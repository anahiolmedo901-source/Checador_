import { Session } from '@supabase/supabase-js';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { getFriendlyError } from '@/lib/errors';
import { registerDevice } from '@/lib/device';
import { supabase } from '@/lib/supabase';
import { DeviceInfo, EmployeeProfile } from '@/types';

type AuthStatus = 'loading' | 'signedIn' | 'signedOut';

type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  profile: EmployeeProfile | null;
  device: DeviceInfo | null;
  isDeviceUsable: boolean;
  signIn: (code: string, nip: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshDevice: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const EMAIL_DOMAIN = 'check.local';

function codeToEmail(code: string): string {
  const normalized = code.trim().toUpperCase().replace(/\s+/g, '');
  return `${normalized}@${EMAIL_DOMAIN}`;
}

async function fetchProfile(): Promise<EmployeeProfile | null> {
  const { data, error } = await supabase.rpc('employee_profile');
  if (error) throw error;
  return (data as EmployeeProfile) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  const refreshDevice = useCallback(async () => {
    try {
      const info = await registerDevice();
      setDevice(info);
    } catch {
      setDevice(null);
    }
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!active) return;
        setSession(data.session);
        if (data.session) {
          try {
            const p = await fetchProfile();
            if (active) setProfile(p);
          } catch {
            if (active) setProfile(null);
          }
          refreshDevice();
        }
        if (active) setStatus(data.session ? 'signedIn' : 'signedOut');
      })
      .catch(() => {
        if (active) setStatus('signedOut');
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) setDevice(null);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [refreshDevice]);

  const isDeviceUsable =
    device == null ? true : device.is_active;

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      profile,
      device,
      isDeviceUsable,
      async signIn(code, nip) {
        const { error } = await supabase.auth.signInWithPassword({
          email: codeToEmail(code),
          password: nip,
        });
        if (error) {
          const friendly = getFriendlyError(error);
          throw new Error(friendly);
        }
        const p = await fetchProfile();
        setProfile(p);
        setStatus('signedIn');
        await refreshDevice();
      },
      async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        setProfile(null);
        setDevice(null);
        setStatus('signedOut');
      },
      async refreshProfile() {
        const p = await fetchProfile();
        setProfile(p);
      },
      refreshDevice,
    }),
    [status, session, profile, device, isDeviceUsable, refreshDevice]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
