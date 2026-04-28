// Stub — milestone 4 (E1). Loads /prompts/*.yaml at cold start and
// caches by prompt id + version. Versioned dispatch lets us A/B prompts
// without redeploys (see docs/08-prompt-eval.md).

export interface PromptRecord {
  id: string;
  version: string;
  template: string;
}

export async function loadPrompts(): Promise<Map<string, PromptRecord>> {
  throw new Error('not implemented: prompts/registry.loadPrompts');
}

export function getPrompt(_id: string): PromptRecord {
  throw new Error('not implemented: prompts/registry.getPrompt');
}
