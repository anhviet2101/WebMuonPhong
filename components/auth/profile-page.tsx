import { useEffect, useState } from "react";
import { toast } from "sonner";
import { authApi, type OrganizationProfile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "./auth-context";

export function ProfilePage() {
  const { user, refreshProfile, logout } = useAuth();
  const [organization, setOrganization] = useState<OrganizationProfile>({ name: "", address: "", contact_email: "" });
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  useEffect(() => { if (user?.organization) setOrganization({ ...user.organization, name: user.organization.name ?? "", address: user.organization.address ?? "", contact_email: user.organization.contact_email ?? "" }); }, [user]);
  const saveOrganization = async (event: React.FormEvent) => { event.preventDefault(); try { await authApi.updateOrganization({ representative_name: organization.representative_name, hotline: organization.hotline, contact_email: organization.contact_email, fanpage_url: organization.fanpage_url }); await refreshProfile(); toast.success("Đã lưu thông tin CLB."); } catch { toast.error("Không thể lưu thông tin CLB."); } };
  const changePassword = async (event: React.FormEvent) => { event.preventDefault(); if (passwords.next.length < 8 || passwords.next !== passwords.confirm) return toast.error("Mật khẩu mới tối thiểu 8 ký tự và phải trùng nhau."); try { await authApi.changePassword(passwords.current, passwords.next); setPasswords({ current: "", next: "", confirm: "" }); toast.success("Đã đổi mật khẩu."); } catch { toast.error("Mật khẩu hiện tại không đúng."); } };
  if (!user) return null;
  const field = (key: "representative_name" | "hotline" | "contact_email" | "fanpage_url", label: string) => <div className="grid gap-2"><Label>{label}</Label><Input value={organization[key] ?? ""} onChange={(e) => setOrganization({ ...organization, [key]: e.target.value })} /></div>;
  return <main className="min-h-screen bg-slate-50 p-4 sm:p-8"><div className="mx-auto max-w-5xl space-y-6">
    <div className="flex items-center justify-between"><div><p className="text-sm text-blue-600">TÀI KHOẢN CLB</p><h1 className="text-2xl font-semibold">Hồ sơ & liên hệ</h1><p className="text-sm text-slate-600">{user.fullName} · {user.email}</p></div><Button variant="outline" onClick={logout}>Đăng xuất</Button></div>
    <Card><CardHeader><CardTitle>Thông tin liên hệ {organization.name || "CLB"}</CardTitle><CardDescription>Thông tin này sẽ được tự động điền ở Bước 3 khi tạo đơn.</CardDescription></CardHeader><CardContent><form className="grid gap-4 sm:grid-cols-2" onSubmit={saveOrganization}>{field("representative_name", "Người phụ trách thường trực")}{field("hotline", "Số điện thoại")}{field("contact_email", "Email liên hệ")}{field("fanpage_url", "Fanpage") }<div className="sm:col-span-2"><Button>Lưu thông tin</Button></div></form></CardContent></Card>
    <Card><CardHeader><CardTitle>Đổi mật khẩu</CardTitle></CardHeader><CardContent><form className="grid gap-4 sm:max-w-xl" onSubmit={changePassword}>{(["current", "next", "confirm"] as const).map((key) => <div className="grid gap-2" key={key}><Label>{key === "current" ? "Mật khẩu hiện tại" : key === "next" ? "Mật khẩu mới" : "Nhập lại mật khẩu mới"}</Label><Input type="password" value={passwords[key]} onChange={(e) => setPasswords({ ...passwords, [key]: e.target.value })} required /></div>)}<Button>Đổi mật khẩu</Button></form></CardContent></Card>
  </div></main>;
}
