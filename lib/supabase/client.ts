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
      // Explicit, not just relying on the (currently also 'implicit')
      // supabase-js default: PKCE's code exchange needs the code_verifier
      // it generated to still be in *this* client instance's storage when
      // the link is opened. Kinwin's password-recovery and email-confirmation
      // links are frequently opened in a different context than the one
      // that requested them — a phone's default browser (Universal
      // Links/App Links aren't fully configured on every platform/build
      // yet) or a different device's mail client — where that verifier
      // was never stored. Implicit flow avoids this entirely: GoTrue
      // verifies the emailed token server-side and hands back a ready
      // access_token/refresh_token pair directly, needing nothing stored
      // locally beforehand. See app/auth/reset-password.tsx and
      // lib/auth/parse-auth-redirect.ts. Kinwin has no OAuth/SSO, so PKCE's
      // usual advantage (protecting an OAuth redirect's authorization code
      // from interception) doesn't apply here.
      flowType: 'implicit',
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
