// Stub — milestone 3 (AI3). Softens speaker drafts via Claude, returns
// candidates for the speaker to review (never delivered without approval —
// CLAUDE.md safety rail #5).

export interface TranslateInput {
  speaker_draft: string;
  topic_summary?: string;
  speaker_baseline?: { avg_message_length: number };
}

export interface TranslateResult {
  softened: string;
  changes_made: string;
  prompt_version: string;
}

export async function translate(
  _input: TranslateInput,
): Promise<TranslateResult> {
  throw new Error('not implemented: translator/translate.translate');
}
