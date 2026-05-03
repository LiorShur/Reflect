import * as fs from 'fs';
import * as path from 'path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

const PROJECT_ID = 'reflect-rules-test';
const RULES_PATH = path.resolve(__dirname, '..', 'database.rules.json');

let testEnv: RulesTestEnvironment;

const A = 'partnerA-uid';
const B = 'partnerB-uid';
const X = 'stranger-uid';
const SID = 'session-1';

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    database: {
      rules: fs.readFileSync(RULES_PATH, 'utf8'),
      host: '127.0.0.1',
      port: 9000,
    },
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearDatabase();

  // Seed session meta + current_turn pointers via the privileged context.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    await db.ref(`sessions/${SID}`).set({
      meta: { partnerA: A, partnerB: B, state: 'IN_TURN' },
      current_turn: {
        speaker_uid: A,
        listener_uid: B,
      },
    });
  });
});

function refFor(uid: string | null, p: string) {
  const ctx = uid
    ? testEnv.authenticatedContext(uid)
    : testEnv.unauthenticatedContext();
  return ctx.database().ref(p);
}

describe('partner-boundary reads', () => {
  it('speaker can read own speaker_draft', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .database()
        .ref(`sessions/${SID}/current_turn/speaker_draft`)
        .set({ text: 'hi', committed: false });
    });
    await assertSucceeds(
      refFor(A, `sessions/${SID}/current_turn/speaker_draft`).once('value'),
    );
  });

  it('listener cannot read speaker_draft', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .database()
        .ref(`sessions/${SID}/current_turn/speaker_draft`)
        .set({ text: 'hi', committed: false });
    });
    await assertFails(
      refFor(B, `sessions/${SID}/current_turn/speaker_draft`).once('value'),
    );
  });

  it('listener can read own listener_draft', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .database()
        .ref(`sessions/${SID}/current_turn/listener_draft`)
        .set({ text: 'mirror' });
    });
    await assertSucceeds(
      refFor(B, `sessions/${SID}/current_turn/listener_draft`).once('value'),
    );
  });

  it('speaker cannot read listener_draft', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .database()
        .ref(`sessions/${SID}/current_turn/listener_draft`)
        .set({ text: 'mirror' });
    });
    await assertFails(
      refFor(A, `sessions/${SID}/current_turn/listener_draft`).once('value'),
    );
  });

  it('non-participant cannot read session at all', async () => {
    await assertFails(refFor(X, `sessions/${SID}`).once('value'));
  });
});

describe('partner-boundary writes', () => {
  it('speaker can write own speaker_draft when state=IN_TURN', async () => {
    await assertSucceeds(
      refFor(A, `sessions/${SID}/current_turn/speaker_draft`).set({
        text: 'draft',
        committed: false,
      }),
    );
  });

  it('listener cannot write speaker_draft', async () => {
    await assertFails(
      refFor(B, `sessions/${SID}/current_turn/speaker_draft`).set({
        text: 'draft',
        committed: false,
      }),
    );
  });

  it('neither partner can write delivered (orchestrator-only path)', async () => {
    await assertFails(
      refFor(A, `sessions/${SID}/current_turn/delivered`).set({
        text: 'spoofed',
      }),
    );
    await assertFails(
      refFor(B, `sessions/${SID}/current_turn/delivered`).set({
        text: 'spoofed',
      }),
    );
  });

  it('neither partner can write meta directly', async () => {
    await assertFails(refFor(A, `sessions/${SID}/meta/state`).set('WRAP_UP'));
    await assertFails(refFor(B, `sessions/${SID}/meta/partnerA`).set(B));
  });

  it('translation.approved writable only by speaker', async () => {
    await assertSucceeds(
      refFor(A, `sessions/${SID}/current_turn/translation/approved`).set(true),
    );
    await assertFails(
      refFor(B, `sessions/${SID}/current_turn/translation/approved`).set(true),
    );
  });

  it('translation.softened cannot be written by either partner', async () => {
    await assertFails(
      refFor(A, `sessions/${SID}/current_turn/translation/softened`).set(
        'spoofed soft text',
      ),
    );
    await assertFails(
      refFor(B, `sessions/${SID}/current_turn/translation/softened`).set(
        'spoofed soft text',
      ),
    );
  });
});

