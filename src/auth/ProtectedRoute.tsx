// src/auth/ProtectedRoute.tsx
import { useAuth } from "./AuthProvider";
import AuthForm from "./AuthForm";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) return <div className="p-6 text-sc-delft/60">Loading…</div>;
  if (session) return <>{children}</>;

    return (
      <div className="flex h-screen items-center justify-center bg-sc-offwhite">
        <AuthForm />
      </div>
    );
}
