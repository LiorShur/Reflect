import { useEffect, useState } from 'react';
import { off, onValue, ref } from 'firebase/database';

import { tryInitFirebase } from '../firebase';

export interface Translation {
  softened?: string;
  changes_made?: string;
  already_soft?: boolean;
  cannot_soften?: boolean;
  approved?: boolean;
  prompt_version?: string;
  moderator_tier?: 'clean' | 'tier_1' | 'tier_2' | 'tier_3';
  moderator_fastpath_tier?: 'clean' | 'tier_1' | 'tier_2' | 'tier_3';
  moderator_suggestion?: string | null;
  moderator_reason?: string | null;
}

export interface DeliveredMessage {
  text?: string;
  delivered_at?: number;
  version?: 'softened' | 'original';
}

export interface ListenerDraft {
  content_field?: string;
  feeling_field?: string;
  committed?: boolean;
}

export interface MirrorRecord {
  text?: string;
  submitted_at?: number;
}

export interface SpeakerConfirmation {
  status?: 'heard' | 'more' | 'retry';
  hint?: string | null;
}

export interface FloorSwapSummary {
  prev_speaker_uid?: string;
  prev_listener_uid?: string;
  delivered_text?: string;
  mirror_text?: string;
  created_at?: number;
}

// speaker_draft and listener_draft live at /sessions/{sid}/speaker_draft
// and /sessions/{sid}/listener_draft respectively (siblings of
// current_turn) so the security rules can keep them private to the
// role. Use useSpeakerDraft / useListenerDraft to subscribe.
export interface CurrentTurn {
  speaker_uid?: string;
  listener_uid?: string;
  translation?: Translation;
  delivered?: DeliveredMessage;
  mirror?: MirrorRecord;
  speaker_confirmation?: SpeakerConfirmation;
  floor_swap_summary?: FloorSwapSummary;
  swap_acks?: Record<string, boolean>;
  end_acks?: Record<string, boolean>;
  retry_hint?: string | null;
}

export type CurrentTurnView =
  { ready: false } | { ready: true; turn: CurrentTurn | null };

export function useCurrentTurn(sessionId: string | null): CurrentTurnView {
  const [state, setState] = useState<CurrentTurnView>({ ready: false });

  useEffect(() => {
    if (!sessionId) {
      setState({ ready: true, turn: null });
      return;
    }
    const fb = tryInitFirebase();
    if (!fb) {
      setState({ ready: true, turn: null });
      return;
    }
    const r = ref(fb.database, `sessions/${sessionId}/current_turn`);
    const handler = (snap: { val: () => unknown }) => {
      const val = snap.val() as CurrentTurn | null;
      setState({ ready: true, turn: val });
    };
    const errorHandler = () => setState({ ready: true, turn: null });
    onValue(r, handler, errorHandler);
    return () => off(r, 'value', handler);
  }, [sessionId]);

  return state;
}