describe('user-scoped paths', () => {
  it('user can write own display_name', async () => {
    await assertSucceeds(
      refFor(A, `users/${A}/profile/display_name`).set('Alice'),
    );
  });

  it('user cannot write another user display_name', async () => {
    await assertFails(refFor(B, `users/${A}/profile/display_name`).set('Bob'));
  });

  it('partner_uid is server-only (orchestrator-written via pairing function)', async () => {
    // M2 safety rail: a malicious client cannot self-pair by writing
    // partner_uid directly.
    await assertFails(refFor(A, `users/${A}/profile/partner_uid`).set(B));
  });

  it('paired_at is server-only', async () => {
    await assertFails(refFor(A, `users/${A}/profile/paired_at`).set(123));
  });

  it('active_session_id is server-only (orchestrator-written by createSession)', async () => {
    await assertFails(
      refFor(A, `users/${A}/profile/active_session_id`).set('abc'),
    );
  });

  it('screening is server-only (orchestrator computes tier)', async () => {
    await assertFails(refFor(A, `users/${A}/screening`).set({ tier: 'low' }));
  });

  it('baseline is server-only (orchestrator updates rolling avg)', async () => {
    await assertFails(
      refFor(A, `users/${A}/baseline`).set({
        avg_message_length: 100,
        sample_count: 10,
      }),
    );
  });
});

describe('meta + telemetry paths (server-only)', () => {
  it('authenticated user cannot read /meta', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('meta/anthropic_cost/2026-05-01').set(0.5);
    });
    await assertFails(
      refFor(A, 'meta/anthropic_cost/2026-05-01').once('value'),
    );
  });

  it('authenticated user cannot write /meta', async () => {
    await assertFails(refFor(A, 'meta/anthropic_cost/2026-05-01').set(0));
  });

  it('authenticated user cannot read /telemetry', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .database()
        .ref('telemetry/traces/2026-05-01/x')
        .set({ prompt_role: 'translator' });
    });
    await assertFails(refFor(A, 'telemetry/traces/2026-05-01').once('value'));
  });

  it('authenticated user cannot write /telemetry', async () => {
    await assertFails(
      refFor(A, 'telemetry/traces/2026-05-01/x').set({
        prompt_role: 'translator',
      }),
    );
  });
});

// Helper: override meta/state for a single test. The default seed is
// state=IN_TURN; some paths gate on state=CHECK_IN, FLOOR_SWAP, etc.
async function setState(state: string) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.database().ref(`sessions/${SID}/meta/state`).set(state);
  });
}

describe('checkins (per-uid private)', () => {
  beforeEach(async () => {
    await setState('CHECK_IN');
  });

  it('partner can read own checkin', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .database()
        .ref(`sessions/${SID}/checkins/${A}`)
        .set({ flooding_score: 4, ready: true });
    });
    await assertSucceeds(
      refFor(A, `sessions/${SID}/checkins/${A}`).once('value'),
    );
  });

  it('partner cannot read other partner checkin', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .database()
        .ref(`sessions/${SID}/checkins/${A}`)
        .set({ flooding_score: 9, ready: true });
    });
    await assertFails(refFor(B, `sessions/${SID}/checkins/${A}`).once('value'));
  });

  it('partner can write own checkin during CHECK_IN', async () => {
    await assertSucceeds(
      refFor(A, `sessions/${SID}/checkins/${A}`).set({
        flooding_score: 3,
        ready: true,
      }),
    );
  });

  it('partner cannot write other partner checkin', async () => {
    await assertFails(
      refFor(A, `sessions/${SID}/checkins/${B}`).set({
        flooding_score: 1,
        ready: true,
      }),
    );
  });

  it('partner cannot write own checkin outside CHECK_IN', async () => {
    await setState('IN_TURN');
    await assertFails(
      refFor(A, `sessions/${SID}/checkins/${A}`).set({
        flooding_score: 3,
        ready: true,
      }),
    );
  });

  it('non-participant cannot read or write checkins', async () => {
    await assertFails(refFor(X, `sessions/${SID}/checkins/${A}`).once('value'));
    await assertFails(
      refFor(X, `sessions/${SID}/checkins/${X}`).set({
        flooding_score: 1,
        ready: true,
      }),
    );
  });
});

