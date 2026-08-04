import type { Session, User } from '@supabase/supabase-js';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { supabase } from '@/lib/supabase/client';

export type AuthErrorKind =
  | 'not_configured'
  | 'invalid_credentials'
  | 'duplicate_account'
  | 'weak_password'
  | 'network'
  | 'unknown';

export type AuthResult = { readonly ok: true } | { readonly ok: false; readonly kind: AuthErrorKind; readonly message: string };

export type Profile = { readonly id: string; readonly displayName: string | null };

type AuthStatus = 'loading' | 'signed_out' | 'signed_in';

type AuthContextValue = {
  readonly isConfigured: boolean;
  readonly status: AuthStatus;
  readonly session: Session | null;
  readonly user: User | null;
  readonly profile: Profile | null;
  readonly signUp: (email: string, password: string) => Promise<AuthResult>;
  readonly signIn: (email: string, password: string) => Promise<AuthResult>;
  readonly signOut: () => Promise<void>;
  readonly updateDisplayName: (displayName: string) => Promise<AuthResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function classifySupabaseError(message: string | undefined): { kind: AuthErrorKind; message: string } {
  const text = (message ?? '').toLowerCase();
  if (text.includes('invalid login credentials') || text.includes('invalid email or password')) {
    return { kind: 'invalid_credentials', message: 'That email and password combination is incorrect.' };
  }
  if (text.includes('already registered') || text.includes('already exists') || text.includes('user already')) {
    return { kind: 'duplicate_account', message: 'An account with that email already exists. Try signing in instead.' };
  }
  if (text.includes('password') && (text.includes('short') || text.includes('at least') || text.includes('weak'))) {
    return { kind: 'weak_password', message: 'Choose a longer password (at least 8 characters).' };
  }
  if (text.includes('network') || text.includes('fetch') || text.includes('failed to connect')) {
    return { kind: 'network', message: 'Could not reach Kinwin. Check your connection and try again.' };
  }
  return { kind: 'unknown', message: message || 'Something went wrong. Try again.' };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const isConfigured = supabase !== null;
  const [status, setStatus] = useState<AuthStatus>(isConfigured ? 'loading' : 'signed_out');
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) {
      setProfile(null);
      return;
    }
    setProfile({ id: data.id, displayName: data.display_name });
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setStatus(data.session ? 'signed_in' : 'signed_out');
      if (data.session) void loadProfile(data.session.user.id);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setStatus(nextSession ? 'signed_in' : 'signed_out');
      if (nextSession) {
        void loadProfile(nextSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signUp = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, kind: 'not_configured', message: 'Kinwin is not connected to a Supabase project yet.' };
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) {
      const { kind, message } = classifySupabaseError(error.message);
      return { ok: false, kind, message };
    }
    // Supabase intentionally returns a user with no identities for an
    // already-registered email, to avoid leaking which emails have accounts.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      return { ok: false, kind: 'duplicate_account', message: 'An account with that email already exists. Try signing in instead.' };
    }
    return { ok: true };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, kind: 'not_configured', message: 'Kinwin is not connected to a Supabase project yet.' };
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      const { kind, message } = classifySupabaseError(error.message);
      return { ok: false, kind, message };
    }
    return { ok: true };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const updateDisplayName = useCallback(async (displayName: string): Promise<AuthResult> => {
    if (!supabase || !session) return { ok: false, kind: 'not_configured', message: 'You are not signed in.' };
    const trimmed = displayName.trim();
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: trimmed.length > 0 ? trimmed : null })
      .eq('id', session.user.id);
    if (error) {
      const { kind, message } = classifySupabaseError(error.message);
      return { ok: false, kind, message };
    }
    setProfile({ id: session.user.id, displayName: trimmed.length > 0 ? trimmed : null });
    return { ok: true };
  }, [session]);

  const value = useMemo<AuthContextValue>(() => ({
    isConfigured,
    status,
    session,
    user: session?.user ?? null,
    profile,
    signUp,
    signIn,
    signOut,
    updateDisplayName,
  }), [isConfigured, status, session, profile, signUp, signIn, signOut, updateDisplayName]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
