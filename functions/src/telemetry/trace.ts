import { createHash } from 'crypto';
import { getDatabase } from 'firebase-admin/database';

// Anonymized trace logging for AI calls. CLAUDE.md safety rail #2:
// raw conversation content is NEVER logged by default. We hash the
// inputs with SHA-256 (sufficient for "did this exact text recur"
// queries during debugging) and persist only the hash plus
// metadata.
//
// Stored at /telemetry/traces/{YYYY-MM-DD}/{trace_id} so a
// scheduled cleanup function can drop old days wholesale (24h TTL
// per docs/02 § Privacy posture; the cleanup cron lands in a
// later PR).

export interface TraceEvent {
  prompt_role: string;
  prompt_version: string;
  model: string;
  input_text: string; // hashed before persist
  output_text?: string; // hashed before persist if provided
  latency_ms: number;
  cost_usd?: number;
  session_id?: string; // hashed before persist if provided
}

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

function todayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export async function trace(
  event: TraceEvent,
  now: Date = new Date(),
): Promise<void> {
  const day = todayKey(now);
  const record = {
    prompt_role: event.prompt_role,
    prompt_version: event.prompt_version,
    model: event.model,
    input_hash: sha256(event.input_text),
    output_hash: event.output_text ? sha256(event.output_text) : null,
    session_id_hash: event.session_id ? sha256(event.session_id) : null,
    latency_ms: event.latency_ms,
    cost_usd: event.cost_usd ?? null,
    created_at: now.getTime(),
  };
  await getDatabase().ref(`telemetry/traces/${day}`).push(record);
}
