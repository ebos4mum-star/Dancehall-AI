import type { ReactNode } from 'react';
import { useFormField } from '@/ui/formFocus';
import type { FieldKind } from '@/ui/inputBehavior';
import {
  Pressable,
  Switch,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type ReturnKeyTypeOptions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PulseStage } from '@/pulse/PulseStage';
import type { PulseState } from '@/pulse/machine';
import { HeroScene } from '@/scene/HeroScene';
import { brand, MIN_TOUCH_TARGET, radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { haptics } from '@/ui/haptics';
import { IconBadge, type IconName } from '@/ui/kit';

const STEP_ICONS: IconName[] = ['person', 'shield-checkmark', 'body', 'heart', 'flag'];

/**
 * The top of every onboarding step: Pulse speaks the step's line from a speech bubble on the stage, and a five-node journey shows where you
 * are. Completed steps show a check, the current step is lime, later steps are outlined. The whole strip reads as "Step n of N" to screen readers.
 */
export function JourneyHeader({
  step,
  total,
  line,
  pulse,
  stepLabel,
}: {
  step: number;
  total: number;
  line: string;
  pulse: PulseState;
  stepLabel: string;
}) {
  return (
    <HeroScene world="today" height={248}>
      <View style={{ position: 'absolute', top: spacing.md, left: spacing.md, right: 128 }}>
        <View
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel={line}
          style={{
            backgroundColor: brand.ivory,
            borderRadius: radius.lg,
            borderBottomRightRadius: 4,
            padding: spacing.md,
          }}
        >
          <AppText style={{ color: brand.plum, fontWeight: '600' }}>{line}</AppText>
        </View>
      </View>
      <View style={{ position: 'absolute', right: -6, top: 24 }}>
        <PulseStage state={pulse} size={150} />
      </View>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={stepLabel}
        accessibilityValue={{ min: 1, max: total, now: step }}
        style={{
          position: 'absolute',
          left: spacing.lg,
          right: spacing.lg,
          bottom: spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        {Array.from({ length: total }, (_, i) => i + 1).map((n) => {
          const done = n < step;
          const current = n === step;
          return (
            <View
              key={n}
              style={{ flexDirection: 'row', alignItems: 'center', flex: n === total ? 0 : 1 }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: current
                    ? brand.lime
                    : done
                      ? brand.violet
                      : 'rgba(36,20,61,0.7)',
                  borderWidth: current ? 0 : 2,
                  borderColor: done ? brand.violet : brand.violet,
                }}
              >
                <Ionicons
                  name={done ? 'checkmark' : (STEP_ICONS[n - 1] ?? 'ellipse')}
                  size={18}
                  color={current || done ? brand.plum : brand.ivory}
                />
              </View>
              {n < total ? (
                <View
                  style={{
                    flex: 1,
                    height: 3,
                    marginHorizontal: 4,
                    borderRadius: 2,
                    backgroundColor: done ? brand.violet : 'rgba(157,128,235,0.35)',
                  }}
                />
              ) : null}
            </View>
          );
        })}
      </View>
    </HeroScene>
  );
}

/** A focused card for one idea in a step, with an icon and a clear title. */
export function StepCard({
  icon,
  title,
  note,
  children,
}: {
  icon: IconName;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.lg,
        gap: spacing.md,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <IconBadge name={icon} size={36} fill={colors.primary} color={colors.onPrimary} />
        <AppText variant="heading" accessibilityRole="header" style={{ flex: 1 }}>
          {title}
        </AppText>
      </View>
      {note ? (
        <AppText variant="caption" muted>
          {note}
        </AppText>
      ) : null}
      {children}
    </View>
  );
}

/** A large input with a leading icon and an optional unit pill. The visible label is also the accessible name. */
export function BigField({
  label,
  value,
  onChangeText,
  icon,
  suffix,
  hint,
  placeholder,
  keyboardType,
  maxLength,
  autoComplete,
  editable = true,
  autoCapitalize,
  status,
  kind,
  returnKeyType,
  onSubmitEditing,
  autoCorrect,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  icon: IconName;
  suffix?: string;
  hint?: string;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
  autoComplete?: 'name' | 'email' | 'one-time-code';
  editable?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  /** What the field is for; sets the right keyboard, capitalisation, autocorrect and return key. Explicit props still win. */
  kind?: FieldKind;
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: () => void;
  autoCorrect?: boolean;
  /** A short validation state shown under the field (never the only signal: it has text). */
  status?: { ok: boolean; text: string } | null;
}) {
  const { colors, typography } = useTheme();
  const f = useFormField({
    kind,
    props: {
      keyboardType,
      autoCapitalize,
      autoCorrect,
      returnKeyType,
      onSubmitEditing: onSubmitEditing ? () => onSubmitEditing() : undefined,
    },
  });
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label">{label}</AppText>
      <View
        style={{
          minHeight: 60,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          borderRadius: radius.md,
          borderWidth: 2,
          borderColor: status ? (status.ok ? colors.success : colors.warningText) : colors.border,
          backgroundColor: colors.background,
          paddingHorizontal: spacing.md,
        }}
      >
        <Ionicons name={icon} size={22} color={colors.textMuted} accessibilityElementsHidden />
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={hint}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          maxLength={maxLength}
          autoComplete={autoComplete}
          editable={editable}
          {...f}
          style={[
            typography.body,
            {
              flex: 1,
              minWidth: 0,
              minHeight: 56,
              fontSize: 22,
              fontWeight: '600',
              color: colors.text,
            },
          ]}
        />
        {suffix ? (
          <View
            style={{
              backgroundColor: colors.border,
              borderRadius: radius.pill,
              paddingHorizontal: spacing.sm,
              paddingVertical: 2,
            }}
          >
            <AppText variant="label">{suffix}</AppText>
          </View>
        ) : null}
      </View>
      {status ? (
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
          accessibilityLiveRegion="polite"
        >
          <Ionicons
            name={status.ok ? 'checkmark-circle' : 'alert-circle'}
            size={16}
            color={status.ok ? colors.success : colors.warningText}
          />
          <AppText
            variant="caption"
            style={{ color: status.ok ? colors.success : colors.warningText, flex: 1 }}
          >
            {status.text}
          </AppText>
        </View>
      ) : null}
      {hint ? (
        <AppText variant="caption" muted>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

/** A consent as a trust card: what it is, what it does, whether it is needed, and the switch. Optional consents are never presented as required. */
export function TrustCard({
  icon,
  title,
  body,
  required,
  value,
  onChange,
  requiredLabel,
  optionalLabel,
}: {
  icon: IconName;
  title: string;
  body: string;
  required: boolean;
  value: boolean;
  onChange: (v: boolean) => void;
  requiredLabel: string;
  optionalLabel: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: value ? 2 : 1,
        borderColor: value ? colors.primary : colors.border,
        padding: spacing.md,
        gap: spacing.sm,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <IconBadge name={icon} size={44} fill={value ? brand.lime : brand.violet} />
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="label">{title}</AppText>
          <View
            style={{
              alignSelf: 'flex-start',
              borderRadius: radius.pill,
              paddingHorizontal: spacing.sm,
              paddingVertical: 1,
              backgroundColor: required ? brand.coral : colors.border,
            }}
          >
            <AppText
              variant="caption"
              style={{ color: required ? brand.plum : colors.text, fontWeight: '700' }}
            >
              {required ? requiredLabel : optionalLabel}
            </AppText>
          </View>
        </View>
        <Switch
          accessibilityLabel={title}
          value={value}
          onValueChange={(v) => {
            haptics.tap();
            onChange(v);
          }}
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      </View>
      <AppText variant="caption" muted>
        {body}
      </AppText>
    </View>
  );
}

/** A question with two big answers. Both are radios named exactly "Yes" and "No" so assistive tech reads them plainly. */
export function YesNoCard({
  question,
  value,
  onChange,
  yes,
  no,
}: {
  question: string;
  value: boolean | undefined;
  onChange: (v: boolean) => void;
  yes: string;
  no: string;
}) {
  const { colors } = useTheme();
  const opt = (v: boolean, label: string, icon: IconName) => {
    const selected = value === v;
    return (
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        aria-checked={selected}
        accessibilityLabel={label}
        onPress={() => {
          haptics.tap();
          onChange(v);
        }}
        style={{
          flex: 1,
          minHeight: MIN_TOUCH_TARGET + 8,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.xs,
          borderRadius: radius.md,
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? colors.primary : colors.border,
          backgroundColor: selected ? colors.successBg : colors.background,
        }}
      >
        <Ionicons
          name={selected ? 'checkmark-circle' : icon}
          size={20}
          color={selected ? colors.success : colors.textMuted}
        />
        <AppText variant="label">{label}</AppText>
      </Pressable>
    );
  };
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: value === undefined ? colors.border : colors.primary,
        padding: spacing.md,
        gap: spacing.md,
      }}
    >
      <AppText>{question}</AppText>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: spacing.sm }}>
        {opt(false, no, 'close-circle-outline')}
        {opt(true, yes, 'ellipse-outline')}
      </View>
    </View>
  );
}
