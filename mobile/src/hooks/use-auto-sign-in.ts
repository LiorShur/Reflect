// Deprecated — kept as a shim to avoid breaking any lingering
// imports. The anonymous-auth bridge from pre-A1 is gone; SignInScreen
// (rendered by App.tsx's auth gate) is now the only entry point.
//
// Real auth lives in useAuthState. Delete this file once no imports
// remain.
export function useAutoSignIn(): void {
  // no-op: A1 removed the auto anonymous sign-in.
}
