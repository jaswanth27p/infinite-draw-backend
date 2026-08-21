import { UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AiDiagramService } from './ai-diagram.service';
import { CreditsService } from '../credits/credits.service';

jest.mock('./diagram-agent', () => ({
  diagramAgent: { generate: jest.fn() },
  MAX_OUTPUT_TOKENS: 2000,
}));
import { diagramAgent } from './diagram-agent';

describe('AiDiagramService', () => {
  const creditsServiceMock = {
    reserveUsage: jest.fn(),
    settleUsage: jest.fn(),
    refundUsage: jest.fn(),
  };
  const jobMock = { remove: jest.fn() };
  const queueMock = { add: jest.fn().mockResolvedValue(undefined), getJob: jest.fn().mockResolvedValue(jobMock) };

  function buildService() {
    return new AiDiagramService(creditsServiceMock as unknown as CreditsService, queueMock as never);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    creditsServiceMock.reserveUsage.mockResolvedValue({ id: 'res_1', estimateWholeRupees: 2 });
  });

  describe('generate', () => {
    it('reserves credits, calls the agent, settles on a valid mermaid fence, and returns the mermaid text', async () => {
      (diagramAgent.generate as jest.Mock).mockResolvedValue({
        text: 'Here you go:\n```mermaid\nflowchart TD\nA-->B\n```\n',
        usage: { inputTokens: 100, outputTokens: 50 },
      });
      const service = buildService();

      const result = await service.generate('user_1', 'req_1', 'a simple flow');

      expect(creditsServiceMock.reserveUsage).toHaveBeenCalledWith('user_1', 'req_1', expect.any(Prisma.Decimal));
      expect(diagramAgent.generate).toHaveBeenCalledWith('a simple flow', { modelSettings: { maxOutputTokens: 2000 } });
      expect(creditsServiceMock.settleUsage).toHaveBeenCalledWith('res_1', expect.any(Prisma.Decimal));
      expect(result).toEqual({ mermaid: 'flowchart TD\nA-->B' });
    });

    it('removes the delayed release job after settling', async () => {
      (diagramAgent.generate as jest.Mock).mockResolvedValue({
        text: '```mermaid\nflowchart TD\nA-->B\n```',
        usage: { inputTokens: 10, outputTokens: 10 },
      });
      const service = buildService();

      await service.generate('user_1', 'req_1', 'a simple flow');

      expect(queueMock.add).toHaveBeenCalledWith(
        'release-stale-reservation',
        { reservationId: 'res_1' },
        { delay: 2 * 60 * 1000, jobId: 'release-res_1' },
      );
      expect(queueMock.getJob).toHaveBeenCalledWith('release-res_1');
      expect(jobMock.remove).toHaveBeenCalled();
    });

    it('refunds and throws UnprocessableEntityException when the response has no mermaid fence', async () => {
      (diagramAgent.generate as jest.Mock).mockResolvedValue({ text: 'no fence here', usage: {} });
      const service = buildService();

      await expect(service.generate('user_1', 'req_1', 'a simple flow')).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(creditsServiceMock.refundUsage).toHaveBeenCalledWith('res_1');
      expect(creditsServiceMock.settleUsage).not.toHaveBeenCalled();
    });

    it('refunds and rethrows when the agent call itself throws', async () => {
      (diagramAgent.generate as jest.Mock).mockRejectedValue(new Error('provider timeout'));
      const service = buildService();

      await expect(service.generate('user_1', 'req_1', 'a simple flow')).rejects.toThrow('provider timeout');
      expect(creditsServiceMock.refundUsage).toHaveBeenCalledWith('res_1');
    });

    it('refunds and rethrows when enqueuing the delayed release job itself throws', async () => {
      queueMock.add.mockRejectedValueOnce(new Error('redis blip'));
      const service = buildService();

      await expect(service.generate('user_1', 'req_1', 'a simple flow')).rejects.toThrow('redis blip');
      expect(creditsServiceMock.refundUsage).toHaveBeenCalledWith('res_1');
      expect(diagramAgent.generate).not.toHaveBeenCalled();
      expect(creditsServiceMock.settleUsage).not.toHaveBeenCalled();
    });
  });

  describe('modify', () => {
    it('includes the selected elements and prompt in the agent call, and returns the mermaid text', async () => {
      (diagramAgent.generate as jest.Mock).mockResolvedValue({
        text: '```mermaid\nflowchart TD\nA-->C\n```',
        usage: { inputTokens: 20, outputTokens: 20 },
      });
      const service = buildService();

      const result = await service.modify('user_1', 'req_1', 'add a node', [{ id: 'el_1', type: 'rectangle' }]);

      const [sentPrompt] = (diagramAgent.generate as jest.Mock).mock.calls[0];
      expect(sentPrompt).toContain('"id":"el_1"');
      expect(sentPrompt).toContain('add a node');
      expect(result).toEqual({ mermaid: 'flowchart TD\nA-->C' });
    });
  });
});