describe('mirror (listener-only one-shot write)', () => {
  it('listener can write mirror when none exists', async () => {
    await assertSucceeds(
      refFor(B, `sessions/${SID}/current_turn/mirror`).set({
        text: 'reflection',
        submitted_at: 1,
      }),
    );
  });

  it('listener cannot overwrite existing mirror', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .database()
        .ref(`sessions/${SID}/current_turn/mirror`)
        .set({ text: 'first', submitted_at: 1 });
    });
    await assertFails(
      refFor(B, `sessions/${SID}/current_turn/mirror`).set({
        text: 'overwrite',
        submitted_at: 2,
      }),
    );
  });

  it('speaker cannot write mirror', async () => {
    await assertFails(
      refFor(A, `sessions/${SID}/current_turn/mirror`).set({
        text: 'spoof',
        submitted_at: 1,
      }),
    );
  });

  it('both partners can read mirror', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .database()
        .ref(`sessions/${SID}/current_turn/mirror`)
        .set({ text: 'reflection', submitted_at: 1 });
    });
    await assertSucceeds(
      refFor(A, `sessions/${SID}/current_turn/mirror`).once('value'),
    );
    await assertSucceeds(
      refFor(B, `sessions/${SID}/current_turn/mirror`).once('value'),
    );
  });

  it('listener cannot write mirror outside IN_TURN', async () => {
    await setState('FLOOR_SWAP');
    await assertFails(
      refFor(B, `sessions/${SID}/current_turn/mirror`).set({
        text: 'reflection',
        submitted_at: 1,
      }),
    );
  });
});

describe('speaker_confirmation (speaker-only write)', () => {
  it('speaker can write speaker_confirmation', async () => {
    await assertSucceeds(
      refFor(A, `sessions/${SID}/current_turn/speaker_confirmation`).set({
        status: 'heard',
      }),
    );
  });

  it('listener cannot write speaker_confirmation', async () => {
    await assertFails(
      refFor(B, `sessions/${SID}/current_turn/speaker_confirmation`).set({
        status: 'heard',
      }),
    );
  });

  it('both partners can read speaker_confirmation', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .database()
        .ref(`sessions/${SID}/current_turn/speaker_confirmation`)
        .set({ status: 'heard' });
    });
    await assertSucceeds(
      refFor(A, `sessions/${SID}/current_turn/speaker_confirmation`).once(
        'value',
      ),
    );
    await assertSucceeds(
      refFor(B, `sessions/${SID}/current_turn/speaker_confirmation`).once(
        'value',
      ),
    );
  });
});

describe('history (append-only, server-written)', () => {
  it('neither partner can write history', async () => {
    await assertFails(
      refFor(A, `sessions/${SID}/history/turn1`).set({
        speaker_uid: A,
        delivered_text: 'fake',
      }),
    );
    await assertFails(
      refFor(B, `sessions/${SID}/history/turn1`).set({
        speaker_uid: A,
        delivered_text: 'fake',
      }),
    );
  });

  it('both partners can read history', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .database()
        .ref(`sessions/${SID}/history/turn1`)
        .set({ speaker_uid: A, delivered_text: 'real' });
    });
    await assertSucceeds(
      refFor(A, `sessions/${SID}/history/turn1`).once('value'),
    );
    await assertSucceeds(
      refFor(B, `sessions/${SID}/history/turn1`).once('value'),
    );
  });

  it('non-participant cannot read history', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .database()
        .ref(`sessions/${SID}/history/turn1`)
        .set({ speaker_uid: A, delivered_text: 'real' });
    });
    await assertFails(refFor(X, `sessions/${SID}/history/turn1`).once('value'));
  });
});

describe('flags (server-written, participant-readable)', () => {
  it('neither partner can write flags', async () => {
    await assertFails(
      refFor(A, `sessions/${SID}/flags/flag1`).set({
        type: 'harsh_startup',
        severity: 3,
      }),
    );
    await assertFails(
      refFor(B, `sessions/${SID}/flags/flag1`).set({
        type: 'harsh_startup',
        severity: 3,
      }),
    );
  });

  it('both partners can read flags', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .database()
        .ref(`sessions/${SID}/flags/flag1`)
        .set({ type: 'harsh_startup', severity: 3, target_uid: A });
    });
    await assertSucceeds(
      refFor(A, `sessions/${SID}/flags/flag1`).once('value'),
    );
    await assertSucceeds(
      refFor(B, `sessions/${SID}/flags/flag1`).once('value'),
    );
  });
});

