import { useState } from 'react';
import { View } from 'react-native';
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
          <DepthCard>
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
            <AppText variant="heading">{household.name}</AppText>
            <AppText
              variant="caption"
              muted
            >{`${household.memberCount} ${t('household.members')}`}</AppText>
            {household.role === 'owner' ? (
              <Button
                variant="secondary"
                label={t('household.invite')}
                onPress={() => run(async () => setInvite(await store.createHouseholdInvite!()))}
              />
            ) : null}
            {invite ? (
              <View accessibilityLiveRegion="polite">
                <AppText variant="caption" muted>
                  {t('household.inviteShown')}
                </AppText>
                <AppText variant="heading" selectable>
                  {invite}
                </AppText>
              </View>
            ) : null}
            <Button
              variant="secondary"
              label={t('household.leave')}
              onPress={() =>
                run(async () => {
                  await store.leaveHousehold!();
                  setInvite(null);
                })
              }
            />
          </DepthCard>

          <DepthCard>
            <AppText variant="heading">{t('household.meals')}</AppText>
            {(meals.data ?? []).length === 0 ? (
              <AppText muted>{t('household.noMeals')}</AppText>
            ) : null}
            {(meals.data ?? []).map((m) => (
              <View key={m.id} style={{ gap: 4 }}>
                <AppText>{`${m.day} · ${m.mealType}: ${m.title}`}</AppText>
                <Button
                  variant="secondary"
                  label={`${t('common.delete')} ${m.title}`}
                  onPress={() => run(() => store.deleteHouseholdMeal!(m.id))}
                />
              </View>
            ))}
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
          </DepthCard>

          <DepthCard>
            <AppText variant="heading">{t('household.grocery')}</AppText>
            {(grocery.data ?? []).length === 0 ? (
              <AppText muted>{t('household.noItems')}</AppText>
            ) : null}
            {(grocery.data ?? []).map((g) => (
              <View key={g.id} style={{ gap: 4 }}>
                <Button
                  variant={g.checked ? 'secondary' : 'primary'}
                  label={`${g.checked ? '✓ ' : ''}${g.name}${g.quantity ? ` (${g.quantity})` : ''}`}
                  onPress={() => run(() => store.setHouseholdGroceryChecked!(g.id, !g.checked))}
                />
              </View>
            ))}
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
          </DepthCard>
        </>
      ) : null}
    </Screen>
  );
}
