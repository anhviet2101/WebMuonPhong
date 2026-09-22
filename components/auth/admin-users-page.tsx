import { useEffect, useState } from "react";
import { toast } from "sonner";
import { authApi, type UserRecord } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "./auth-context";
import axios from "axios";

export function AdminUsersPage() {
  const { user, logout } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [form, setForm] = useState({ username: "", fullName: "", email: "", role: "club" });
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
  useEffect(() => { void load(); }, []);
  const create = async (event: React.FormEvent) => { event.preventDefault(); try { const password = "UET@2026"; const { data } = await authApi.createUser({ username: form.username, first_name: form.fullName, email: form.email, password, role: "CLB_REP", must_change_password: true }); setUsers((items) => [normalize(data as UserRecord & Record<string, unknown>), ...items]); await navigator.clipboard.writeText(password); setForm({ username: "", fullName: "", email: "", role: "club" }); toast.success(`Đã tạo tài khoản. Mật khẩu tạm thời ${password} đã được sao chép.`); } catch { toast.error("Không thể tạo tài khoản."); } };
  const reset = async (id: string) => { try { const { data } = await authApi.resetUserPassword(id); if (data.password) { await navigator.clipboard.writeText(data.password); toast.success("Mật khẩu mới đã được sao chép."); } else toast.success("Đã yêu cầu đặt lại mật khẩu."); } catch { toast.error("Không thể đặt lại mật khẩu."); } };
  const toggle = async (item: UserRecord) => { try { const { data } = await authApi.toggleUser(item.id, !item.isActive); const normalized = normalize(data as UserRecord & Record<string, unknown>); setUsers((items) => items.map((value) => value.id === item.id ? normalized : value)); toast.success(normalized.isActive ? "Đã mở tài khoản." : "Đã khóa tài khoản."); } catch { toast.error("Không thể cập nhật tài khoản."); } };
  if (!user) return null;
  return <main className="min-h-screen bg-slate-50 p-4 sm:p-8"><div className="mx-auto max-w-6xl space-y-6">
    <div className="flex items-center justify-between"><div><p className="text-sm text-blue-600">QUẢN TRỊ HỆ THỐNG</p><h1 className="text-2xl font-semibold">Tài khoản người dùng</h1></div><Button variant="outline" onClick={logout}>Đăng xuất</Button></div>
    <Card><CardHeader><CardTitle>Tạo tài khoản đại diện</CardTitle><CardDescription>Mật khẩu tạm thời sẽ được hệ thống tạo và yêu cầu đổi ở lần đăng nhập đầu.</CardDescription></CardHeader><CardContent><form className="grid gap-3 sm:grid-cols-4" onSubmit={create}><div className="grid gap-2"><Label>Tên đăng nhập</Label><Input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div><div className="grid gap-2"><Label>Họ tên</Label><Input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></div><div className="grid gap-2"><Label>Email</Label><Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div><div className="flex items-end"><Button>Tạo tài khoản</Button></div></form></CardContent></Card>
    <Card><CardHeader><CardTitle>Danh sách tài khoản</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">Người dùng</th><th className="p-3">Vai trò</th><th className="p-3">Trạng thái</th><th className="p-3 text-right">Thao tác</th></tr></thead><tbody>{users.map((item) => <tr className="border-b" key={item.id}><td className="p-3"><b>{item.fullName}</b><div className="text-slate-500">{item.username} · {item.email}</div></td><td className="p-3">{item.role}</td><td className="p-3"><Badge variant={item.isActive ? "default" : "outline"}>{item.isActive ? "Đang hoạt động" : "Đã khóa"}</Badge></td><td className="space-x-2 p-3 text-right"><Button size="sm" variant="outline" onClick={() => void toggle(item)}>{item.isActive ? "Khóa" : "Mở khóa"}</Button><Button size="sm" variant="outline" onClick={() => void reset(item.id)}>Đặt lại mật khẩu</Button></td></tr>)}</tbody></table>{users.length === 0 && <p className="py-8 text-center text-slate-500">Chưa có dữ liệu tài khoản.</p>}</div></CardContent></Card>
  </div></main>;
}
