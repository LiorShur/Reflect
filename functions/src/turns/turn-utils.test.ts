import {
  isValidConfirmStatus,
  isValidDecision,
  isValidDraftText,
  moderatorTierString,
  parseModeratorEscalationOutput,
  parseTranslatorOutput,
  planConfirmDecision,
} from './turn-utils';

describe('isValidDraftText', () => {
  it.each(['hi', 'I felt unheard.', 'a'.repeat(2000)])(
    'accepts non-empty length-bounded string %p',
    (s) => {
      expect(isValidDraftText(s)).toBe(true);
    },
  );

  it.each(['', '   ', '\n\t'])('rejects empty / whitespace %p', (s) => {
    expect(isValidDraftText(s)).toBe(false);
  });

  it('rejects strings longer than 2000 chars', () => {
    expect(isValidDraftText('a'.repeat(2001))).toBe(false);
  });

  it.each([null, undefined, 0, {}, []])('rejects %p', (v) => {
    expect(isValidDraftText(v)).toBe(false);
  });
});

describe('parseTranslatorOutput', () => {
  const valid = {
    softened: 'I felt unheard when…',
    already_soft: false,
    cannot_soften: false,
    changes_made: 'I-statement, specific behavior, positive need.',
  };

  it('parses a clean JSON response', () => {
    const result = parseTranslatorOutput(JSON.stringify(valid));
    expect(result).toEqual(valid);
  });

  it('parses despite leading/trailing whitespace', () => {
    const result = parseTranslatorOutput(`\n  ${JSON.stringify(valid)}\n`);
    expect(result).toEqual(valid);
  });

  it('strips a ```json code fence', () => {
    const wrapped = '```json\n' + JSON.stringify(valid) + '\n```';
    expect(parseTranslatorOutput(wrapped)).toEqual(valid);
  });

  it('strips a plain ``` fence', () => {
    const wrapped = '```\n' + JSON.stringify(valid) + '\n```';
    expect(parseTranslatorOutput(wrapped)).toEqual(valid);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseTranslatorOutput('not json')).toThrow(/valid JSON/);
  });

  it('throws on missing softened', () => {
    const broken = { ...valid } as Record<string, unknown>;
    delete broken.softened;
    expect(() => parseTranslatorOutput(JSON.stringify(broken))).toThrow(
      /softened/,
    );
  });

  it('throws on missing already_soft', () => {
    const broken = { ...valid } as Record<string, unknown>;
    delete broken.already_soft;
    expect(() => parseTranslatorOutput(JSON.stringify(broken))).toThrow(
      /already_soft/,
    );
  });

  it('throws on missing cannot_soften', () => {
    const broken = { ...valid } as Record<string, unknown>;
    delete broken.cannot_soften;
    expect(() => parseTranslatorOutput(JSON.stringify(broken))).toThrow(
      /cannot_soften/,
    );
  });

  it('throws on missing changes_made', () => {
    const broken = { ...valid } as Record<string, unknown>;
    delete broken.changes_made;
    expect(() => parseTranslatorOutput(JSON.stringify(broken))).toThrow(
      /changes_made/,
    );
  });

  it('throws on non-object JSON', () => {
    expect(() => parseTranslatorOutput('"a string"')).toThrow(/non-object/);
    expect(() => parseTranslatorOutput('[1, 2, 3]')).toThrow(/non-object/);
  });

  it('accepts already_soft=true with softened == raw', () => {
    const r = parseTranslatorOutput(
      JSON.stringify({ ...valid, already_soft: true }),
    );
    expect(r.already_soft).toBe(true);
  });

  it('accepts cannot_soften=true', () => {
    const r = parseTranslatorOutput(
      JSON.stringify({ ...valid, cannot_soften: true }),
    );
    expect(r.cannot_soften).toBe(true);
  });
});

describe('isValidDecision', () => {
  it.each(['send_softened', 'send_original', 'edit'])('accepts %s', (s) => {
    expect(isValidDecision(s)).toBe(true);
  });

  it.each(['', 'foo', null, undefined, 0, {}])('rejects %p', (v) => {
    expect(isValidDecision(v)).toBe(false);
  });
});

