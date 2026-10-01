import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { getFriendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { SessionState } from '@/types';

export function useSessionState() {
  const [state, setState] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('my_session_state');
      if (rpcError) {
        setError(getFriendlyError(rpcError));
        setState(null);
      } else {
        setError(null);
        setState((data as SessionState) ?? null);
      }
    } catch (err) {
      setError(getFriendlyError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  return { state, loading, error, refresh };
}