import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { PublicPost } from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { useAccountGate } from '@/account/gate';
import { errorMessage } from '@/data/hooks';
import { Composer } from '@/community/Composer';
import { MyCommunity } from '@/community/MyCommunity';
import { PostCard } from '@/community/PostCard';
import { useCommunityAvailable } from '@/community/useCommunity';
import { t } from '@/i18n';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Notice } from '@/ui/Banner';
import { Screen } from '@/ui/Screen';
import { Disclosure } from '@/ui/kit';
import { useTheme } from '@/theme/useTheme';

/** One chronological feed. Public: a guest can read everything that is published. Sharing, encouraging, commenting, reporting and blocking need an account. */
export default function CommunityScreen() {
  const { store, session, config } = useApp();
  const available = useCommunityAvailable();
  const gate = useAccountGate();
  const { spacing } = useTheme();
  const { compose } = useLocalSearchParams<{ compose?: string }>();
  const [posts, setPosts] = useState<PublicPost[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [commentsEnabled, setCommentsEnabled] = useState(false);

  const load = useCallback(async () => {
    if (!available) return;
    try {
      const r = await store.communityFeed!({ limit: 20 });
      setPosts(r.posts);
      setNext(r.next);
      setBlocked(session ? await store.communityBlocked!() : []);
      setCommentsEnabled((await store.communityStatus?.())?.commentsEnabled === true);
      setErr(null);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setLoaded(true);
    }
  }, [available, store, session]);
  useEffect(() => void load(), [load]);
  useEffect(() => {
    if (compose === '1' && session) setComposing(true);
  }, [compose, session]);

  if (!available)
    return (
      <Screen top={false}>
        <Notice>{t('community.unavailable')}</Notice>
      </Screen>
    );
  const more = async () => {
    if (!next) return;
    const r = await store.communityFeed!({ cursor: next, limit: 20 });
    setPosts((p) => [...p, ...r.posts]);
    setNext(r.next);
  };
  return (
    <Screen
      top={false}
      banner={{
        world: 'friends',
        title: t('ban.community.title'),
        line: t('ban.community.line'),
        pulse: 'idle',
      }}
    >
      {posts.some((p) => p.isSample) ? (
        <Notice tone="warning">{t('community.sampleNote')}</Notice>
      ) : null}
      <Card>
        <Disclosure title={t('community.guidelinesTitle')}>
          <AppText variant="caption" muted>
            {t('community.guidelines')}
          </AppText>
          <AppText variant="caption" muted>
            {config.supportEmail
              ? t('community.contact', { email: config.supportEmail })
              : t('community.contactNone')}
          </AppText>
        </Disclosure>
        {composing && session ? (
          <Composer onPosted={() => void load()} onClose={() => setComposing(false)} />
        ) : (
          <>
            <Button
              label={t('community.share')}
              onPress={() =>
                gate.guard('community_post', '/community?compose=1', () => setComposing(true))
              }
            />
            {!session ? (
              <AppText variant="caption" muted>
                {t('community.signInHint')}
              </AppText>
            ) : null}
          </>
        )}
      </Card>
      {err ? <Notice tone="warning">{err}</Notice> : null}
      {loaded && posts.length === 0 ? <AppText muted>{t('community.empty')}</AppText> : null}
      <View style={{ gap: spacing.md }}>
        {posts.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            commentsEnabled={commentsEnabled}
            onChanged={() => void load()}
          />
        ))}
      </View>
      {next ? (
        <Button variant="secondary" label={t('community.loadMore')} onPress={() => void more()} />
      ) : null}
      {session ? (
        <MyCommunity key={composing ? 'composing' : 'idle'} onChanged={() => void load()} />
      ) : null}
      {session ? (
        <Card>
          <Disclosure title={t('community.blockedTitle', { n: blocked.length })}>
            {blocked.length === 0 ? (
              <AppText variant="caption" muted>
                {t('community.blockedNone')}
              </AppText>
            ) : (
              blocked.map((u) => (
                <View key={u} style={{ gap: spacing.xs }}>
                  <AppText>{`@${u}`}</AppText>
                  <Button
                    variant="secondary"
                    label={`${t('community.unblock')} @${u}`}
                    onPress={async () => {
                      await store.communityUnblock!(u);
                      void load();
                    }}
                  />
                </View>
              ))
            )}
          </Disclosure>
        </Card>
      ) : null}
    </Screen>
  );
}
