// E5 — Eval CLI runner.
//
// Loads a dataset, runs the corresponding prompt against each case,
// and applies the case-level expectations. Prints a markdown report
// to stdout (or --out) and exits non-zero on any failure.
//
// Usage:
//   ANTHROPIC_API_KEY=sk-... \
//   npx ts-node eval/scripts/run-eval.ts --suite translator
//   npx ts-node eval/scripts/run-eval.ts --suite moderator-fastpath
//   npx ts-node eval/scripts/run-eval.ts --suite moderator-escalation
//   npx ts-node eval/scripts/run-eval.ts --suite wrap-up
//   npx ts-node eval/scripts/run-eval.ts --suite all
//
// The fast-path suite is offline (pure code, no API key needed).
// Translator / escalation / wrap-up suites all call Claude.

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

import { scoreFastPath } from '../../functions/src/moderator/score';
import {
  parseModeratorEscalationOutput,
  parseTranslatorOutput,
} from '../../functions/src/turns/turn-utils';
import { parseSummarizerOutput } from '../../functions/src/sessions/wrap-up-utils';

interface PromptYaml {
  role: string;
  version: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
  system?: string;
  user_template?: string;
}

interface CaseResult {
  id: string;
  passed: boolean;
  reasons: string[];
  notes?: string;
}

const SUITES = [
  'translator',
  'moderator-fastpath',
  'moderator-escalation',
  'wrap-up',
] as const;
type Suite = (typeof SUITES)[number];

function parseArgs(): { suite: Suite | 'all'; out: string | null } {
  const args = process.argv.slice(2);
  const suiteIdx = args.indexOf('--suite');
  const suite = suiteIdx >= 0 ? (args[suiteIdx + 1] as Suite | 'all') : 'all';
  const outIdx = args.indexOf('--out');
  const out = outIdx >= 0 ? args[outIdx + 1] : null;
  if (suite !== 'all' && !SUITES.includes(suite as Suite)) {
    console.error(
      `Unknown suite: ${suite}. Use one of: ${SUITES.join(', ')} or 'all'.`,
    );
    process.exit(2);
  }
  return { suite, out };
}

function loadPrompt(role: string): PromptYaml {
  const file = role.replace(/_/g, '-') + '.yaml';
  const p = path.resolve(__dirname, '..', '..', 'prompts', file);
  const raw = fs.readFileSync(p, 'utf8');
  return yaml.load(raw) as PromptYaml;
}

function renderTemplate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) => {
    if (!(name in vars)) {
      throw new Error(`Template missing variable: ${name}`);
    }
    return String(vars[name]);
  });
}

function loadDataset<T>(name: string): T[] {
  const p = path.resolve(__dirname, '..', 'datasets', `${name}.json`);
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T[];
}

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.error(
      'ANTHROPIC_API_KEY is not set. The fast-path suite runs without it; LLM suites need it.',
    );
    process.exit(2);
  }
  _client = new Anthropic({ apiKey: key });
  return _client;
}

async function callClaude(
  prompt: PromptYaml,
  inputs: Record<string, string | number>,
): Promise<string> {
  if (!prompt.user_template) {
    throw new Error(`Prompt ${prompt.role} has no user_template`);
  }
  const resp = await client().messages.create({
    model: prompt.model,
    max_tokens: prompt.max_tokens ?? 1024,
    temperature: prompt.temperature,
    system: prompt.system,
    messages: [
      { role: 'user', content: renderTemplate(prompt.user_template, inputs) },
    ],
  });
  const block = resp.content[0];
  return block?.type === 'text' ? block.text : '';
}

// -- suites -----------------------------------------------------------

interface TranslatorCase {
  id: string;
  input: Record<string, string>;
  expect: {
    already_soft?: boolean;
    cannot_soften?: boolean;
    must_contain?: string[];
    must_not_contain?: string[];
  };
  notes?: string;
}

