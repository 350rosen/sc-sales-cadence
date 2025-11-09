import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import { LayoutDashboard, Handshake, Users, Building2, Percent, Mail } from "lucide-react";
import { useState } from "react";

import Dashboard from "./pages/Dashboard";
import Deals from "./pages/Deals";
import Contacts from "./pages/Contacts";
import Companies from "./pages/Companies";
import CommissionSchedules from "./pages/CommissionSchedules";
import MyDeals from "./pages/MyDeals";
import Communications from "./pages/Communications";
import AccountManagementPage from "./pages/AccountManagementPage";
import ResetPassword from "./pages/ResetPassword";

import Modal from "./components/forms/Modal";
import AddDealExtendedForm from "./components/forms/DealForm";
import ExportCommissionsModal from "./components/forms/ExportCommissionsModal";
import { Button } from "./components/ui";

import { AuthService } from "./services/authService";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import ProtectedRoute from "./auth/ProtectedRoute";
import { useRole } from "./services/useRole";

/* ---------------- Fullscreen loader ---------------- */
function FullScreenLoading() {
  return (
    <div className="h-screen w-screen grid place-items-center bg-sc-offwhite">
      <div className="rounded-md border border-sc-delft/15 bg-white px-4 py-2 text-sc-delft/70">
        Loading…
      </div>
    </div>
  );
}

/* ---------------- Role gate ---------------- */
function RoleGate() {
  const { role, loading } = useRole();
  if (loading) return <FullScreenLoading />;

  if (role === "admin") return <AdminAppShell />;
  if (role === "sdev") return <SdevAppShell />;
  return <RepAppShell />;
}

/* ---------- Sidebar (admin shell) ---------- */
function Sidebar() {
  const link = (isActive: boolean) =>
    `flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
      isActive ? "bg-sc-lightgreen/15 text-sc-green font-medium" : "text-sc-delft/80 hover:bg-sc-lightgreen/10"
    }`;

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 border-r border-sc-delft/15 bg-sc-white flex flex-col">
      <div className="h-16 flex items-center gap-3 px-4 border-b border-sc-delft/15">
        <div className="h-9 w-9 rounded bg-sc-green text-sc-white grid place-items-center font-bold">S</div>
        <div className="font-semibold text-sc-delft">Sun Caddy, LLC.</div>
      </div>

      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        <NavLink to="/" end className={({ isActive }) => link(isActive)}>
          {({ isActive }) => (<><LayoutDashboard size={18} className={isActive ? "text-sc-orange" : "text-sc-green"} />Dashboard</>)}
        </NavLink>
        <NavLink to="/deals" className={({ isActive }) => link(isActive)}>
          {({ isActive }) => (<><Handshake size={18} className={isActive ? "text-sc-orange" : "text-sc-green"} />Deals</>)}
        </NavLink>
        <NavLink to="/contacts" className={({ isActive }) => link(isActive)}>
          {({ isActive }) => (<><Users size={18} className={isActive ? "text-sc-orange" : "text-sc-green"} />Contacts</>)}
        </NavLink>
        <NavLink to="/companies" className={({ isActive }) => link(isActive)}>
          {({ isActive }) => (<><Building2 size={18} className={isActive ? "text-sc-orange" : "text-sc-green"} />Companies</>)}
        </NavLink>
        <NavLink to="/commissions" className={({ isActive }) => link(isActive)}>
          {({ isActive }) => (<><Percent size={18} className={isActive ? "text-sc-orange" : "text-sc-green"} />Commission Schedules</>)}
        </NavLink>
        {/* NOTE: Communications removed from admin UI */}
      </nav>
    </aside>
  );
}

/* ---------- Rep Sidebar ---------- */
function RepSidebar() {
  const link = (isActive: boolean) =>
    `flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
      isActive ? "bg-sc-lightgreen/15 text-sc-green font-medium" : "text-sc-delft/80 hover:bg-sc-lightgreen/10"
    }`;

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 border-r border-sc-delft/15 bg-sc-white flex flex-col">
      <div className="h-16 flex items-center gap-3 px-4 border-b border-sc-delft/15">
        <div className="h-9 w-9 rounded bg-sc-green text-sc-white grid place-items-center font-bold">S</div>
        <div className="font-semibold text-sc-delft">Rep</div>
      </div>
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        <NavLink to="/my-deals" className={({ isActive }) => link(isActive)}>
          {({ isActive }) => (<><Handshake size={18} className={isActive ? "text-sc-orange" : "text-sc-green"} />My Deals</>)}
        </NavLink>
        <NavLink to="/communications" className={({ isActive }) => link(isActive)}>
          {({ isActive }) => (<><Mail size={18} className={isActive ? "text-sc-orange" : "text-sc-green"} />Communications</>)}
        </NavLink>
      </nav>
    </aside>
  );
}

