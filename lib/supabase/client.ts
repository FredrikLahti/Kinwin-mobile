import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { readSupabaseConfig } from './config';

/**
 * `null` when EXPO_PUBLIC_SUPABASE_URL/EXPO_PUBLIC_SUPABASE_ANON_KEY are
 * absent. Callers must handle that explicitly (see AuthProvider) rather than
 * falling back to a mocked client or a fake authenticated user.
 */
export const supabase: SupabaseClient | null = (() => {
  const config = readSupabaseConfig();
  if (!config) return null;
  return createClient(config.url, config.anonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
})();

// Supabase's token auto-refresh timer only ticks while the app is in the
// foreground; this is the official guidance for pairing it with RN's
// AppState so a backgrounded app doesn't burn the refresh cycle.
if (supabase) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
