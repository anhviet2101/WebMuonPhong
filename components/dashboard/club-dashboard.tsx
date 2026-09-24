"use client";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Clock3,
  Download,
  FileText,
  Mail,
  MoreHorizontal,
  Phone,
  Plus,
  Printer,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardHeader } from "@/components/shared/dashboard-header";
import { DateTime24Field, bookingTimeError } from "@/components/shared/date-time-24-field";
import {
  BookingStatusBadge,
  PhysicalStatusBadge,
} from "@/components/shared/status-badges";
import {
  toLocalInput,
  usePrototypeStore,
  type Booking,
} from "@/components/shared/prototype-store";
import {
  exportMauADocx,
  mauAFieldsFromBookings,
  mauAFixed,
  printMauA,
  type MauAFields,
} from "@/components/shared/document-export";
import { useAuth } from "@/components/auth/auth-context";
import { api, endpoints } from "@/lib/api";

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    hourCycle: "h23",
  }).format(new Date(iso));
const defaultBookingTime = (hour: number) => {
  const date = new Date();
  date.setDate(date.getDate() + 3);
  date.setHours(hour, 0, 0, 0);
  return toLocalInput(date.toISOString());
};
function HoldCountdown({ expiresAt }: { expiresAt?: string }) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    const update = () => setRemaining(Math.max(0, new Date(expiresAt ?? 0).getTime() - Date.now()));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  if (!expiresAt || remaining <= 0) return <span className="text-xs text-red-600">Hết hạn giữ chỗ</span>;
  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return <span className="text-xs text-amber-700">Còn {hours}g {minutes}p {seconds}s giữ chỗ</span>;
}
function BookingFormDialog({
  open,
  close,
  editing,
  onCreated,
}: {
  open: boolean;
  close: () => void;
  editing: Booking | null;
  onCreated: (booking: Booking) => void;
}) {
  const store = usePrototypeStore();
  const { user } = useAuth();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [start, setStart] = useState(
    editing ? toLocalInput(editing.startAt) : defaultBookingTime(18),
  );
  const [end, setEnd] = useState(
    editing ? toLocalInput(editing.endAt) : defaultBookingTime(20),
  );
  const editingRoom = store.rooms.find((r) => r.id === editing?.roomId);
  const editingBuilding = store.buildings.find((b) => b.id === editingRoom?.buildingId);
  const [campus, setCampus] = useState(editingBuilding?.campusId ?? store.campuses[0]?.id ?? "");
  const campusBuildings = store.buildings.filter((b) => b.campusId === campus);
  const [building, setBuilding] = useState(editingRoom?.buildingId ?? campusBuildings[0]?.id ?? "");
  const buildingRooms = store.rooms.filter((r) => r.buildingId === building);
  const [remoteAvailableIds, setRemoteAvailableIds] = useState<string[] | null>(
    null,
  );
  const [loadingRooms, setLoadingRooms] = useState(false);
  const available = remoteAvailableIds === null
    ? []
    : buildingRooms.filter((r) => remoteAvailableIds.includes(r.id));
  const [room, setRoom] = useState(editing?.roomId ?? "");
  const [backup, setBackup] = useState(editing?.backupRoomId ?? "none");
  const [name, setName] = useState(editing?.activityName ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [count, setCount] = useState(String(editing?.participants ?? 50));
  const [contactPerson, setContactPerson] = useState(
    editing?.contactPerson ?? (user?.organization?.representative_name || user?.fullName || ""),
  );
  const [contactPhone, setContactPhone] = useState(
    editing?.contactPhone ?? (user?.organization?.hotline || user?.phone || ""),
  );
  const [contactEmail, setContactEmail] = useState(
    editing?.contactEmail ?? (user?.organization?.contact_email || user?.email || ""),
  );
  useEffect(() => {
    if (editing || !user) return;
    setContactPerson((current) => current || user.organization?.representative_name || user.fullName);
    setContactEmail((current) => current || user.organization?.contact_email || user.email);
    setContactPhone((current) => current || user.organization?.hotline || user.phone || "");
  }, [editing, user]);
  useEffect(() => {
    if (editing) {
      if (editingBuilding && !store.campuses.some((item) => item.id === campus)) {
        setCampus(editingBuilding.campusId);
        setBuilding(editingRoom?.buildingId ?? "");
      }
      return;
    }
    if (!editing && store.campuses.length && !store.campuses.some((item) => item.id === campus)) {
      const firstCampus = store.campuses[0];
      setCampus(firstCampus.id);
      const firstBuilding = store.buildings.find((item) => item.campusId === firstCampus.id);
      setBuilding(firstBuilding?.id ?? "");
    }
  }, [campus, editing, editingRoom, editingBuilding, store.campuses, store.buildings]);
  const timeError = bookingTimeError(start, end);
  const validTime = timeError === null;
  const validCount = Number.isInteger(Number(count)) && Number(count) > 0;
  const changeStart = (value: string) => {
    const previousStart = new Date(start);
    const nextStart = new Date(value);
    const currentEnd = new Date(end);
    setStart(value);
    if (!Number.isFinite(nextStart.getTime())) return;
    if (start.slice(0, 10) !== value.slice(0, 10) || !Number.isFinite(currentEnd.getTime()) || currentEnd <= nextStart) {
      const previousDuration = currentEnd.getTime() - previousStart.getTime();
      const duration = previousDuration > 0 && previousDuration < 24 * 60 * 60_000
        ? previousDuration
        : 2 * 60 * 60_000;
      setEnd(toLocalInput(new Date(nextStart.getTime() + duration).toISOString()));
    }
  };
  const loadAvailableRoomIds = async () => {
    const { data } = await api.get(endpoints.availableRooms, {
      params: {
        start_time: new Date(start).toISOString(),
        end_time: new Date(end).toISOString(),
        building_id: building,
        exclude_booking: editing?.id,
        participant_count: validCount ? Number(count) : undefined,
      },
    });
    return (data.results ?? data).map((item: { id: number | string }) =>
      String(item.id),
    );
  };
  useEffect(() => {
    if (!validTime || !validCount || !building) {
      setRemoteAvailableIds(null);
      setLoadingRooms(false);
      return;
    }
    let cancelled = false;
    setLoadingRooms(true);
    setRemoteAvailableIds(null);
    const timer = window.setTimeout(() => loadAvailableRoomIds()
      .then((ids) => {
        if (cancelled) return;
        setRemoteAvailableIds(ids);
        if (room && !ids.includes(room)) setRoom("");
        if (backup !== "none" && !ids.includes(backup)) setBackup("none");
      })
      .catch(() => {
        if (cancelled) return;
        setRemoteAvailableIds([]);
        setRoom("");
        setBackup("none");
        toast.error("Không thể kiểm tra phòng khả dụng theo thời gian đã chọn");
      })
      .finally(() => {
        if (!cancelled) setLoadingRooms(false);
      }), 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [building, count, editing?.id, end, start, validCount, validTime]);
  const resetBuilding = (value: string) => {
    setCampus(value);
    const first = store.buildings.find((b) => b.campusId === value);
    setBuilding(first?.id ?? "");
    setRoom("");
    setBackup("none");
  };
  const submit = async () => {
    const nextErrors: Record<string, string> = {};
    if (timeError) nextErrors.time = timeError;
    if (!campus) nextErrors.campus = "Vui lòng chọn cơ sở.";
    if (!building) nextErrors.building = "Vui lòng chọn tòa nhà.";
    if (!room) nextErrors.room = "Vui lòng chọn phòng trống.";
    if (!name.trim()) nextErrors.name = "Vui lòng nhập tên hoạt động.";
    if (!description.trim()) nextErrors.description = "Vui lòng nhập mục đích hoặc mô tả.";
    if (!Number.isInteger(Number(count)) || Number(count) < 1) nextErrors.count = "Số người phải là số nguyên lớn hơn 0.";
    const chosenRoom = store.rooms.find((item) => item.id === room);
    if (chosenRoom?.capacity != null && Number(count) > chosenRoom.capacity) nextErrors.count = `Phòng chỉ chứa tối đa ${chosenRoom.capacity} người.`;
    if (!contactPerson.trim()) nextErrors.contactPerson = "Vui lòng nhập người đại diện.";
    if (!contactPhone.trim()) nextErrors.contactPhone = "Vui lòng nhập số điện thoại.";
    if (!contactEmail.trim()) nextErrors.contactEmail = "Vui lòng nhập email.";
    else if (!/^\S+@\S+\.\S+$/.test(contactEmail)) nextErrors.contactEmail = "Email chưa hợp lệ.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSubmitting(true);
    try {
      const freshIds = await loadAvailableRoomIds();
      setRemoteAvailableIds(freshIds);
      if (
        !freshIds.includes(room) ||
        (backup !== "none" && !freshIds.includes(backup))
      ) {
        setRoom(freshIds.includes(room) ? room : "");
        setBackup(
          backup !== "none" && freshIds.includes(backup) ? backup : "none",
        );
        setErrors({ room: "Phòng đã có đơn giữ hoặc bị khóa trong khung giờ này." });
        setSubmitting(false);
        return toast.error(
          "Phòng đã có đơn khác giữ trong khung giờ này. Vui lòng chọn phòng khác.",
        );
      }
    } catch {
      setErrors({ room: "Không thể kiểm tra phòng trống. Vui lòng thử lại." });
      setSubmitting(false);
      return toast.error(
        "Không thể kiểm tra phòng khả dụng. Vui lòng thử lại trước khi gửi đơn.",
      );
    }
    const data = {
      clubCode: user?.organization?.abbreviation ?? "",
      clubName: user?.organization?.name ?? user?.organizationName ?? "",
      activityName: name,
      description,
      roomId: room,
      backupRoomId: backup === "none" ? undefined : backup,
      startAt: new Date(start).toISOString(),
      endAt: new Date(end).toISOString(),
      participants: Number(count),
      contactPerson: contactPerson.trim(),
      contactPhone: contactPhone.trim(),
      contactEmail: contactEmail.trim(),
      equipment: [],
    };
    try {
      if (editing) {
        if (editing.status === "needs_revision" || editing.status === "draft") {
          await store.updateBooking(editing.id, { ...data, status: "pending_hold" });
        } else {
          await store.updateBooking(editing.id, data);
        }
        toast.success("Đã cập nhật đơn");
      } else {
        const b = await store.addBooking(data);
        toast.success(`${b.id} đã được giữ chỗ trong 48 giờ`);
        onCreated(b);
      }
      close();
    } catch {
      // The store reports the API error and keeps the form open for correction.
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Sửa đơn" : "Đăng ký mượn phòng"}
          </DialogTitle>
          <DialogDescription>
            Điền thông tin trên một màn hình. Hệ thống tính buffer 15 phút trước và sau.
          </DialogDescription>
        </DialogHeader>
        <h3 className="font-semibold">Thời gian</h3>
        {(
          <div className="grid gap-4 sm:grid-cols-2">
            <div><DateTime24Field label="Bắt đầu" value={start} onChange={changeStart} />
              {!start && <p className="text-sm text-red-600">Vui lòng chọn ngày và giờ bắt đầu.</p>}</div>
            <div><DateTime24Field label="Kết thúc" value={end} onChange={setEnd} />
              {!end && <p className="text-sm text-red-600">Vui lòng chọn ngày và giờ kết thúc.</p>}</div>
            {start && end && (errors.time || timeError) && (
              <p className="text-sm text-red-600 sm:col-span-2">
                {errors.time || timeError}
              </p>
            )}
          </div>
        )}
        <div className="grid gap-2">
          <Label>Số người dự kiến</Label>
          <Input type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} />
          {errors.count && <p className="text-sm text-red-600">{errors.count}</p>}
        </div>
        <h3 className="font-semibold">Địa điểm</h3>
        {(
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Cơ sở</Label>
              <Select value={campus} onValueChange={resetBuilding}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {store.campuses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code} - {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.campus && <p className="text-sm text-red-600">{errors.campus}</p>}
            </div>
            <div className="grid gap-2">
              <Label>Tòa nhà</Label>
              <Select
                value={building}
                onValueChange={(v) => {
                  setBuilding(v);
                  setRoom("");
                  setBackup("none");
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {campusBuildings.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.building && <p className="text-sm text-red-600">{errors.building}</p>}
            </div>
            <div className="grid gap-2">
              <Label>Phòng chính</Label>
              <Select value={room} onValueChange={(value) => { setRoom(value); if (backup === value) setBackup("none"); }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Chọn phòng trống" />
                </SelectTrigger>
                <SelectContent>
                  {loadingRooms && (
                    <SelectItem value="loading" disabled>
                      Đang kiểm tra phòng trống...
                    </SelectItem>
                  )}
                  {!loadingRooms && remoteAvailableIds !== null && available.length === 0 && (
                    <SelectItem value="empty" disabled>
                      Không có phòng trống trong khung giờ này
                    </SelectItem>
                  )}
                  {available.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name} · {r.capacity === null ? "Chưa cập nhật sức chứa" : `${r.capacity} người`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.room && <p className="text-sm text-red-600">{errors.room}</p>}
            </div>
            <div className="grid gap-2">
              <Label>Phòng dự phòng</Label>
              <Select value={backup} onValueChange={setBackup}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Không chọn</SelectItem>
                  {loadingRooms && (
                    <SelectItem value="loading" disabled>
                      Đang kiểm tra phòng trống...
                    </SelectItem>
                  )}
                  {available
                    .filter((r) => r.id !== room)
                    .map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {!loadingRooms && remoteAvailableIds !== null && validTime && validCount && building && available.length === 0 && (
              <p className="text-sm text-amber-700 sm:col-span-2">
                Không có phòng khả dụng trong khung giờ đã chọn. Vui lòng đổi
                thời gian hoặc tòa nhà.
              </p>
            )}
          </div>
        )}
        <h3 className="font-semibold">Hoạt động và người liên hệ</h3>
        {(
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Tên hoạt động</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
              {errors.name && <p className="text-sm text-red-600">{errors.name}</p>}
            </div>
            <div className="grid gap-2">
              <Label>Mô tả</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              {errors.description && <p className="text-sm text-red-600">{errors.description}</p>}
            </div>
            <div className="grid gap-4 rounded-lg border bg-slate-50 p-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Họ và tên người đại diện *</Label>
                <Input
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                />
                {errors.contactPerson && <p className="text-sm text-red-600">{errors.contactPerson}</p>}
              </div>
              <div className="grid gap-2">
                <Label>Số điện thoại / Zalo *</Label>
                <Input
                  inputMode="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                />
                {errors.contactPhone && <p className="text-sm text-red-600">{errors.contactPhone}</p>}
              </div>
              <div className="grid gap-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                />
                {errors.contactEmail && <p className="text-sm text-red-600">{errors.contactEmail}</p>}
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Đóng
          </Button>
          <Button onClick={submit} disabled={submitting}>{submitting ? "Đang gửi..." : "Gửi đơn"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function BookingDetailDialog({
  booking,
  close,
}: {
  booking: Booking | null;
  close: () => void;
}) {
  const store = usePrototypeStore();
  const room = booking
    ? store.rooms.find((item) => item.id === booking.roomId)
    : undefined;
  const building = room
    ? store.buildings.find((item) => item.id === room.buildingId)
    : undefined;
  const campus = building
    ? store.campuses.find((item) => item.id === building.campusId)
    : undefined;

  return (
    <Dialog open={!!booking} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{booking?.activityName ?? "Thông tin đơn mượn"}</DialogTitle>
          <DialogDescription>
            {booking ? `Mã đơn ${booking.id}` : "Chi tiết đơn đăng ký mượn phòng"}
          </DialogDescription>
        </DialogHeader>
        {booking && (
          <div className="grid gap-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <BookingStatusBadge status={booking.status} />
              <PhysicalStatusBadge status={booking.physicalStatus} />
            </div>
            <div className="grid gap-3 rounded-lg border bg-slate-50 p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase text-slate-500">Phòng</p>
                <p className="font-medium">
                  {room?.name ?? booking.roomName ?? booking.roomId}
                  {building ? ` · ${building.name}` : ""}
                </p>
                {campus && <p className="text-xs text-slate-500">{campus.name}</p>}
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-slate-500">Thời gian</p>
                <p className="font-medium">{fmt(booking.startAt)}</p>
                <p className="text-xs text-slate-500">Kết thúc: {fmt(booking.endAt)}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-slate-500">Số lượng</p>
                <p className="font-medium">{booking.participants} người</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-slate-500">Người phụ trách</p>
                <p className="font-medium">{booking.contactPerson}</p>
                <p className="text-xs text-slate-500">
                  {booking.contactPhone} · {booking.contactEmail}
                </p>
              </div>
            </div>
            <div className="grid gap-2">
              <div>
                <p className="text-xs font-medium uppercase text-slate-500">Mô tả hoạt động</p>
                <p className="mt-1 whitespace-pre-wrap text-slate-700">
                  {booking.description || "Chưa có mô tả"}
                </p>
              </div>
              {booking.note && (
                <div>
                  <p className="text-xs font-medium uppercase text-slate-500">Ghi chú</p>
                  <p className="mt-1 whitespace-pre-wrap text-slate-700">{booking.note}</p>
                </div>
              )}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button onClick={close}>Đóng</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function MauAPreview({ initialBooking, close }: { initialBooking: Booking | null; close: () => void }) {
  const store = usePrototypeStore();
  const eligible = useMemo(() => store.bookings.filter((booking) =>
    ["pending_hold", "needs_revision", "approved", "room_changed"].includes(booking.status)), [store.bookings]);
  const [scope, setScope] = useState<"day" | "week">("day");
  const [date, setDate] = useState(localDate(new Date(initialBooking?.startAt ?? eligible[0]?.startAt ?? Date.now())));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [fields, setFields] = useState<MauAFields>(() => mauAFieldsFromBookings([]));
  const range = useMemo(() => {
    const from = new Date(`${date}T00:00:00`);
    if (scope === "week") from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
    const to = new Date(from);
    to.setDate(to.getDate() + (scope === "week" ? 7 : 1));
    return { from, to };
  }, [scope, date]);
  const available = useMemo(() => eligible
    .filter((booking) => new Date(booking.startAt) >= range.from && new Date(booking.startAt) < range.to)
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()),
  [eligible, range]);
  useEffect(() => {
    setSelectedIds(available.map((booking) => booking.id));
    setFields(mauAFieldsFromBookings(available));
  }, [available]);
  const selected = available.filter((booking) => selectedIds.includes(booking.id));
  const choose = (id: string, checked: boolean) => {
    const nextIds = checked ? [...selectedIds, id] : selectedIds.filter((item) => item !== id);
    setSelectedIds(nextIds);
    setFields(mauAFieldsFromBookings(available.filter((booking) => nextIds.includes(booking.id))));
  };
  const field = (key: "clubName" | "issueDate" | "intro" | "participants" | "signerTitle" | "signerName", value: string) =>
    setFields((current) => ({ ...current, [key]: value }));
  const slotField = (bookingId: string, key: "time" | "location", value: string) =>
    setFields((current) => ({ ...current, slots: current.slots.map((slot) => slot.bookingId === bookingId ? { ...slot, [key]: value } : slot) }));
  return (
    <Dialog open onOpenChange={(value) => !value && close()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Mẫu A · Đơn đề nghị của CLB</DialogTitle>
          <DialogDescription>Chọn lịch trong một ngày hoặc cả tuần. Chữ đỏ được chỉnh riêng cho lần xuất này; chữ đen giữ theo mẫu bạn cung cấp.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 rounded-lg border bg-slate-50 p-4 sm:grid-cols-2">
          <div className="grid gap-2"><Label>Phạm vi xuất</Label>
            <Select value={scope} onValueChange={(value) => setScope(value as "day" | "week")}>
              <SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="day">Một ngày</SelectItem><SelectItem value="week">Cả tuần (Thứ Hai – Chủ Nhật)</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="grid gap-2"><Label>Chọn ngày</Label><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div>
          <p className="text-sm text-slate-600 sm:col-span-2">Khoảng xuất: {range.from.toLocaleDateString("vi-VN")} – {new Date(range.to.getTime() - 1).toLocaleDateString("vi-VN")}</p>
          <div className="grid gap-2 sm:col-span-2">
            {available.length ? available.map((booking) => (
              <label key={booking.id} className="flex items-center gap-2 rounded-md border bg-white p-2 text-sm">
                <input type="checkbox" checked={selectedIds.includes(booking.id)} onChange={(event) => choose(booking.id, event.target.checked)} />
                {fmt(booking.startAt)} · {booking.roomName} · {booking.activityName}
              </label>
            )) : <p className="text-sm text-amber-700">Không có đơn giữ phòng hoặc đã duyệt trong khoảng này.</p>}
          </div>
        </div>
        <div className="document-preview space-y-3 rounded-lg border bg-white p-6 text-black">
          <div className="grid gap-4 text-center sm:grid-cols-2">
            <div><b>{mauAFixed.institution}</b><Input className="mt-2 font-serif text-red-700" aria-label="Tên CLB" value={fields.clubName} onChange={(event) => field("clubName", event.target.value)} /></div>
            <div><Label>Ngày lập đơn</Label><Input className="mt-2 font-serif text-red-700" value={fields.issueDate} onChange={(event) => field("issueDate", event.target.value)} /></div>
          </div>
          <h2 className="text-center text-xl font-bold">{mauAFixed.title}</h2>
          <p className="text-center font-bold">{mauAFixed.recipient}</p>
          <textarea className="min-h-24 w-full rounded-md border border-input p-3 font-serif text-red-700" aria-label="Đoạn giới thiệu" value={fields.intro} onChange={(event) => field("intro", event.target.value)} />
          <p>{mauAFixed.request}</p><p className="font-bold">Thời gian, địa điểm:</p>
          {fields.slots.map((slot, index) => (
            <div key={slot.bookingId} className="grid gap-2 rounded-md border p-3">
              <label className="grid gap-1 sm:grid-cols-[120px_1fr] sm:items-center"><span>Thời gian {fields.slots.length > 1 ? index + 1 : ""}</span><Input className="font-serif text-red-700" value={slot.time} onChange={(event) => slotField(slot.bookingId, "time", event.target.value)} /></label>
              <label className="grid gap-1 sm:grid-cols-[120px_1fr] sm:items-center"><span>Địa điểm {fields.slots.length > 1 ? index + 1 : ""}</span><Input className="font-serif text-red-700" value={slot.location} onChange={(event) => slotField(slot.bookingId, "location", event.target.value)} /></label>
            </div>
          ))}
          <label className="grid gap-1 sm:grid-cols-[210px_1fr] sm:items-center"><span>Số lượng người tham gia:</span><Input className="font-serif text-red-700" value={fields.participants} onChange={(event) => field("participants", event.target.value)} /></label>
          <p>{mauAFixed.commitment}</p><p>{mauAFixed.responsibility}</p><p className="whitespace-pre-line">{mauAFixed.closing}</p>
          <div className="grid gap-3 pt-4 text-center text-sm font-bold sm:grid-cols-3">
            <span>Ý KIẾN<br />PHÒNG HCQT VÀ TCCB</span><span>Ý KIẾN<br />HỘI SINH VIÊN TRƯỜNG</span>
            <div>TM. BAN CHỦ NHIỆM<Input className="mt-2 font-serif text-red-700" aria-label="Chức danh người ký" value={fields.signerTitle} onChange={(event) => field("signerTitle", event.target.value)} /><Input className="mt-4 font-serif text-red-700" aria-label="Tên người ký" value={fields.signerName} onChange={(event) => field("signerName", event.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>Đóng</Button>
          <Button variant="outline" disabled={!selected.length} onClick={() => printMauA(fields)}><Printer /> In đơn</Button>
          <Button disabled={!selected.length} onClick={async () => { await exportMauADocx(fields, `Mau-A-${scope}-${date}.docx`); toast.success("Đã tải Mẫu A"); }}><Download /> Tải file .docx</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ClubDashboard() {
  const store = usePrototypeStore();
  const { user } = useAuth();
  // The API applies organization ownership filtering for club users. Numeric
  // organization IDs are intentionally kept in clubCode, so do not filter by
  // the prototype's former "MEC" code.
  const mine = store.bookings;
  const drafts = mine.filter((b) => b.status === "draft");
  const processing = mine.filter((b) =>
    ["pending_hold", "needs_revision"].includes(b.status),
  );
  const upcoming = mine.filter(
    (b) =>
      ["approved", "room_changed"].includes(b.status) &&
      new Date(b.startAt) > new Date(),
  );
  const history = mine.filter((b) =>
    ["completed", "rejected", "cancelled", "expired"].includes(b.status),
  );
  const [formOpen, setFormOpen] = useState(false),
    [editing, setEditing] = useState<Booking | null>(null),
    [cancel, setCancel] = useState<Booking | null>(null),
    [detail, setDetail] = useState<Booking | null>(null),
    [mauABooking, setMauABooking] = useState<Booking | null>(null),
    [mauAOpen, setMauAOpen] = useState(false);
  const roomName = (id: string) =>
    store.rooms.find((r) => r.id === id)?.name ?? store.bookings.find((b) => b.roomId === id)?.roomName ?? id;
  return (
    <main className="min-h-screen bg-slate-50">
      <DashboardHeader
        badge={user?.organization?.abbreviation || user?.organizationName || "CLB"}
        eyebrow="Dashboard CLB"
        title={user?.organization?.name || user?.organizationName || "Câu lạc bộ"}
        userName={user?.fullName || user?.username || "Đại diện CLB"}
        userRole={user?.title || "Đại diện CLB"}
        userInitials={(user?.fullName || user?.username || "CLB").split(/\s+/).slice(-2).map((part) => part[0]).join("").toUpperCase()}
        notificationAudience="club"
        primaryAction={
          <Button onClick={() => setFormOpen(true)}>
            <Plus />
            Đăng ký mượn phòng
          </Button>
        }
        navItems={[
          { id: "overview", label: "Tổng quan", active: true },
          {
            id: "calendar",
            label: "Lịch phòng",
            onClick: () => window.location.assign("/calendar"),
          },
        ]}
      />
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["Đang xử lý", processing.length, <Clock3 />],
            ["Lịch sắp tới", upcoming.length, <CalendarDays />],
            [
              "Cần nộp bản cứng",
              processing.filter((b) => b.physicalStatus === "chua_nhan")
                .length,
              <FileText />,
            ],
          ].map(([label, value, icon]) => (
            <Card key={String(label)}>
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-sm text-slate-500">{label}</p>
                  <p className="text-3xl font-semibold">{value}</p>
                </div>
                <span className="text-blue-600">{icon}</span>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="border-blue-200 bg-blue-50/60">
          <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-md bg-blue-600 text-white">
                <UserRound className="size-5" />
              </span>
              <div>
                <p className="text-sm font-medium text-blue-700">
                  Cán bộ trực VP Đoàn hỗ trợ
                </p>
                <h2 className="font-semibold">
                  {store.supportContact.name
                    ? `${store.supportContact.name} · ${store.supportContact.role}`
                    : "VP Đoàn chưa cập nhật cán bộ trực"}
                </h2>
                {store.supportContact.name && <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                  <span className="inline-flex items-center gap-1">
                    <Phone className="size-4" />
                    {store.supportContact.phone}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Mail className="size-4" />
                    {store.supportContact.email}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock3 className="size-4" />
                    {store.supportContact.shift}
                  </span>
                </div>}
              </div>
            </div>
            <Button variant="outline" className="bg-white" onClick={() => { setMauABooking(null); setMauAOpen(true); }}>
              <FileText /> Xuất Mẫu A theo ngày/tuần
            </Button>
          </CardContent>
        </Card>
        <Tabs defaultValue="processing">
          <TabsList>
            <TabsTrigger value="processing">Đơn đang xử lý</TabsTrigger>
            <TabsTrigger value="drafts">Bản nháp{drafts.length ? ` (${drafts.length})` : ""}</TabsTrigger>
            <TabsTrigger value="upcoming">Lịch sắp tới</TabsTrigger>
            <TabsTrigger value="history">Lịch sử</TabsTrigger>
          </TabsList>
          {[
            ["processing", processing],
            ["drafts", drafts],
            ["upcoming", upcoming],
            ["history", history],
          ].map(([tab, list]) => (
            <TabsContent key={String(tab)} value={String(tab)}>
              <Card>
                <CardHeader>
                  <CardTitle>
                    {tab === "processing"
                      ? "Đơn đang xử lý"
                      : tab === "drafts"
                        ? "Bản nháp · chưa giữ phòng"
                      : tab === "upcoming"
                        ? "Lịch sắp tới"
                        : "Lịch sử"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mã đơn</TableHead>
                        <TableHead>Hoạt động</TableHead>
                        <TableHead>Phòng & thời gian</TableHead>
                        <TableHead>Bản cứng</TableHead>
                        <TableHead>Trạng thái</TableHead>
                        <TableHead>Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(list as Booking[]).length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="py-12 text-center text-slate-500"
                          >
                            Chưa có dữ liệu
                          </TableCell>
                        </TableRow>
                      )}
                      {(list as Booking[]).map((b) => {
                        const canEdit =
                          ["draft", "pending_hold", "needs_revision"].includes(b.status) &&
                          b.physicalStatus !== "da_nhan_ban_cung";
                        return (
                        <TableRow key={b.id}>
                          <TableCell className="font-medium">{b.id}</TableCell>
                          <TableCell>
                            <button
                              type="button"
                              className="text-left font-semibold hover:text-blue-700 hover:underline"
                              onClick={() => setDetail(b)}
                            >
                              {b.activityName}
                            </button>
                            <p className="text-xs text-slate-500">
                              {b.participants} người
                            </p>
                          </TableCell>
                          <TableCell>
                            {roomName(b.roomId)}
                            <p className="text-xs text-slate-500">
                              {fmt(b.startAt)}
                            </p>
                          </TableCell>
                          <TableCell>
                            <PhysicalStatusBadge status={b.physicalStatus} />
                          </TableCell>
                          <TableCell>
                            <BookingStatusBadge status={b.status} />
                            {b.status === "pending_hold" && (
                              <p><HoldCountdown expiresAt={b.holdExpiresAt} /></p>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              {b.status === "draft" ? <Button
                                size="sm"
                                variant="outline"
                                onClick={() => { setEditing(b); setFormOpen(true); }}
                              >Tiếp tục</Button> : <Button
                                size="sm"
                                variant="outline"
                                disabled={!['pending_hold', 'needs_revision', 'approved', 'room_changed'].includes(b.status)}
                                onClick={() => { setMauABooking(b); setMauAOpen(true); }}
                              >
                                <Download />
                                Mẫu A
                              </Button>}
                              {[
                                "draft",
                                "pending_hold",
                                "needs_revision",
                              ].includes(b.status) && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button size="icon-sm" variant="outline">
                                      <MoreHorizontal />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    {canEdit && (
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setEditing(b);
                                          setFormOpen(true);
                                        }}
                                      >
                                        Sửa đơn
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                      variant="destructive"
                                      onClick={() => setCancel(b)}
                                    >
                                      Hủy đơn
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
      {formOpen && (
        <BookingFormDialog
          key={editing?.id ?? "new"}
          open={formOpen}
          editing={editing}
          onCreated={(booking) => { setMauABooking(booking); setMauAOpen(true); }}
          close={() => {
            setFormOpen(false);
            setEditing(null);
          }}
        />
      )}
      {mauAOpen && <MauAPreview initialBooking={mauABooking} close={() => { setMauAOpen(false); setMauABooking(null); }} />}
      <BookingDetailDialog booking={detail} close={() => setDetail(null)} />
      <Dialog open={!!cancel} onOpenChange={(v) => !v && setCancel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hủy đơn {cancel?.id}?</DialogTitle>
            <DialogDescription>
              Phòng sẽ được mở lại cho CLB khác đăng ký.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancel(null)}>
              Giữ đơn
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (cancel) {
                  await store.cancelBooking(cancel.id);
                  toast.success("Đã hủy đơn và trả phòng");
                }
                setCancel(null);
              }}
            >
              Xác nhận hủy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
export default ClubDashboard;
