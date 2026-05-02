import {
  isValidDecision,
  isValidDraftText,
  parseTranslatorOutput,
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
