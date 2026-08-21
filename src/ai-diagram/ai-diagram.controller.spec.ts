// The real ./diagram-agent module transitively imports @mastra/core, which
// ships ESM-only sub-dependencies (e.g. @sindresorhus/slugify) that Jest's
// CJS module loader cannot require synchronously (unlike Node itself, which
// supports require(esm) natively as of Node 22+). Mock it out here so this
// controller-level test — which never exercises the agent — doesn't trip
// over that Jest/Node ESM interop gap. See ai-diagram.service.spec.ts for
// the same pattern.
jest.mock('./diagram-agent', () => ({
  diagramAgent: { generate: jest.fn() },
  MAX_OUTPUT_TOKENS: 2000,
}));

import { AiDiagramController } from './ai-diagram.controller';
import { AiDiagramService } from './ai-diagram.service';

describe('AiDiagramController', () => {
  const serviceMock = { generate: jest.fn(), modify: jest.fn() };

  function buildController() {
    return new AiDiagramController(serviceMock as unknown as AiDiagramService);
  }

  beforeEach(() => jest.clearAllMocks());

  it('generate delegates to the service with the caller id and dto fields', async () => {
    serviceMock.generate.mockResolvedValue({ mermaid: 'flowchart TD\nA-->B' });
    const controller = buildController();

    const result = await controller.generate('user_1', { prompt: 'a flow', requestId: 'req_1' });

    expect(serviceMock.generate).toHaveBeenCalledWith('user_1', 'req_1', 'a flow');
    expect(result).toEqual({ mermaid: 'flowchart TD\nA-->B' });
  });

  it('modify delegates to the service with the caller id, dto fields, and selection', async () => {
    serviceMock.modify.mockResolvedValue({ mermaid: 'flowchart TD\nA-->C' });
    const controller = buildController();

    const result = await controller.modify('user_1', {
      prompt: 'change it',
      requestId: 'req_2',
      selectedElements: [{ id: 'el_1' }],
    });

    expect(serviceMock.modify).toHaveBeenCalledWith('user_1', 'req_2', 'change it', [{ id: 'el_1' }]);
    expect(result).toEqual({ mermaid: 'flowchart TD\nA-->C' });
  });
});
