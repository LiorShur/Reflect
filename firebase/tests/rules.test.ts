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
