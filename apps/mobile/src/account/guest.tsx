import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { searchFoods, suggestQuickFit, type QuickFitMinutes } from '@dancehall/shared';
import { useAccountGate } from '@/account/gate';
import { useApp } from '@/data/AppProvider';
import { t } from '@/i18n';
import { spacing } from '@/theme/tokens';
import { AppText } from '@/ui/AppText';
import { Notice } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Screen } from '@/ui/Screen';
import { TextField } from '@/ui/TextField';

/**
 * What a guest sees on the tabs that are personal when there is an account. Everything here is public content (the catalogue, reference foods); the personal
 * features are one clearly labelled step away, and nothing here reads or writes any account data.
 */
function CreateAccountCard() {
  return (
    <Card>
      <Notice>{t('guest.banner')}</Notice>
      <Button label={t('guest.createAccount')} onPress={() => router.push('/account/start')} />
    </Card>
  );
}

export function GuestToday() {
  const quick = (minutes: QuickFitMinutes) => {
    const w = suggestQuickFit({ minutes, seed: minutes });
    if (w) router.push({ pathname: '/dance/[id]', params: { id: w.id } });
  };
  return (
    <Screen
      banner={{
        world: 'today',
        title: t('guest.todayTitle'),
        line: t('guest.todayLine'),
        pulse: 'welcome',
      }}
    >
      <CreateAccountCard />
      <Card>
        <AppText variant="heading" accessibilityRole="header">
          {t('guest.todayQuick')}
        </AppText>
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          {([5, 10, 15] as const).map((m) => (
            <Button
              key={m}
              variant="secondary"
              label={t('dance.minutes', { n: m })}
              onPress={() => quick(m)}
            />
          ))}
        </View>
        <Button
          variant="secondary"
          label={t('guest.browseWorkouts')}
          onPress={() => router.push('/dance')}
        />
        <Button
          variant="secondary"
          label={t('guest.browseFood')}
          onPress={() => router.push('/food')}
        />
      </Card>
    </Screen>
  );
}

export function GuestFood() {
  const [q, setQ] = useState('');
  const results = useMemo(() => searchFoods(q, undefined, 8), [q]);
  const gate = useAccountGate();
  return (
    <Screen
      banner={{
        world: 'food',
        title: t('guest.foodTitle'),
        line: t('guest.foodLine'),
        pulse: 'idle',
      }}
    >
      <CreateAccountCard />
      <Card>
        <TextField
          label={t('guest.foodSearch')}
          kind="search"
          value={q}
          onChangeText={setQ}
          autoCapitalize="none"
        />
        <AppText variant="caption" muted>
          {t('food.sourceNote')}
        </AppText>
        {results.map((f) => (
          <View
            key={f.id}
            style={{ gap: 2 }}
            accessible
            accessibilityLabel={`${f.name}, ${f.servingLabel}`}
          >
            <AppText variant="label">{f.name}</AppText>
            <AppText variant="caption" muted>
              {f.servingLabel}
            </AppText>
          </View>
        ))}
      </Card>
      <Card>
        <Button label={t('guest.logMeal')} onPress={() => gate.go('log_food', '/food/add')} />
        <Button
          variant="secondary"
          label={t('guest.mealPlan')}
          onPress={() => gate.go('meal_plan', '/food/plan')}
        />
      </Card>
    </Screen>
  );
}

export function GuestMe() {
  const { config } = useApp();
  return (
    <Screen title={t('guest.meTitle')}>
      <Card>
        <AppText>{t('guest.meBody')}</AppText>
        <Button label={t('guest.createAccount')} onPress={() => router.push('/account/start')} />
      </Card>
      {config.community ? (
        <Card>
          <AppText muted>{t('community.entrySub')}</AppText>
          <Button
            variant="secondary"
            label={t('community.entry')}
            onPress={() => router.push('/community')}
          />
        </Card>
      ) : null}
      <Card>
        <AppText variant="heading" accessibilityRole="header">
          {t('guest.privacyTitle')}
        </AppText>
        <AppText muted>{t('me.privacyBody')}</AppText>
      </Card>
    </Screen>
  );
}
