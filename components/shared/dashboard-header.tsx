"use client";

import { Bell } from "lucide-react";
import { cn } from "cn";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { usePrototypeStore } from "@/components/shared/prototype-store";
import { isClubRole, useAuth } from "@/components/auth/auth-context";

type NavItem = {
  id: string;
  label: string;
  active?: boolean;
  onClick?: () => void;
};

export function AuthControls() {
  const { user, logout } = useAuth();
  if (!user) {
    return (
      <Button variant="outline" onClick={() => window.location.assign("/login")}>
        Đăng nhập
      </Button>
    );
  }
  const club = isClubRole(user.role);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-auto justify-start gap-3 bg-slate-50 px-3 py-2">
          <span className="grid size-9 place-items-center rounded-full bg-white text-sm font-semibold text-blue-700 ring-1 ring-slate-200">
            {(user.fullName || user.username).slice(0, 2).toUpperCase()}
          </span>
          <span className="min-w-0 text-left">
            <span className="block max-w-40 truncate text-sm font-medium text-slate-950">
              {user.fullName || user.username}
            </span>
            <span className="block max-w-40 truncate text-xs text-slate-500">
              {user.organizationName || user.role}
            </span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => window.location.assign(club ? "/clb/profile" : "/admin/users")}>
          {club ? "Hồ sơ CLB" : "Quản lý tài khoản CLB"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => window.dispatchEvent(new CustomEvent("room-booking:change-password"))}>
          Đổi mật khẩu
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={logout}>
          Đăng xuất
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DashboardHeader({
  badge,
  eyebrow,
  title,
  subtitle,
  userName,
  userRole,
  userInitials,
  notificationAudience,
  primaryAction,
  navItems,
}: {
  badge: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  userName: string;
  userRole: string;
  userInitials: string;
  notificationAudience: "club" | "admin";
  primaryAction?: ReactNode;
  navItems?: NavItem[];
}) {
  const { user, logout } = useAuth();
  const store = usePrototypeStore();
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = store.bookings.find((item) => item.id === detailId);
  const notifications = store.notifications.filter(
    (item) => item.audience === notificationAudience,
  );
  const unread = notifications.filter((item) => !item.read).length;
  const timeAgo = (value: string) => {
    const minutes = Math.max(
      1,
      Math.floor((Date.now() - new Date(value).getTime()) / 60_000),
    );
    return minutes < 60
      ? `${minutes} phút trước`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)} giờ trước`
        : `${Math.floor(minutes / 1440)} ngày trước`;
  };
  return (
    <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-blue-600 text-sm font-bold text-white">
              {badge}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-500">{eyebrow}</p>
              <h1 className="break-words text-xl font-semibold tracking-normal sm:text-2xl">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-1 max-w-3xl text-sm text-slate-600">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-auto justify-start gap-3 bg-slate-50 px-3 py-2">
                    <span className="grid size-9 place-items-center rounded-full bg-white text-sm font-semibold text-blue-700 ring-1 ring-slate-200">
                      {(user.fullName || user.username || userInitials).slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 text-left">
                      <span className="block max-w-40 truncate text-sm font-medium text-slate-950">
                        {user.fullName || user.username}
                      </span>
                      <span className="block max-w-40 truncate text-xs text-slate-500">
                        {user.organizationName || user.role}
                      </span>
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => window.location.assign(isClubRole(user.role) ? "/clb/profile" : "/admin/users")}>
                    {isClubRole(user.role) ? "Hồ sơ CLB" : "Quản lý tài khoản CLB"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => window.dispatchEvent(new CustomEvent("room-booking:change-password"))}>
                    Đổi mật khẩu
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={logout}>
                    Đăng xuất
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button variant="outline" onClick={() => window.location.assign("/login")}>
                Đăng nhập
              </Button>
            )}

            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-lg"
                    className="relative bg-white"
                  >
                    <Bell />
                    {unread > 0 && (
                      <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                        {unread}
                      </span>
                    )}
                    <span className="sr-only">Thông báo</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="w-[min(380px,calc(100vw-2rem))] p-0"
                >
                  <div className="flex items-center justify-between border-b p-3">
                    <b>Thông báo</b>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        store.markAllNotificationsRead(notificationAudience)
                      }
                    >
                      Đánh dấu tất cả đã đọc
                    </Button>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="p-6 text-center text-sm text-slate-500">
                        Chưa có thông báo
                      </p>
                    ) : (
                      notifications.map((item) => {
                        const booking = store.bookings.find(
                          (value) => value.id === item.bookingId,
                        );
                        return (
                          <button
                            key={item.id}
                            className={cn(
                              "w-full border-b p-3 text-left hover:bg-slate-50",
                              !item.read && "bg-blue-50/70",
                            )}
                            onClick={() => {
                              store.markNotificationRead(item.id);
                              if (booking) setDetailId(booking.id);
                            }}
                          >
                            <span className="flex items-start gap-2">
                              <span
                                className={cn(
                                  "mt-1 size-2 shrink-0 rounded-full",
                                  item.read ? "bg-slate-300" : "bg-blue-600",
                                )}
                              />
                              <span>
                                <b className="block text-sm">{item.title}</b>
                                <span className="block text-sm text-slate-600">
                                  {item.message}
                                </span>
                                <span className="mt-1 block text-xs text-slate-400">
                                  {timeAgo(item.createdAt)}
                                </span>
                                {booking && (
                                  <span className="mt-2 block rounded-md border bg-white p-2 text-xs text-slate-600">
                                    <b>{booking.id}</b> · {booking.activityName}
                                    <br />
                                    {booking.contactPerson} ·{" "}
                                    {booking.contactPhone}
                                  </span>
                                )}
                              </span>
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              {primaryAction}
            </div>
          </div>
        </div>

        {navItems && navItems.length > 0 && (
          <nav className="flex gap-2 overflow-x-auto text-sm">
            {navItems.map((item) => (
              <Button
                key={item.id}
                type="button"
                variant={item.active ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "text-slate-600",
                  item.active && "bg-slate-100 text-slate-950",
                )}
                onClick={item.onClick}
              >
                {item.label}
              </Button>
            ))}
          </nav>
        )}
      </div>
      <Dialog
        open={!!detail}
        onOpenChange={(open) => !open && setDetailId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detail?.activityName}</DialogTitle>
            <DialogDescription>
              {detail?.id} · {detail?.clubName}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="grid gap-3 rounded-lg border bg-slate-50 p-4 text-sm sm:grid-cols-2">
              <p>
                <b>Thời gian</b>
                <br />
                {new Date(detail.startAt).toLocaleString("vi-VN")} -{" "}
                {new Date(detail.endAt).toLocaleTimeString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              <p>
                <b>Trạng thái</b>
                <br />
                {detail.status}
              </p>
              <p>
                <b>Người đại diện</b>
                <br />
                {detail.contactPerson} · {detail.contactRole || "Đại diện CLB"}
              </p>
              <p>
                <b>Liên hệ</b>
                <br />
                {detail.contactPhone}
                <br />
                {detail.contactEmail}
              </p>
              {detail.note && (
                <p className="sm:col-span-2">
                  <b>Ghi chú xử lý</b>
                  <br />
                  {detail.note}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setDetailId(null)}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
