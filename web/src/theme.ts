// Design tokens as TS constants for the rare cases we need them
// outside CSS (inline styles, computed color values, canvas rendering).
// Keep in sync with src/styles/tokens.css.
//
// For everything else, prefer CSS custom properties in `.module.css`
// files so both themes just work.

export const colors = {
  bg: 'var(--color-bg)',
  bgElevated: 'var(--color-bg-elevated)',
  bgSubtle: 'var(--color-bg-subtle)',
  text: 'var(--color-text)',
  textMuted: 'var(--color-text-muted)',
  textSubtle: 'var(--color-text-subtle)',
  primary: 'var(--color-primary)',
  primaryHover: 'var(--color-primary-hover)',
  primarySoft: 'var(--color-primary-soft)',
  onPrimary: 'var(--color-on-primary)',
  accent: 'var(--color-accent)',
  danger: 'var(--color-danger)',
  dangerSoft: 'var(--color-danger-soft)',
  border: 'var(--color-border)',
  focusRing: 'var(--color-focus-ring)',
} as const;

export const space = {
  1: 'var(--space-1)',
  2: 'var(--space-2)',
  3: 'var(--space-3)',
  4: 'var(--space-4)',
  5: 'var(--space-5)',
  6: 'var(--space-6)',
  7: 'var(--space-7)',
  8: 'var(--space-8)',
} as const;

export const radii = {
  sm: 'var(--radius-sm)',
  md: 'var(--radius-md)',
  lg: 'var(--radius-lg)',
  pill: 'var(--radius-pill)',
} as const;

export const shadows = {
  sm: 'var(--shadow-sm)',
  md: 'var(--shadow-md)',
  lg: 'var(--shadow-lg)',
} as const;

export const fonts = {
  serif: 'var(--font-serif)',
  sans: 'var(--font-sans)',
} as const;
