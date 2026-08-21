import { Agent } from '@mastra/core/agent';

export const MAX_OUTPUT_TOKENS = 2000;

export const diagramAgent = new Agent({
  id: 'diagram-assist',
  name: 'Diagram Assist',
  instructions:
    'You generate or modify Mermaid flowchart diagrams from natural-language requests. ' +
    'Always respond with exactly one fenced code block labeled mermaid, containing valid ' +
    'Mermaid flowchart syntax (starting with "flowchart TD" or "flowchart LR"). ' +
    'Do not include any explanation or text outside the fenced block.',
  model: 'opencode-go/mimo-v2.5',
});
