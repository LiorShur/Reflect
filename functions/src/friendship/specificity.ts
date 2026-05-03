// Pure helper for R4 — specificity nudge on daily appreciations.
// Side-effect-free so the mobile client can inline-check the input
// while the user types. We intentionally err on the side of NOT
// nudging — it's a soft suggestion, not a block, and false positives
// feel more annoying than missing some genuinely-vague appreciations.
//
// docs/04 § Daily appreciation: "Soft inline nudge if input is
// generic (\"what specifically today?\")."

const STOPWORDS = new Set([
  'thanks',
  'thank',
  'love',
  'you',
  'the',
  'a',
  'an',
  'is',
  'was',
  'were',
  'been',
  'being',
  'are',
  'am',
  'so',
  'much',
  'really',
  'very',
  'good',
  'great',
  'nice',
  'sweet',
  'kind',
  'i',
  'me',
  'my',
  'mine',
  'your',
  'yours',
  'for',
  'to',
  'today',
  'tonight',
  'always',
  'just',
  'and',
  'or',
  'but',
  'wow',
  'yeah',
  'yes',
  'cool',
  'awesome',
]);

const MIN_LENGTH_FOR_SPECIFIC = 25;
const MIN_NON_STOPWORD_TOKENS = 2;

// Returns true when an appreciation reads as generic enough to suggest
// the user say what specifically. The test is fuzzy — short AND
// stopword-heavy is the trigger. Either alone is fine.
export function isGenericAppreciation(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false; // empty is not "generic" — it's blank
  if (trimmed.length >= MIN_LENGTH_FOR_SPECIFIC) return false;

  const tokens = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);

  const nonStop = tokens.filter((t) => !STOPWORDS.has(t));
  return nonStop.length < MIN_NON_STOPWORD_TOKENS;
}
