import { createHash } from 'crypto';
import { getDatabase } from 'firebase-admin/database';

// E3 — User feedback capture on translator decisions. Records WHICH
// decision the speaker made (send_softened / send_original / edit)
// alongside the hashed input + softened output and prompt version,
// so we can later compute acceptance / rejection rates per prompt
// version and feed that signal back into prompt iteration.
//
// Same privacy posture as telemetry/trace: never persists raw text
// per CLAUDE.md safety rail #2. SHA-256 hashes are sufficient for
// "did this same input recur" queries during debugging.
//
// Stored at /telemetry/translator_feedback/{YYYY-MM-DD}/{push_id}.
// Server-only readable per the existing /telemetry rule.

export type TranslatorDecision = 'send_softened' | 'send_original' | 'edit';

export interface TranslatorFeedbackEvent {
  decision: TranslatorDecision;
  prompt_version: string;
  moderator_tier?: 'clean' | 'tier_1' | 'tier_2' | 'tier_3' | null;
  raw_text: string; // hashed before persist
  softened_text: string; // hashed before persist
  session_id: string; // hashed before persist
  speaker_uid: string; // hashed before persist
}

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

function todayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export async function recordTranslatorFeedback(
  event: TranslatorFeedbackEvent,
  now: Date = new Date(),
): Promise<void> {
  const day = todayKey(now);
  const record = {
    decision: event.decision,
    prompt_version: event.prompt_version,
    moderator_tier: event.moderator_tier ?? null,
    raw_hash: sha256(event.raw_text),
    softened_hash: sha256(event.softened_text),
    session_id_hash: sha256(event.session_id),
    speaker_uid_hash: sha256(event.speaker_uid),
    raw_length: event.raw_text.length,
    softened_length: event.softened_text.length,
    created_at: now.getTime(),
  };
  await getDatabase().ref(`telemetry/translator_feedback/${day}`).push(record);
}
