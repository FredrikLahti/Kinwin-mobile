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

import { AuthErrorKind, classifySupabaseError } from '@/lib/auth/classify-error';
import { buildPasswordResetRedirectUrl } from '@/lib/auth/reset-password-url';
import { supabase } from '@/lib/supabase/client';

export type { AuthErrorKind };
export type AuthResult = { readonly ok: true } | { readonly ok: false; readonly kind: AuthErrorKind; readonly message: string };
// signUp succeeds whether or not Supabase requires email confirmation before
// a session exists — needsConfirmation is how the caller tells those two
// real outcomes apart instead of assuming the account is immediately usable.
export type SignUpResult = { readonly ok: true; readonly needsConfirmation: boolean } | { readonly ok: false; readonly kind: AuthErrorKind; readonly message: string };

export type Profile = { readonly id: string; readonly displayName: string | null; readonly showChallengeIntro: boolean };

type AuthStatus = 'loading' | 'signed_out' | 'signed_in';

type AuthContextValue = {
  readonly isConfigured: boolean;
  readonly status: AuthStatus;
  readonly session: Session | null;
  readonly user: User | null;
  readonly profile: Profile | null;
  readonly signUp: (email: string, password: string) => Promise<SignUpResult>;
  readonly resendConfirmationEmail: (email: string) => Promise<AuthResult>;
  readonly signIn: (email: string, password: string) => Promise<AuthResult>;
  readonly signOut: () => Promise<void>;
  readonly updateDisplayName: (displayName: string) => Promise<AuthResult>;
  readonly updateShowChallengeIntro: (show: boolean) => Promise<AuthResult>;
  readonly requestPasswordReset: (email: string) => Promise<AuthResult>;
  /** Requires the recovery session established by applyRecoverySession below. */
  readonly updatePassword: (newPassword: string) => Promise<AuthResult>;
  /** Establishes a session from a password-recovery link's access/refresh token pair. Never trusted as a normal sign-in. */
  readonly applyRecoverySession: (accessToken: string, refreshToken: string) => Promise<AuthResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const isConfigured = supabase !== null;
  const [status, setStatus] = useState<AuthStatus>(isConfigured ? 'loading' : 'signed_out');
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, show_challenge_intro')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) {
      setProfile(null);
      return;
    }
    setProfile({ id: data.id, displayName: data.display_name, showChallengeIntro: data.show_challenge_intro });
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

  const signUp = useCallback(async (email: string, password: string): Promise<SignUpResult> => {
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
    // A null session (with a real user) is exactly how Supabase reports
    // "created, but email confirmation is required before sign-in" — a
    // successful session here means confirmation is disabled or already
    // satisfied, so the account is immediately usable.
    return { ok: true, needsConfirmation: data.session === null };
  }, []);

  // Real, current v2 API (auth.resend), not a hand-rolled substitute. Never
  // reveals whether the email actually has a pending signup — GoTrue itself
  // does not distinguish that case in its response either.
  const resendConfirmationEmail = useCallback(async (email: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, kind: 'not_configured', message: 'Kinwin is not connected to a Supabase project yet.' };
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
    if (error) {
      const { kind, message } = classifySupabaseError(error.message);
      return { ok: false, kind, message };
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
    setProfile((current) => ({
      id: session.user.id,
      displayName: trimmed.length > 0 ? trimmed : null,
      showChallengeIntro: current?.showChallengeIntro ?? true,
    }));
    return { ok: true };
  }, [session]);

  const updateShowChallengeIntro = useCallback(async (show: boolean): Promise<AuthResult> => {
    if (!supabase || !session) return { ok: false, kind: 'not_configured', message: 'You are not signed in.' };
    const { error } = await supabase
      .from('profiles')
      .update({ show_challenge_intro: show })
      .eq('id', session.user.id);
    if (error) {
      const { kind, message } = classifySupabaseError(error.message);
      return { ok: false, kind, message };
    }
    setProfile((current) => (current ? { ...current, showChallengeIntro: show } : current));
    return { ok: true };
  }, [session]);

  // Never reports whether the email actually has an account — Supabase's
  // own resetPasswordForEmail deliberately succeeds either way, so this
  // stays truthful without any extra branching here.
  const requestPasswordReset = useCallback(async (email: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, kind: 'not_configured', message: 'Kinwin is not connected to a Supabase project yet.' };
    const redirectTo = buildPasswordResetRedirectUrl(process.env.EXPO_PUBLIC_RECIPIENT_INVITATION_BASE_URL);
    if (!redirectTo) return { ok: false, kind: 'not_configured', message: 'Password reset is not available in this build yet.' };
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (error) {
      const { kind, message } = classifySupabaseError(error.message);
      return { ok: false, kind, message };
    }
    return { ok: true };
  }, []);

  // Establishes the short-lived recovery session from the tokens embedded
  // in the emailed reset link. This is never treated as an ordinary sign-in
  // by the rest of the app — onAuthStateChange still flips status to
  // 'signed_in' (there is no separate "recovery" auth status in Supabase),
  // so the reset-password screen itself is what limits what this session is
  // used for before the user sets a new password.
  const applyRecoverySession = useCallback(async (accessToken: string, refreshToken: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, kind: 'not_configured', message: 'Kinwin is not connected to a Supabase project yet.' };
    const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) {
      const { kind, message } = classifySupabaseError(error.message);
      return { ok: false, kind, message };
    }
    return { ok: true };
  }, []);

  const updatePassword = useCallback(async (newPassword: string): Promise<AuthResult> => {
    if (!supabase || !session) return { ok: false, kind: 'not_authenticated', message: 'This reset link is no longer valid. Request a new one.' };
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      const { kind, message } = classifySupabaseError(error.message);
      return { ok: false, kind, message };
    }
    return { ok: true };
  }, [session]);

  const value = useMemo<AuthContextValue>(() => ({
    isConfigured,
    status,
    session,
    user: session?.user ?? null,
    profile,
    signUp,
    resendConfirmationEmail,
    signIn,
    signOut,
    updateDisplayName,
    updateShowChallengeIntro,
    requestPasswordReset,
    updatePassword,
    applyRecoverySession,
  }), [isConfigured, status, session, profile, signUp, resendConfirmationEmail, signIn, signOut, updateDisplayName, updateShowChallengeIntro, requestPasswordReset, updatePassword, applyRecoverySession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
