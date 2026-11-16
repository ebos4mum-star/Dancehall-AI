import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  COMMUNITY_LIMITS,
  screenText,
  validateMedia,
  type MediaInput,
  type PostType,
} from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { errorMessage } from '@/data/hooks';
import { preparePhoto } from '@/food/photo';
import type { WorkoutSession } from '@/data/types';
import { t, type StringKey } from '@/i18n';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { DepthCard } from '@/ui/Depth';
import { Notice } from '@/ui/Banner';
import { SettingRow } from '@/ui/SettingRow';
import { TextField } from '@/ui/TextField';
import { IconChoice, SectionTitle } from '@/ui/kit';
import { useTheme } from '@/theme/useTheme';
import { brand } from '@/theme/tokens';
import { mimeFromUri } from './format';
import { ShareAchievement } from './ShareAchievement';
import { UsernameClaim } from './UsernameClaim';

type Kind = 'text' | 'story' | 'photo' | 'video' | 'milestone';
const KINDS: Array<{ k: Kind; icon: 'create' | 'book' | 'image' | 'videocam' | 'ribbon' }> = [
  { k: 'text', icon: 'create' },
  { k: 'story', icon: 'book' },
  { k: 'photo', icon: 'image' },
  { k: 'video', icon: 'videocam' },
  { k: 'milestone', icon: 'ribbon' },
];

