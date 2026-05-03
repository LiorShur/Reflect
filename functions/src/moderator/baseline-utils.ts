// Pure helpers for AI5 — speaker baseline tracking. Side-effect-free
// so they can be unit-tested without firebase-admin. The actual RTDB
// reads/writes live in turns/history-trigger.

import type { SpeakerBaseline } from './score';

// Rolling average over each archived speaker turn's delivered text.
// We keep it simple: incremental mean of message length and
// exclamation count. The fast-path uses these for activation deltas
// (docs/10 § Activation markers) once sample_count crosses the
// minimum threshold.
//
// Math: new_mean = old_mean + (x - old_mean) / new_count.
// Equivalent to (old_mean * old_count + x) / new_count without the
// risk of integer overflow on long-running couples.
export function updateBaseline(
  prev: SpeakerBaseline | null,
  text: string,
): SpeakerBaseline {
  const length = text.length;
  const exclamations = (text.match(/!/g) || []).length;

  const oldCount = prev?.sample_count ?? 0;
  const oldLen = prev?.avg_message_length ?? 0;
  const oldExc = prev?.avg_exclamations ?? 0;

  const newCount = oldCount + 1;
  return {
    avg_message_length: oldLen + (length - oldLen) / newCount,
    avg_exclamations: oldExc + (exclamations - oldExc) / newCount,
    sample_count: newCount,
  };
}
