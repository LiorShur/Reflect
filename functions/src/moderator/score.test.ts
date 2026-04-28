import { scoreFastPath, SpeakerBaseline } from './score';

describe('scoreFastPath — self-reference exemption (docs/10 test cases)', () => {
  const cases: Array<[string, boolean]> = [
    ['I never feel heard', false],
    ['You never listen to me', true],
    ['I always end up doing the dishes alone', false],
    ['You always make this about yourself', true],
    ['I never know what to say in these moments', false],
  ];

  test.each(cases)('"%s" should flag = %s', (input, shouldFlag) => {
    const result = scoreFastPath(input);
    const flagged = result.tier !== 'clean';
    expect(flagged).toBe(shouldFlag);
  });
});

describe('scoreFastPath — tier assignment', () => {
  it('clean text returns tier=clean, score=0', () => {
    const r = scoreFastPath('I would like us to talk about the dishes.');
    expect(r.tier).toBe('clean');
    expect(r.score).toBe(0);
    expect(r.flags).toHaveLength(0);
  });

  it('contempt phrase forces tier_3 regardless of total score', () => {
    const r = scoreFastPath('grow up');
    expect(r.tier).toBe('tier_3');
    expect(r.flags.some((f) => f.type === 'contempt_phrase')).toBe(true);
  });

  it('name-calling directed at partner forces tier_3', () => {
    const r = scoreFastPath("you're an idiot");
    expect(r.tier).toBe('tier_3');
    expect(r.flags.some((f) => f.type === 'name_calling')).toBe(true);
  });

  it('absolutism alone is tier_1 (silent suggestion)', () => {
    const r = scoreFastPath('You always do that.');
    expect(r.tier).toBe('tier_1');
  });

  it('mind-reading + absolutism reaches tier_2 with escalation', () => {
    const r = scoreFastPath("You never even try, you don't care.");
    expect(['tier_2', 'tier_3']).toContain(r.tier);
    if (r.tier === 'tier_2') {
      expect(r.needs_escalation).toBe(true);
    }
  });
});

describe('scoreFastPath — self-reference exemption only suppresses absolutism', () => {
  it('"I never" prefix still allows name-calling to fire on the same message', () => {
    const r = scoreFastPath("I never said this, but you're an idiot.");
    expect(r.tier).toBe('tier_3');
    expect(r.flags.some((f) => f.type === 'name_calling')).toBe(true);
  });
});

describe('scoreFastPath — name-calling proximity', () => {
  it('contempt name without "you" nearby is NOT flagged as name-calling', () => {
    const r = scoreFastPath('That comment was lazy reasoning.');
    expect(r.flags.some((f) => f.type === 'name_calling')).toBe(false);
  });

  it('contempt name immediately after "you are" is flagged', () => {
    const r = scoreFastPath('You are so selfish.');
    expect(r.flags.some((f) => f.type === 'name_calling')).toBe(true);
  });
});

describe('scoreFastPath — defensiveness opener (first 12 words only)', () => {
  it('flags "I wouldn\'t have to if" at start', () => {
    const r = scoreFastPath("I wouldn't have to if you actually helped.");
    expect(r.flags.some((f) => f.type === 'defensiveness')).toBe(true);
  });

  it('does NOT flag the same phrase deep in a long message', () => {
    const r = scoreFastPath(
      'I want to talk about how we share housework. ' +
        "When dishes pile up I wouldn't have to if you helped.",
    );
    expect(r.flags.some((f) => f.type === 'defensiveness')).toBe(false);
  });
});

describe('scoreFastPath — activation deltas', () => {
  const baseline: SpeakerBaseline = {
    avg_message_length: 200,
    avg_exclamations: 0.5,
    sample_count: 10,
  };

  it('flags all-caps shouting against baseline', () => {
    const r = scoreFastPath('I am DONE with this.', baseline);
    expect(r.flags.some((f) => f.type === 'activation_caps')).toBe(true);
  });

  it('skips activation flags when sample_count < 5', () => {
    const tinyBaseline: SpeakerBaseline = {
      avg_message_length: 200,
      avg_exclamations: 0.5,
      sample_count: 2,
    };
    const r = scoreFastPath('I am DONE with this.', tinyBaseline);
    expect(r.flags.some((f) => f.type.startsWith('activation_'))).toBe(false);
  });
});
