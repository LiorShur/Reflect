// Pure tier-computation logic for the safety-screening flow.
// Side-effect-free so it can be unit-tested without firebase-admin or
// the emulator. The questions, blocks, and tier rules come verbatim
// from docs/07-safety-screening.md § Question battery and § Tier
// computation. ANY change here must be flagged for DV-specialist
// review (CLAUDE.md safety rail #4).

export type Tier = 'low' | 'moderate' | 'high';

export const QUESTION_IDS = [
  'q1', // Block A
  'q2',
  'q3',
  'q4',
  'q5', // Block B
  'q6',
  'q7',
  'q8',
  'q9',
  'q10', // Block C
  'q11',
] as const;

export type QuestionId = (typeof QUESTION_IDS)[number];

const BLOCK_A: QuestionId[] = ['q1', 'q2', 'q3', 'q4'];
const BLOCK_B: QuestionId[] = ['q5', 'q6', 'q7', 'q8', 'q9'];

export interface TierResult {
  tier: Tier;
  flags: string[];
}

// Likert: 0=never, 1=rarely, 2=sometimes, 3=often, 4=always.
// Q11 is reverse-scored (higher score = freer to disagree = safer).
export function computeTier(answers: Record<string, number>): TierResult {
  const flags: string[] = [];
  let tier: Tier = 'low';

  const score = (id: QuestionId): number => {
    const v = answers[id];
    return typeof v === 'number' && v >= 0 && v <= 4 ? v : 0;
  };

  const escalate = (next: Tier) => {
    if (next === 'high' || (next === 'moderate' && tier === 'low')) {
      tier = next;
    }
  };

  // Q1 (physical harm) — any non-zero score forces high tier.
  // docs/07 § Tier computation.
  if (score('q1') > 0) {
    flags.push('q1_physical_harm');
    escalate('high');
  }

  // Block A — direct conflict. Any item ≥3 → high; else any item =2 →
  // moderate; else low.
  for (const id of BLOCK_A) {
    const s = score(id);
    if (s >= 3) {
      flags.push(`${id}_high`);
      escalate('high');
    } else if (s === 2) {
      flags.push(`${id}_moderate`);
      escalate('moderate');
    }
  }

  // Block B — coercive control. Any item ≥3 → high. Pattern of 2+
  // items at ≥2 → moderate. (A single Block B item at 2 is not
  // sufficient on its own per the doc; flagged for DV reviewer in
  // case the spec needs adjustment.)
  let blockBPatternCount = 0;
  for (const id of BLOCK_B) {
    const s = score(id);
    if (s >= 3) {
      flags.push(`${id}_high`);
      escalate('high');
    } else if (s >= 2) {
      blockBPatternCount += 1;
    }
  }
  if (blockBPatternCount >= 2) {
    flags.push('block_b_pattern');
    escalate('moderate');
  }

  // Block C — subjective safety. Q10 = "afraid" (higher = worse).
  // Q11 = "free to disagree" (higher = better, reverse-scored).
  const q10 = score('q10');
  const q11 = score('q11');
  if (q10 >= 3) {
    flags.push('q10_afraid');
    escalate('high');
  } else if (q10 === 2) {
    flags.push('q10_concern');
    escalate('moderate');
  }
  if (q11 <= 1) {
    flags.push('q11_not_free_to_disagree');
    escalate('high');
  } else if (q11 === 2) {
    flags.push('q11_concern');
    escalate('moderate');
  }

  return { tier, flags };
}
