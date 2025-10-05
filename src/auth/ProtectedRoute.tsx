// src/auth/ProtectedRoute.tsx
import { useAuth } from "./AuthProvider";
import AuthForm from "./AuthForm";
import { useRole } from "../services/useRole";

export default function ProtectedRoute({
  children,
  roles, // e.g. ["admin"]
}: {
  children: React.ReactNode;
  roles?: UserRole[];
}) {
  const { session, loading: authLoading } = useAuth();
  const { role, loading: roleLoading } = useRole();

  if (authLoading || (roles && roleLoading)) {
    return <div className="p-6 text-sc-delft/60">Loading…</div>;
  }

  if (!session) {
    return (
      <div className="flex h-screen items-center justify-center bg-sc-offwhite">
        <AuthForm />
      </div>
    );
  }

  if (roles && role && !roles.includes(role)) {
    return (
      <div className="p-6 text-sc-delft/80">
        You don’t have access to this page.
      </div>
    );
  }

  return <>{children}</>;
}
