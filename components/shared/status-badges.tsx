"use client";

import { cn } from "cn";

import { Badge } from "@/components/ui/badge";

export type BookingStatusKey =
  | "draft"
  | "pending_hold"
  | "needs_revision"
  | "approved"
  | "room_changed"
  | "completed"
  | "rejected"
  | "cancelled"
  | "expired";

export type PhysicalStatusKey =
  | "chua_nhan"
  | "da_nhan_ban_cung";

const bookingStatusLabel: Record<BookingStatusKey, string> = {
  draft: "Draft",
  pending_hold: "Pending Hold",
  needs_revision: "Needs Revision",
  approved: "Approved",
  room_changed: "Room Changed",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
  expired: "Expired",
};

const bookingStatusClass: Record<BookingStatusKey, string> = {
  draft: "border-slate-200 bg-slate-100 text-slate-700",
  pending_hold: "border-amber-200 bg-amber-100 text-amber-800",
  needs_revision: "border-orange-200 bg-orange-100 text-orange-800",
  approved: "border-emerald-200 bg-emerald-100 text-emerald-800",
  room_changed: "border-blue-200 bg-blue-100 text-blue-800",
  completed: "border-slate-200 bg-slate-100 text-slate-700",
  rejected: "border-red-200 bg-red-100 text-red-800",
  cancelled: "border-slate-200 bg-slate-100 text-slate-700",
  expired: "border-red-200 bg-red-100 text-red-800",
};

const physicalStatusLabel: Record<PhysicalStatusKey, string> = {
  chua_nhan: "Chưa nhận bản cứng",
  da_nhan_ban_cung: "Đã nhận bản cứng",
};

const physicalStatusClass: Record<PhysicalStatusKey, string> = {
  chua_nhan: "border-amber-200 bg-amber-50 text-amber-800",
  da_nhan_ban_cung: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

export function BookingStatusBadge({
  status,
  className,
}: {
  status: BookingStatusKey;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("rounded-md", bookingStatusClass[status], className)}
    >
      {bookingStatusLabel[status]}
    </Badge>
  );
}

export function PhysicalStatusBadge({
  status,
  className,
}: {
  status: PhysicalStatusKey;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("rounded-md", physicalStatusClass[status], className)}
    >
      {physicalStatusLabel[status]}
    </Badge>
  );
}
