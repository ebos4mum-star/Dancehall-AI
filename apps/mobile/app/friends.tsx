import { withAccount } from '@/account/gate';
import { GroupCoopNote, LeagueCard } from '@/gamification/ui';
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';
import {
  SHARE_CATEGORIES,
  localDateKey,
  type GroupKind,
  type GroupMetric,
} from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { errorMessage, useLoad } from '@/data/hooks';
import type { SocialAck } from '@/data/types';
import { BigField } from '@/onboarding/kit';
import { t, type StringKey } from '@/i18n';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Choice } from '@/ui/Choice';
import { DepthCard } from '@/ui/Depth';
import { EmptyState } from '@/ui/EmptyState';
import { Notice } from '@/ui/Banner';
import { Screen } from '@/ui/Screen';

const addDays = (key: string, n: number) =>
  new Date(Date.parse(`${key}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const msg = (code: string) => {
  const k = `social.err.${code}` as StringKey;
  return t(k) === k ? t('social.err.unknown') : t(k);
};

/** A whole row is the control: at least 44 points tall (the bare iOS switch is smaller), read by VoiceOver as one switch with its state. */
function ToggleRow({
  label,
  text,
  on,
  onChange,
}: {
  label: string;
  text?: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  const { spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      aria-checked={on}
      onPress={() => onChange(!on)}
      style={{
        minHeight: MIN_TOUCH_TARGET,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
      }}
    >
      <AppText style={{ flex: 1 }}>{text ?? label}</AppText>
      <View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        aria-hidden
        accessibilityElementsHidden
      >
        <Switch value={on} />
      </View>
    </Pressable>
  );
}

/**
 * Friends, sharing and group goals. Only a weekly activity summary can ever be shared, one friend at a time, and it can be turned off at once.
 * Food, weight and health information are not shareable at all.
 */
function Friends() {
  const { store, profile } = useApp();
  const { spacing } = useTheme();
  const { data, error, reload } = useLoad(async (s) => (await s.socialOverview?.()) ?? null);
  const [name, setName] = useState('');
  const [claim, setClaim] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [shared, setShared] = useState<Record<string, boolean>>({});
  const [seen, setSeen] = useState<Record<string, string>>({});
  const [kind, setKind] = useState<GroupKind>('challenge');
  const [metric, setMetric] = useState<GroupMetric>('active_minutes');
  const [title, setTitle] = useState('');
  const [invite, setInvite] = useState<string[]>([]);
  const tz = profile?.timeZone ?? null;

  const run = async (fn: () => Promise<SocialAck<object>>, ok?: string) => {
    try {
      setProblem(null);
      const r = await fn();
      if (!r.ok) setProblem(msg(r.code));
      else setNote(ok ?? null);
      reload();
      return r.ok;
    } catch (e) {
      setProblem(errorMessage(e));
      return false;
    }
  };
  const openFriend = async (friend: string) => {
    if (open === friend) return setOpen(null);
    setOpen(friend);
    const cats = (await store.socialSharesWith?.(friend)) ?? [];
    setShared((s) => ({ ...s, [friend]: cats.includes('activity_summary') }));
    const v = await store.socialViewFriend?.(friend);
    setSeen((s) => ({
      ...s,
      [friend]:
        v?.ok && v.activity
          ? t('social.theirWeek', {
              s: v.activity.sessions,
              m: v.activity.minutes,
              d: v.activity.activeDays,
            })
          : t('social.theyShareNothing'),
    }));
  };
  const create = async () => {
    const today = localDateKey(new Date(), tz);
    const ok = await run(
      () =>
        store.socialCreateGroup!({
          kind,
          title,
          metric,
          target: kind === 'challenge' ? null : metric === 'active_days' ? 4 : 150,
          startDay: today,
          endDay: addDays(today, kind === 'challenge' ? 29 : 6),
          invite,
        }),
      t('social.groupCreated'),
    );
    if (ok) {
      setTitle('');
      setInvite([]);
    }
  };

  if (!data)
    return (
      <Screen>
        {error ? <Notice tone="warning">{error}</Notice> : null}
        {error ? (
          <Button label={t('barcode.retry')} onPress={reload} />
        ) : (
          <AppText muted accessibilityLiveRegion="polite">
            {t('common.loading')}
          </AppText>
        )}
      </Screen>
    );

  return (
    <Screen>
      <Notice>{t('social.privacy')}</Notice>
      {data.username && typeof store.socialRevokeAll === 'function' ? (
        <Button
          variant="secondary"
          label={t('social.stopAll')}
          onPress={() => void run(() => store.socialRevokeAll!(), t('social.stoppedAll'))}
        />
      ) : null}
      {problem ? <Notice tone="warning">{problem}</Notice> : null}
      {note ? <Notice>{note}</Notice> : null}
      {!data.username ? (
        <DepthCard>
          <AppText>{t('social.needName')}</AppText>
          <BigField
            icon="at"
            label={t('social.nameLabel')}
            value={claim}
            onChangeText={setClaim}
            autoCapitalize="none"
            maxLength={20}
          />
          <Button
            label={t('social.claim')}
            disabled={claim.trim() === ''}
            onPress={async () => {
              if (await run(() => store.socialClaimUsername!(claim), t('social.claimed')))
                setClaim('');
            }}
          />
        </DepthCard>
      ) : (
        <>
          <DepthCard>
            <AppText variant="heading" accessibilityRole="header">
              {t('social.addTitle')}
            </AppText>
            <BigField
              icon="person-add"
              label={t('social.addLabel')}
              value={name}
              onChangeText={setName}
              autoCapitalize="none"
            />
            <Button
              label={t('social.send')}
              disabled={name.trim() === ''}
              onPress={async () => {
                if (await run(() => store.socialRequest!(name), t('social.sent'))) setName('');
              }}
            />
          </DepthCard>

          {data.incoming.length > 0 ? (
            <DepthCard>
              <AppText variant="heading" accessibilityRole="header">
                {t('social.requests')}
              </AppText>
              {data.incoming.map((n) => (
                <View key={n} style={{ gap: spacing.sm }}>
                  <AppText variant="label">{n}</AppText>
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <Button
                      label={t('social.accept')}
                      onPress={() => void run(() => store.socialRespond!(n, true))}
                    />
                    <Button
                      variant="secondary"
                      label={t('social.decline')}
                      onPress={() => void run(() => store.socialRespond!(n, false))}
                    />
                  </View>
                </View>
              ))}
            </DepthCard>
          ) : null}
          {data.outgoing.length > 0 ? (
            <DepthCard>
              <AppText variant="label">{t('social.waiting')}</AppText>
              {data.outgoing.map((n) => (
                <View
                  key={n}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
                >
                  <AppText style={{ flex: 1 }}>{n}</AppText>
                  <Button
                    variant="secondary"
                    label={t('social.cancel')}
                    onPress={() => void run(() => store.socialCancel!(n))}
                  />
                </View>
              ))}
            </DepthCard>
          ) : null}

          <AppText variant="heading" accessibilityRole="header">
            {t('social.friends')}
          </AppText>
          {data.friends.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title={t('social.noFriendsTitle')}
              body={t('social.noFriends')}
            />
          ) : null}
          {data.friends.map((f) => (
            <DepthCard key={f}>
              <Button
                variant="secondary"
                label={open === f ? `${f} ▲` : `${f} ▼`}
                onPress={() => void openFriend(f)}
              />
              {open === f ? (
                <View style={{ gap: spacing.sm }}>
                  <AppText variant="caption" muted>
                    {seen[f] ?? ''}
                  </AppText>
                  {SHARE_CATEGORIES.map((c) => (
                    <ToggleRow
                      key={c}
                      label={t('social.shareWeekly', { name: f })}
                      on={shared[f] === true}
                      onChange={async (on) => {
                        const ok = await run(() => store.socialSetShare!(f, c, on));
                        if (ok) setShared((s) => ({ ...s, [f]: on }));
                      }}
                    />
                  ))}
                  <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                    <Button
                      variant="secondary"
                      label={t('social.remove')}
                      onPress={() => void run(() => store.socialRemove!(f), t('social.removed'))}
                    />
                    <Button
                      variant="secondary"
                      label={t('social.block')}
                      onPress={() => void run(() => store.socialBlock!(f), t('social.blockedDone'))}
                    />
                  </View>
                </View>
              ) : null}
            </DepthCard>
          ))}

          <LeagueCard />

          <AppText variant="heading" accessibilityRole="header">
            {t('social.groups')}
          </AppText>
          <GroupCoopNote />
          {data.groups.map((g) => (
            <DepthCard key={g.id}>
              <AppText variant="heading">{g.title}</AppText>
              <AppText variant="caption" muted>
                {`${t(`social.kind.${g.kind}` as StringKey)} · ${g.startDay} – ${g.endDay}`}
              </AppText>
              {g.iAm === 'invited' ? (
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <Button
                    label={t('social.join')}
                    onPress={() => void run(() => store.socialRespondGroup!(g.id, true))}
                  />
                  <Button
                    variant="secondary"
                    label={t('social.decline')}
                    onPress={() => void run(() => store.socialRespondGroup!(g.id, false))}
                  />
                </View>
              ) : (
                <View style={{ gap: spacing.xs }}>
                  <AppText variant="caption" muted>
                    {t('social.groupShares')}
                  </AppText>
                  {g.byMember.map((m) => (
                    <AppText key={m.username}>
                      {`${m.username}${m.isMe ? ` (${t('social.you')})` : ''}: ${m.total} ${g.metric === 'active_days' ? t('social.days') : t('social.min')}`}
                    </AppText>
                  ))}
                  {g.target ? (
                    <AppText variant="caption" muted>
                      {t('social.target', {
                        n: g.target,
                        unit: g.metric === 'active_days' ? t('social.days') : t('social.min'),
                      })}
                    </AppText>
                  ) : null}
                  <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                    <Button
                      label={t('social.sync')}
                      onPress={() =>
                        void run(() => store.socialSyncGroup!(g.id), t('social.synced'))
                      }
                    />
                    <Button
                      variant="secondary"
                      label={t('social.leave')}
                      onPress={() =>
                        void run(() => store.socialLeaveGroup!(g.id), t('social.left'))
                      }
                    />
                  </View>
                </View>
              )}
            </DepthCard>
          ))}
          {data.friends.length > 0 ? (
            <DepthCard>
              <AppText variant="heading" accessibilityRole="header">
                {t('social.newGroup')}
              </AppText>
              <Choice
                label={t('social.kindLabel')}
                value={kind}
                onChange={(v) => setKind(v)}
                options={(['challenge', 'couple', 'family'] as const).map((k) => ({
                  value: k,
                  label: t(`social.kind.${k}` as StringKey),
                }))}
              />
              <Choice
                label={t('social.metricLabel')}
                value={metric}
                onChange={(v) => setMetric(v)}
                options={(['active_minutes', 'active_days'] as const).map((k) => ({
                  value: k,
                  label: t(`social.metric.${k}` as StringKey),
                }))}
              />
              <BigField
                icon="flag"
                label={t('social.titleLabel')}
                value={title}
                onChangeText={setTitle}
                maxLength={60}
              />
              <AppText variant="label">{t('social.inviteLabel')}</AppText>
              {data.friends.map((f) => (
                <ToggleRow
                  key={f}
                  label={t('social.inviteFriend', { name: f })}
                  text={f}
                  on={invite.includes(f)}
                  onChange={(on) => setInvite((l) => (on ? [...l, f] : l.filter((x) => x !== f)))}
                />
              ))}
              <AppText variant="caption" muted>
                {t('social.groupConsent')}
              </AppText>
              <Button
                label={t('social.create')}
                disabled={title.trim() === ''}
                onPress={() => void create()}
              />
            </DepthCard>
          ) : null}
          {data.blocked.length > 0 ? (
            <DepthCard>
              <AppText variant="label">{t('social.blockedTitle')}</AppText>
              {data.blocked.map((n) => (
                <View
                  key={n}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
                >
                  <AppText style={{ flex: 1 }}>{n}</AppText>
                  <Button
                    variant="secondary"
                    label={t('social.unblock')}
                    onPress={() => void run(() => store.socialUnblock!(n))}
                  />
                </View>
              ))}
            </DepthCard>
          ) : null}
        </>
      )}
    </Screen>
  );
}

export default withAccount(Friends, 'challenges');
