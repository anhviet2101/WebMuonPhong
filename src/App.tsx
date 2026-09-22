import { AdminDashboard } from "../components/dashboard/admin-dashboard";
import { ClubDashboard } from "../components/dashboard/club-dashboard";
import { RoomCalendar } from "../components/calendar/room-calendar";
import { LoginPage } from "../components/auth/login-page";
import { ProfilePage } from "../components/auth/profile-page";
import { AdminUsersPage } from "../components/auth/admin-users-page";
import { isClubRole, useAuth } from "../components/auth/auth-context";
import { useEffect, type ReactNode } from "react";

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
    return <ProtectedRoute allow={isClubRole}><ProfilePage /></ProtectedRoute>;
  }
  if (window.location.pathname.startsWith("/admin/users")) {
    return <ProtectedRoute allow={(role) => !isClubRole(role)}><AdminUsersPage /></ProtectedRoute>;
  }
  if (window.location.pathname.includes("admin-doan")) {
    return <ProtectedRoute allow={(role) => !isClubRole(role)}><AdminDashboard /></ProtectedRoute>;
  }

  if (window.location.pathname.includes("calendar")) {
    return <RoomCalendar />;
  }

  return <ClubDashboard />;
}
