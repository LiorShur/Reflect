import { useEffect, useState } from 'react';
import { off, onValue, ref } from 'firebase/database';

import { tryInitFirebase } from '../firebase';

// Mirrors /sessions/{sid}/summary per docs/03. The two summary
// strings are server-written by the wrap-up summarizer trigger;
// the *_confirmed flags are client-writable per existing security
// rules (each partner can only flip their own).
export type NextAction = 'leave' | 'schedule_solving' | 'add_to_perpetual';

export interface SessionSummary {
  partner_a_summary?: string;
  partner_b_summary?: string;
  partner_a_confirmed?: boolean;
  partner_b_confirmed?: boolean;
  next_action?: NextAction;
  prompt_version?: string;
  generated_at?: number;
}

export type SessionSummaryView =
  | { ready: false }
  | { ready: true; summary: SessionSummary | null };

export function useSummary(sessionId: string | null): SessionSummaryView {
  const [state, setState] = useState<SessionSummaryView>({ ready: false });

  useEffect(() => {
    if (!sessionId) {
      setState({ ready: true, summary: null });
      return;
    }
    const fb = tryInitFirebase();
    if (!fb) {
      setState({ ready: true, summary: null });
      return;
    }
    const r = ref(fb.database, `sessions/${sessionId}/summary`);
    const handler = (snap: { val: () => unknown }) => {
      const val = snap.val() as SessionSummary | null;
      setState({ ready: true, summary: val });
    };
    const errorHandler = () => setState({ ready: true, summary: null });
    onValue(r, handler, errorHandler);
    return () => off(r, 'value', handler);
  }, [sessionId]);

  return state;
}
