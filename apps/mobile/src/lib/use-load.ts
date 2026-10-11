import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from './api';

/**
 * Loads data for a screen: `loading` on the first load, `refreshing` for pull-to-refresh, `error` as a
 * message. Results of an outdated load (deps changed meanwhile) are ignored.
 */
export function useLoad<T>(load: () => Promise<T>, deps: readonly unknown[]) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const generation = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller lists the dependencies
  const run = useCallback(load, deps);

  const fetchData = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent') => {
      const mine = ++generation.current;
      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);
      try {
        const result = await run();
        if (mine === generation.current) {
          setData(result);
          setError(null);
        }
      } catch (e) {
        if (mine === generation.current) setError(errorMessage(e));
      } finally {
        if (mine === generation.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [run],
  );

  useEffect(() => {
    void fetchData('initial');
  }, [fetchData]);

  return {
    data,
    setData,
    error,
    loading,
    refreshing,
    /** Pull-to-refresh. */
    refresh: useCallback(() => fetchData('refresh'), [fetchData]),
    /** Reload without spinners (after an action). */
    reload: useCallback(() => fetchData('silent'), [fetchData]),
  };
}