async function runTranslator(): Promise<CaseResult[]> {
  const prompt = loadPrompt('translator');
  const cases = loadDataset<TranslatorCase>('translator');
  const results: CaseResult[] = [];
  for (const c of cases) {
    const reasons: string[] = [];
    try {
      const text = await callClaude(prompt, c.input);
      const parsed = parseTranslatorOutput(text);
      if (
        c.expect.already_soft !== undefined &&
        parsed.already_soft !== c.expect.already_soft
      ) {
        reasons.push(
          `already_soft expected ${c.expect.already_soft}, got ${parsed.already_soft}`,
        );
      }
      if (
        c.expect.cannot_soften !== undefined &&
        parsed.cannot_soften !== c.expect.cannot_soften
      ) {
        reasons.push(
          `cannot_soften expected ${c.expect.cannot_soften}, got ${parsed.cannot_soften}`,
        );
      }
      const lower = parsed.softened.toLowerCase();
      for (const needle of c.expect.must_contain ?? []) {
        if (!lower.includes(needle.toLowerCase())) {
          reasons.push(`softened missing required substring: "${needle}"`);
        }
      }
      for (const needle of c.expect.must_not_contain ?? []) {
        if (lower.includes(needle.toLowerCase())) {
          reasons.push(`softened contains banned substring: "${needle}"`);
        }
      }
    } catch (err) {
      reasons.push(
        `runtime: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    results.push({
      id: c.id,
      passed: reasons.length === 0,
      reasons,
      notes: c.notes,
    });
  }
  return results;
}

interface FastPathCase {
  id: string;
  input: string;
  expect: {
    tier: 'clean' | 'tier_1' | 'tier_2' | 'tier_3';
    must_have_flag_types?: string[];
  };
  notes?: string;
}

function runModeratorFastpath(): CaseResult[] {
  const cases = loadDataset<FastPathCase>('moderator-fastpath');
  const results: CaseResult[] = [];
  for (const c of cases) {
    const reasons: string[] = [];
    const r = scoreFastPath(c.input);
    if (r.tier !== c.expect.tier) {
      reasons.push(
        `tier expected ${c.expect.tier}, got ${r.tier} (score=${r.score})`,
      );
    }
    for (const ft of c.expect.must_have_flag_types ?? []) {
      if (!r.flags.some((f) => f.type === ft)) {
        reasons.push(`missing required flag type: ${ft}`);
      }
    }
    results.push({
      id: c.id,
      passed: reasons.length === 0,
      reasons,
      notes: c.notes,
    });
  }
  return results;
}

interface EscalationCase {
  id: string;
  input: Record<string, string>;
  expect: {
    tier: 1 | 2 | 3;
    suggestion_must_be_present?: boolean;
  };
  notes?: string;
}

async function runModeratorEscalation(): Promise<CaseResult[]> {
  const prompt = loadPrompt('moderator_escalation');
  const cases = loadDataset<EscalationCase>('moderator-escalation');
  const results: CaseResult[] = [];
  for (const c of cases) {
    const reasons: string[] = [];
    try {
      const text = await callClaude(prompt, c.input);
      const parsed = parseModeratorEscalationOutput(text);
      if (parsed.tier !== c.expect.tier) {
        reasons.push(`tier expected ${c.expect.tier}, got ${parsed.tier}`);
      }
      if (
        c.expect.suggestion_must_be_present === true &&
        (parsed.suggestion === null || parsed.suggestion.trim().length === 0)
      ) {
        reasons.push('suggestion expected, got empty/null');
      }
    } catch (err) {
      reasons.push(
        `runtime: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    results.push({
      id: c.id,
      passed: reasons.length === 0,
      reasons,
      notes: c.notes,
    });
  }
  return results;
}

interface WrapUpCase {
  id: string;
  input: Record<string, string>;
  expect: {
    partner_a_summary_must_contain?: string[];
    partner_b_summary_must_contain?: string[];
    partner_b_summary_must_be_short?: boolean;
    must_not_suggest_solutions?: boolean;
    must_not_blame?: boolean;
  };
  notes?: string;
}

const SOLUTION_SIGNALS = [
  'you should',
  'you could',
  'try to',
  'next time',
  'going forward',
  'instead of',
];

const BLAME_SIGNALS = ['the problem is', 'is at fault', 'caused this'];

async function runWrapUp(): Promise<CaseResult[]> {
  const prompt = loadPrompt('wrap_up_summarizer');
  const cases = loadDataset<WrapUpCase>('wrap-up');
  const results: CaseResult[] = [];
  for (const c of cases) {
    const reasons: string[] = [];
    try {
      const text = await callClaude(prompt, c.input);
      const parsed = parseSummarizerOutput(text);
      const a = parsed.partner_a_summary.toLowerCase();
      const b = parsed.partner_b_summary.toLowerCase();
      for (const needle of c.expect.partner_a_summary_must_contain ?? []) {
        if (!a.includes(needle.toLowerCase())) {
          reasons.push(`partner_a missing substring: "${needle}"`);
        }
      }
      for (const needle of c.expect.partner_b_summary_must_contain ?? []) {
        if (!b.includes(needle.toLowerCase())) {
          reasons.push(`partner_b missing substring: "${needle}"`);
        }
      }
      if (
        c.expect.partner_b_summary_must_be_short === true &&
        parsed.partner_b_summary.length > 200
      ) {
        reasons.push(
          `partner_b summary expected short (no content from B); got ${parsed.partner_b_summary.length} chars`,
        );
      }
      if (c.expect.must_not_suggest_solutions === true) {
        for (const s of SOLUTION_SIGNALS) {
          if (a.includes(s) || b.includes(s)) {
            reasons.push(`solution-suggestion phrasing detected: "${s}"`);
          }
        }
      }
      if (c.expect.must_not_blame === true) {
        for (const s of BLAME_SIGNALS) {
          if (a.includes(s) || b.includes(s)) {
            reasons.push(`blame phrasing detected: "${s}"`);
          }
        }
      }
    } catch (err) {
      reasons.push(
        `runtime: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    results.push({
      id: c.id,
      passed: reasons.length === 0,
      reasons,
      notes: c.notes,
    });
  }
  return results;
}

// -- report ----------------------------------------------------------

function renderReport(label: string, results: CaseResult[]): string {
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const lines: string[] = [];
  lines.push(`## ${label} (${passed}/${total} passed)\n`);
  for (const r of results) {
    const mark = r.passed ? '✓' : '✗';
    lines.push(`- ${mark} **${r.id}**${r.notes ? ` — ${r.notes}` : ''}`);
    for (const reason of r.reasons) {
      lines.push(`  - ${reason}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const { suite, out } = parseArgs();
  const wantAll = suite === 'all';
  const blocks: string[] = [];
  let anyFailed = false;

  if (wantAll || suite === 'moderator-fastpath') {
    const r = runModeratorFastpath();
    blocks.push(renderReport('Moderator fast-path', r));
    if (r.some((x) => !x.passed)) anyFailed = true;
  }
  if (wantAll || suite === 'translator') {
    const r = await runTranslator();
    blocks.push(renderReport('Translator', r));
    if (r.some((x) => !x.passed)) anyFailed = true;
  }
  if (wantAll || suite === 'moderator-escalation') {
    // Skip silently if dataset doesn't exist yet (escalation seed not
    // shipped with this PR — file present without entries is fine too).
    const dsPath = path.resolve(
      __dirname,
      '..',
      'datasets',
      'moderator-escalation.json',
    );
    if (fs.existsSync(dsPath)) {
      const r = await runModeratorEscalation();
      blocks.push(renderReport('Moderator escalation', r));
      if (r.some((x) => !x.passed)) anyFailed = true;
    } else if (!wantAll) {
      console.error(
        'moderator-escalation dataset not found at eval/datasets/moderator-escalation.json',
      );
      process.exit(2);
    }
  }
  if (wantAll || suite === 'wrap-up') {
    const r = await runWrapUp();
    blocks.push(renderReport('Wrap-up summarizer', r));
    if (r.some((x) => !x.passed)) anyFailed = true;
  }

  const report = `# Eval report — ${new Date().toISOString()}\n\n${blocks.join('\n')}`;
  if (out) {
    fs.writeFileSync(out, report);
    console.log(`Report written to ${out}`);
  } else {
    console.log(report);
  }
  if (anyFailed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
