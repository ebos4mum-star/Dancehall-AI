import { useCallback, useEffect, useState } from 'react';
import { useApp } from '@/data/AppProvider';
import { errorMessage } from '@/data/hooks';
import { t } from '@/i18n';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Notice } from '@/ui/Banner';
import { Disclosure } from '@/ui/kit';
import { UsernameClaim } from './UsernameClaim';

type Me = {
  username: string;
  canChangeAt?: string | null;
  restriction?: 'muted' | 'suspended' | null;
};

/** The member's own Community settings: their name (changeable, with a cooldown), any pause on the account, and leaving Community. Nothing else about them is shown. */
export function MyCommunity({ onChanged }: { onChanged: () => void }) {
  const { store, config } = useApp();
  const [me, setMe] = useState<Me | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const load = useCallback(async () => {
    try {
      setMe((await store.communityProfile?.()) ?? null);
    } catch {
      setMe(null);
    }
  }, [store]);
  useEffect(() => void load(), [load]);
  if (!me) return null;
  const wait = me.canChangeAt ? new Date(me.canChangeAt).toISOString().slice(0, 10) : null;
  return (
    <Card>
      <AppText variant="heading" accessibilityRole="header">
        {t('community.me.title')}
      </AppText>
      <AppText>{`@${me.username}`}</AppText>
      {me.restriction ? (
        <Notice tone="warning">
          {t(
            me.restriction === 'muted'
              ? 'community.me.restrictedMuted'
              : 'community.me.restrictedSuspended',
          )}
        </Notice>
      ) : null}
      {msg ? <Notice tone="info">{msg}</Notice> : null}
      {err ? <Notice tone="warning">{err}</Notice> : null}
      {store.communityChangeUsername ? (
        <Disclosure title={t('community.me.change')}>
          {wait ? (
            <AppText variant="caption" muted>
              {t('community.me.changeWait', { date: wait })}
            </AppText>
          ) : (
            <>
              <AppText variant="caption" muted>
                {t('community.me.changeBody')}
              </AppText>
              <UsernameClaim
                mode="change"
                onClaimed={() => {
                  setMsg(t('community.me.changed'));
                  void load();
                  onChanged();
                }}
              />
            </>
          )}
        </Disclosure>
      ) : null}
      <Disclosure title={t('community.me.appeals')}>
        <AppText variant="caption" muted>
          {config.supportEmail
            ? t('community.me.appealsBody', { email: config.supportEmail })
            : t('community.me.appealsNone')}
        </AppText>
      </Disclosure>
      {store.communityLeave ? (
        <Disclosure title={t('community.me.leave')}>
          <AppText variant="caption" muted>
            {t('community.me.leaveBody')}
          </AppText>
          {confirmLeave ? (
            <Button
              variant="secondary"
              label={t('community.me.leaveConfirm')}
              onPress={async () => {
                try {
                  const r = await store.communityLeave!();
                  if (r.ok) {
                    setMe(null);
                    setMsg(t('community.me.left'));
                    onChanged();
                  } else setErr(r.reasons[0] ?? '');
                } catch (e) {
                  setErr(errorMessage(e));
                }
              }}
            />
          ) : (
            <Button
              variant="secondary"
              label={t('community.me.leave')}
              onPress={() => setConfirmLeave(true)}
            />
          )}
        </Disclosure>
      ) : null}
    </Card>
  );
}