describe('isValidConfirmStatus', () => {
  it.each(['heard', 'more', 'retry'])('accepts %s', (s) => {
    expect(isValidConfirmStatus(s)).toBe(true);
  });

  it.each(['', 'yes', 'mostly', null, undefined, 0, {}])('rejects %p', (v) => {
    expect(isValidConfirmStatus(v)).toBe(false);
  });
});

describe('planConfirmDecision', () => {
  it("'heard' archives, swaps roles, transitions to FLOOR_SWAP", () => {
    expect(planConfirmDecision('heard')).toEqual({
      status: 'heard',
      newState: 'FLOOR_SWAP',
      archiveTurn: true,
      swapRoles: true,
      clearMirrorOnly: false,
    });
  });

  it("'more' archives the sub-turn, keeps speaker, stays IN_TURN", () => {
    expect(planConfirmDecision('more')).toEqual({
      status: 'more',
      newState: 'IN_TURN',
      archiveTurn: true,
      swapRoles: false,
      clearMirrorOnly: false,
    });
  });

  it("'retry' clears the mirror only, stays IN_TURN, no archive", () => {
    expect(planConfirmDecision('retry')).toEqual({
      status: 'retry',
      newState: 'IN_TURN',
      archiveTurn: false,
      swapRoles: false,
      clearMirrorOnly: true,
    });
  });
});

describe('parseModeratorEscalationOutput', () => {
  const valid = {
    tier: 2,
    reason: 'Likely to put the partner on the defensive.',
    suggestion: "Try 'I felt overlooked when…' instead.",
  };

  it('parses a clean tier-2 response', () => {
    expect(parseModeratorEscalationOutput(JSON.stringify(valid))).toEqual(
      valid,
    );
  });

  it('accepts tier 1 with null suggestion', () => {
    const t1 = { tier: 1, reason: 'Fine to send.', suggestion: null };
    expect(parseModeratorEscalationOutput(JSON.stringify(t1))).toEqual(t1);
  });

  it('accepts tier 3', () => {
    const t3 = {
      tier: 3,
      reason: 'Contains contempt.',
      suggestion: 'Refocus on what you need.',
    };
    expect(parseModeratorEscalationOutput(JSON.stringify(t3))).toEqual(t3);
  });

  it('strips a ```json code fence', () => {
    const wrapped = '```json\n' + JSON.stringify(valid) + '\n```';
    expect(parseModeratorEscalationOutput(wrapped)).toEqual(valid);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseModeratorEscalationOutput('not json')).toThrow(
      /valid JSON/,
    );
  });

  it('throws on non-object JSON', () => {
    expect(() => parseModeratorEscalationOutput('"a string"')).toThrow(
      /non-object/,
    );
    expect(() => parseModeratorEscalationOutput('[1, 2, 3]')).toThrow(
      /non-object/,
    );
  });

  it.each([0, 4, '2', null, undefined])('throws on invalid tier %p', (t) => {
    const broken = { ...valid, tier: t };
    expect(() =>
      parseModeratorEscalationOutput(JSON.stringify(broken)),
    ).toThrow(/tier/);
  });

  it('throws on missing reason', () => {
    const broken = { ...valid } as Record<string, unknown>;
    delete broken.reason;
    expect(() =>
      parseModeratorEscalationOutput(JSON.stringify(broken)),
    ).toThrow(/reason/);
  });

  it('throws on non-string non-null suggestion', () => {
    const broken = { ...valid, suggestion: 42 };
    expect(() =>
      parseModeratorEscalationOutput(JSON.stringify(broken)),
    ).toThrow(/suggestion/);
  });
});

describe('moderatorTierString', () => {
  it('maps numeric tiers to strings', () => {
    expect(moderatorTierString(1)).toBe('tier_1');
    expect(moderatorTierString(2)).toBe('tier_2');
    expect(moderatorTierString(3)).toBe('tier_3');
  });
});
