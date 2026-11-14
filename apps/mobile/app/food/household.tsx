import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Disclosure, IconAction, IconBadge, SectionTitle } from '@/ui/kit';
import { useTheme } from '@/theme/useTheme';
import { brand } from '@/theme/tokens';
import { EmptyState } from '@/ui/EmptyState';
import { haptics } from '@/ui/haptics';
import { useApp } from '@/data/AppProvider';
import { errorMessage, useLoad } from '@/data/hooks';
import type { HouseholdMealType } from '@/data/types';
import { t } from '@/i18n';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { DepthCard } from '@/ui/Depth';
import { Notice } from '@/ui/Banner';
import { Screen } from '@/ui/Screen';
import { TextField } from '@/ui/TextField';

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Shared meal ideas and one grocery list for the people you live with. Only these two lists are shared. */
export default function HouseholdScreen() {
  const { store } = useApp();
  const { colors, spacing } = useTheme();
  const hh = useLoad(async (s) => (s.getHousehold ? { h: await s.getHousehold() } : null));
  const meals = useLoad(async (s) => (s.listHouseholdMeals ? s.listHouseholdMeals() : []));
  const grocery = useLoad(async (s) => (s.listHouseholdGrocery ? s.listHouseholdGrocery() : []));
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [invite, setInvite] = useState<string | null>(null);
  const [meal, setMeal] = useState('');
  const [item, setItem] = useState('');
  const [qty, setQty] = useState('');
  const run = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  if (hh.data === null)
    return (
      <Screen top={false}>
        <Notice>{t('household.unavailable')}</Notice>
      </Screen>
    );
  const household = hh.data?.h ?? null;
  const byDay = new Map<string, NonNullable<typeof meals.data>>();
  for (const m of meals.data ?? []) byDay.set(m.day, [...(byDay.get(m.day) ?? []), m]);
  const days = [...byDay.keys()].sort();
  const open = (grocery.data ?? []).filter((g) => !g.checked);
  const done = (grocery.data ?? []).filter((g) => g.checked);
  const row = (g: NonNullable<typeof grocery.data>[number]) => (
    <Pressable
      key={g.id}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: g.checked }}
      accessibilityLabel={`${g.name}${g.quantity ? `, ${g.quantity}` : ''}`}
      onPress={() => {
        haptics.tap();
        void run(() => store.setHouseholdGroceryChecked!(g.id, !g.checked));
      }}
      style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
    >
      <Ionicons
        name={g.checked ? 'checkmark-circle' : 'ellipse-outline'}
        size={28}
        color={g.checked ? colors.success : colors.textMuted}
      />
      <AppText
        style={{
          flex: 1,
          textDecorationLine: g.checked ? 'line-through' : 'none',
          opacity: g.checked ? 0.6 : 1,
        }}
      >
        {g.name}
      </AppText>
      {g.quantity ? (
        <AppText variant="caption" muted>
          {g.quantity}
        </AppText>
      ) : null}
    </Pressable>
  );
  return (
    <Screen
      top={false}
      banner={{
        world: 'food',
        title: t('ban.household.title'),
        line: t('ban.household.line'),
        pulse: 'idle',
      }}
    >
      <AppText muted>{t('household.intro')}</AppText>
      {err || hh.error ? <Notice tone="warning">{String(err ?? hh.error)}</Notice> : null}
      {hh.data && !household ? (
        <>
          <EmptyState
            icon="home"
            title={t('household.emptyTitle')}
            body={t('household.emptyBody')}
          />
          <DepthCard>
            <SectionTitle icon="add-circle" title={t('household.create')} />
            <TextField
              label={t('household.createLabel')}
              value={name}
              onChangeText={setName}
              maxLength={40}
            />
            <Button
              label={t('household.create')}
              onPress={() => run(() => store.createHousehold!(name))}
            />
          </DepthCard>
          <DepthCard>
            <SectionTitle icon="key" title={t('household.join')} />
            <TextField
              label={t('household.joinLabel')}
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
              maxLength={24}
            />
            <Button
              variant="secondary"
              label={t('household.join')}
              onPress={() => run(() => store.joinHousehold!(code))}
            />
          </DepthCard>
        </>
      ) : null}
      {household ? (
        <>
          <DepthCard>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <IconBadge name="home" size={48} fill={brand.lime} />
              <View style={{ flex: 1 }}>
                <AppText variant="heading" accessibilityRole="header">
                  {household.name}
                </AppText>
                <AppText
                  variant="caption"
                  muted
                >{`${household.memberCount} ${household.memberCount === 1 ? t('household.member1') : t('household.members')}`}</AppText>
              </View>
            </View>
            {invite ? (
              <View
                accessibilityLiveRegion="polite"
                style={{
                  backgroundColor: colors.successBg,
                  borderRadius: 12,
                  padding: spacing.md,
                  gap: 2,
                }}
              >
                <AppText variant="caption" muted>
                  {t('household.inviteShown')}
                </AppText>
                <AppText variant="heading" selectable>
                  {invite}
                </AppText>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              {household.role === 'owner' ? (
                <IconAction
                  icon="person-add"
                  label={t('household.invite')}
                  onPress={() => run(async () => setInvite(await store.createHouseholdInvite!()))}
                />
              ) : null}
              <IconAction
                icon="exit"
                label={t('household.leave')}
                danger
                onPress={() =>
                  run(async () => {
                    await store.leaveHousehold!();
                    setInvite(null);
                  })
                }
              />
            </View>
          </DepthCard>

          <SectionTitle icon="restaurant" title={t('household.meals')} />
          {days.length === 0 ? <AppText muted>{t('household.noMeals')}</AppText> : null}
          {days.map((d) => (
            <DepthCard key={d}>
              <AppText variant="label">
                {new Date(`${d}T12:00:00`).toLocaleDateString('en', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'short',
                })}
              </AppText>
              {(byDay.get(d) ?? []).map((m) => (
                <View
                  key={m.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.sm,
                    minHeight: 48,
                  }}
                >
                  <IconBadge
                    name={
                      m.mealType === 'breakfast'
                        ? 'cafe'
                        : m.mealType === 'lunch'
                          ? 'fast-food'
                          : m.mealType === 'dinner'
                            ? 'restaurant'
                            : 'nutrition'
                    }
                    size={32}
                  />
                  <View style={{ flex: 1 }}>
                    <AppText>{m.title}</AppText>
                    <AppText variant="caption" muted>
                      {m.mealType}
                    </AppText>
                  </View>
                  <IconAction
                    icon="close-circle"
                    label={`${t('common.delete')} ${m.title}`}
                    onPress={() => run(() => store.deleteHouseholdMeal!(m.id))}
                  />
                </View>
              ))}
            </DepthCard>
          ))}
          <Disclosure title={t('household.addMeal')} summary={t('household.mealTitle')}>
            <TextField
              label={t('household.mealTitle')}
              value={meal}
              onChangeText={setMeal}
              maxLength={80}
            />
            <Button
              label={t('household.addMeal')}
              onPress={() =>
                run(async () => {
                  await store.addHouseholdMeal!({
                    day: todayIso(),
                    mealType: 'dinner' as HouseholdMealType,
                    title: meal,
                  });
                  setMeal('');
                })
              }
            />
          </Disclosure>

          <SectionTitle icon="cart" title={t('household.grocery')} />
          <DepthCard>
            {(grocery.data ?? []).length === 0 ? (
              <AppText muted>{t('household.noItems')}</AppText>
            ) : null}
            {open.map(row)}
            {done.length > 0 ? (
              <AppText variant="caption" muted>
                {`${t('household.gotIt')} (${done.length})`}
              </AppText>
            ) : null}
            {done.map(row)}
          </DepthCard>
          <Disclosure
            title={t('household.addItem')}
            summary={t('household.itemQty')}
            initiallyOpen={(grocery.data ?? []).length === 0}
          >
            <TextField
              label={t('household.itemName')}
              value={item}
              onChangeText={setItem}
              maxLength={60}
            />
            <TextField
              label={t('household.itemQty')}
              value={qty}
              onChangeText={setQty}
              maxLength={20}
            />
            <Button
              label={t('household.addItem')}
              onPress={() =>
                run(async () => {
                  await store.addHouseholdGroceryItem!({ name: item, quantity: qty });
                  setItem('');
                  setQty('');
                })
              }
            />
          </Disclosure>
        </>
      ) : null}
    </Screen>
  );
}
