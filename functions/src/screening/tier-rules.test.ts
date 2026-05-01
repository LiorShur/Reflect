import { computeTier } from './tier-rules';

const allZero = (): Record<string, number> => ({
  q1: 0,
  q2: 0,
  q3: 0,
  q4: 0,
  q5: 0,
  q6: 0,
  q7: 0,
  q8: 0,
  q9: 0,
  q10: 0,
  q11: 4, // "always free to disagree" — safest
});

describe('computeTier — clean baseline', () => {
  it('returns low + empty flags when nothing is concerning', () => {
    const r = computeTier(allZero());
    expect(r.tier).toBe('low');
    expect(r.flags).toEqual([]);
  });
});

describe('computeTier — Q1 physical-harm override', () => {
  it.each([1, 2, 3, 4])('forces high tier when q1 score is %i', (score) => {
    const r = computeTier({ ...allZero(), q1: score });
    expect(r.tier).toBe('high');
    expect(r.flags).toContain('q1_physical_harm');
  });

  it('does NOT trigger q1 override when q1 is 0', () => {
    const r = computeTier(allZero());
    expect(r.flags).not.toContain('q1_physical_harm');
  });
});

describe('computeTier — Block A (direct conflict)', () => {
  it('moderate when q2 = 2 (insults sometimes)', () => {
    const r = computeTier({ ...allZero(), q2: 2 });
    expect(r.tier).toBe('moderate');
    expect(r.flags).toContain('q2_moderate');
  });

  it('high when q3 = 3 (threats often)', () => {
    const r = computeTier({ ...allZero(), q3: 3 });
    expect(r.tier).toBe('high');
    expect(r.flags).toContain('q3_high');
  });

  it('high when q4 = 4 (screaming always)', () => {
    const r = computeTier({ ...allZero(), q4: 4 });
    expect(r.tier).toBe('high');
    expect(r.flags).toContain('q4_high');
  });
});

describe('computeTier — Block B (coercive control)', () => {
  it('low when only one Block B item is at 2 (per spec)', () => {
    const r = computeTier({ ...allZero(), q5: 2 });
    expect(r.tier).toBe('low');
    expect(r.flags).not.toContain('block_b_pattern');
  });

  it('moderate when two Block B items are at 2', () => {
    const r = computeTier({ ...allZero(), q5: 2, q8: 2 });
    expect(r.tier).toBe('moderate');
    expect(r.flags).toContain('block_b_pattern');
  });

  it('moderate when three Block B items are at 2', () => {
    const r = computeTier({ ...allZero(), q5: 2, q6: 2, q9: 2 });
    expect(r.tier).toBe('moderate');
    expect(r.flags).toContain('block_b_pattern');
  });

  it('high when any Block B item is at 3+', () => {
    const r = computeTier({ ...allZero(), q8: 3 });
    expect(r.tier).toBe('high');
    expect(r.flags).toContain('q8_high');
  });

  it('high when q9 = 4 (controls money always)', () => {
    const r = computeTier({ ...allZero(), q9: 4 });
    expect(r.tier).toBe('high');
    expect(r.flags).toContain('q9_high');
  });
});

describe('computeTier — Block C (subjective safety)', () => {
  it('high when q10 = 3 (often afraid)', () => {
    const r = computeTier({ ...allZero(), q10: 3 });
    expect(r.tier).toBe('high');
    expect(r.flags).toContain('q10_afraid');
  });

  it('high when q10 = 4 (always afraid)', () => {
    const r = computeTier({ ...allZero(), q10: 4 });
    expect(r.tier).toBe('high');
  });

  it('moderate when q10 = 2 (sometimes afraid)', () => {
    const r = computeTier({ ...allZero(), q10: 2 });
    expect(r.tier).toBe('moderate');
    expect(r.flags).toContain('q10_concern');
  });

  it('high when q11 = 0 (never free to disagree, reverse-scored)', () => {
    const r = computeTier({ ...allZero(), q11: 0 });
    expect(r.tier).toBe('high');
    expect(r.flags).toContain('q11_not_free_to_disagree');
  });

  it('high when q11 = 1 (rarely free to disagree)', () => {
    const r = computeTier({ ...allZero(), q11: 1 });
    expect(r.tier).toBe('high');
  });

  it('moderate when q11 = 2 (sometimes free to disagree)', () => {
    const r = computeTier({ ...allZero(), q11: 2 });
    expect(r.tier).toBe('moderate');
    expect(r.flags).toContain('q11_concern');
  });

  it('low when q11 = 3 (often free to disagree) and no other concerns', () => {
    const r = computeTier({ ...allZero(), q11: 3 });
    expect(r.tier).toBe('low');
  });

  it('low when q11 = 4 (always free to disagree, the default in tests)', () => {
    const r = computeTier(allZero());
    expect(r.tier).toBe('low');
  });
});

describe('computeTier — multi-block escalation', () => {
  it('takes the max tier across blocks (block A high beats block B moderate)', () => {
    const r = computeTier({
      ...allZero(),
      q3: 3, // Block A high
      q5: 2,
      q6: 2, // Block B moderate
    });
    expect(r.tier).toBe('high');
    expect(r.flags).toContain('q3_high');
    expect(r.flags).toContain('block_b_pattern');
  });

  it('keeps moderate when only Block A and Block C contribute moderate', () => {
    const r = computeTier({ ...allZero(), q2: 2, q10: 2 });
    expect(r.tier).toBe('moderate');
  });

  it('Q1 override beats everything', () => {
    const r = computeTier({
      ...allZero(),
      q1: 1, // any non-zero
      q2: 0,
      q11: 4,
    });
    expect(r.tier).toBe('high');
    expect(r.flags).toContain('q1_physical_harm');
  });
});

describe('computeTier — input hardening', () => {
  it('treats out-of-range scores as 0 (defensive — server validates)', () => {
    const r = computeTier({ ...allZero(), q1: 99 as number });
    expect(r.tier).toBe('low');
  });

  it('treats negative scores as 0', () => {
    const r = computeTier({ ...allZero(), q1: -1 as number });
    expect(r.tier).toBe('low');
  });

  it('treats missing answers as 0', () => {
    const r = computeTier({ q11: 4 });
    expect(r.tier).toBe('low');
  });
});
