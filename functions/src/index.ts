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
