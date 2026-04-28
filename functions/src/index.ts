// Cloud Functions entry point. Concrete handlers are registered as
// milestones land; for now this file just re-exports the orchestrator
// stub so `firebase deploy --only functions` has something to bind.

import { registerTriggers } from './orchestrator/triggers';

registerTriggers();

export { moderate } from './moderator/fast-path';
export { scoreFastPath } from './moderator/score';