describe('summary (per-partner confirms, server-written summaries)', () => {
  it('partner A can confirm own summary', async () => {
    await assertSucceeds(
      refFor(A, `sessions/${SID}/summary/partner_a_confirmed`).set(true),
    );
  });

  it('partner B cannot confirm partner A summary', async () => {
    await assertFails(
      refFor(B, `sessions/${SID}/summary/partner_a_confirmed`).set(true),
    );
  });

  it('partner B can confirm own summary', async () => {
    await assertSucceeds(
      refFor(B, `sessions/${SID}/summary/partner_b_confirmed`).set(true),
    );
  });

  it('partner A cannot confirm partner B summary', async () => {
    await assertFails(
      refFor(A, `sessions/${SID}/summary/partner_b_confirmed`).set(true),
    );
  });

  it('neither partner can write a summary string', async () => {
    await assertFails(
      refFor(A, `sessions/${SID}/summary/partner_a_summary`).set('spoof'),
    );
    await assertFails(
      refFor(B, `sessions/${SID}/summary/partner_b_summary`).set('spoof'),
    );
  });

  it('both partners can read summaries', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref(`sessions/${SID}/summary`).set({
        partner_a_summary: 'A says…',
        partner_b_summary: 'B says…',
      });
    });
    await assertSucceeds(
      refFor(A, `sessions/${SID}/summary/partner_b_summary`).once('value'),
    );
    await assertSucceeds(
      refFor(B, `sessions/${SID}/summary/partner_a_summary`).once('value'),
    );
  });
});

describe('presence (per-uid)', () => {
  it('user can write own presence', async () => {
    await assertSucceeds(
      refFor(A, `sessions/${SID}/presence/${A}/online`).set(true),
    );
  });

  it('user cannot write other user presence', async () => {
    await assertFails(
      refFor(B, `sessions/${SID}/presence/${A}/online`).set(true),
    );
  });

  it('both partners can read partner presence', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .database()
        .ref(`sessions/${SID}/presence/${A}/online`)
        .set(true);
    });
    await assertSucceeds(
      refFor(B, `sessions/${SID}/presence/${A}/online`).once('value'),
    );
  });
});

describe('appreciation_feed (recipient-private, sender-attributed)', () => {
  it('recipient can read own feed', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .database()
        .ref(`appreciation_feed/${A}/entry1`)
        .set({ from_uid: B, content: 'thanks' });
    });
    await assertSucceeds(refFor(A, `appreciation_feed/${A}`).once('value'));
  });

  it('non-recipient cannot read others feed', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .database()
        .ref(`appreciation_feed/${A}/entry1`)
        .set({ from_uid: B, content: 'thanks' });
    });
    await assertFails(refFor(B, `appreciation_feed/${A}`).once('value'));
  });

  it('sender can write to recipient feed when from_uid===self', async () => {
    await assertSucceeds(
      refFor(B, `appreciation_feed/${A}/entry2`).set({
        from_uid: B,
        content: 'thanks',
      }),
    );
  });

  it('sender cannot spoof from_uid', async () => {
    await assertFails(
      refFor(B, `appreciation_feed/${A}/entry3`).set({
        from_uid: A,
        content: 'self-fake',
      }),
    );
  });

  it('recipient can write reaction on own entry', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .database()
        .ref(`appreciation_feed/${A}/entry4`)
        .set({ from_uid: B, content: 'kind' });
    });
    await assertSucceeds(
      refFor(A, `appreciation_feed/${A}/entry4/reaction`).set('heart'),
    );
  });

  it('sender cannot write reaction on recipient entry', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .database()
        .ref(`appreciation_feed/${A}/entry5`)
        .set({ from_uid: B, content: 'kind' });
    });
    await assertFails(
      refFor(B, `appreciation_feed/${A}/entry5/reaction`).set('heart'),
    );
  });
});

describe('pair_codes path (server-only)', () => {
  it('authenticated user cannot read pair_codes', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('pair_codes/123456').set({
        creator_uid: A,
        created_at: 1,
        expires_at: 2,
      });
    });
    await assertFails(refFor(A, 'pair_codes/123456').once('value'));
    await assertFails(refFor(A, 'pair_codes').once('value'));
  });

  it('authenticated user cannot write pair_codes', async () => {
    await assertFails(
      refFor(A, 'pair_codes/999999').set({
        creator_uid: A,
        created_at: 1,
        expires_at: 2,
      }),
    );
  });

  it('unauthenticated user cannot read or write pair_codes', async () => {
    await assertFails(refFor(null, 'pair_codes/123456').once('value'));
    await assertFails(
      refFor(null, 'pair_codes/999999').set({ creator_uid: A }),
    );
  });
});
