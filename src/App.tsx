import { LoginPage } from "../components/auth/login-page";
import { isClubRole, useAuth } from "../components/auth/auth-context";
import { lazy, Suspense, useEffect, type ReactNode } from "react";

const AdminDashboard = lazy(() => import("../components/dashboard/admin-dashboard").then((module) => ({ default: module.AdminDashboard })));
const ClubDashboard = lazy(() => import("../components/dashboard/club-dashboard").then((module) => ({ default: module.ClubDashboard })));
const RoomCalendar = lazy(() => import("../components/calendar/room-calendar").then((module) => ({ default: module.RoomCalendar })));
const ProfilePage = lazy(() => import("../components/auth/profile-page").then((module) => ({ default: module.ProfilePage })));
const AdminUsersPage = lazy(() => import("../components/auth/admin-users-page").then((module) => ({ default: module.AdminUsersPage })));
const PrototypeStoreProvider = lazy(() => import("../components/shared/prototype-store").then((module) => ({ default: module.PrototypeStoreProvider })));

function ProtectedRoute({
  allow,
  children,
}: {
  allow: (role: string) => boolean;
  children: ReactNode;
}) {
  const { user, loading } = useAuth();
  useEffect(() => {
    if (!loading && (!user || !allow(user.role))) {
      window.location.assign("/login");
    }
  }, [allow, loading, user]);
  if (loading || !user || !allow(user.role)) return null;
  return <>{children}</>;
}

export default function App() {
  if (window.location.pathname === "/login") return <LoginPage />;
  if (window.location.pathname.startsWith("/clb/profile")) {
    return <ProtectedRoute allow={isClubRole}><Suspense fallback={<PageLoading />}><ProfilePage /></Suspense></ProtectedRoute>;
  }
  if (window.location.pathname.startsWith("/admin/users")) {
    return <ProtectedRoute allow={(role) => !isClubRole(role)}><Suspense fallback={<PageLoading />}><AdminUsersPage /></Suspense></ProtectedRoute>;
  }
  if (window.location.pathname.includes("admin-doan")) {
    return (
      <ProtectedRoute allow={(role) => !isClubRole(role)}>
        <Suspense fallback={<PageLoading />}><PrototypeStoreProvider>
          <AdminDashboard />
        </PrototypeStoreProvider></Suspense>
      </ProtectedRoute>
    );
  }

  if (window.location.pathname.includes("calendar")) {
    return (
      <ProtectedRoute allow={() => true}>
        <Suspense fallback={<PageLoading />}><PrototypeStoreProvider>
          <RoomCalendar />
        </PrototypeStoreProvider></Suspense>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute allow={isClubRole}>
      <Suspense fallback={<PageLoading />}><PrototypeStoreProvider>
        <ClubDashboard />
      </PrototypeStoreProvider></Suspense>
    </ProtectedRoute>
  );
}

function PageLoading() {
  return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Đang tải trang...</div>;
}
