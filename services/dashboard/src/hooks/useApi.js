import { useCallback, useEffect, useState } from 'react';

/**
 * Minimal data-fetching hook: no caching/dedup library needed at this scope
 * (a handful of read-mostly dashboard views), just loading/error/data state
 * and a refetch function for the "after triggering a pipeline run" case.
 */
export function useApi(fetcher, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    load();
  }, [load]);

  return { data, error, loading, refetch: load };
}
