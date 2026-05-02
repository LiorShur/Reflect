import {
  bothPartnersConfirmedWrapUp,
  formatTurnHistory,
  parseSummarizerOutput,
  type ArchivedTurn,
} from './wrap-up-utils';

describe('parseSummarizerOutput', () => {
  const valid = {
    partner_a_summary: 'Alice felt unheard about weekend plans.',
    partner_b_summary: 'Bob wanted more shared decision-making.',
  };

  it('parses a clean JSON response', () => {
    expect(parseSummarizerOutput(JSON.stringify(valid))).toEqual(valid);
  });

  it('strips a ```json code fence', () => {
    const wrapped = '```json\n' + JSON.stringify(valid) + '\n```';
    expect(parseSummarizerOutput(wrapped)).toEqual(valid);
  });

  it('parses despite leading/trailing whitespace', () => {
    expect(parseSummarizerOutput(`\n  ${JSON.stringify(valid)}\n`)).toEqual(
      valid,
    );
  });

  it('throws on invalid JSON', () => {
    expect(() => parseSummarizerOutput('not json')).toThrow(/valid JSON/);
  });

  it('throws on non-object JSON', () => {
    expect(() => parseSummarizerOutput('"a string"')).toThrow(/non-object/);
    expect(() => parseSummarizerOutput('[1, 2, 3]')).toThrow(/non-object/);
  });

  it('throws on missing partner_a_summary', () => {
    const broken = { ...valid } as Record<string, unknown>;
    delete broken.partner_a_summary;
    expect(() => parseSummarizerOutput(JSON.stringify(broken))).toThrow(
      /partner_a_summary/,
    );
  });

  it('throws on missing partner_b_summary', () => {
    const broken = { ...valid } as Record<string, unknown>;
    delete broken.partner_b_summary;
    expect(() => parseSummarizerOutput(JSON.stringify(broken))).toThrow(
      /partner_b_summary/,
    );
  });
});

describe('formatTurnHistory', () => {
  const A = 'uidA';
  const B = 'uidB';

  it('returns placeholder for empty history', () => {
    expect(formatTurnHistory([], A, B)).toBe('(no turns recorded)');
  });

  it('formats a single turn with both delivered and mirror text', () => {
    const turns: ArchivedTurn[] = [
      {
        speaker_uid: A,
        listener_uid: B,
        delivered_text: 'I felt unheard.',
        mirror_text: 'You felt invisible.',
        archived_at: 1000,
      },
    ];
    const out = formatTurnHistory(turns, A, B);
    expect(out).toContain('Turn 1 (Partner A speaking)');
    expect(out).toContain('Partner A said: I felt unheard.');
    expect(out).toContain('Partner B reflected: You felt invisible.');
  });

  it('sorts turns by archived_at', () => {
    const turns: ArchivedTurn[] = [
      {
        speaker_uid: B,
        listener_uid: A,
        delivered_text: 'Second',
        archived_at: 2000,
      },
      {
        speaker_uid: A,
        listener_uid: B,
        delivered_text: 'First',
        archived_at: 1000,
      },
    ];
    const out = formatTurnHistory(turns, A, B);
    const firstIdx = out.indexOf('First');
    const secondIdx = out.indexOf('Second');
    expect(firstIdx).toBeGreaterThan(-1);
    expect(secondIdx).toBeGreaterThan(firstIdx);
    expect(out).toContain('Turn 1 (Partner A speaking)');
    expect(out).toContain('Turn 2 (Partner B speaking)');
  });

  it('omits missing fields gracefully', () => {
    const turns: ArchivedTurn[] = [
      {
        speaker_uid: A,
        listener_uid: B,
        delivered_text: 'Just spoken, no mirror yet',
        archived_at: 1,
      },
    ];
    const out = formatTurnHistory(turns, A, B);
    expect(out).toContain('Partner A said');
    expect(out).not.toContain('reflected');
  });
});

describe('bothPartnersConfirmedWrapUp', () => {
  it('returns true only when both partners confirmed', () => {
    expect(
      bothPartnersConfirmedWrapUp({
        partner_a_confirmed: true,
        partner_b_confirmed: true,
      }),
    ).toBe(true);
  });

  it.each([
    [{ partner_a_confirmed: true, partner_b_confirmed: false }],
    [{ partner_a_confirmed: false, partner_b_confirmed: true }],
    [{ partner_a_confirmed: true }],
    [{}],
    [{ partner_a_confirmed: 'true', partner_b_confirmed: 'true' }],
  ])('returns false for %p', (input) => {
    expect(bothPartnersConfirmedWrapUp(input)).toBe(false);
  });
});
