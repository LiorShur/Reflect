import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../App';
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
} from '../lib/screening-resources';
import { useAuthState, type AuthState } from '../hooks/use-auth-state';
import { useScreening, type Tier } from '../hooks/use-screening';

type Step = 'intro' | 'question' | 'submitting' | 'result';

interface SubmitResponse {
  tier: Tier;
}

function currentUid(auth: AuthState): string | null {
  if (!auth.ready || 'error' in auth) return null;
  return auth.user?.uid ?? null;
}

export default function ScreeningScreen() {
  const auth = useAuthState();
  const uid = currentUid(auth);
  const screening = useScreening(uid);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // If the user already completed screening, jump straight to the
  // result view — re-running submitScreening would error out anyway.
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

  const totalQuestions = SCREENING_QUESTIONS.length;

  const onAnswer = (likert: Likert) => {
    const q = SCREENING_QUESTIONS[questionIndex];
    setAnswers((prev) => ({ ...prev, [q.id]: likert }));
    if (questionIndex + 1 < totalQuestions) {
      setQuestionIndex((i) => i + 1);
    } else {
      void submit({ ...answers, [q.id]: likert });
    }
  };

  const submit = async (finalAnswers: Record<string, Likert>) => {
    setStep('submitting');
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
      Alert.alert(
        'Could not submit',
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : String(err),
      );
      setStep('question');
    }
  };

  if (!screening.ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (step === 'intro') {
    return <IntroView onStart={() => setStep('question')} />;
  }

  if (step === 'submitting') {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.helper}>Submitting…</Text>
      </View>
    );
  }

  if (step === 'result') {
    const tier = resultTier ?? (screening.completed ? screening.tier : 'low');
    return <ResultView tier={tier} onDone={() => navigation.popToTop()} />;
  }

  const question = SCREENING_QUESTIONS[questionIndex];
  return (
    <QuestionView
      index={questionIndex}
      total={totalQuestions}
      questionText={question.text}
      onAnswer={onAnswer}
    />
  );
}

function IntroView({ onStart }: { onStart: () => void }) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>A quick check-in first</Text>
      <Text style={styles.paragraph}>
        A short set of questions helps us tune Reflect to how things are for you
        right now. Your answers stay on your device — your partner never sees
        them, and we never store the raw responses.
      </Text>
      <Text style={styles.paragraph}>Eleven questions, about two minutes.</Text>
      <Pressable style={styles.primaryButton} onPress={onStart}>
        <Text style={styles.primaryLabel}>Start</Text>
      </Pressable>
    </ScrollView>
  );
}

function QuestionView({
  index,
  total,
  questionText,
  onAnswer,
}: {
  index: number;
  total: number;
  questionText: string;
  onAnswer: (likert: Likert) => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.progress}>
        Question {index + 1} of {total}
      </Text>
      <Text style={styles.question}>{questionText}</Text>
      <View style={styles.likertList}>
        {([0, 1, 2, 3, 4] as Likert[]).map((value) => (
          <Pressable
            key={value}
            style={styles.likertButton}
            onPress={() => onAnswer(value)}
            accessibilityRole="button"
            accessibilityLabel={LIKERT_LABELS[value]}
          >
            <Text style={styles.likertLabel}>{LIKERT_LABELS[value]}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function ResultView({ tier, onDone }: { tier: Tier; onDone: () => void }) {
  const resource = useMemo<Resource>(() => {
    // expo-localization isn't wired in this PR yet — default to the
    // generic resource. TODO: pass a real locale once the package
    // lands.
    return resourceForLocale(null) ?? DEFAULT_RESOURCE;
  }, []);

  if (tier === 'low') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>Thanks for answering.</Text>
        <Text style={styles.paragraph}>
          You can now pair with your partner and use all of Reflect&apos;s
          features.
        </Text>
        <Pressable style={styles.primaryButton} onPress={onDone}>
          <Text style={styles.primaryLabel}>Continue</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (tier === 'moderate') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>Thanks for answering.</Text>
        <Text style={styles.paragraph}>
          Based on your responses, we recommend starting with the individual
          reflection exercises before joint sessions. Joint conflict mode is
          paused for now.
        </Text>
        <View style={styles.resourceBox}>
          <Text style={styles.resourceTitle}>If you ever need support</Text>
          <Text style={styles.resourceLine}>{resource.primary}</Text>
          {resource.secondary ? (
            <Text style={styles.resourceLine}>{resource.secondary}</Text>
          ) : null}
        </View>
        <Pressable style={styles.primaryButton} onPress={onDone}>
          <Text style={styles.primaryLabel}>Continue</Text>
        </Pressable>
      </ScrollView>
    );
  }

  // high
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Thanks for answering.</Text>
      <Text style={styles.paragraph}>
        Reflective listening can make some situations harder, not easier. Based
        on your responses, we don&apos;t recommend the joint mode right now. The
        friendship features are still available if you&apos;d like to use them.
      </Text>
      <View style={styles.resourceBox}>
        <Text style={styles.resourceTitle}>Resources</Text>
        <Text style={styles.resourceLine}>{resource.primary}</Text>
        {resource.secondary ? (
          <Text style={styles.resourceLine}>{resource.secondary}</Text>
        ) : null}
        <Text style={styles.helper}>
          You may want to use this app from a different device.
        </Text>
      </View>
      <Pressable style={styles.primaryButton} onPress={onDone}>
        <Text style={styles.primaryLabel}>Continue</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 22, fontWeight: '600', marginBottom: 12 },
  paragraph: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
    opacity: 0.85,
  },
  helper: {
    fontSize: 13,
    opacity: 0.6,
    textAlign: 'center',
    marginTop: 12,
  },
  progress: {
    fontSize: 13,
    opacity: 0.6,
    marginBottom: 12,
  },
  question: {
    fontSize: 19,
    lineHeight: 26,
    marginBottom: 24,
  },
  likertList: { gap: 12 },
  likertButton: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  likertLabel: { fontSize: 16 },
  primaryButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  primaryLabel: { color: 'white', fontWeight: '600', fontSize: 16 },
  resourceBox: {
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    marginVertical: 16,
  },
  resourceTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  resourceLine: { fontSize: 15, marginBottom: 4 },
});
