// S7 (light) — in-session disclosure pattern seed.
//
// docs/v1-scope S7: "In-session disclosure detector (LLM-based on
// speaker drafts)". The full LLM-based detector is v1-scope but
// requires a clinically-reviewed Claude prompt and false-positive
// tuning that's not yet done. This lexical scaffold is the pilot
// bridge: a small phrase list that, when matched in a compose draft,
// surfaces the safety-resources card to the SPEAKER (not the
// partner). Does not block the message.
//
// **INTENDED USE**: give this file to your DV specialist. They add
// the phrase list they consider high-signal for the pilot. The
// team's job is the plumbing; the specialist's job is the phrases.
//
// Design constraints for phrases added here:
//   - Match on SELF-disclosure ("I'm scared he'll…", "he hit me…"),
//     not descriptions of the partner's state.
//   - Avoid over-triggering: prefer specific phrases over broad
//     keywords like "afraid" (a common feeling word in normal
//     conflict).
//   - Case-insensitive.
//   - The pipeline treats a single match as a disclosure signal —
//     tune phrase specificity accordingly.
//
// Empty by default. The pipeline behaves as if S7 is not present
// (no false positives) until a phrase is added.

export const DISCLOSURE_PATTERNS: RegExp[] = [
  // Add phrases here in consultation with a DV specialist. Examples
  // of the SHAPE (do not use verbatim without review):
  //
  //   /\bi(?:'m| am) (?:scared|afraid) (?:of|that) (?:he|she|they)\b/i,
  //   /\b(?:he|she|they) (?:hit|hits|hit me|has hit me)\b/i,
  //   /\b(?:i'?m|i am) not safe\b/i,
];

export interface DisclosureMatch {
  pattern: string; // stringified regex, for telemetry
  index: number; // where the match started
}

export function detectDisclosure(text: string): DisclosureMatch | null {
  for (const re of DISCLOSURE_PATTERNS) {
    const m = re.exec(text);
    if (m) {
      return { pattern: re.toString(), index: m.index };
    }
  }
  return null;
}
