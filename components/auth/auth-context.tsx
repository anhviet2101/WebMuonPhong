import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authApi, clearAuthTokens, getAccessToken, setAuthTokens, type LoginResponse, type UserProfile } from "@/lib/api";

type AuthContextValue = {
  user: UserProfile | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<UserProfile>;
  logout: () => void;
  refreshProfile: () => Promise<UserProfile | null>;
  setUser: (user: UserProfile) => void;
};
const AuthContext = createContext<AuthContextValue | null>(null);

function fromResponse(response: LoginResponse): UserProfile {
  const raw = response.user ?? {};
  return {
    id: String(raw.id ?? ""),
    username: String(raw.username ?? ""),
    email: String(raw.email ?? ""),
    fullName: String(raw.fullName ?? raw.full_name ?? raw.username ?? ""),
    role: raw.role ?? "club",
    organizationId: raw.organizationId ?? raw.organization_id,
    organizationName: raw.organizationName ?? raw.organization_name,
    isActive: raw.isActive ?? raw.is_active ?? true,
    mustChangePassword: response.must_change_password ?? raw.mustChangePassword ?? raw.must_change_password ?? false,
    phone: raw.phone,
    title: raw.title,
    organization: raw.organization,
  };
}
function normalizeProfile(raw: UserProfile & Record<string, unknown>): UserProfile {
  return {
    ...raw,
    id: String(raw.id ?? ""),
    username: String(raw.username ?? ""),
    email: String(raw.email ?? ""),
    fullName: String(raw.fullName ?? raw.full_name ?? raw.username ?? ""),
    role: (raw.role ?? "club") as string,
    organizationId: (raw.organizationId ?? raw.organization_id) as string | undefined,
    organizationName: (raw.organizationName ?? raw.organization_name) as string | undefined,
    isActive: Boolean(raw.isActive ?? raw.is_active ?? true),
    mustChangePassword: Boolean(raw.mustChangePassword ?? raw.must_change_password ?? false),
    organization: raw.organization as UserProfile["organization"],
  };
}
function storedUser(): UserProfile | null {
  try {
    const value = localStorage.getItem("room-booking:user");
    return value ? (JSON.parse(value) as UserProfile) : null;
  } catch {
    return null;
  }
}
export function isClubRole(role: string) {
  const normalized = role.toLowerCase();
  return normalized === "club" || normalized.includes("club") || normalized.includes("representative") || normalized === "clb_rep";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<UserProfile | null>(() => storedUser());
  const [loading, setLoading] = useState(Boolean(getAccessToken()) && !user);
  const setUser = (next: UserProfile) => {
    setUserState(next);
    localStorage.setItem("room-booking:user", JSON.stringify(next));
  };
  const refreshProfile = async () => {
    if (!getAccessToken()) return null;
    try {
      const { data } = await authApi.me();
      const normalized = normalizeProfile(data as UserProfile & Record<string, unknown>);
      setUser(normalized);
      return normalized;
    } catch {
      return user;
    }
  };
  useEffect(() => {
    if (!getAccessToken()) return;
    void refreshProfile().finally(() => setLoading(false));
  }, []);
  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    login: async (username, password) => {
      const { data } = await authApi.login(username, password);
      setAuthTokens(data.access, data.refresh);
      const next = fromResponse(data);
      setUser(next);
      return next;
    },
    logout: () => {
      clearAuthTokens();
      setUserState(null);
      window.location.assign("/login");
    },
    refreshProfile,
    setUser,
  }), [loading, user]);
  return <AuthContext.Provider value={value}>{children}<PasswordGate /></AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is missing");
  return value;
}

function PasswordGate() {
  const { user, setUser, logout } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  useEffect(() => {
    const open = () => setManualOpen(true);
    window.addEventListener("room-booking:change-password", open);
    return () => window.removeEventListener("room-booking:change-password", open);
  }, []);
  const open = Boolean(user?.mustChangePassword) || manualOpen;
  const submit = async () => {
    if (next.length < 8 || next !== confirm) return toast.error("Mật khẩu mới tối thiểu 8 ký tự và phải trùng nhau.");
    setSaving(true);
    try {
      await authApi.changePassword(current, next);
      setUser({ ...user!, mustChangePassword: false });
      setManualOpen(false);
      toast.success("Đã đổi mật khẩu. Bạn có thể tiếp tục sử dụng hệ thống.");
    } catch {
      toast.error("Không thể đổi mật khẩu. Vui lòng kiểm tra mật khẩu hiện tại.");
    } finally { setSaving(false); }
  };
  return <Dialog open={open}><DialogContent onPointerDownOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => event.preventDefault()}>
    <DialogHeader><DialogTitle>Đổi mật khẩu bắt buộc</DialogTitle><DialogDescription>Vì lý do bảo mật, hãy đổi mật khẩu trước khi tiếp tục.</DialogDescription></DialogHeader>
    <div className="grid gap-3">
      <div className="grid gap-2"><Label>Mật khẩu hiện tại</Label><Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
      <div className="grid gap-2"><Label>Mật khẩu mới</Label><Input type="password" value={next} onChange={(e) => setNext(e.target.value)} /></div>
      <div className="grid gap-2"><Label>Nhập lại mật khẩu mới</Label><Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
    </div>
    <DialogFooter><Button variant="outline" onClick={logout}>Đăng xuất</Button><Button onClick={submit} disabled={saving}>{saving ? "Đang lưu..." : "Đổi mật khẩu"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
