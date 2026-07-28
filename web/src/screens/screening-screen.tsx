import { useEffect, useMemo, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useNavigate } from 'react-router-dom';

import { AppShell } from '../components/app-shell';
import { Button } from '../components/button';
import { tryInitFirebase } from '../firebase';
import {
  LIKERT_LABELS,
  Likert,
  SCREENING_QUESTIONS,
} from '../lib/screening-questions';
import {
  DEFAULT_RESOURCE,
  resourceForLocale,
  type Resource,
} from '../lib/resources';
import { useAuthState } from '../hooks/use-auth-state';
import { useScreening, type Tier } from '../hooks/use-screening';
import styles from './screening-screen.module.css';

type Step = 'intro' | 'question' | 'submitting' | 'result';

interface SubmitResponse {
  tier: Tier;
}

export function ScreeningScreen() {
  const auth = useAuthState();
  const uid = auth.status === 'ready' && auth.user ? auth.user.uid : null;
  const screening = useScreening(uid);
  const navigate = useNavigate();

  const initialStep: Step =
    screening.ready && screening.completed ? 'result' : 'intro';
  const [step, setStep] = useState<Step>(initialStep);

  useEffect(() => {
    if (screening.ready && screening.completed && step !== 'result') {
      setStep('result');
    }
  }, [screening, step]);

  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Likert>>({});
  const [resultTier, setResultTier] = useState<Tier | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalQuestions = SCREENING_QUESTIONS.length;

  const onAnswer = (likert: Likert) => {
    const q = SCREENING_QUESTIONS[questionIndex];
    const next = { ...answers, [q.id]: likert };
    setAnswers(next);
    if (questionIndex + 1 < totalQuestions) {
      setQuestionIndex((i) => i + 1);
    } else {
      void submit(next);
    }
  };

  const submit = async (finalAnswers: Record<string, Likert>) => {
    setStep('submitting');
    setError(null);
    try {
      const fb = tryInitFirebase();
      if (!fb) throw new Error('Firebase is not configured.');
      const fn = httpsCallable<
        { answers: Record<string, Likert> },
        SubmitResponse
      >(getFunctions(fb.app), 'submitScreening');
      const result = await fn({ answers: finalAnswers });
      setResultTier(result.data.tier);
      setStep('result');
    } catch (err) {
      setError(readableError(err));
      setStep('question');
    }
  };

  if (!screening.ready) {
    return (
      <AppShell title="Quick check-in" back>
        <p className={styles.helper}>Loading…</p>
      </AppShell>
    );
  }

  if (step === 'intro') {
    return (
      <AppShell title="Quick check-in" back>
        <IntroView onStart={() => setStep('question')} />
      </AppShell>
    );
  }

  if (step === 'submitting') {
    return (
      <AppShell title="Quick check-in" back>
        <p className={styles.helper}>Submitting…</p>
      </AppShell>
    );
  }

  if (step === 'result') {
    const tier = resultTier ?? (screening.completed ? screening.tier : 'low');
    return (
      <AppShell title="All done" back>
        <ResultView tier={tier} onDone={() => navigate('/')} />
      </AppShell>
    );
  }

  const question = SCREENING_QUESTIONS[questionIndex];
  return (
    <AppShell title={`Question ${questionIndex + 1} of ${totalQuestions}`} back>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <QuestionView questionText={question.text} onAnswer={onAnswer} />
    </AppShell>
  );
}

function IntroView({ onStart }: { onStart: () => void }) {
  return (
    <div className={styles.pane}>
      <h1 className={styles.heading}>A quick check-in first</h1>
      <p className={styles.paragraph}>
        A short set of questions helps us tune Reflect to how things are for you
        right now. Your answers stay on your device — your partner never sees
        them, and we never store the raw responses.
      </p>
      <p className={styles.paragraph}>Eleven questions, about two minutes.</p>
      <Button variant="primary" onClick={onStart}>
        Start
      </Button>
    </div>
  );
}

function QuestionView({
  questionText,
  onAnswer,
}: {
  questionText: string;
  onAnswer: (likert: Likert) => void;
}) {
  return (
    <div className={styles.pane}>
      <p className={styles.question}>{questionText}</p>
      <div className={styles.likertList}>
        {([0, 1, 2, 3, 4] as Likert[]).map((value) => (
          <button
            key={value}
            type="button"
            className={styles.likertButton}
            onClick={() => onAnswer(value)}
            aria-label={LIKERT_LABELS[value]}
          >
            {LIKERT_LABELS[value]}
          </button>
        ))}
      </div>
    </div>
  );
}

function ResultView({ tier, onDone }: { tier: Tier; onDone: () => void }) {
  const resource = useMemo<Resource>(() => {
    const locale =
      typeof navigator !== 'undefined' && navigator.language
        ? navigator.language
        : null;
    return resourceForLocale(locale) ?? DEFAULT_RESOURCE;
  }, []);

  if (tier === 'low') {
    return (
      <div className={styles.pane}>
        <h2 className={styles.heading}>Thanks for answering.</h2>
        <p className={styles.paragraph}>
          You can now pair with your partner and use all of Reflect&apos;s
          features.
        </p>
        <Button variant="primary" onClick={onDone}>
          Continue
        </Button>
      </div>
    );
  }

  if (tier === 'moderate') {
    return (
      <div className={styles.pane}>
        <h2 className={styles.heading}>Thanks for answering.</h2>
        <p className={styles.paragraph}>
          Based on your responses, we recommend starting with the individual
          reflection exercises before joint sessions. Joint conflict mode is
          paused for now.
        </p>
        <ResourceBox resource={resource} />
        <Button variant="primary" onClick={onDone}>
          Continue
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.pane}>
      <h2 className={styles.heading}>Thanks for answering.</h2>
      <p className={styles.paragraph}>
        Reflective listening can make some situations harder, not easier. Based
        on your responses, we don&apos;t recommend the joint mode right now. The
        friendship features are still available if you&apos;d like to use them.
      </p>
      <ResourceBox resource={resource} highTier />
      <Button variant="primary" onClick={onDone}>
        Continue
      </Button>
    </div>
  );
}

function ResourceBox({
  resource,
  highTier,
}: {
  resource: Resource;
  highTier?: boolean;
}) {
  return (
    <div className={styles.resourceBox}>
      <p className={styles.resourceTitle}>
        {highTier ? 'Resources' : 'If you ever need support'}
      </p>
      <p className={styles.resourceLine}>{resource.primary}</p>
      {resource.secondary ? (
        <p className={styles.resourceLine}>{resource.secondary}</p>
      ) : null}
      {highTier ? (
        <p className={styles.resourceHelper}>
          You may want to use this app from a different device.
        </p>
      ) : null}
    </div>
  );
}

function readableError(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}
