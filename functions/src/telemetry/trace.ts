// Stub — milestone 4 (E2). Anonymized trace logging to Firestore.
// Per CLAUDE.md safety rail #2: hashed inputs by default, raw text only
// with explicit opt-in + TTL.

export interface TraceEvent {
  session_id_hash: string;
  prompt_id: string;
  prompt_version: string;
  input_hash: string;
  output_summary?: string;
  latency_ms: number;
  cost_usd?: number;
}

export async function trace(_event: TraceEvent): Promise<void> {
  throw new Error('not implemented: telemetry/trace.trace');
}
