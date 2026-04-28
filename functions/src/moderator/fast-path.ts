import { FastPathResult, scoreFastPath, SpeakerBaseline } from './score';

export interface ModerateInput {
  text: string;
  baseline?: SpeakerBaseline;
}

export function moderate(input: ModerateInput): FastPathResult {
  return scoreFastPath(input.text, input.baseline);
}
