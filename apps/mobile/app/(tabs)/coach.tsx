import { useCallback, useEffect, useRef, useState } from 'react';
import { PulseStage, usePulse } from '@/pulse/PulseStage';
import { Ionicons } from '@expo/vector-icons';
import { IconBadge } from '@/ui/kit';
import { brand } from '@/theme/tokens';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/data/AppProvider';
import { errorMessage, useLoad } from '@/data/hooks';
import type { CoachAction, Conversation } from '@/data/types';
import { Bubble, TypingBubble } from '@/coach/ui';
import { t, type StringKey } from '@/i18n';
import { MIN_TOUCH_TARGET, radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { CharacterStage, DepthCard, HeroCard } from '@/ui/Depth';
import { DevBanner } from '@/ui/DevBanner';
import { Notice } from '@/ui/Banner';
import { haptics } from '@/ui/haptics';

const PROMPTS = ['plan', 'busy', 'travel', 'comeback', 'week', 'swap'] as const;
const PROMPT_ICON = {
  plan: 'sunny',
  busy: 'timer',
  travel: 'airplane',
  comeback: 'refresh-circle',
  week: 'stats-chart',
  swap: 'swap-horizontal',
} as const;

export default function Coach() {
  const { store, config } = useApp();
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const pulse = usePulse();
  const params = useLocalSearchParams<{ prompt?: string }>();
  const supported = typeof store.sendCoachMessage === 'function';
  const { data: convs } = useLoad(async (st) =>
    st.listConversations ? st.listConversations() : [],
  );
  const { data: usage } = useLoad(async (st) => (st.getAiUsage ? st.getAiUsage() : null));
  const { data: summary } = useLoad(async (st) =>
    st.getCoachContextSummary ? st.getCoachContextSummary() : [],
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [startedNew, setStartedNew] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);
  const sentParam = useRef(false);

  const conv: Conversation | undefined =
    (convs ?? []).find((c) => c.id === activeId) ?? (activeId ? undefined : undefined);
  const chat = conv?.messages ?? [];
  const personalized = usage?.personalization ?? false;
  const chatUsage = usage?.features.find((f) => f.feature === 'concierge_chat');

  // Pick up where you left off: reopen the latest conversation if a suggestion is still waiting for your decision or it was active in the last 2 hours.
  useEffect(() => {
    if (activeId || startedNew || !convs || convs.length === 0 || params.prompt) return;
    const latest = convs[0]!;
    const pending = latest.messages.some((m) => m.actions.some((a) => a.status === 'proposed'));
    const recent = Date.now() - Date.parse(latest.updatedAt) < 2 * 60 * 60 * 1000;
    if (pending || recent) setActiveId(latest.id);
  }, [convs, activeId, startedNew, params.prompt]);

  const send = useCallback(
    async (raw: string) => {
      const msg = raw.trim();
      if (!msg || busy || !store.sendCoachMessage) return;
      setBusy(true);
      setErr(null);
      setText('');
      try {
        const r = await store.sendCoachMessage({ conversationId: activeId, text: msg });
        setActiveId(r.conversation.id);
        haptics.tap();
        // Pulse acknowledges a reply gently; a comeback question gets the encouraging pose.
        pulse.send(msg === t('coach.prompt.comeback') ? 'comeback' : 'appOpened');
      } catch (e) {
        haptics.warning();
        setErr(errorMessage(e));
        // the question is saved in history even when no answer can be given
        const list = await store.listConversations?.();
        const newest = list?.[0];
        if (!activeId && newest) setActiveId(newest.id);
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, busy, store],
  );

  useEffect(() => {
    if (params.prompt && !sentParam.current && supported) {
      sentParam.current = true;
      void send(String(params.prompt));
    }
  }, [params.prompt, send, supported]);
  useEffect(() => {
    // Only follow a conversation; an empty chat stays at the top so the welcome scene is visible.
    if (chat.length > 0 || busy) scroll.current?.scrollToEnd({ animated: false });
  }, [chat.length, busy]);

  const decide = async (a: CoachAction, d: 'applied' | 'dismissed') => {
    setBusy(true);
    setErr(null);
    try {
      await store.decideCoachAction?.(a.id, d);
      if (d === 'applied') haptics.success();
    } catch (e) {
      haptics.warning();
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!supported) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          paddingTop: insets.top,
          padding: spacing.md,
        }}
      >
        <AppText variant="title" accessibilityRole="header">
          {t('coach.title')}
        </AppText>
        <Notice>{t('coach.paused')}</Notice>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <DevBanner />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm }}>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <AppText variant="title" accessibilityRole="header">
              {t('coach.title')}
            </AppText>
            {chat.length > 0 ? (
              <View style={{ width: 64, height: 58, overflow: 'hidden' }}>
                <PulseStage state={busy ? 'idle' : pulse.state} size={64} />
              </View>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {activeId ? (
              <Button
                variant="secondary"
                label={t('coach.newChat')}
                onPress={() => {
                  setActiveId(null);
                  setStartedNew(true);
                  setErr(null);
                }}
              />
            ) : null}
            <Button
              variant="secondary"
              label={t('coach.settings')}
              onPress={() => router.push('/coach/settings')}
            />
          </View>
        </View>
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
        >
          {config.authMode === 'mock' ? (
            <Notice tone="warning">{t('coach.mockBanner')}</Notice>
          ) : null}
          {chat.length === 0 ? (
            <HeroCard world="coach">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View style={{ flex: 1, gap: spacing.sm }}>
                  <AppText
                    variant="title"
                    style={{ color: colors.onHero }}
                    accessibilityRole="header"
                  >
                    {t('coach.heroTitle')}
                  </AppText>
                  <AppText style={{ color: colors.onHero }}>{t('coach.heroBody')}</AppText>
                </View>
                <CharacterStage size={96} />
              </View>
            </HeroCard>
          ) : null}
          {!personalized && chat.length === 0 ? (
            <DepthCard>
              <AppText variant="heading">{t('coach.personalizeTitle')}</AppText>
              <AppText muted>{t('coach.personalizeBody')}</AppText>
              {(summary ?? []).length > 0 ? null : null}
              <Button
                label={t('coach.personalizeOn')}
                onPress={async () => {
                  try {
                    await store.setConsent('ai_coach_personalization', true);
                  } catch (e) {
                    setErr(errorMessage(e));
                  }
                }}
              />
            </DepthCard>
          ) : null}
          {chat.map((m) => (
            <Bubble key={m.id} m={m} summaryLines={summary ?? []} busy={busy} onDecide={decide} />
          ))}
          {busy ? <TypingBubble label={t('coach.thinking')} /> : null}
          {err ? <Notice tone="warning">{err}</Notice> : null}
          {usage?.paused ? <Notice>{t('coach.paused')}</Notice> : null}
          {chat.length === 0 ? (
            <View style={{ gap: spacing.sm }}>
              <AppText variant="label" accessibilityRole="header">
                {t('coach.tryAsking')}
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {PROMPTS.map((p) => (
                  <Pressable
                    key={p}
                    accessibilityRole="button"
                    accessibilityLabel={t(`coach.prompt.${p}` as StringKey)}
                    disabled={busy}
                    onPress={() => send(t(`coach.prompt.${p}` as StringKey))}
                    style={{
                      flexBasis: '48%',
                      flexGrow: 1,
                      minHeight: 76,
                      borderRadius: radius.md,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                      padding: spacing.sm,
                      gap: spacing.xs,
                    }}
                  >
                    <IconBadge name={PROMPT_ICON[p]} size={30} fill={brand.violet} />
                    <AppText variant="label">{t(`coach.prompt.${p}` as StringKey)}</AppText>
                  </Pressable>
                ))}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('coach.review')}
                onPress={() => router.push('/coach/review')}
                style={{
                  minHeight: 64,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  borderRadius: radius.md,
                  backgroundColor: colors.primary,
                  padding: spacing.md,
                }}
              >
                <IconBadge
                  name="calendar"
                  size={36}
                  fill={colors.onPrimary}
                  color={colors.primary}
                />
                <AppText variant="label" style={{ color: colors.onPrimary, flex: 1 }}>
                  {t('coach.review')}
                </AppText>
                <Ionicons name="chevron-forward" size={20} color={colors.onPrimary} />
              </Pressable>
            </View>
          ) : null}
          {chat.length === 0 && (convs ?? []).length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              <AppText variant="label">{t('coach.recent')}</AppText>
              {(convs ?? []).slice(0, 3).map((c) => (
                <Pressable
                  key={c.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('coach.recent')}: ${c.title}`}
                  onPress={() => setActiveId(c.id)}
                  style={{
                    minHeight: MIN_TOUCH_TARGET,
                    justifyContent: 'center',
                    paddingHorizontal: spacing.md,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <Ionicons name="chatbubbles" size={20} color={colors.textMuted} />
                    <AppText variant="label" style={{ flex: 1 }}>
                      {c.title}
                    </AppText>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}
          {chatUsage ? (
            <AppText variant="caption" muted>
              {t('coach.usage', { used: chatUsage.used, allowance: chatUsage.allowance })}
            </AppText>
          ) : null}
        </ScrollView>
        <View
          style={{
            flexDirection: 'row',
            gap: spacing.sm,
            padding: spacing.md,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.surface,
            alignItems: 'center',
          }}
        >
          <TextInput
            accessibilityLabel={t('coach.placeholder')}
            placeholder={t('coach.placeholder')}
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => send(text)}
            returnKeyType="send"
            maxLength={1000}
            style={[
              typography.body,
              {
                flex: 1,
                minWidth: 0,
                minHeight: MIN_TOUCH_TARGET,
                color: colors.text,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: colors.border,
                paddingHorizontal: spacing.md,
                backgroundColor: colors.background,
              },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('coach.send')}
            accessibilityState={{ disabled: busy || text.trim() === '' }}
            disabled={busy || text.trim() === ''}
            onPress={() => send(text)}
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: brand.lime,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: busy || text.trim() === '' ? 0.45 : 1,
            }}
          >
            <Ionicons name="send" size={22} color={brand.plum} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
