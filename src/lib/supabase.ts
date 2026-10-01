import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from '@/lib/env';

const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_KEY = 'placeholder-anon-key';

const url = isSupabaseConfigured ? supabaseUrl : PLACEHOLDER_URL;
const key = isSupabaseConfigured ? supabaseAnonKey : PLACEHOLDER_KEY;

function ssrStorage() {
  return {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  };
}

export const supabase = createClient(url, key, {
  auth: {
    storage: typeof window === 'undefined' ? ssrStorage() : (AsyncStorage as never),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});