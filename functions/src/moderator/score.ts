import {
  ABSOLUTISM,
  CHARACTER_ATTACK,
  CONTEMPT_NAMES,
  CONTEMPT_PHRASES,
  DEFENSIVENESS_OPENERS,
  MIND_READING,
  SELF_REFERENCE,
} from './patterns';

export interface SpeakerBaseline {
  avg_message_length: number;
  avg_exclamations: number;
  sample_count: number;
}

export interface FastPathFlag {
  type: string;
  term?: string;
  delta?: number;
}

export interface FastPathResult {
  tier: 'clean' | 'tier_1' | 'tier_2' | 'tier_3';
  score: number;
  flags: FastPathFlag[];
  needs_escalation: boolean;
}

export function scoreFastPath(
  text: string,
  baseline?: SpeakerBaseline,
): FastPathResult {
  const t = text.toLowerCase();
  const flags: FastPathFlag[] = [];
  let score = 0;

  // "I never feel heard" is a self-statement, not a partner attack —
  // exempt from absolutism scoring. See docs/10 § Self-reference exemption.
  const selfRef = SELF_REFERENCE.some((r) => r.test(t));

  if (!selfRef) {
    for (const word of ABSOLUTISM) {
      if (new RegExp(`\\b${escapeRegex(word)}\\b`, 'i').test(t)) {
        flags.push({ type: 'absolutism', term: word });
        score += 1;
      }
    }
  }

  for (const pat of CHARACTER_ATTACK) {
    const m = t.match(pat);
    if (m) {
      flags.push({ type: 'character_attack', term: m[0] });
      score += 2;
    }
  }

  for (const pat of MIND_READING) {
    if (pat.test(t)) {
      flags.push({ type: 'mind_reading' });
      score += 2;
    }
  }

  // Defensiveness only counts as an opener (first 12 words).
  const opener = t.split(/\s+/).slice(0, 12).join(' ');
  for (const pat of DEFENSIVENESS_OPENERS) {
    if (pat.test(opener)) {
      flags.push({ type: 'defensiveness' });
      score += 1;
    }
  }

  for (const pat of CONTEMPT_PHRASES) {
    if (pat.test(t)) {
      flags.push({ type: 'contempt_phrase' });
      score += 4;
    }
  }

  // Name-calling: only flag when the term is directed at the partner,
  // detected by "you/you're/your" within 3 tokens before.
  const tokens = t.split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i].replace(/[.,!?]/g, '');
    if (CONTEMPT_NAMES.has(tok)) {
      const window = tokens.slice(Math.max(0, i - 3), i).join(' ');
      if (/\byou(?:'re|r)?\b/i.test(window)) {
        flags.push({ type: 'name_calling', term: tok });
        score += 5;
      }
    }
  }

  if (baseline && baseline.sample_count >= 5) {
    const len = text.length;
    const exclamations = (text.match(/!/g) || []).length;
    const allCaps = (text.match(/\b[A-Z]{3,}\b/g) || []).length;

    if (len < baseline.avg_message_length * 0.5) {
      flags.push({ type: 'activation_short', delta: -0.5 });
      score += 1;
    }
    if (exclamations > baseline.avg_exclamations * 2) {
      flags.push({ type: 'activation_punct' });
      score += 1;
    }
    if (allCaps > 0) {
      flags.push({ type: 'activation_caps' });
      score += 2;
    }
  }

  let tier: FastPathResult['tier'] = 'clean';
  let needs_escalation = false;

  if (
    score >= 7 ||
    flags.some((f) => f.type === 'name_calling' || f.type === 'contempt_phrase')
  ) {
    tier = 'tier_3';
  } else if (score >= 4) {
    tier = 'tier_2';
    needs_escalation = true;
  } else if (score >= 1) {
    tier = 'tier_1';
  }

  return { tier, score, flags, needs_escalation };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
