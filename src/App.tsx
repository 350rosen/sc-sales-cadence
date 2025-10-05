// src/App.tsx
import { Routes, Route, NavLink, useLocation, Navigate } from "react-router-dom";
import { Bell, LayoutDashboard, Handshake, Users, Building2, Percent } from "lucide-react";
import { useState } from "react";

import Dashboard from "./pages/Dashboard";
import Deals from "./pages/Deals";
import Contacts from "./pages/Contacts";
import Companies from "./pages/Companies";
import CommissionSchedules from "./pages/CommissionSchedules";

import Modal from "./components/forms/Modal";
import AddDealExtendedForm from "./components/forms/DealForm";
import ExportCommissionsModal from "./components/forms/ExportCommissionsModal";
import { Button } from "./components/ui";

import { AuthProvider, useAuth } from "./auth/AuthProvider";
import ProtectedRoute from "./auth/ProtectedRoute";
import { supabase } from "./lib/supabaseClient";
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

/* ---------------- Role gate: wait before rendering any shell ---------------- */
function RoleGate() {
  const { role, loading } = useRole();
  if (loading) return <FullScreenLoading />;     // ← prevents “rep” flash for admins
  return role === "admin" ? <AdminAppShell /> : <RepAppShell />;
}

/* ---------- Sidebar (admin shell) ---------- */
function Sidebar() {
  const link = (isActive: boolean) =>
    `flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
      isActive
        ? "bg-sc-lightgreen/15 text-sc-green font-medium"
        : "text-sc-delft/80 hover:bg-sc-lightgreen/10"
    }`;

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 border-r border-sc-delft/15 bg-sc-white flex flex-col">
      <div className="h-16 flex items-center gap-3 px-4 border-b border-sc-delft/15">
        <div className="h-9 w-9 rounded bg-sc-green text-sc-white grid place-items-center font-bold">S</div>
        <div className="font-semibold text-sc-delft">Sun Caddy, LLC.</div>
      </div>

      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        <NavLink to="/" end className={({ isActive }) => link(isActive)}>
          {({ isActive }) => (<><LayoutDashboard size={18} className={isActive ? "text-sc-orange" : "text-sc-green"}/>Dashboard</>)}
        </NavLink>
        <NavLink to="/deals" className={({ isActive }) => link(isActive)}>
          {({ isActive }) => (<><Handshake size={18} className={isActive ? "text-sc-orange" : "text-sc-green"}/>Deals</>)}
        </NavLink>
        <NavLink to="/contacts" className={({ isActive }) => link(isActive)}>
          {({ isActive }) => (<><Users size={18} className={isActive ? "text-sc-orange" : "text-sc-green"}/>Contacts</>)}
        </NavLink>
        <NavLink to="/companies" className={({ isActive }) => link(isActive)}>
          {({ isActive }) => (<><Building2 size={18} className={isActive ? "text-sc-orange" : "text-sc-green"}/>Companies</>)}
        </NavLink>
        <NavLink to="/commissions" className={({ isActive }) => link(isActive)}>
          {({ isActive }) => (<><Percent size={18} className={isActive ? "text-sc-orange" : "text-sc-green"}/>Commission Schedules</>)}
        </NavLink>
      </nav>
    </aside>
  );
}

/* ---------- Top Bar (used by both shells) ---------- */
function TopBar() {
  const [openAdd, setOpenAdd] = useState(false);
  const [openExport, setOpenExport] = useState(false);
  const { session } = useAuth();
  const location = useLocation();

  // Flicker-free: purely route-based
  const onMyDealsPage = location.pathname.startsWith("/my-deals");

  const notifyReload = () => {
    localStorage.setItem("reload-deals", String(Date.now()));
  };

  return (
    <>
      <header className="h-16 sticky top-0 z-40 flex items-center justify-between px-4 border-b border-sc-delft/15 bg-sc-white">
        {/* Hide actions entirely on /my-deals */}
        {!onMyDealsPage ? (
          <div className="flex items-center gap-3">
            <Button onClick={() => setOpenAdd(true)}>Add New Deal</Button>
            <Button variant="secondary" onClick={() => setOpenExport(true)}>
              Export Commissions
            </Button>
          </div>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-3">
          {/* ... right side unchanged ... */}
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-sc-delft text-white grid place-items-center">
              {(session?.user?.email ?? "U").slice(0, 1).toUpperCase()}
            </div>
            <span className="text-sm text-sc-delft">
              {session?.user?.email ?? "Signed in"}
            </span>
            <button
              className="ml-2 text-xs text-sc-delft/70 underline hover:text-sc-orange"
              onClick={() => supabase.auth.signOut()}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Don’t even mount modals on /my-deals */}
      {!onMyDealsPage && (
        <>
          <Modal open={openAdd} title="Add Deal" onClose={() => setOpenAdd(false)}>
            <AddDealExtendedForm
              onDone={() => {
                setOpenAdd(false);
                notifyReload();
              }}
            />
          </Modal>

          <Modal
            open={openExport}
            title="Export Commissions"
            onClose={() => setOpenExport(false)}
          >
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
          </Routes>
        </main>
      </div>
    </div>
  );
}

/* ---------- Rep shell (your “My Deals” page) ---------- */
import MyDeals from "./pages/MyDeals"; // your rep page component

function RepAppShell() {
  return (
    <div className="h-screen bg-sc-offwhite">
      <div className="pl-0 h-screen flex flex-col">
        <TopBar /> {/* we’ll make TopBar route-aware below */}
        <main className="flex-1 overflow-y-auto p-6">
          <Routes>
            <Route path="/" element={<Navigate to="/my-deals" replace />} />  {/* NEW */}
            <Route path="/my-deals" element={<MyDeals />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

/* ---------- App (auth-wrapped) ---------- */
export default function App() {
  return (
    <AuthProvider>
      <ProtectedRoute>
        <RoleGate />   {/* ← wait for role before rendering any UI */}
      </ProtectedRoute>
    </AuthProvider>
  );
}
