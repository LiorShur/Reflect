import { BackHandler, Platform } from 'react-native';

export type QuickExitDecision = 'exit_app' | 'platform_unsupported';

// Pure decision: testable without RN. iOS doesn't allow programmatic
// app exit, so we surface that to the caller and the UI shows manual
// instructions instead.
export function quickExitDecision(
  platformOS: typeof Platform.OS,
): QuickExitDecision {
  return platformOS === 'android' ? 'exit_app' : 'platform_unsupported';
}

// JS-only quick exit per docs/07-safety-screening § Quick-exit pattern.
//
// Limitations vs the spec (filed as follow-up for M5/M6):
// - Android: closes the app via BackHandler but does NOT call
//   finishAndRemoveTask(); the entry remains in the recent-tasks
//   switcher. Full task clearing requires a native module.
// - iOS: programmatic exit is not permitted by Apple. Caller should
//   fall back to a "swipe up to leave" instruction.
// - Push notifications: not yet wired (M5 R3); once they are,
//   quickExit() must additionally disable them.
export function quickExit(): QuickExitDecision {
  const decision = quickExitDecision(Platform.OS);
  if (decision === 'exit_app') {
    BackHandler.exitApp();
  }
  return decision;
}