/* ---------- Top Bar (role-based CTAs) ---------- */
function TopBar() {
  const [openAdd, setOpenAdd] = useState(false);
  const [openExport, setOpenExport] = useState(false);
  const { session } = useAuth();
  const { role } = useRole();

  const showCtas = role === "admin"; // only admins see Add / Export
  const notifyReload = () => localStorage.setItem("reload-deals", String(Date.now()));

  return (
    <>
      <header className="h-16 sticky top-0 z-40 flex items-center justify-between px-4 border-b border-sc-delft/15 bg-sc-white">
        {showCtas ? (
          <div className="flex items-center gap-3">
            <Button onClick={() => setOpenAdd(true)}>Add New Deal</Button>
            <Button variant="secondary" onClick={() => setOpenExport(true)}>Export Commissions</Button>
          </div>
        ) : <div />}

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-sc-delft text-white grid place-items-center">
              {(session?.user?.email ?? "U").slice(0, 1).toUpperCase()}
            </div>
            <span className="text-sm text-sc-delft">{session?.user?.email ?? "Signed in"}</span>

            {role === "admin" && (
              <NavLink to="/account" className="ml-2 text-xs text-sc-delft/70 underline hover:text-sc-green">Account</NavLink>
            )}

            <button className="ml-2 text-xs text-sc-delft/70 underline hover:text-sc-orange" onClick={() => AuthService.signOut()}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      {showCtas && (
        <>
          <Modal open={openAdd} title="Add Deal" onClose={() => setOpenAdd(false)}>
            <AddDealExtendedForm
              onDone={() => {
                setOpenAdd(false);
                notifyReload();
              }}
            />
          </Modal>

          <Modal open={openExport} title="Export Commissions" onClose={() => setOpenExport(false)}>
            <ExportCommissionsModal onDone={() => setOpenExport(false)} />
          </Modal>
        </>
      )}
    </>
  );
}

/* ---------- Admin shell ---------- */
function AdminAppShell() {
  return (
    <div className="h-screen bg-sc-offwhite">
      <aside className="fixed left-0 top-0 h-screen w-64 border-r border-sc-delft/15 bg-sc-white">
        <Sidebar />
      </aside>
      <div className="pl-64 h-screen flex flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/deals" element={<Deals />} />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="/companies" element={<Companies />} />
            <Route path="/commissions" element={<CommissionSchedules />} />
            {/* Communications intentionally NOT routed here */}
            <Route path="/account" element={<AccountManagementPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

/* ---------- Rep shell ---------- */
function RepAppShell() {
  return (
    <div className="h-screen bg-sc-offwhite">
      <aside className="fixed left-0 top-0 h-screen w-56 border-r border-sc-delft/15 bg-sc-white">
        <RepSidebar />
      </aside>
      <div className="pl-56 h-screen flex flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">
          <Routes>
            <Route path="/" element={<Navigate to="/my-deals" replace />} />
            <Route path="/my-deals" element={<MyDeals />} />
            <Route path="/communications" element={<Communications />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

/* ---------- Sdev shell (only Communications) ---------- */
function SdevAppShell() {
  return (
    <div className="h-screen bg-sc-offwhite">
      <div className="pl-0 h-screen flex flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">
          <Routes>
            <Route path="/" element={<Navigate to="/communications" replace />} />
            <Route path="/communications" element={<Communications />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

/* ---------- Protected App wrapper ---------- */
function ProtectedApp() {
  return (
    <ProtectedRoute>
      <RoleGate />
    </ProtectedRoute>
  );
}

/* ---------- App ---------- */
export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/*" element={<ProtectedApp />} />
      </Routes>
    </AuthProvider>
  );
}
