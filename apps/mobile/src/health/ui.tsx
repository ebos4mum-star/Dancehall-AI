import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/data/AppProvider';
import { t } from '@/i18n';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Banner';
import { Card } from '@/ui/Card';
import { SectionTitle } from '@/ui/kit';
import { SettingRow } from '@/ui/SettingRow';
import { formatDate } from '@/lib/format';
import { progressionActions } from '@/gamification/progressionStore';
import { deviceRaw, readHealthPrefs, writeHealthPrefs, type HealthPrefs } from './prefs';
import { healthProviderFor } from './provider';
import { syncHealth } from './sync';

/** Runs an import for the signed-in person if they turned it on. Safe to call on every focus: duplicates are skipped before anything is written. */
export function useHealthImport() {
  const { store, session, config } = useApp();
  const userId = session?.userId ?? null;
  const provider = useMemo(() => healthProviderFor(config), [config]);
  const [prefs, setPrefs] = useState<HealthPrefs>({ enabled: false, lastSyncIso: null });
  const [available, setAvailable] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // One import at a time: the switch and the automatic import can both ask within the same moment, and the second must not run (or overwrite the first's message).
  const inFlight = useRef(false);

  useEffect(() => {
    let alive = true;
    if (!userId || !config.appleHealth) return;
    void readHealthPrefs(deviceRaw, userId).then((p) => alive && setPrefs(p));
    void provider.status().then((s) => alive && setAvailable(s === 'ready'));
    return () => {
      alive = false;
    };
  }, [userId, provider, config.appleHealth]);

  const run = useCallback(
    async (p: HealthPrefs) => {
      if (!userId || inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      setMessage(null);
      try {
        const r = await syncHealth({
          store,
          provider,
          now: new Date(),
          lastSyncIso: p.lastSyncIso,
        });
        const next = { ...p, lastSyncIso: new Date().toISOString() };
        setPrefs(next);
        await writeHealthPrefs(deviceRaw, userId, next);
        if (r.imported > 0) progressionActions().noteImported(r.imported);
        setMessage(r.imported > 0 ? t('hk.result', { n: r.imported }) : t('hk.resultNone'));
      } catch {
        setMessage(t('hk.error'));
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [store, provider, userId],
  );

  // Automatic import: when the person has it on, import once each time a screen using this hook opens.
  useEffect(() => {
    if (prefs.enabled && available && userId) void run(prefs);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when it becomes enabled or available, not after every sync
  }, [prefs.enabled, available, userId]);

  const toggle = useCallback(
    async (on: boolean) => {
      if (!userId) return;
      if (on) {
        // The system permission sheet appears only now, because the person asked for it.
        const asked = await provider.authorize();
        if (!asked) return setMessage(t('hk.unavailable'));
      }
      const next = { enabled: on, lastSyncIso: on ? prefs.lastSyncIso : null };
      setPrefs(next);
      await writeHealthPrefs(deviceRaw, userId, next);
      if (on) await run(next);
    },
    [provider, userId, prefs.lastSyncIso, run],
  );

  return {
    offered: config.appleHealth,
    available,
    prefs,
    message,
    busy,
    toggle,
    syncNow: () => run(prefs),
  };
}

/** Settings: the Apple Health switch. Off by default; nothing is asked or read until it is turned on. */
export function HealthSettingsCard() {
  const h = useHealthImport();
  if (!h.offered) return null;
  return (
    <Card>
      <SectionTitle icon="heart" title={t('hk.title')} />
      <SettingRow
        icon="fitness"
        title={t('hk.switch')}
        body={t('hk.switchBody')}
        value={h.prefs.enabled}
        disabled={!h.available || h.busy}
        onChange={(v) => void h.toggle(v)}
      />
      {!h.available ? <Notice>{t('hk.unavailable')}</Notice> : null}
      {h.prefs.enabled ? (
        <>
          <Button variant="secondary" label={t('hk.syncNow')} onPress={() => void h.syncNow()} />
          {h.prefs.lastSyncIso ? (
            <AppText variant="caption" muted>
              {t('hk.last', { when: formatDate(h.prefs.lastSyncIso) })}
            </AppText>
          ) : null}
          <AppText variant="caption" muted>
            {t('hk.permissionNote')}
          </AppText>
        </>
      ) : null}
      {h.message ? <Notice>{h.message}</Notice> : null}
    </Card>
  );
}

/** Mount once on Today so an enabled import runs when the app opens. Renders nothing. */
export function HealthAutoImport() {
  useHealthImport();
  return null;
}
