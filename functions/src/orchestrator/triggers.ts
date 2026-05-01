import { logger } from 'firebase-functions/v2';

import { loadPrompts } from '../prompts/registry';

// Cold-start hook: warm the prompt cache so the first user-facing
// call doesn't pay a filesystem-read penalty. RTDB onWrite triggers
// for sessions land in M3b (session creation) and M3c (speaker
// compose → moderator → translator).
export function registerTriggers(): void {
  try {
    const prompts = loadPrompts();
    logger.info('orchestrator: prompts loaded', {
      count: prompts.size,
      roles: Array.from(prompts.keys()),
    });
  } catch (err) {
    // Don't crash the function instance on cold start if prompts
    // are missing — surface the error in logs and fail callers
    // explicitly when they request a missing role.
    logger.error('orchestrator: failed to load prompts at cold start', {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