/** The one Share Progress action. Everything is previewed in place, needs the "everyone can see this" tick, and nothing is posted until Post is pressed. */
export function Composer({ onPosted, onClose }: { onPosted: () => void; onClose: () => void }) {
  const { store } = useApp();
  const { colors, spacing, radius } = useTheme();
  const [username, setUsername] = useState<string | null | undefined>(undefined);
  const [kind, setKind] = useState<Kind>('text');
  const [body, setBody] = useState('');
  const [pair, setPair] = useState(false);
  const [media, setMedia] = useState<
    Partial<Record<'single' | 'before' | 'after' | 'video', MediaInput>>
  >({});
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [support, setSupport] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [recent, setRecent] = useState<WorkoutSession[]>([]);
  const [shareFrom, setShareFrom] = useState<WorkoutSession | null>(null);
  const [mode, setMode] = useState<'open' | 'text_only' | 'read_only'>('open');

  useEffect(() => {
    let live = true;
    void store.communityProfile?.().then((p) => live && setUsername(p?.username ?? null));
    void store.communityStatus?.().then(
      (m) => live && setMode(m),
      () => undefined,
    );
    void store
      .listSessions()
      .then((l) => live && setRecent(l.filter((s) => s.status === 'completed').slice(0, 3)));
    return () => {
      live = false;
    };
  }, [store]);

  const max = kind === 'story' ? COMMUNITY_LIMITS.storyChars : COMMUNITY_LIMITS.postChars;
  const live =
    body.trim() === '' || kind === 'photo' || kind === 'video'
      ? null
      : screenText(body, { maxChars: max });
  const list = (
    kind === 'photo'
      ? pair
        ? [media.before, media.after]
        : [media.single]
      : kind === 'video'
        ? [media.video]
        : []
  ).filter((m): m is MediaInput => !!m);
  const mediaCheck = kind === 'photo' || kind === 'video' ? validateMedia(list) : null;
  const mediaReady =
    (kind === 'photo' && (pair ? list.length === 2 : list.length === 1)) ||
    (kind === 'video' && list.length === 1);

  const pickPhoto = async (role: 'single' | 'before' | 'after') => {
    try {
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        exif: false,
      });
      const a = r.canceled ? null : r.assets[0];
      if (!a) return;
      // Re-encoded and resized on the device, which also removes location and camera data.
      const p = await preparePhoto(a.uri, a.width, a.height);
      setMedia((m) => ({
        ...m,
        [role]: {
          kind: 'photo',
          role,
          mime: mimeFromUri(p.uri, 'photo'),
          bytes: a.fileSize ?? 500_000,
          uri: p.uri,
        },
      }));
      setProblems([]);
    } catch (e) {
      setProblems([errorMessage(e)]);
    }
  };
  const pickVideo = async () => {
    try {
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        videoMaxDuration: COMMUNITY_LIMITS.videoSeconds,
        quality: 0.7,
      });
      const a = r.canceled ? null : r.assets[0];
      if (!a) return;
      setMedia((m) => ({
        ...m,
        video: {
          kind: 'video',
          role: 'single',
          mime: a.mimeType ?? mimeFromUri(a.uri, 'video'),
          bytes: a.fileSize ?? 1_000_000,
          durationS: a.duration ? a.duration / 1000 : null,
          uri: a.uri,
        },
      }));
      setProblems([]);
    } catch (e) {
      setProblems([errorMessage(e)]);
    }
  };

  if (done)
    return (
      <DepthCard>
        <Notice>{done}</Notice>
        <Button label={t('common.continue')} onPress={onClose} />
      </DepthCard>
    );
  if (shareFrom)
    return (
      <ShareAchievement
        source={{
          kind: 'workout',
          title: shareFrom.title,
          style: shareFrom.style,
          minutes: shareFrom.durationS ? Math.round(shareFrom.durationS / 60) : shareFrom.minutes,
        }}
        onClose={() => {
          setShareFrom(null);
          onPosted();
          onClose();
        }}
      />
    );

  const canPost =
    !busy &&
    mode !== 'read_only' &&
    understood &&
    (kind === 'photo' || kind === 'video'
      ? mediaReady && mediaCheck?.ok !== false
      : live?.decision !== 'block' && body.trim() !== '');

  return (
    <DepthCard>
      <SectionTitle icon="share-social" title={t('community.composeTitle')} />
      {username === undefined ? null : username === null ? (
        <UsernameClaim onClaimed={setUsername} />
      ) : (
        <>
          {mode !== 'open' ? (
            <Notice tone="info">
              {t(mode === 'read_only' ? 'community.paused.all' : 'community.paused.media')}
            </Notice>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {KINDS.filter((o) => mode === 'open' || (o.k !== 'photo' && o.k !== 'video')).map(
              (o) => (
                <View key={o.k} style={{ flexBasis: '30%', flexGrow: 1 }}>
                  <IconChoice
                    icon={o.icon}
                    label={t(`community.kind.${o.k}` as StringKey)}
                    selected={kind === o.k}
                    tint={brand.lime}
                    onPress={() => {
                      setKind(o.k);
                      setProblems([]);
                    }}
                  />
                </View>
              ),
            )}
          </View>

          {kind === 'milestone' ? (
            <>
              <AppText variant="label">{t('community.milestonePick')}</AppText>
              {recent.length === 0 ? <AppText muted>{t('community.milestoneNone')}</AppText> : null}
              {recent.map((s) => (
                <Button
                  key={s.id}
                  variant="secondary"
                  label={s.title}
                  onPress={() => setShareFrom(s)}
                />
              ))}
            </>
          ) : null}

          {kind === 'text' || kind === 'story' || kind === 'photo' || kind === 'video' ? (
            <>
              <TextField
                label={kind === 'story' ? t('community.writeStory') : t('community.write')}
                value={body}
                onChangeText={(v) => {
                  setBody(v);
                  setProblems([]);
                }}
                maxLength={max}
                multiline
              />
              <AppText variant="caption" muted>
                {t('community.chars', { n: body.length, max })}
              </AppText>
              {live && live.decision !== 'allow' ? (
                <Notice tone={live.decision === 'block' ? 'warning' : 'info'}>
                  {live.reasons.join(' ')}
                </Notice>
              ) : null}
            </>
          ) : null}

          {kind === 'photo' ? (
            <>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <IconChoice
                    icon="image"
                    label={t('community.photoOne')}
                    selected={!pair}
                    onPress={() => setPair(false)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <IconChoice
                    icon="images"
                    label={t('community.photoPair')}
                    selected={pair}
                    onPress={() => setPair(true)}
                  />
                </View>
              </View>
              {(pair ? (['before', 'after'] as const) : (['single'] as const)).map((role) => (
                <View key={role} style={{ gap: spacing.xs }}>
                  {media[role] ? (
                    <Image
                      source={{ uri: media[role]!.uri }}
                      accessibilityLabel={`${role} photo preview`}
                      style={{ width: '100%', height: 160, borderRadius: radius.md }}
                      resizeMode="cover"
                    />
                  ) : null}
                  <Button
                    variant="secondary"
                    label={
                      role === 'before'
                        ? t('community.pickBefore')
                        : role === 'after'
                          ? t('community.pickAfter')
                          : t('community.pick')
                    }
                    onPress={() => void pickPhoto(role)}
                  />
                  {media[role] ? (
                    <Button
                      variant="secondary"
                      label={`${t('community.removeMedia')}`}
                      onPress={() =>
                        setMedia((m) => {
                          const { [role]: _x, ...rest } = m;
                          return rest;
                        })
                      }
                    />
                  ) : null}
                </View>
              ))}
            </>
          ) : null}
          {kind === 'video' ? (
            <View style={{ gap: spacing.xs }}>
              {media.video ? (
                <AppText
                  variant="caption"
                  muted
                >{`${Math.round(media.video.durationS ?? 0)} s`}</AppText>
              ) : null}
              <Button
                variant="secondary"
                label={t('community.pickVideo')}
                onPress={() => void pickVideo()}
              />
            </View>
          ) : null}
          {mediaCheck && !mediaCheck.ok && list.length > 0 ? (
            <Notice tone="warning">{mediaCheck.reason}</Notice>
          ) : null}
          {kind === 'photo' || kind === 'video' ? (
            <Notice>{t('community.mediaNote')}</Notice>
          ) : null}

          {kind !== 'milestone' ? (
            <>
              <SettingRow
                icon="eye"
                title={t('community.public')}
                body={t('community.publicBody')}
                value={understood}
                onChange={setUnderstood}
              />
              {problems.length > 0 ? <Notice tone="warning">{problems.join(' ')}</Notice> : null}
              {support ? <Notice tone="warning">{t('community.supportTitle')}</Notice> : null}
              <Button
                label={t('community.post')}
                disabled={!canPost}
                onPress={async () => {
                  setBusy(true);
                  setProblems([]);
                  setSupport(false);
                  try {
                    const type: PostType = kind as PostType;
                    const r = await store.communityPost!(
                      { type, body, media: list },
                      { confirmed: understood },
                    );
                    if (r.ok) {
                      setDone(r.message);
                      onPosted();
                    } else {
                      setProblems(r.reasons);
                      setSupport(r.support === true);
                    }
                  } catch (e) {
                    setProblems([errorMessage(e)]);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </>
          ) : null}
        </>
      )}
      <Button variant="secondary" label={t('community.cancel')} onPress={onClose} />
      <AppText variant="caption" style={{ color: colors.textMuted }}>
        {t('share.never')}
      </AppText>
    </DepthCard>
  );
}
