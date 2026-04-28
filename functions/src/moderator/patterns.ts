export const ABSOLUTISM = new Set([
  'always',
  'never',
  'every time',
  'every single time',
  'all the time',
  'constantly',
  'forever',
  'nothing',
  'everything',
  'no one',
  'nobody',
  'everyone',
]);

export const CONTEMPT_NAMES = new Set([
  'idiot',
  'asshole',
  'jerk',
  'loser',
  'pathetic',
  'selfish',
  'lazy',
  'stupid',
  'childish',
  'immature',
  'crazy',
  'insane',
  'ridiculous',
  'useless',
  'worthless',
]);

export const CONTEMPT_PHRASES: RegExp[] = [
  /\btypical (of )?you\b/i,
  /\bclassic you\b/i,
  /\breal mature\b/i,
  /\bwow,?\s+(just|really|so)\s+wow\b/i,
  /\boh (please|come on|sure)\b/i,
  /\bsure,?\s+jan\b/i,
  /\bof course you\b/i,
  /\bgrow up\b/i,
];

export const CHARACTER_ATTACK: RegExp[] = [
  /\byou(?:'re| are) (?:so|such (?:a|an))\s+(\w+)/i,
  /\byou(?:'re| are) (?:a|an)\s+(\w+(?: \w+)?)/i,
  /\byou(?:'re| are) being\s+(\w+)/i,
];

export const MIND_READING: RegExp[] = [
  /\byou don't (even )?(care|love|listen|see|notice)\b/i,
  /\byou obviously\b/i,
  /\byou clearly (don't|can't|won't)\b/i,
  /\byou never (even )?(try|bother|think)\b/i,
];

export const DEFENSIVENESS_OPENERS: RegExp[] = [
  /^(well,?\s+)?i wouldn't (have to|need to)\s+(?:if|because)/i,
  /^yeah,?\s+but you\b/i,
  /^i'm just trying to\b/i,
  /^the only reason i\b/i,
];

// NOTE: docs/10 § "Word lists and patterns" shows a narrower regex
// requiring an emotion verb after "I never/always":
//   /\bi (never|always) (feel|felt|am|was|get)\b/i
// That regex fails the doc's own test cases ("I always end up doing the
// dishes alone", "I never know what to say in these moments"). The
// exemption only suppresses absolutism scoring — other patterns
// (character_attack, mind_reading, name_calling) still fire — so
// broadening this to any "I never|always" self-statement matches the
// spirit of the spec and the documented test cases.
//
// Flagged for human review: confirm broadened pattern is acceptable, or
// extend the verb list instead.
export const SELF_REFERENCE: RegExp[] = [/\bi (never|always)\b/i];
