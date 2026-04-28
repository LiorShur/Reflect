import { FastPathResult } from './score';

// Stub — milestone 3 (AI2). Calls the moderator-escalation prompt for
// tier_2 ambiguous cases via anthropic/client.

export interface EscalationInput {
  text: string;
  fast_path: FastPathResult;
}

export interface EscalationResult {
  final_tier: FastPathResult['tier'];
  rationale: string;
}

export async function escalateToClaude(
  _input: EscalationInput,
): Promise<EscalationResult> {
  throw new Error('not implemented: moderator/escalation.escalateToClaude');
}
