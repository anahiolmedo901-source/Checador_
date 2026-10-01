import { useCallback, useEffect, useRef, useState } from 'react';

export function useAdminList<Item>(fetchPage: (search: string) => Promise<Item[]>) {
  const fetchRef = useRef(fetchPage);

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchRef.current = fetchPage;
  }, [fetchPage]);

  const load = useCallback((term: string) => {
    setLoading(true);
    setError(null);
    return fetchRef.current(term).then(setItems);
  }, []);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void load(search).catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Error al cargar.');
      }).finally(() => {
        if (active) setLoading(false);
      });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, load]);

  const reload = useCallback(() => {
    void load(search).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Error al cargar.')).finally(() => setLoading(false));
  }, [search, load]);

  const setSearchDebounced = useCallback((value: string) => {
    setLoading(true);
    setSearch(value);
  }, []);

  return { items, loading, error, search, setSearch: setSearchDebounced, reload };
}