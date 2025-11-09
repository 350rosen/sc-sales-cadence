import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AuthService, type Session } from "../services/authService";

type AuthCtx = {
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  session: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const s = await AuthService.getSession();
      if (mounted) {
        setSession(s);
        setLoading(false);
      }
    })();

    const unsub = AuthService.onAuthChange((s) => {
      if (mounted) setSession(s);
    });

    return () => { mounted = false; unsub(); };
  }, []);

  const signOut = async () => {
    await AuthService.signOut();
    // hard redirect so shells reset and ProtectedRoute re-evaluates
    window.location.replace("/");
  };

  const value = useMemo(() => ({ session, loading, signOut }), [session, loading]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
