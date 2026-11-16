import { useState } from 'react';
import { Image, View } from 'react-native';
import {
  REPORT_REASONS,
  COMMUNITY_LIMITS,
  type PublicComment,
  type PublicPost,
  type ReportReason,
} from '@dancehall/shared';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useApp } from '@/data/AppProvider';
import { useAccountGate } from '@/account/gate';
import { errorMessage } from '@/data/hooks';
import { t, type StringKey } from '@/i18n';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { DepthCard } from '@/ui/Depth';
import { Notice } from '@/ui/Banner';
import { TextField } from '@/ui/TextField';
import { IconChoice } from '@/ui/kit';
import { useTheme } from '@/theme/useTheme';
import { brand } from '@/theme/tokens';
import { timeAgo } from './format';

function PostVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  return (
    <VideoView
      player={player}
      style={{ width: '100%', height: 220, borderRadius: 12 }}
      nativeControls
      accessibilityLabel="Shared video"
    />
  );
}

/** One post: author's username, time, text, milestone, media, one Encourage, flat comments, and report / block / delete. Guests can read; acting needs an account. */
export function PostCard({
  post,
  onChanged,
  commentsEnabled = false,
}: {
  post: PublicPost;
  onChanged: () => void;
  /** Comments are off for V1 (the code is kept for later). The server refuses them too. */
  commentsEnabled?: boolean;
}) {
  const { store } = useApp();
  const gate = useAccountGate();
  const { colors, spacing, radius } = useTheme();
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<PublicComment[] | null>(null);
  const [draft, setDraft] = useState('');
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const here = '/community';

  const run = async (
    fn: () => Promise<{ ok: boolean; reasons?: string[]; message?: string } | void>,
  ) => {
    setBusy(true);
    setProblem(null);
    try {
      const r = await fn();
      if (r && 'ok' in r && !r.ok) setProblem((r.reasons ?? []).join(' '));
      return r;
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const loadComments = async () => setComments(await store.communityComments!(post.id));

  const toggleComments = async () => {
    const next = !showComments;
    setShowComments(next);
    if (next) await loadComments();
  };

  return (
    <DepthCard>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}
      >
        <AppText variant="label">{`@${post.author}`}</AppText>
        {post.isSample ? (
          <View
            style={{
              backgroundColor: brand.coral,
              borderRadius: radius.pill,
              paddingHorizontal: spacing.sm,
              paddingVertical: 2,
            }}
          >
            <AppText variant="caption" style={{ color: brand.plum, fontWeight: '700' }}>
              {t('community.sample')}
            </AppText>
          </View>
        ) : null}
        <AppText variant="caption" muted>
          {timeAgo(post.createdAt, new Date())}
        </AppText>
      </View>
      {post.status !== 'published' ? (
        <Notice>
          {t(`community.status.${post.status === 'held' ? 'held' : 'hidden'}` as StringKey)}
        </Notice>
      ) : null}
      {post.milestone ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.md,
            padding: spacing.sm,
            backgroundColor: colors.surface,
          }}
        >
          <AppText variant="label">{post.milestone.title}</AppText>
          <AppText variant="caption" muted>
            {[post.milestone.style, post.milestone.minutes ? `${post.milestone.minutes} min` : null]
              .filter(Boolean)
              .join(' · ')}
          </AppText>
        </View>
      ) : null}
      {post.body ? <AppText>{post.body}</AppText> : null}
      {post.media.map((m, i) =>
        m.kind === 'photo' ? (
          <View key={`${m.uri}-${i}`} style={{ gap: 2 }}>
            {m.role !== 'single' ? (
              <AppText variant="caption" muted>
                {m.role === 'before' ? 'Before' : 'After'}
              </AppText>
            ) : null}
            <Image
              source={{ uri: m.uri }}
              accessibilityLabel={m.role === 'single' ? 'Shared photo' : `${m.role} photo`}
              style={{ width: '100%', height: 220, borderRadius: radius.md }}
              resizeMode="cover"
            />
          </View>
        ) : (
          <PostVideo key={`${m.uri}-${i}`} uri={m.uri} />
        ),
      )}
      {post.isMine && post.encouragedCount !== null && post.encouragedCount > 0 ? (
        <AppText variant="caption" muted>
          {t('community.encouragedCount', { n: post.encouragedCount })}
        </AppText>
      ) : null}
      <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
        {!post.isMine && post.status === 'published' ? (
          <View style={{ flexBasis: '47%', flexGrow: 1 }}>
            <IconChoice
              icon="heart"
              label={post.encouragedByMe ? t('community.encouraged') : t('community.encourage')}
              selected={post.encouragedByMe}
              tint={brand.coral}
              onPress={() =>
                gate.guard('community_join', here, () => {
                  void run(async () => {
                    const r = await store.communityEncourage!(post.id, !post.encouragedByMe);
                    if (r.ok) onChanged();
                    return r;
                  });
                })
              }
            />
          </View>
        ) : null}
        {commentsEnabled && post.status === 'published' ? (
          <View style={{ flexBasis: '47%', flexGrow: 1 }}>
            <IconChoice
              icon="chatbubble"
              label={t('community.comments', { n: post.commentCount })}
              selected={showComments}
              onPress={() => void toggleComments()}
            />
          </View>
        ) : null}
      </View>

      {commentsEnabled && showComments ? (
        <View style={{ gap: spacing.sm }}>
          {comments && comments.length === 0 ? (
            <AppText variant="caption" muted>
              {t('community.noComments')}
            </AppText>
          ) : null}
          {(comments ?? []).map((c) => (
            <View key={c.id} style={{ gap: 2 }}>
              <AppText
                variant="caption"
                muted
              >{`@${c.author} · ${timeAgo(c.createdAt, new Date())}`}</AppText>
              <AppText>{c.body}</AppText>
              {c.status !== 'published' ? (
                <AppText variant="caption" muted>
                  {t('community.status.hidden')}
                </AppText>
              ) : null}
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {c.isMine || post.isMine ? (
                  <Button
                    variant="secondary"
                    label={`${t('community.delete')}`}
                    onPress={() =>
                      void run(async () => {
                        const r = await store.communityDeleteComment!(c.id);
                        if (r.ok) {
                          await loadComments();
                          onChanged();
                        }
                        return r;
                      })
                    }
                  />
                ) : (
                  <Button
                    variant="secondary"
                    label={t('community.report')}
                    onPress={() =>
                      gate.guard(
                        'community_join',
                        here,
                        () =>
                          void run(async () => {
                            const r = await store.communityReport!({
                              targetType: 'comment',
                              targetId: c.id,
                              reason: 'other',
                            });
                            if (r.ok) {
                              setMsg(t('community.reportThanks'));
                              await loadComments();
                            }
                            return r;
                          }),
                      )
                    }
                  />
                )}
              </View>
            </View>
          ))}
          <TextField
            label={t('community.commentLabel')}
            value={draft}
            onChangeText={setDraft}
            maxLength={COMMUNITY_LIMITS.commentChars}
            multiline
          />
          <Button
            label={t('community.commentSend')}
            disabled={busy || draft.trim() === ''}
            onPress={() =>
              gate.guard(
                'community_post',
                here,
                () =>
                  void run(async () => {
                    const r = await store.communityComment!(post.id, draft);
                    if (r.ok) {
                      setDraft('');
                      setMsg(r.message);
                      await loadComments();
                      onChanged();
                    }
                    return r;
                  }),
              )
            }
          />
        </View>
      ) : null}

      <Button variant="secondary" label={t('community.more')} onPress={() => setMenu((m) => !m)} />
      {menu ? (
        <View style={{ gap: spacing.sm }}>
          {post.isMine ? (
            <Button
              variant="secondary"
              label={t('community.delete')}
              onPress={() =>
                void run(async () => {
                  const r = await store.communityDeletePost!(post.id);
                  if (r.ok) onChanged();
                  return r;
                })
              }
            />
          ) : (
            <>
              <Button
                variant="secondary"
                label={t('community.report')}
                onPress={() => gate.guard('community_join', here, () => setReporting((v) => !v))}
              />
              <Button
                variant="secondary"
                label={t('community.block')}
                onPress={() =>
                  gate.guard(
                    'community_join',
                    here,
                    () =>
                      void run(async () => {
                        const r = await store.communityBlock!(post.author);
                        if (r.ok) {
                          setMsg(t('community.blockThanks'));
                          onChanged();
                        }
                        return r;
                      }),
                  )
                }
              />
            </>
          )}
        </View>
      ) : null}
      {reporting ? (
        <View style={{ gap: spacing.sm }}>
          <AppText variant="label">{t('community.reportTitle')}</AppText>
          {REPORT_REASONS.map((r) => (
            <IconChoice
              key={r}
              icon={r === 'self_harm' ? 'heart' : 'flag'}
              label={t(`community.reason.${r}` as StringKey)}
              selected={reason === r}
              onPress={() => setReason(r)}
            />
          ))}
          <Button
            label={t('community.reportSend')}
            disabled={!reason || busy}
            onPress={() =>
              void run(async () => {
                const r = await store.communityReport!({
                  targetType: 'post',
                  targetId: post.id,
                  reason: reason!,
                });
                if (r.ok) {
                  setReporting(false);
                  setMenu(false);
                  setMsg(t('community.reportThanks'));
                  onChanged();
                }
                return r;
              })
            }
          />
        </View>
      ) : null}
      {msg ? <Notice>{msg}</Notice> : null}
      {problem ? <Notice tone="warning">{problem}</Notice> : null}
    </DepthCard>
  );
}
