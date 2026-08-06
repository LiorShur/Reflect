import { useEffect, useState } from 'react';
import { off, onValue, ref } from 'firebase/database';

import { tryInitFirebase } from '../firebase';

export interface PartnerProfile {
  displayName: string | null;
}

export type PartnerProfileView =
  { ready: false } | { ready: true; profile: PartnerProfile };

// Reads /public_profiles/{partnerUid}/display_name — a public
// (auth-only) node so partners can see each other's chosen display
// name. The full users/{uid}/profile is self-only per the security
// rules; this node exists specifically so partner-facing UI (Home
// hero, appreciation feed sender labels) has something to render.
export function usePartnerProfile(
  partnerUid: string | null,
): PartnerProfileView {
  const [state, setState] = useState<PartnerProfileView>({ ready: false });

  useEffect(() => {
    if (!partnerUid) {
      setState({ ready: true, profile: { displayName: null } });
      return;
    }
    const fb = tryInitFirebase();
    if (!fb) {
      setState({ ready: true, profile: { displayName: null } });
      return;
    }
    const r = ref(fb.database, `public_profiles/${partnerUid}/display_name`);
    const handler = (snap: { val: () => unknown }) => {
      const val = snap.val();
      setState({
        ready: true,
        profile: { displayName: typeof val === 'string' ? val : null },
      });
    };
    const errorHandler = () =>
      setState({ ready: true, profile: { displayName: null } });
    onValue(r, handler, errorHandler);
    return () => off(r, 'value', handler);
  }, [partnerUid]);

  return state;
}
