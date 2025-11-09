import type { Session } from '@supabase/supabase-js';
import { supabase } from "../lib/supabaseClient";

type Unsubscribe = () => void;

function clearSupabaseLocal() {
  // belt & suspenders: remove any lingering local entries
  Object.keys(localStorage).forEach((k) => {
    if (k.startsWith('sb-')) localStorage.removeItem(k);
  });
}

export const AuthService = {
  async getSession(): Promise<Session | null> {
    const { data } = await supabase.auth.getSession();
    return data.session ?? null;
  },

  onAuthChange(callback: (session: Session | null) => void): Unsubscribe {
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      callback(session ?? null);
    });
    return () => data.subscription.unsubscribe();
  },

  async signOut(): Promise<void> {
    // revoke tokens server-side
    await supabase.auth.signOut(); // default scope "global"
    // clear any cached local tokens from old clients/versions
    clearSupabaseLocal();
    // force a full reload so providers/shell reset immediately
    window.location.replace('/');
  },

  // OAuth example
  signInWithGoogle(redirectTo?: string) {
    return supabase.auth.signInWithOAuth({
      provider: "google",
      options: redirectTo ? { redirectTo } : undefined,
    });
  },

  // magic link / OTP example
  signInWithEmail(email: string, redirectTo?: string) {
    return supabase.auth.signInWithOtp({
      email,
      options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
    });
  },

  getUser() {
    return supabase.auth.getUser(); // { data: { user }, error }
  },
};

export type { Session };
