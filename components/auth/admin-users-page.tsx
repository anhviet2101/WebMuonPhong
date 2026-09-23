import { useEffect, useState, type FormEvent } from "react";
import axios from "axios";
import { toast } from "sonner";
import { api, authApi, endpoints, type OrganizationProfile, type UserRecord } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "./auth-context";

function unpack<T>(data: T[] | { results?: T[] }): T[] {
  return Array.isArray(data) ? data : data.results ?? [];
}

function normalizeUser(item: UserRecord & Record<string, unknown>): UserRecord {
  return {
    ...item,
    id: String(item.id),
    username: String(item.username ?? ""),
    email: String(item.email ?? ""),
    fullName: String(item.fullName ?? item.first_name ?? item.username ?? ""),
    role: String(item.role ?? item.role_name ?? "CLB_REP"),
    isActive: Boolean(item.isActive ?? item.is_active ?? false),
    mustChangePassword: Boolean(item.mustChangePassword ?? item.must_change_password ?? false),
    archivedAt: (item.archivedAt ?? item.archived_at ?? null) as string | null,
  };
}

function errorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return fallback;
}

export function AdminUsersPage() {
  const { user, logout } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [archivedUsers, setArchivedUsers] = useState<UserRecord[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationProfile[]>([]);
  const [archivedOrganizations, setArchivedOrganizations] = useState<OrganizationProfile[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [organizationForm, setOrganizationForm] = useState({ name: "", abbreviation: "" });
  const [form, setForm] = useState({ username: "", fullName: "", email: "", organization: "" });

  const load = async () => {
    try {
      const [currentUsers, deletedUsers, currentOrganizations, deletedOrganizations] = await Promise.all([
        authApi.listUsers(),
        authApi.listUsers(true),
        api.get<OrganizationProfile[]>(endpoints.organizations),
        api.get<OrganizationProfile[]>(`${endpoints.organizations}?archived=1`),
      ]);
      setUsers(unpack(currentUsers.data).map((item) => normalizeUser(item as UserRecord & Record<string, unknown>)));
      setArchivedUsers(unpack(deletedUsers.data).map((item) => normalizeUser(item as UserRecord & Record<string, unknown>)));
      setOrganizations(unpack(currentOrganizations.data));
      setArchivedOrganizations(unpack(deletedOrganizations.data));
    } catch (error) {
      toast.error(errorMessage(error, "Không thể tải danh sách CLB và tài khoản."));
    }
  };

  useEffect(() => { void load(); }, []);

  const createOrganization = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const { data } = await api.post<OrganizationProfile>(endpoints.organizations, {
        name: organizationForm.name,
        abbreviation: organizationForm.abbreviation,
        type: "club",
        active: true,
      });
      setOrganizations((items) => [...items, data]);
      setForm((current) => ({ ...current, organization: String(data.id) }));
      setOrganizationForm({ name: "", abbreviation: "" });
      toast.success("Đã tạo hồ sơ CLB.");
    } catch (error) {
      toast.error(errorMessage(error, "Không thể tạo hồ sơ CLB."));
    }
  };

  const createUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.organization) return toast.error("Vui lòng chọn CLB.");
    try {
      const { data } = await authApi.createUser({
        username: form.username,
        first_name: form.fullName,
        email: form.email,
        organization: Number(form.organization),
        role: "CLB_REP",
        must_change_password: true,
      });
      setUsers((items) => [normalizeUser(data as UserRecord & Record<string, unknown>), ...items]);
      if (data.password) {
        void navigator.clipboard?.writeText(data.password).catch(() => toast.info("Có thể sao chép mật khẩu từ thông báo."));
      }
      setForm({ username: "", fullName: "", email: "", organization: form.organization });
      toast.success(data.password ? `Đã tạo tài khoản. Mật khẩu tạm thời: ${data.password}` : "Đã tạo tài khoản.");
    } catch (error) {
      toast.error(errorMessage(error, "Không thể tạo tài khoản."));
    }
  };

  const resetPassword = async (id: string) => {
    try {
      const { data } = await authApi.resetUserPassword(id);
      if (data.password) {
        void navigator.clipboard?.writeText(data.password).catch(() => toast.info("Có thể sao chép mật khẩu từ thông báo."));
        toast.success(`Mật khẩu mới: ${data.password}`);
      } else {
        toast.success("Đã yêu cầu đặt lại mật khẩu.");
      }
    } catch (error) {
      toast.error(errorMessage(error, "Không thể đặt lại mật khẩu."));
    }
  };

  const toggleUser = async (item: UserRecord) => {
    try {
      const { data } = await authApi.toggleUser(item.id, !item.isActive);
      const normalized = normalizeUser(data as UserRecord & Record<string, unknown>);
      setUsers((items) => items.map((value) => value.id === item.id ? normalized : value));
      toast.success(normalized.isActive ? "Đã mở tài khoản." : "Đã khóa tài khoản.");
    } catch (error) {
      toast.error(errorMessage(error, "Không thể cập nhật tài khoản."));
    }
  };

  const archiveOrganization = async (item: OrganizationProfile) => {
    if (!item.id || !window.confirm(`Xóa CLB “${item.name}”? Các tài khoản đại diện sẽ ngừng đăng nhập. Đơn cũ và nhật ký vẫn được giữ.`)) return;
    try {
      await api.delete(`${endpoints.organizations}${item.id}/`);
      await load();
      toast.success("Đã xóa CLB. Có thể khôi phục trong mục Đã xóa.");
    } catch (error) {
      toast.error(errorMessage(error, "Không thể xóa CLB."));
    }
  };

  const restoreOrganization = async (item: OrganizationProfile) => {
    if (!item.id) return;
    try {
      await api.post(`${endpoints.organizations}${item.id}/restore/`);
      await load();
      toast.success("Đã khôi phục CLB. Hãy khôi phục từng tài khoản đại diện nếu cần.");
    } catch (error) {
      toast.error(errorMessage(error, "Không thể khôi phục CLB."));
    }
  };

  const archiveUser = async (item: UserRecord) => {
    if (!window.confirm(`Xóa tài khoản “${item.username}”? Người này sẽ ngừng đăng nhập. Đơn cũ và nhật ký vẫn được giữ.`)) return;
    try {
      await authApi.archiveUser(item.id);
      await load();
      toast.success("Đã xóa tài khoản. Có thể khôi phục trong mục Đã xóa.");
    } catch (error) {
      toast.error(errorMessage(error, "Không thể xóa tài khoản."));
    }
  };

  const restoreUser = async (item: UserRecord) => {
    try {
      await authApi.restoreUser(item.id);
      await load();
      toast.success("Đã khôi phục tài khoản.");
    } catch (error) {
      toast.error(errorMessage(error, "Không thể khôi phục tài khoản."));
    }
  };

  if (!user) return null;
  const visibleOrganizations = showArchived ? archivedOrganizations : organizations;
  const visibleUsers = showArchived ? archivedUsers : users;

  return <main className="min-h-screen bg-slate-50 p-4 sm:p-8">
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm text-blue-600">QUẢN TRỊ HỆ THỐNG</p><h1 className="text-2xl font-semibold">Quản lý CLB và tài khoản</h1></div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowArchived((value) => !value)}>{showArchived ? "Xem đang dùng" : "Xem đã xóa"}</Button>
          <Button variant="outline" onClick={logout}>Đăng xuất</Button>
        </div>
      </div>

      {!showArchived && <>
        <Card><CardHeader><CardTitle>Thêm CLB</CardTitle><CardDescription>Tạo hồ sơ CLB trước khi cấp tài khoản đại diện.</CardDescription></CardHeader><CardContent>
          <form className="grid gap-3 sm:grid-cols-[1fr_180px_auto]" onSubmit={createOrganization}>
            <div className="grid gap-2"><Label>Tên CLB</Label><Input required value={organizationForm.name} onChange={(event) => setOrganizationForm({ ...organizationForm, name: event.target.value })} /></div>
            <div className="grid gap-2"><Label>Tên viết tắt</Label><Input value={organizationForm.abbreviation} onChange={(event) => setOrganizationForm({ ...organizationForm, abbreviation: event.target.value })} /></div>
            <div className="flex items-end"><Button>Thêm CLB</Button></div>
          </form>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Tạo tài khoản đại diện</CardTitle><CardDescription>Mật khẩu tạm thời sẽ được hệ thống tạo và yêu cầu đổi ở lần đăng nhập đầu.</CardDescription></CardHeader><CardContent>
          <form className="grid gap-3 sm:grid-cols-5" onSubmit={createUser}>
            <div className="grid gap-2"><Label>CLB</Label><Select value={form.organization} onValueChange={(value) => setForm({ ...form, organization: value })}><SelectTrigger><SelectValue placeholder="Chọn CLB" /></SelectTrigger><SelectContent>{organizations.filter((item) => item.active !== false).map((item) => <SelectItem key={String(item.id)} value={String(item.id)}>{item.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-2"><Label>Tên đăng nhập</Label><Input required value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></div>
            <div className="grid gap-2"><Label>Họ tên</Label><Input required value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></div>
            <div className="grid gap-2"><Label>Email</Label><Input type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div>
            <div className="flex items-end"><Button>Tạo tài khoản</Button></div>
          </form>
        </CardContent></Card>
      </>}

      <Card><CardHeader><CardTitle>{showArchived ? "CLB đã xóa" : "Danh sách CLB"}</CardTitle><CardDescription>{showArchived ? "Đơn cũ vẫn được lưu. Khôi phục CLB trước khi khôi phục tài khoản đại diện." : "Xóa sẽ ẩn CLB và các tài khoản đại diện, đồng thời giữ lịch sử."}</CardDescription></CardHeader><CardContent>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">CLB</th><th className="p-3">Trạng thái</th><th className="p-3 text-right">Thao tác</th></tr></thead><tbody>
          {visibleOrganizations.map((item) => <tr className="border-b" key={String(item.id)}><td className="p-3"><b>{item.name}</b>{item.abbreviation && <div className="text-slate-500">{item.abbreviation}</div>}</td><td className="p-3"><Badge variant={showArchived || item.active === false ? "outline" : "default"}>{showArchived ? "Đã xóa" : item.active === false ? "Tạm ngưng" : "Đang hoạt động"}</Badge></td><td className="p-3 text-right">{showArchived ? <Button size="sm" variant="outline" onClick={() => void restoreOrganization(item)}>Khôi phục</Button> : <Button size="sm" variant="destructive" onClick={() => void archiveOrganization(item)}>Xóa</Button>}</td></tr>)}
        </tbody></table>{visibleOrganizations.length === 0 && <p className="py-8 text-center text-slate-500">Chưa có CLB trong danh sách này.</p>}</div>
      </CardContent></Card>

      <Card><CardHeader><CardTitle>{showArchived ? "Tài khoản đã xóa" : "Danh sách tài khoản"}</CardTitle></CardHeader><CardContent>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">Người dùng</th><th className="p-3">Vai trò</th><th className="p-3">Trạng thái</th><th className="p-3 text-right">Thao tác</th></tr></thead><tbody>
          {visibleUsers.map((item) => <tr className="border-b" key={item.id}><td className="p-3"><b>{item.fullName}</b><div className="text-slate-500">{item.username} · {item.email}</div></td><td className="p-3">{item.role}</td><td className="p-3"><Badge variant={item.isActive ? "default" : "outline"}>{showArchived ? "Đã xóa" : item.isActive ? "Đang hoạt động" : "Đã khóa"}</Badge></td><td className="p-3 text-right"><div className="flex flex-wrap justify-end gap-2">
            {showArchived ? <Button size="sm" variant="outline" onClick={() => void restoreUser(item)}>Khôi phục</Button> : <>
              <Button size="sm" variant="outline" onClick={() => void toggleUser(item)}>{item.isActive ? "Khóa" : "Mở khóa"}</Button>
              <Button size="sm" variant="outline" onClick={() => void resetPassword(item.id)}>Đặt lại mật khẩu</Button>
              {item.role === "CLB_REP" && <Button size="sm" variant="destructive" onClick={() => void archiveUser(item)}>Xóa</Button>}
            </>}
          </div></td></tr>)}
        </tbody></table>{visibleUsers.length === 0 && <p className="py-8 text-center text-slate-500">Chưa có tài khoản trong danh sách này.</p>}</div>
      </CardContent></Card>
    </div>
  </main>;
}
