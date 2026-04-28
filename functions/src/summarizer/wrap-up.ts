// Stub — milestone 4 (AI4). Generates per-partner wrap-up summaries
// from completed session turns.

export interface WrapUpInput {
  session_id: string;
  partner_uid: string;
}

export interface WrapUpResult {
  summary: string;
  prompt_version: string;
}

export async function summarizeWrapUp(
  _input: WrapUpInput,
): Promise<WrapUpResult> {
  throw new Error('not implemented: summarizer/wrap-up.summarizeWrapUp');
}
