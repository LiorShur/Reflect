import { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  block?: boolean;
  busy?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  block,
  busy,
  disabled,
  children,
  className,
  ...rest
}: Props) {
  const cls = [
    styles.base,
    styles[variant],
    block ? styles.block : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={cls}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? <Spinner /> : children}
    </button>
  );
}

function Spinner() {
  return <span className={styles.spinner} aria-hidden />;
}
