import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// Loaded structure for a versioned prompt YAML. Mirrors what the
// existing /prompts/*.yaml files use; orchestrator code accesses
// these fields directly.
export interface PromptRecord {
  role: string;
  version: string;
  status?: 'active' | 'inactive';
  rollout_pct?: number;
  model: string;
  temperature?: number;
  max_tokens?: number;
  system?: string;
  user_template?: string;
}

const cache = new Map<string, PromptRecord>();
let loaded = false;

// Resolves prompts/ next to the compiled functions code at runtime.
// scripts/copy-prompts.js stages /prompts → functions/prompts on each
// build, so this path holds whether running via firebase deploy
// (Cloud Run) or `firebase emulators:start`.
function promptsDir(): string {
  return path.resolve(__dirname, '..', '..', 'prompts');
}

export function loadPrompts(): Map<string, PromptRecord> {
  if (loaded) return cache;
  const dir = promptsDir();
  if (!fs.existsSync(dir)) {
    throw new Error(
      `Prompts directory not found at ${dir}. Did the build copy step run?`,
    );
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.yaml'));
  for (const file of files) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    const parsed = yaml.load(text) as PromptRecord | null;
    if (!parsed || !parsed.role) {
      throw new Error(`Prompt ${file} missing required 'role' field.`);
    }
    cache.set(parsed.role, parsed);
  }
  loaded = true;
  return cache;
}

export function getPrompt(role: string): PromptRecord {
  if (!loaded) loadPrompts();
  const p = cache.get(role);
  if (!p) {
    throw new Error(`Unknown prompt role: ${role}`);
  }
  return p;
}

// Test-only: lets unit tests reset the cache without restarting the
// process. Not part of the public surface.
export function _resetForTests(): void {
  cache.clear();
  loaded = false;
}

// Simple {{variable}} substitution for prompt templates. Missing
// variables throw — better to fail loudly at the call site than emit
// a malformed prompt.
export function renderTemplate(
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
