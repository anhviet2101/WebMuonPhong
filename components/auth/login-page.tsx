import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isClubRole, useAuth } from "./auth-context";
import axios from "axios";

export function LoginPage() {
  const { user, login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (user) window.location.assign(isClubRole(user.role) ? "/clb" : "/admin-doan"); }, [user]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true);
    try { const next = await login(username, password); toast.success("Đăng nhập thành công"); window.location.assign(isClubRole(next.role) ? "/clb" : "/admin-doan"); }
    catch (error) {
      if (axios.isAxiosError(error)) {
        const payload = error.response?.data;
        const detail = typeof payload === "string"
          ? payload.trim()
          : Array.isArray((payload as { detail?: unknown[] } | undefined)?.detail)
            ? (payload as { detail: string[] }).detail.filter((item) => typeof item === "string" && item.trim()).join(", ")
            : typeof (payload as { detail?: unknown } | undefined)?.detail === "string"
              ? (payload as { detail: string }).detail.trim()
              : Array.isArray((payload as { non_field_errors?: unknown[] } | undefined)?.non_field_errors)
                ? (payload as { non_field_errors: string[] }).non_field_errors.filter((item) => typeof item === "string" && item.trim()).join(", ")
                : typeof (payload as { message?: unknown } | undefined)?.message === "string"
                  ? (payload as { message: string }).message.trim()
                  : "";
        toast.error(
          detail ||
            (error.response
              ? `Không thể đăng nhập (HTTP ${error.response.status}).`
              : "Không kết nối được backend. Hãy kiểm tra cấu hình API_URL/VITE_API_URL và trạng thái server."),
        );
      } else {
        toast.error("Không thể đăng nhập. Hãy kiểm tra backend đang chạy.");
      }
    }
    finally { setBusy(false); }
  };
  return <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
    <Card className="w-full max-w-md">
      <CardHeader><p className="text-sm font-medium text-blue-600">HỆ THỐNG MƯỢN PHÒNG CLB</p><CardTitle className="text-2xl">Đăng nhập</CardTitle><CardDescription>Sử dụng tài khoản được cấp để quản lý đăng ký.</CardDescription></CardHeader>
      <CardContent><form className="grid gap-4" onSubmit={submit}>
        <div className="grid gap-2"><Label htmlFor="username">Tên đăng nhập</Label><Input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required /></div>
        <div className="grid gap-2"><Label htmlFor="password">Mật khẩu</Label><Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        <Button disabled={busy}>{busy ? "Đang đăng nhập..." : "Đăng nhập"}</Button>
      </form></CardContent>
    </Card>
  </main>;
}
