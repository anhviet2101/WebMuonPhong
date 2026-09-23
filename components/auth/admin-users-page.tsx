import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, authApi, endpoints, type OrganizationProfile, type UserRecord } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "./auth-context";
import axios from "axios";

export function AdminUsersPage() {
  const { user, logout } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationProfile[]>([]);
  const [organizationForm, setOrganizationForm] = useState({ name: "", abbreviation: "" });
  const [form, setForm] = useState({ username: "", fullName: "", email: "", organization: "" });
  const normalize = (item: UserRecord & Record<string, unknown>): UserRecord => ({
    ...item,
    id: String(item.id),
    username: String(item.username ?? ""),
    email: String(item.email ?? ""),
    fullName: String(item.fullName ?? item.first_name ?? item.username ?? ""),
    role: String(item.role ?? item.role_name ?? "CLB_REP"),
    isActive: Boolean(item.isActive ?? item.is_active ?? false),
    mustChangePassword: Boolean(item.mustChangePassword ?? item.must_change_password ?? false),
  });
  const load = async () => {
    try {
      const { data } = await authApi.listUsers();
      const items = Array.isArray(data) ? data : data.results ?? [];
      setUsers(items.map((item) => normalize(item as UserRecord & Record<string, unknown>)));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const detail = error.response?.data?.detail;
        toast.error(
          detail
            ? `Không thể tải danh sách (${detail}).`
            : `Không thể tải danh sách (HTTP ${error.response?.status ?? "mạng"}).`,
        );
      } else {
        toast.error("Không thể tải danh sách tài khoản.");
      }
    }
  };
  useEffect(() => {
    void load();
    void api.get(endpoints.organizations).then(({ data }) => {
      setOrganizations(data.results ?? data);
    }).catch(() => toast.error("Không thể tải danh sách CLB."));
  }, []);
  const createOrganization = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const { data } = await api.post(endpoints.organizations, {
        name: organizationForm.name,
        abbreviation: organizationForm.abbreviation,
        type: "club",
        active: true,
      });
      setOrganizations((items) => [...items, data]);
      setForm((current) => ({ ...current, organization: String(data.id) }));
      setOrganizationForm({ name: "", abbreviation: "" });
      toast.success("Đã tạo hồ sơ CLB.");
    } catch {
      toast.error("Không thể tạo hồ sơ CLB.");
    }
  };
  const create = async (event: React.FormEvent) => { event.preventDefault(); if (!form.organization) return toast.error("Vui lòng chọn CLB."); try { const { data } = await authApi.createUser({ username: form.username, first_name: form.fullName, email: form.email, organization: Number(form.organization), role: "CLB_REP", must_change_password: true }); setUsers((items) => [normalize(data as UserRecord & Record<string, unknown>), ...items]); if (data.password) void navigator.clipboard?.writeText(data.password).catch(() => toast.info("Có thể sao chép mật khẩu từ thông báo.")); setForm({ username: "", fullName: "", email: "", organization: form.organization }); toast.success(data.password ? `Đã tạo tài khoản. Mật khẩu tạm thời: ${data.password}` : "Đã tạo tài khoản."); } catch { toast.error("Không thể tạo tài khoản."); } };
  const reset = async (id: string) => { try { const { data } = await authApi.resetUserPassword(id); if (data.password) { void navigator.clipboard?.writeText(data.password).catch(() => toast.info("Có thể sao chép mật khẩu từ thông báo.")); toast.success(`Mật khẩu mới: ${data.password}`); } else toast.success("Đã yêu cầu đặt lại mật khẩu."); } catch { toast.error("Không thể đặt lại mật khẩu."); } };
  const toggle = async (item: UserRecord) => { try { const { data } = await authApi.toggleUser(item.id, !item.isActive); const normalized = normalize(data as UserRecord & Record<string, unknown>); setUsers((items) => items.map((value) => value.id === item.id ? normalized : value)); toast.success(normalized.isActive ? "Đã mở tài khoản." : "Đã khóa tài khoản."); } catch { toast.error("Không thể cập nhật tài khoản."); } };
  if (!user) return null;
  return <main className="min-h-screen bg-slate-50 p-4 sm:p-8"><div className="mx-auto max-w-6xl space-y-6">
    <div className="flex items-center justify-between"><div><p className="text-sm text-blue-600">QUẢN TRỊ HỆ THỐNG</p><h1 className="text-2xl font-semibold">Tài khoản người dùng</h1></div><Button variant="outline" onClick={logout}>Đăng xuất</Button></div>
    <Card><CardHeader><CardTitle>Thêm CLB</CardTitle><CardDescription>Tạo hồ sơ CLB trước khi cấp tài khoản đại diện.</CardDescription></CardHeader><CardContent><form className="grid gap-3 sm:grid-cols-[1fr_180px_auto]" onSubmit={createOrganization}><div className="grid gap-2"><Label>Tên CLB</Label><Input required value={organizationForm.name} onChange={(e) => setOrganizationForm({ ...organizationForm, name: e.target.value })} /></div><div className="grid gap-2"><Label>Tên viết tắt</Label><Input value={organizationForm.abbreviation} onChange={(e) => setOrganizationForm({ ...organizationForm, abbreviation: e.target.value })} /></div><div className="flex items-end"><Button>Thêm CLB</Button></div></form></CardContent></Card>
    <Card><CardHeader><CardTitle>Tạo tài khoản đại diện</CardTitle><CardDescription>Mật khẩu tạm thời sẽ được hệ thống tạo và yêu cầu đổi ở lần đăng nhập đầu.</CardDescription></CardHeader><CardContent><form className="grid gap-3 sm:grid-cols-5" onSubmit={create}><div className="grid gap-2"><Label>CLB</Label><Select value={form.organization} onValueChange={(value) => setForm({ ...form, organization: value })}><SelectTrigger><SelectValue placeholder="Chọn CLB" /></SelectTrigger><SelectContent>{organizations.filter((item) => item.active !== false).map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>Tên đăng nhập</Label><Input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div><div className="grid gap-2"><Label>Họ tên</Label><Input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></div><div className="grid gap-2"><Label>Email</Label><Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div><div className="flex items-end"><Button>Tạo tài khoản</Button></div></form></CardContent></Card>
    <Card><CardHeader><CardTitle>Danh sách tài khoản</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">Người dùng</th><th className="p-3">Vai trò</th><th className="p-3">Trạng thái</th><th className="p-3 text-right">Thao tác</th></tr></thead><tbody>{users.map((item) => <tr className="border-b" key={item.id}><td className="p-3"><b>{item.fullName}</b><div className="text-slate-500">{item.username} · {item.email}</div></td><td className="p-3">{item.role}</td><td className="p-3"><Badge variant={item.isActive ? "default" : "outline"}>{item.isActive ? "Đang hoạt động" : "Đã khóa"}</Badge></td><td className="space-x-2 p-3 text-right"><Button size="sm" variant="outline" onClick={() => void toggle(item)}>{item.isActive ? "Khóa" : "Mở khóa"}</Button><Button size="sm" variant="outline" onClick={() => void reset(item.id)}>Đặt lại mật khẩu</Button></td></tr>)}</tbody></table>{users.length === 0 && <p className="py-8 text-center text-slate-500">Chưa có dữ liệu tài khoản.</p>}</div></CardContent></Card>
  </div></main>;
}
