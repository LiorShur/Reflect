// Screening question battery. Text is taken VERBATIM from
// docs/07-safety-screening.md § Question battery. Any rewording must
// be flagged for human review per CLAUDE.md safety rails — wording in
// this flow can directly cause harm if subtly wrong.

export type Likert = 0 | 1 | 2 | 3 | 4;

export const LIKERT_LABELS: Record<Likert, string> = {
  0: 'Never',
  1: 'Rarely',
  2: 'Sometimes',
  3: 'Often',
  4: 'Always',
};

export interface ScreeningQuestion {
  id: string;
  text: string;
  block: 'A' | 'B' | 'C';
  // Q11 is the only reverse-scored item: higher score = safer.
  reverseScored?: boolean;
}

export const SCREENING_QUESTIONS: ScreeningQuestion[] = [
  // Block A — Direct conflict
  {
    id: 'q1',
    text: 'How often does your partner physically hurt you?',
    block: 'A',
  },
  {
    id: 'q2',
    text: 'How often does your partner insult you or talk down to you?',
    block: 'A',
  },
  {
    id: 'q3',
    text: 'How often does your partner threaten you with harm?',
    block: 'A',
  },
  {
    id: 'q4',
    text: 'How often does your partner scream or curse at you?',
    block: 'A',
  },
  // Block B — Coercive control
  {
    id: 'q5',
    text: 'How often does your partner make most of the major decisions without consulting you?',
    block: 'B',
  },
  {
    id: 'q6',
    text: 'How often have you stopped seeing friends or family because of conflict with your partner?',
    block: 'B',
  },
  {
    id: 'q7',
    text: 'How often do you avoid certain topics because of how your partner might react?',
    block: 'B',
  },
  {
    id: 'q8',
    text: 'How often does your partner check or monitor your phone, location, or activity?',
    block: 'B',
  },
  {
    id: 'q9',
    text: 'How often does your partner control your access to money?',
    block: 'B',
  },
  // Block C — Subjective safety
  {
    id: 'q10',
    text: 'Do you feel afraid of your partner?',
    block: 'C',
  },
  {
    id: 'q11',
    text: 'Do you feel free to disagree with your partner?',
    block: 'C',
    reverseScored: true,
  },
];
