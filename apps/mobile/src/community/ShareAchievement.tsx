import { useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  buildAchievementShare,
  screenText,
  COMMUNITY_LIMITS,
  type ShareSource,
} from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { errorMessage } from '@/data/hooks';
import { t } from '@/i18n';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { DepthCard } from '@/ui/Depth';
import { Notice } from '@/ui/Banner';
import { SettingRow } from '@/ui/SettingRow';
import { TextField } from '@/ui/TextField';
import { SectionTitle } from '@/ui/kit';
import { useTheme } from '@/theme/useTheme';
import { UsernameClaim } from './UsernameClaim';

/**
 * Share My Achievement. It NEVER posts by itself: the person sees exactly what will be public, chooses what to add, ticks that they understand it is public, and presses
 * Post. Health information stays private: only the title, the dance style and (if turned on) the minutes can be shared. Needs an account and a public username.
 */
export function ShareAchievement({
  source,
  onClose,
}: {
  source: ShareSource;
  onClose: () => void;
}) {
  const { store } = useApp();
  const { colors, spacing, radius } = useTheme();
  const [username, setUsername] = useState<string | null | undefined>(undefined);
  const [includeMinutes, setIncludeMinutes] = useState(false);
  const [note, setNote] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void store.communityProfile?.().then((p) => live && setUsername(p?.username ?? null));
    return () => {
      live = false;
    };
  }, [store]);

  const preview = buildAchievementShare(source, { includeMinutes, note });
  const noteCheck =
    note.trim() === '' ? null : screenText(note, { maxChars: COMMUNITY_LIMITS.noteChars });

  if (result)
    return (
      <DepthCard>
        <Notice>{result}</Notice>
        <Button label={t('common.continue')} onPress={onClose} />
      </DepthCard>
    );

  return (
    <DepthCard>
      <SectionTitle icon="share-social" title={t('share.title')} />
      <AppText variant="caption" muted>
        {t('share.never')}
      </AppText>
      {username === undefined ? null : username === null ? (
        <UsernameClaim onClaimed={setUsername} />
      ) : (
        <>
          <AppText variant="label">{t('share.preview')}</AppText>
          <View
            accessible
            accessibilityLabel={preview.publicLines.join('. ')}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radius.md,
              padding: spacing.md,
              gap: spacing.xs,
              backgroundColor: colors.surface,
            }}
          >
            <AppText variant="caption" muted>
              {t('share.as', { name: username })}
            </AppText>
            {preview.publicLines.map((l) => (
              <AppText key={l}>{l}</AppText>
            ))}
          </View>
          {source.minutes ? (
            <SettingRow
              icon="time"
              title={t('share.includeMinutes')}
              body={t('share.includeMinutesBody')}
              value={includeMinutes}
              onChange={setIncludeMinutes}
            />
          ) : null}
          <TextField
            label={t('share.note')}
            value={note}
            onChangeText={(v) => {
              setNote(v);
              setProblems([]);
            }}
            maxLength={COMMUNITY_LIMITS.noteChars}
            multiline
          />
          {noteCheck && noteCheck.decision === 'block' ? (
            <Notice tone="warning">{noteCheck.reasons.join(' ')}</Notice>
          ) : null}
          <View style={{ gap: spacing.xs }}>
            <AppText variant="label">{t('share.private')}</AppText>
            {preview.privateByDefault.map((l) => (
              <AppText key={l} variant="caption" muted>
                {`• ${l}`}
              </AppText>
            ))}
          </View>
          <SettingRow
            icon="eye"
            title={t('share.confirm')}
            value={understood}
            onChange={setUnderstood}
          />
          {problems.length > 0 ? <Notice tone="warning">{problems.join(' ')}</Notice> : null}
          <Button
            label={t('share.post')}
            disabled={busy || !understood || noteCheck?.decision === 'block'}
            onPress={async () => {
              setBusy(true);
              setProblems([]);
              try {
                const r = await store.communityPost!(
                  { type: 'milestone', body: preview.body, milestone: preview.milestone },
                  { confirmed: understood },
                );
                if (r.ok) setResult(r.message);
                else setProblems(r.reasons);
              } catch (e) {
                setProblems([errorMessage(e)]);
              } finally {
                setBusy(false);
              }
            }}
          />
        </>
      )}
      <Button variant="secondary" label={t('share.cancel')} onPress={onClose} />
    </DepthCard>
  );
}
