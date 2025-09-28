import { createContext, useContext, useEffect, useState } from "react";
import { AuthService, type Session } from "../services/authService";

type AuthCtx = { session: Session | null; loading: boolean };
const Ctx = createContext<AuthCtx>({ session: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setSession(await AuthService.getSession());
      setLoading(false);
    })();
    return AuthService.onAuthChange((s) => setSession(s));
  }, []);

  return <Ctx.Provider value={{ session, loading }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
