import { useState } from 'react';
import { validateUsername } from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { errorMessage } from '@/data/hooks';
import { t } from '@/i18n';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Banner';
import { TextField } from '@/ui/TextField';

/** Choosing the one public name. The rules are checked as the person types; the server-side rules are the ones that count. */
export function UsernameClaim({
  onClaimed,
  mode = 'claim',
}: {
  onClaimed: (username: string) => void;
  /** `change` renames an existing username (no heading: it sits inside Your Community name). */
  mode?: 'claim' | 'change';
}) {
  const { store } = useApp();
  const [raw, setRaw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const check = raw.trim() === '' ? null : validateUsername(raw);
  return (
    <>
      {mode === 'claim' ? (
        <>
          <AppText variant="heading" accessibilityRole="header">
            {t('community.username.title')}
          </AppText>
          <AppText muted>{t('community.username.body')}</AppText>
        </>
      ) : null}
      <TextField
        label={t('community.username.label')}
        value={raw}
        onChangeText={(v) => {
          setRaw(v);
          setErr(null);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        error={check && !check.ok ? check.reason : undefined}
      />
      <Button
        label={t(mode === 'claim' ? 'community.username.claim' : 'community.me.use')}
        disabled={!check || !check.ok}
        onPress={async () => {
          try {
            const r = await (
              mode === 'claim' ? store.communityClaimUsername! : store.communityChangeUsername!
            )(raw);
            if (r.ok) onClaimed(r.username);
            else setErr(r.reasons[0] ?? '');
          } catch (e) {
            setErr(errorMessage(e));
          }
        }}
      />
      {err ? <Notice tone="warning">{err}</Notice> : null}
    </>
  );
}
