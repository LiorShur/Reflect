import { updateBaseline } from './baseline-utils';

describe('updateBaseline', () => {
  it('initializes from null', () => {
    const result = updateBaseline(null, 'hello world');
    expect(result.sample_count).toBe(1);
    expect(result.avg_message_length).toBe(11);
    expect(result.avg_exclamations).toBe(0);
  });

  it('accumulates a second sample', () => {
    const r1 = updateBaseline(null, 'hello');
    const r2 = updateBaseline(r1, 'goodbye!');
    expect(r2.sample_count).toBe(2);
    expect(r2.avg_message_length).toBeCloseTo((5 + 8) / 2, 6);
    expect(r2.avg_exclamations).toBeCloseTo((0 + 1) / 2, 6);
  });

  it('rolling mean is stable across many samples', () => {
    let baseline = updateBaseline(null, 'x'.repeat(10));
    for (let i = 0; i < 9; i++) {
      baseline = updateBaseline(baseline, 'x'.repeat(10));
    }
    expect(baseline.sample_count).toBe(10);
    expect(baseline.avg_message_length).toBeCloseTo(10, 6);
    expect(baseline.avg_exclamations).toBe(0);
  });

  it('counts multiple exclamations in one text', () => {
    const r = updateBaseline(null, 'wow!!! really!');
    expect(r.avg_exclamations).toBe(4);
  });

  it('handles empty text', () => {
    const r = updateBaseline(null, '');
    expect(r.sample_count).toBe(1);
    expect(r.avg_message_length).toBe(0);
    expect(r.avg_exclamations).toBe(0);
  });

  it('treats partial baselines (missing fields) as zero', () => {
    const partial = {
      avg_message_length: 0,
      avg_exclamations: 0,
      sample_count: 0,
    };
    const r = updateBaseline(partial, 'abcd');
    expect(r.sample_count).toBe(1);
    expect(r.avg_message_length).toBe(4);
  });

  it('shifts means toward new samples (longer text)', () => {
    let baseline = updateBaseline(null, 'short');
    baseline = updateBaseline(baseline, 'short');
    baseline = updateBaseline(baseline, 'this is a much longer message');
    expect(baseline.avg_message_length).toBeGreaterThan(5);
    expect(baseline.avg_message_length).toBeLessThan(29);
  });
});
