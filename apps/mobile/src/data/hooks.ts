import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from './AppProvider';
import { StoreError, type DataStore } from './types';
import { t, type StringKey } from '@/i18n';

/** Loads data from the store and reloads it whenever the store changes. */
export function useLoad<T>(loader: (s: DataStore) => Promise<T>): {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const { store, session } = useApp();
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const alive = useRef(true);

  const run = useCallback(async () => {
    // A guest has no data to load. Say so (not loading, no data) instead of waiting for a session that is not coming.
    if (!session) {
      if (alive.current) {
        setData(undefined);
        setLoading(false);
      }
      return;
    }
    try {
      const v = await loaderRef.current(store);
      if (alive.current) {
        setData(v);
        setError(null);
      }
    } catch (e) {
      if (alive.current) setError(errorMessage(e));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [store, session]);

  useEffect(() => {
    alive.current = true;
    void run();
    const off = store.subscribe(() => void run());
    return () => {
      alive.current = false;
      off();
    };
  }, [store, run]);

  return { data, loading, error, reload: () => void run() };
}

export function errorMessage(e: unknown): string {
  if (e instanceof StoreError) return t(`err.${e.code}` as StringKey);
  return t('common.error');
}
