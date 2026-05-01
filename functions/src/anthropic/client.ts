import Anthropic from '@anthropic-ai/sdk';
import { defineSecret } from 'firebase-functions/params';

import { getPrompt, renderTemplate } from '../prompts/registry';
import {
  assertUnderCap,
  computeCostUsd,
  recordCost,
  type UsageInfo,
} from './cost-cap';

// API key is a Firebase Functions Secret — set via:
//   firebase functions:secrets:set ANTHROPIC_API_KEY
// Functions that call callClaude must declare this secret in their
// onCall options so Cloud Functions injects it at runtime.
export const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

// Wrapper interface: callers pass the prompt role and the variables
// to substitute into its user_template. The system prompt comes from
// the YAML; the user message comes from the rendered template.
export interface AnthropicCallOptions {
  prompt_role: string; // e.g., 'translator'
  inputs: Record<string, string | number>;
}

export interface AnthropicCallResult {
  text: string;
  prompt_version: string;
  model: string;
  usage: UsageInfo;
  cost_usd: number;
}

let cachedClient: Anthropic | null = null;
function client(): Anthropic {
  if (cachedClient) return cachedClient;
  const key = ANTHROPIC_API_KEY.value();
  if (!key) {
    throw new Error(
      'ANTHROPIC_API_KEY secret is not set. Run: firebase functions:secrets:set ANTHROPIC_API_KEY',
    );
  }
  cachedClient = new Anthropic({ apiKey: key });
  return cachedClient;
}

// Single entry point for AI calls. Per CLAUDE.md safety rail #1, the
// only place the Anthropic SDK is instantiated. Callers must run
// inside a Cloud Function that declares ANTHROPIC_API_KEY in its
// onCall secrets.
//
// Order of checks: cap-precheck → SDK call → cost record. The
// cap-precheck reads today's accumulated spend and refuses if at or
// over $5; the post-record increments after a successful call.
// There's a small race window where two concurrent invocations both
// pass the precheck and overshoot — acceptable for v1, since the
// overshoot is bounded by per-call cost (cents).
export async function callClaude(
  opts: AnthropicCallOptions,
): Promise<AnthropicCallResult> {
  const prompt = getPrompt(opts.prompt_role);
  if (!prompt.user_template) {
    throw new Error(
      `Prompt '${opts.prompt_role}' has no user_template; cannot call.`,
    );
  }

  await assertUnderCap();

  const userMessage = renderTemplate(prompt.user_template, opts.inputs);

  const response = await client().messages.create({
    model: prompt.model,
    max_tokens: prompt.max_tokens ?? 1024,
    temperature: prompt.temperature,
    system: prompt.system,
    messages: [{ role: 'user', content: userMessage }],
  });

  const usage: UsageInfo = {
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  };
  const cost_usd = computeCostUsd(prompt.model, usage);
  await recordCost(cost_usd);

  // Extract text content. Anthropic responses are content blocks; for
  // our use cases (single-turn text generation) we only expect the
  // first text block.
  const firstBlock = response.content[0];
  const text = firstBlock?.type === 'text' ? firstBlock.text : '';

  return {
    text,
    prompt_version: prompt.version,
    model: prompt.model,
    usage,
    cost_usd,
  };
}
