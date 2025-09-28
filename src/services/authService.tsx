import { supabase } from "../lib/supabaseClient";

export type Session = Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"];

export const AuthService = {
  async getSession() {
    const { data } = await supabase.auth.getSession();
    return data.session;
  },
  onAuthChange(callback: (session: Session) => void) {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => callback(session));
    return () => sub.subscription.unsubscribe();
  },
  signOut() {
    return supabase.auth.signOut();
  },
  // pick one or add more providers
  signInWithGoogle(redirectTo?: string) {
    return supabase.auth.signInWithOAuth({
      provider: "google",
      options: redirectTo ? { redirectTo } : undefined,
    });
  },
  // email+link example
  signInWithEmail(email: string, redirectTo?: string) {
    return supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
  },
  getUser() {
    return supabase.auth.getUser(); // { data: { user }, error }
  },
};
