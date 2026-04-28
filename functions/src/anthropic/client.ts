// Stub — real Anthropic SDK wiring lands in milestone 3 (AI3, AI4).
// Per CLAUDE.md safety rail #1, the API key only ever lives here.

export interface AnthropicCallOptions {
  prompt_id: string;
  inputs: Record<string, unknown>;
}

export interface AnthropicCallResult {
  text: string;
  prompt_version: string;
  usage: { input_tokens: number; output_tokens: number };
}

export async function callClaude(
  _opts: AnthropicCallOptions,
): Promise<AnthropicCallResult> {
  throw new Error('not implemented: anthropic/client.callClaude');
}
