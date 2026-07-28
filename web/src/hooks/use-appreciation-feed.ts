import { useEffect, useState } from 'react';
import {
  endAt,
  off,
  onValue,
  orderByChild,
  query,
  ref,
} from 'firebase/database';

import { tryInitFirebase } from '../firebase';

export interface AppreciationEntry {
  id: string;
  from_uid: string;
  content: string;
  tags?: string[];
  created_at: number;
  reaction?: 'heart' | 'thanks' | 'more' | null;
}

export type AppreciationFeedView =
  { ready: false } | { ready: true; entries: AppreciationEntry[] };

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

// Subscribes to /appreciation_feed/{uid} indexed on created_at.
// Returns up to ~90 days of received appreciations, sorted newest
// first. The ".indexOn" rule on appreciation_feed already covers
// the orderByChild query.
export function useAppreciationFeed(uid: string | null): AppreciationFeedView {
  const [state, setState] = useState<AppreciationFeedView>({ ready: false });

  useEffect(() => {
    if (!uid) {
      setState({ ready: true, entries: [] });
      return;
    }
    const fb = tryInitFirebase();
    if (!fb) {
      setState({ ready: true, entries: [] });
      return;
    }
    const cutoff = Date.now() - NINETY_DAYS_MS;
    const r = query(
      ref(fb.database, `appreciation_feed/${uid}`),
      orderByChild('created_at'),
      endAt(Date.now()),
    );
    const handler = (snap: { val: () => unknown }) => {
      const val =
        (snap.val() as Record<string, Omit<AppreciationEntry, 'id'>> | null) ??
        {};
      const entries: AppreciationEntry[] = Object.entries(val)
        .map(([id, e]) => ({ id, ...e }))
        .filter((e) => (e.created_at ?? 0) >= cutoff)
        .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
      setState({ ready: true, entries });
    };
    const errorHandler = () => setState({ ready: true, entries: [] });
    onValue(r, handler, errorHandler);
    return () => off(r, 'value', handler);
  }, [uid]);

  return state;
}
