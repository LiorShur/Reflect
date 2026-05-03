// Cloud Functions entry point. Initializes the Admin SDK once per cold
// start and exposes the deploy targets.

import { getApps, initializeApp } from 'firebase-admin/app';

import { registerTriggers } from './orchestrator/triggers';

if (getApps().length === 0) {
  initializeApp();
}

registerTriggers();

export { createPairCode } from './pairing/create-pair-code';
export { redeemPairCode } from './pairing/redeem-pair-code';
export { submitScreening } from './screening/submit-screening';
export { createSession } from './sessions/create-session';
export { proposeTopic, acceptTopic, reframeTopic } from './sessions/topic';
export { clearStaleSession } from './sessions/clear-stale-session';
export { onCheckinWritten } from './sessions/checkins-trigger';
export { onSessionEnded } from './sessions/last-conflict-trigger';
export { requestSessionEnd } from './sessions/end-session';
export { adjustSummary } from './sessions/adjust-summary';
export { requestPause } from './sessions/request-pause';
export { resumeFromPause } from './sessions/resume-from-pause';
export { onMetaStateWritten } from './sessions/wrap-up-trigger';
export { onWrapUpConfirmWritten } from './sessions/wrap-up-confirm-trigger';
export { onSpeakerDraftWritten } from './turns/speaker-draft-trigger';
export { decideTranslation } from './turns/decide-translation';
export { confirmTurn } from './turns/confirm-turn';
export { ackFloorSwap } from './turns/ack-floor-swap';
export { onHistoryWritten } from './turns/history-trigger';
