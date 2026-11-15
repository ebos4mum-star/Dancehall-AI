import { Pressable, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PresentationResolution, Presentation, WorkoutDef } from '@dancehall/shared';
import type { AudioSettings } from '@/audio/settings';
import { musicAvailable } from '@/audio/settings';
import { t, type StringKey } from '@/i18n';
import { brand, MIN_TOUCH_TARGET, radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { haptics } from '@/ui/haptics';
import { IconBadge, type IconName } from '@/ui/kit';

const MODE_LABEL: Record<Presentation, StringKey> = {
  guided_text: 'pl.guidedText',
  real_dancer: 'pl.realDancer',
  dancer_3d: 'pl.dancer3d',
};
const MODE_ICON: Record<Presentation, IconName> = {
  guided_text: 'document-text',
  real_dancer: 'videocam',
  dancer_3d: 'cube',
};

/**
 * The presentation selector. It lists exactly what is true: each mode shows Available or Unavailable with the reason, and only available
 * modes can be chosen. Guided text is always available because it needs no media.
 */
export function PresentationPicker({
  resolution,
  onPick,
}: {
  resolution: PresentationResolution;
  onPick: (p: Presentation) => void;
}) {
  const { colors } = useTheme();
  const rows: { kind: Presentation; available: boolean; reason?: string }[] = [
    { kind: 'guided_text', available: true },
    ...resolution.options.map((o) => ({
      kind: o.kind as Presentation,
      available: o.available,
      reason: o.reason ? t(`pl.why.${o.reason}` as StringKey) : undefined,
    })),
  ];
  return (
    <View
      style={{ gap: spacing.sm }}
      accessibilityRole="radiogroup"
      accessibilityLabel={t('pl.presentation')}
    >
      {rows.map((r) => {
        const selected = resolution.active === r.kind;
        return (
          <Pressable
            key={r.kind}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: !r.available }}
            accessibilityLabel={`${t(MODE_LABEL[r.kind])}. ${r.available ? t('pl.available') : `${t('pl.unavailable')}. ${r.reason ?? ''}`}`}
            disabled={!r.available}
            onPress={() => {
              haptics.tap();
              onPick(r.kind);
            }}
            style={{
              minHeight: MIN_TOUCH_TARGET + 8,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              padding: spacing.md,
              borderRadius: radius.md,
              borderWidth: selected ? 2 : 1,
              borderColor: selected ? colors.primary : colors.border,
              backgroundColor: colors.surface,
              opacity: r.available ? 1 : 0.75,
            }}
          >
            <IconBadge
              name={selected ? 'checkmark' : MODE_ICON[r.kind]}
              size={36}
              fill={r.available ? brand.lime : colors.border}
              color={brand.plum}
            />
            <View style={{ flex: 1 }}>
              <AppText variant="label">{t(MODE_LABEL[r.kind])}</AppText>
              <AppText variant="caption" muted>
                {r.available ? t('pl.available') : (r.reason ?? t('pl.unavailable'))}
              </AppText>
            </View>
          </Pressable>
        );
      })}
      <AppText variant="caption" muted accessibilityLiveRegion="polite">
        {t(`pl.active.${resolution.active}` as StringKey)}
      </AppText>
    </View>
  );
}

/** One row of the session preview: what comes up, how long, and the cue it will show. */
export function MovementPreview({
  w,
  lowImpact,
}: {
  w: Pick<WorkoutDef, 'blocks'>;
  lowImpact: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      {w.blocks.map((b, i) => (
        <View
          key={`${b.title}-${i}`}
          accessible
          accessibilityLabel={`${i + 1}. ${b.title}, ${b.seconds} seconds`}
          style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}
        >
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: colors.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppText variant="caption" style={{ fontWeight: '700' }}>
              {i + 1}
            </AppText>
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="label">{`${b.title} · ${Math.round(b.seconds / 60) >= 1 ? `${Math.round(b.seconds / 60)} min` : `${b.seconds} s`}`}</AppText>
            <AppText variant="caption" muted numberOfLines={2}>
              {lowImpact ? b.lowImpactAlt : b.cue}
            </AppText>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Voice and music controls. Anything that cannot work on this device or has no content says so plainly instead of pretending. */
export function AudioPanel({
  audio,
  onChange,
  voiceAvailable,
}: {
  audio: AudioSettings;
  onChange: (p: Partial<AudioSettings>) => void;
  voiceAvailable: boolean;
}) {
  const { colors } = useTheme();
  const step = (key: 'voiceVolume' | 'musicVolume', d: number) =>
    onChange({ [key]: Math.min(1, Math.max(0, Math.round((audio[key] + d) * 10) / 10)) });
  const volumeRow = (label: string, key: 'voiceVolume' | 'musicVolume', disabled: boolean) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <AppText
        variant="label"
        style={{ flex: 1 }}
      >{`${label}: ${Math.round(audio[key] * 100)}%`}</AppText>
      {(['remove', 'add'] as const).map((ic) => (
        <Pressable
          key={ic}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`${label} ${ic === 'add' ? 'up' : 'down'}`}
          onPress={() => step(key, ic === 'add' ? 0.1 : -0.1)}
          style={{
            width: MIN_TOUCH_TARGET,
            height: MIN_TOUCH_TARGET,
            borderRadius: MIN_TOUCH_TARGET / 2,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={ic} size={20} color={colors.text} />
        </Pressable>
      ))}
    </View>
  );
  const music = musicAvailable();
  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <IconBadge name="mic" size={32} fill={brand.violet} />
        <AppText variant="label" style={{ flex: 1 }}>
          {t('pl.voice')}
        </AppText>
        <Switch
          accessibilityLabel={t('pl.voice')}
          value={voiceAvailable && !audio.voiceMuted}
          disabled={!voiceAvailable}
          onValueChange={(v) => onChange({ voiceMuted: !v })}
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      </View>
      {voiceAvailable ? (
        volumeRow(t('pl.voiceVolume'), 'voiceVolume', audio.voiceMuted)
      ) : (
        <AppText variant="caption" muted>
          {t('pl.voiceNone')}
        </AppText>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <IconBadge name="musical-notes" size={32} fill={brand.coral} />
        <AppText variant="label" style={{ flex: 1 }}>
          {t('pl.music')}
        </AppText>
        <Switch
          accessibilityLabel={t('pl.music')}
          value={music && !audio.musicMuted}
          disabled={!music}
          onValueChange={(v) => onChange({ musicMuted: !v })}
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      </View>
      {music ? (
        volumeRow(t('pl.music'), 'musicVolume', audio.musicMuted)
      ) : (
        <AppText variant="caption" muted>
          {t('pl.musicNone')}
        </AppText>
      )}
    </View>
  );
}
