import { InputHTMLAttributes, ReactNode, useId } from 'react';
import styles from './text-field.module.css';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}

export function TextField({ label, hint, error, ...inputProps }: Props) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        {...inputProps}
        id={id}
        className={[
          styles.input,
          error ? styles.inputError : '',
          inputProps.className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : hint ? hintId : undefined}
      />
      {error ? (
        <p id={errId} className={styles.errorText} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className={styles.hintText}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
