import { View } from 'react-native';
import { SECURITY_QUESTIONS } from '@dancehall/shared';
import { t } from '@/i18n';
import { spacing } from '@/theme/tokens';
import { AppText } from '@/ui/AppText';
import { Choice } from '@/ui/Choice';
import { TextField } from '@/ui/TextField';

export const questionText = (id: string): string =>
  SECURITY_QUESTIONS.find((q) => q.id === id)?.text ?? '';

/** Props that keep answers out of password managers, autofill, spell-check and keyboard learning. */
const PRIVATE_INPUT = {
  autoCapitalize: 'none',
  autoCorrect: false,
  spellCheck: false,
  autoComplete: 'off',
  importantForAutofill: 'no',
  textContentType: 'none',
} as const;

export interface Pick2 {
  q: [string | null, string | null];
  a: [string, string];
}
export const emptyPick = (): Pick2 => ({ q: [null, null], a: ['', ''] });

/** Two different questions from the catalogue, each with an answer field. Used when an account is created. */
export function ChooseQuestions({
  value,
  onChange,
}: {
  value: Pick2;
  onChange: (v: Pick2) => void;
}) {
  const opts = (other: string | null) =>
    SECURITY_QUESTIONS.filter((q) => q.id !== other).map((q) => ({ value: q.id, label: q.text }));
  const set = (i: 0 | 1, patch: { q?: string; a?: string }) =>
    onChange({
      q: i === 0 ? [patch.q ?? value.q[0], value.q[1]] : [value.q[0], patch.q ?? value.q[1]],
      a: i === 0 ? [patch.a ?? value.a[0], value.a[1]] : [value.a[0], patch.a ?? value.a[1]],
    });
  return (
    <View style={{ gap: spacing.md }}>
      <Choice
        label={t('acct.q.first')}
        options={opts(value.q[1])}
        value={value.q[0]}
        onChange={(q) => set(0, { q })}
      />
      <TextField
        label={t('acct.q.answerFirst')}
        value={value.a[0]}
        onChangeText={(a) => set(0, { a })}
        {...PRIVATE_INPUT}
      />
      <Choice
        label={t('acct.q.second')}
        options={opts(value.q[0])}
        value={value.q[1]}
        onChange={(q) => set(1, { q })}
      />
      <TextField
        label={t('acct.q.answerSecond')}
        value={value.a[1]}
        onChangeText={(a) => set(1, { a })}
        {...PRIVATE_INPUT}
      />
    </View>
  );
}

/** The two fixed questions of an existing account, each with an answer field. Used for recovery and for replacing the key. */
export function AnswerQuestions({
  questions,
  answers,
  onChange,
}: {
  questions: [string, string];
  answers: [string, string];
  onChange: (a: [string, string]) => void;
}) {
  return (
    <View style={{ gap: spacing.md }}>
      {questions.map((id, i) => (
        <TextField
          key={id}
          // The field is labelled with its own question, so the right answer goes to the right question however the questions are ordered.
          label={questionText(id)}
          value={answers[i]!}
          onChangeText={(v) => onChange(i === 0 ? [v, answers[1]] : [answers[0], v])}
          {...PRIVATE_INPUT}
        />
      ))}
    </View>
  );
}
