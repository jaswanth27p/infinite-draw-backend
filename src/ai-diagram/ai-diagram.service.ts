import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { CreditsService } from '../credits/credits.service';
import { diagramAgent, MAX_OUTPUT_TOKENS } from './diagram-agent';

const MERMAID_FENCE_RE = /```mermaid\s*([\s\S]+?)```/;
const RESERVATION_RELEASE_DELAY_MS = 2 * 60 * 1000;
const RUPEES_PER_1K_INPUT_TOKENS = Number(process.env.AI_COST_PER_1K_INPUT_TOKENS_RUPEES ?? '0.5');
const RUPEES_PER_1K_OUTPUT_TOKENS = Number(process.env.AI_COST_PER_1K_OUTPUT_TOKENS_RUPEES ?? '1.5');

// ~4 characters per token is a standard rough estimate — used only to
// compute the pre-call reservation ceiling. Actual cost always comes from
// the agent response's real `usage` figures.
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function estimateCostRupees(promptText: string): Prisma.Decimal {
  const promptTokens = estimateTokens(promptText);
  const promptCost = (promptTokens / 1000) * RUPEES_PER_1K_INPUT_TOKENS;
  const maxOutputCost = (MAX_OUTPUT_TOKENS / 1000) * RUPEES_PER_1K_OUTPUT_TOKENS;
  return new Prisma.Decimal(promptCost + maxOutputCost);
}

function actualCostRupees(usage: { inputTokens?: number; outputTokens?: number }): Prisma.Decimal {
  const inputCost = ((usage.inputTokens ?? 0) / 1000) * RUPEES_PER_1K_INPUT_TOKENS;
  const outputCost = ((usage.outputTokens ?? 0) / 1000) * RUPEES_PER_1K_OUTPUT_TOKENS;
  return new Prisma.Decimal(inputCost + outputCost);
}

@Injectable()
export class AiDiagramService {
  constructor(
    private readonly creditsService: CreditsService,
    @InjectQueue('ai-usage') private readonly queue: Queue,
  ) {}

  async generate(userId: string, requestId: string, prompt: string): Promise<{ mermaid: string }> {
    return this.run(userId, requestId, prompt);
  }

  async modify(
    userId: string,
    requestId: string,
    prompt: string,
    selectedElements: unknown[],
  ): Promise<{ mermaid: string }> {
    const fullPrompt =
      `Here are the currently selected diagram elements as Excalidraw JSON:\n` +
      `${JSON.stringify(selectedElements)}\n\n` +
      `Requested change: ${prompt}\n\n` +
      `Respond with a full replacement Mermaid flowchart diagram reflecting the requested change.`;
    return this.run(userId, requestId, fullPrompt);
  }

  private async run(userId: string, requestId: string, prompt: string): Promise<{ mermaid: string }> {
    const estimate = estimateCostRupees(prompt);
    const reservation = await this.creditsService.reserveUsage(userId, requestId, estimate);
    const releaseJobId = `release-${reservation.id}`;

    try {
      await this.queue.add(
        'release-stale-reservation',
        { reservationId: reservation.id },
        { delay: RESERVATION_RELEASE_DELAY_MS, jobId: releaseJobId },
      );

      const result = await diagramAgent.generate(prompt, { modelSettings: { maxOutputTokens: MAX_OUTPUT_TOKENS } });

      const match = MERMAID_FENCE_RE.exec(result.text);
      if (!match) {
        throw new UnprocessableEntityException("Couldn't generate a diagram from that — try rephrasing.");
      }

      await this.creditsService.settleUsage(reservation.id, actualCostRupees(result.usage ?? {}));
      return { mermaid: match[1].trim() };
    } catch (err) {
      // Safe even after a successful settle above: refundUsage no-ops once
      // the reservation is no longer RESERVED, so this only fires the
      // catch block's error paths (no-fence, agent error) actually pay out.
      await this.creditsService.refundUsage(reservation.id);
      throw err;
    } finally {
      const job = await this.queue.getJob(releaseJobId);
      await job?.remove();
    }
  }
}
