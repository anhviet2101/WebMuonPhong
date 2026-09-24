"use client";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  Clock3,
  Download,
  FileText,
  Mail,
  MoreHorizontal,
  Phone,
  Plus,
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
import { openBookingScan } from "@/components/shared/booking-scan";
import { DateTime24Field, bookingTimeError } from "@/components/shared/date-time-24-field";
import { DocumentDateField } from "@/components/shared/document-date-field";
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
  type MauAFields,
} from "@/components/shared/document-export";
import { useAuth } from "@/components/auth/auth-context";
import { api, endpoints } from "@/lib/api";

const fmt = (iso: string) =>
  iso ? new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    hourCycle: "h23",
  }).format(new Date(iso)) : "Chưa chọn thời gian";
const paperDeadlineLabel = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Chưa có hạn nộp";
  const weekday = new Intl.DateTimeFormat("vi-VN", { weekday: "long" }).format(date);
  const day = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
  return `${String(date.getHours()).padStart(2, "0")}h${String(date.getMinutes()).padStart(2, "0")} ${weekday}, ngày ${day}`;
};
const defaultBookingTime = (hour: number) => {
  const date = new Date();
  date.setDate(date.getDate() + (8 - date.getDay()) % 7 || 7);
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
  if (!expiresAt) return <span className="text-xs text-slate-500">Chưa giữ phòng</span>;
  if (remaining <= 0) return <span className="text-xs text-red-600">Hết hạn giữ chỗ</span>;
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
  const [step, setStep] = useState(1);
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
  const timeError = bookingTimeError(start, end, { earliestMinute: store.bookingHours.start * 60, latestMinute: store.bookingHours.end * 60 });
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
      const nextEnd = new Date(nextStart.getTime() + duration);
      const closing = new Date(nextStart);
    closing.setHours(store.bookingHours.end, 0, 0, 0);
      setEnd(toLocalInput(new Date(Math.min(nextEnd.getTime(), closing.getTime())).toISOString()));
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
    if (editing?.scanUploadedAt && !window.confirm("Sửa đơn sẽ làm bản scan đã nộp mất hiệu lực. Bạn cần tải bản scan mới sau khi lưu. Tiếp tục?")) return;
    const nextErrors: Record<string, string> = {};
    if (timeError) nextErrors.time = timeError;
    if (!campus) nextErrors.campus = "Vui lòng chọn cơ sở.";
    if (!building) nextErrors.building = "Vui lòng chọn tòa nhà.";
    if (!room) nextErrors.room = "Vui lòng chọn ít nhất một phòng trống.";
    if (!name.trim()) nextErrors.name = "Vui lòng nhập tên hoạt động.";
    if (!description.trim()) nextErrors.description = "Vui lòng nhập mục đích hoặc mô tả.";
    if (!Number.isInteger(Number(count)) || Number(count) < 1) nextErrors.count = "Số người phải là số nguyên lớn hơn 0.";
    const tooSmall = store.rooms.find((item) => item.id === room && item.capacity != null && Number(count) > item.capacity);
    if (tooSmall) nextErrors.count = `Phòng ${tooSmall.name} không đủ sức chứa ${count} người.`;
    if (!contactPerson.trim()) nextErrors.contactPerson = "Vui lòng nhập người đại diện.";
    if (!contactPhone.trim()) nextErrors.contactPhone = "Vui lòng nhập số điện thoại.";
    else if (!/^\+?[0-9][0-9 .-]*$/.test(contactPhone) || !/^\d{9,15}$/.test(contactPhone.replace(/\D/g, ""))) nextErrors.contactPhone = "Số điện thoại/Zalo chỉ được nhập chữ số hợp lệ.";
    if (!contactEmail.trim()) nextErrors.contactEmail = "Vui lòng nhập email.";
    else if (!/^\S+@\S+\.\S+$/.test(contactEmail)) nextErrors.contactEmail = "Email chưa hợp lệ.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSubmitting(true);
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
        const created = await store.addBooking(data);
        toast.success(`Đã giữ phòng; hạn nộp scan ${created.scanDeadlineAt ? new Date(created.scanDeadlineAt).toLocaleString("vi-VN") : "theo hệ thống"}.`);
        onCreated(created);
      }
      close();
    } catch {
      // The store reports the API error and keeps the form open for correction.
    } finally {
      setSubmitting(false);
    }
  };
  const goToRooms = () => {
    const next: Record<string, string> = {};
    if (timeError) next.time = timeError;
    const monday = new Date();
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + 7);
    const endOfSecondWeek = new Date(monday);
    endOfSecondWeek.setDate(endOfSecondWeek.getDate() + 14);
    if (start && (new Date(start) < monday || new Date(start) >= endOfSecondWeek || new Date(start).getDay() === 0)) next.time = "CLB chỉ đăng ký từ thứ Hai đến thứ Bảy của hai tuần kế tiếp.";
    if (!validCount) next.count = "Số người phải là số nguyên lớn hơn 0.";
    if (!name.trim()) next.name = "Vui lòng nhập tên hoạt động.";
    if (!description.trim()) next.description = "Vui lòng nhập mô tả hoạt động.";
    if (!contactPerson.trim()) next.contactPerson = "Vui lòng nhập người đại diện.";
    if (!/^\+?[0-9][0-9 .-]*$/.test(contactPhone) || !/^\d{9,15}$/.test(contactPhone.replace(/\D/g, ""))) next.contactPhone = "Số điện thoại/Zalo không hợp lệ.";
    if (!/^\S+@\S+\.\S+$/.test(contactEmail)) next.contactEmail = "Email không hợp lệ.";
    setErrors(next);
    if (!Object.keys(next).length) setStep(2);
  };
  const saveDraft = async () => {
    if (room && timeError) return toast.error(timeError);
    if (room && !validCount) return toast.error("Số người phải lớn hơn 0 để giữ phòng.");
    setSubmitting(true);
    const asIso = (value: string) => Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : "";
    try {
      const draft = await store.saveDraft({
        clubCode: user?.organization?.abbreviation ?? "",
        clubName: user?.organization?.name ?? user?.organizationName ?? "",
        activityName: name.trim(), description: description.trim(), roomId: room,
        backupRoomId: backup === "none" ? undefined : backup,
        startAt: asIso(start), endAt: asIso(end), participants: Number(count),
        contactPerson: contactPerson.trim(), contactPhone: contactPhone.trim(),
        contactEmail: contactEmail.trim(), equipment: [],
      }, editing?.status === "draft" ? editing.id : undefined);
      toast.success(draft.roomId ? "Đã lưu bản nháp và giữ phòng tối đa 1 giờ." : "Đã lưu bản nháp; chưa giữ phòng, không giới hạn thời gian.");
      close();
    } catch {
      // Store displays the API error and keeps the form open.
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
            {step === 1 ? "Bước 1/2 · Chọn thời gian và điền thông tin hoạt động." : "Bước 2/2 · Chọn phòng trên sơ đồ phòng trống/bận."} Hệ thống tính buffer 15 phút trước và sau.
          </DialogDescription>
        </DialogHeader>
        <h3 className={step === 1 ? "font-semibold" : "hidden"}>Thời gian</h3>
        {(
          <div className={step === 1 ? "grid gap-4 sm:grid-cols-2" : "hidden"}>
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
        <div className={step === 1 ? "grid gap-2" : "hidden"}>
          <Label>Số người dự kiến</Label>
          <Input type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} />
          {errors.count && <p className="text-sm text-red-600">{errors.count}</p>}
        </div>
        <h3 className={step === 2 ? "font-semibold" : "hidden"}>Sơ đồ phòng · {new Date(start).toLocaleDateString("vi-VN")} · {start.slice(11)}–{end.slice(11)}</h3>
        {(
          <div className={step === 2 ? "grid gap-4 sm:grid-cols-2" : "hidden"}>
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
            <div className="grid gap-2 sm:col-span-2">
              <Label>Chọn một phòng</Label>
              <p className="text-xs text-slate-600">Xanh: còn trống · Xám: đã bận/không đủ sức chứa · Viền xanh: đã chọn.</p>
              {loadingRooms && <p className="text-sm">Đang kiểm tra phòng trống...</p>}
              <div className="grid grid-cols-2 gap-2 rounded-lg border bg-slate-50 p-3 sm:grid-cols-4">
                {buildingRooms.map((item) => { const free = remoteAvailableIds?.includes(item.id) ?? false; const chosen = room === item.id; return <button key={item.id} type="button" disabled={!free} aria-pressed={chosen} onClick={() => { setRoom(chosen ? "" : item.id); if (backup === item.id) setBackup("none"); }} className={`min-h-20 rounded-lg border-2 px-3 py-2 text-left text-sm transition ${chosen ? "border-blue-700 bg-blue-100 text-blue-900" : free ? "border-emerald-300 bg-emerald-50 hover:border-emerald-600" : "cursor-not-allowed border-slate-200 bg-slate-200 text-slate-500"}`}><b className="block">{item.name}</b><span>{chosen ? "Đã chọn" : free ? "Còn trống" : "Đã bận / không phù hợp"}</span><span className="block text-xs">{item.capacity ?? "?"} người</span></button>; })}
              </div>
              {errors.room && <p className="text-sm text-red-600">{errors.room}</p>}
            </div>
            <div className="grid gap-2">
              <Label>Phòng dự phòng (không giữ chỗ)</Label>
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
        <h3 className={step === 1 ? "font-semibold" : "hidden"}>Hoạt động và người liên hệ</h3>
        {(
          <div className={step === 1 ? "grid gap-4" : "hidden"}>
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
                  onChange={(e) => setContactPhone(e.target.value.replace(/[^0-9+ .-]/g, ""))}
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
          {(!editing || editing.status === "draft") && <Button variant="outline" onClick={saveDraft} disabled={submitting}>Lưu bản nháp</Button>}
          {step === 1 ? <Button onClick={goToRooms}>Xem phòng trống</Button> : <><Button variant="outline" onClick={() => setStep(1)}>Quay lại</Button><Button onClick={submit} disabled={submitting}>{submitting ? "Đang gửi..." : "Gửi đơn"}</Button></>}
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
  booking = store.bookings.find((item) => item.id === booking?.id) ?? booking;
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
              {booking.status !== "draft" && <div className="rounded-lg border p-3">
                <p className="font-medium">Bản scan đơn đã ký</p>
                <p className="text-xs text-slate-600">Nộp trước {booking.scanDeadlineAt ? new Date(booking.scanDeadlineAt).toLocaleString("vi-VN") : "hạn do cán bộ đặt"}. Chấp nhận PDF/JPG/PNG tối đa 5 MB.</p>
                <p className="text-xs text-slate-600">Bản cứng: trước {booking.paperDeadlineAt ? new Date(booking.paperDeadlineAt).toLocaleString("vi-VN") : "hạn do cán bộ đặt"}.</p>
                {booking.scanReuploadRequestedAt && <p className="text-sm font-medium text-amber-700">Cán bộ yêu cầu nộp lại scan. {booking.scanReuploadReason}</p>}
                {booking.physicalStatus === "chua_nhan" && booking.paperDeadlineAt && new Date(booking.paperDeadlineAt) < new Date() && <p className="text-sm text-red-700">Đã quá hạn bản cứng. Vui lòng liên hệ cán bộ để được xử lý, đơn chưa tự hủy theo mốc này.</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {booking.scanFileName && <Button size="sm" variant="outline" onClick={() => { void openBookingScan(booking!.id).catch(() => toast.error("Không thể mở bản scan.")); }}>Xem bản scan</Button>}
                  {booking.scanUploadedAt && <span className="text-xs text-emerald-700">{booking.scanConfirmedAt ? "Cán bộ đã xác nhận scan" : "Đã tải scan, chờ cán bộ xác nhận"}</span>}
                  {["pending_hold", "needs_revision"].includes(booking.status) && <div className="grid gap-1"><Label htmlFor={`scan-upload-${booking.id}`}>Tải bản scan đơn đã ký</Label><Input id={`scan-upload-${booking.id}`} className="max-w-xs" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" aria-label="Tải bản scan đơn đã ký" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { await store.uploadScan(booking!.id, file); toast.success("Đã tải bản scan."); } catch { /* Store shows the API error. */ } }} /></div>}
                </div>
              </div>}
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
    to.setDate(to.getDate() + (scope === "week" ? 6 : 1));
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
              <SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="day">Một ngày</SelectItem><SelectItem value="week">Cả tuần (Thứ Hai – Thứ Bảy)</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="grid gap-2"><Label>Chọn ngày</Label><DocumentDateField label="Chọn ngày xuất Mẫu A" value={date} onChange={setDate} /></div>
          <div className="grid gap-2 sm:col-span-2"><Label>Đơn vị ở đầu mẫu</Label><Select value={fields.headerType} onValueChange={(value) => setFields((current) => ({ ...current, headerType: value as "hsv" | "doan" }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="hsv">Hội Sinh viên Trường Đại học Công nghệ</SelectItem><SelectItem value="doan">Đoàn Thanh niên Trường Đại học Công nghệ</SelectItem></SelectContent></Select></div>
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
        <div className="document-preview space-y-3 rounded-lg border bg-white p-6 font-serif text-[14pt] leading-[1.2] text-black">
          <div className="grid gap-4 text-center sm:grid-cols-2">
            <div><b className="whitespace-pre-line">{fields.headerType === "hsv" ? mauAFixed.institution : "ĐOÀN ĐẠI HỌC QUỐC GIA HÀ NỘI\nBCH TRƯỜNG ĐẠI HỌC CÔNG NGHỆ"}</b><Input className="mt-2 font-serif text-red-700" aria-label="Tên CLB" value={fields.clubName} onChange={(event) => field("clubName", event.target.value)} /></div>
            <div><Label>Ngày lập đơn</Label><Input className="mt-2 font-serif text-red-700" value={fields.issueDate} onChange={(event) => field("issueDate", event.target.value)} /></div>
          </div>
          <h2 className="text-center text-[20pt] font-bold">{mauAFixed.title}</h2>
          <p className="text-center font-bold">{mauAFixed.recipient}</p>
          <textarea className="min-h-24 w-full rounded-md border border-input p-3 font-serif text-red-700" aria-label="Đoạn giới thiệu" value={fields.intro} onChange={(event) => field("intro", event.target.value)} />
          <p>{mauAFixed.request}</p><p className="font-bold">Thời gian, địa điểm:</p>
          {fields.slots.length > 1 ? <div className="overflow-x-auto"><table className="w-full border-collapse text-[14pt]"><thead><tr>{["STT", "Thời gian", "Địa điểm", "Đơn vị", "Ghi chú"].map((name) => <th key={name} className="border border-black p-2 text-center font-bold">{name}</th>)}</tr></thead><tbody>{fields.slots.map((slot, index) => <tr key={slot.bookingId}><td className="border border-black p-2 text-center">{index + 1}</td><td className="border border-black p-1"><Input className="font-serif text-red-700" value={slot.time} onChange={(event) => slotField(slot.bookingId, "time", event.target.value)} /></td><td className="border border-black p-1"><Input className="font-serif text-red-700" value={slot.location} onChange={(event) => slotField(slot.bookingId, "location", event.target.value)} /></td><td className="border border-black p-2">{fields.clubName}</td><td className="border border-black p-2" /></tr>)}</tbody></table></div> : fields.slots.map((slot, index) => (
            <div key={slot.bookingId} className="grid gap-2 rounded-md border p-3">
              <label className="grid gap-1 sm:grid-cols-[120px_1fr] sm:items-center"><span>Thời gian {fields.slots.length > 1 ? index + 1 : ""}</span><Input className="font-serif text-red-700" value={slot.time} onChange={(event) => slotField(slot.bookingId, "time", event.target.value)} /></label>
              <label className="grid gap-1 sm:grid-cols-[120px_1fr] sm:items-center"><span>Địa điểm {fields.slots.length > 1 ? index + 1 : ""}</span><Input className="font-serif text-red-700" value={slot.location} onChange={(event) => slotField(slot.bookingId, "location", event.target.value)} /></label>
            </div>
          ))}
          <label className="grid gap-1 sm:grid-cols-[210px_1fr] sm:items-center"><span>Số lượng người tham gia:</span><Input className="font-serif text-red-700" value={fields.participants} onChange={(event) => field("participants", event.target.value)} /></label>
          <p>{mauAFixed.commitment}</p><p>{mauAFixed.responsibility}</p><p className="whitespace-pre-line">{mauAFixed.closing}</p>
          <div className="grid gap-3 pt-4 text-center text-[14pt] font-bold sm:grid-cols-3">
            <span>Ý KIẾN<br />PHÒNG HCQT VÀ TCCB</span><span>Ý KIẾN<br />{fields.headerType === "hsv" ? "HỘI SINH VIÊN TRƯỜNG" : "ĐOÀN THANH NIÊN TRƯỜNG"}</span>
            <div>TM. BAN CHỦ NHIỆM<Input className="mt-2 font-serif text-red-700" aria-label="Chức danh người ký" value={fields.signerTitle} onChange={(event) => field("signerTitle", event.target.value)} /><Input className="mt-4 font-serif text-red-700" aria-label="Tên người ký" value={fields.signerName} onChange={(event) => field("signerName", event.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>Đóng</Button>
          <Button disabled={!selected.length} onClick={async () => { try { await exportMauADocx(fields, `Mau-A-${scope}-${date}.docx`); toast.success("Đã tải Mẫu A theo file gốc. Mở bằng Word để in đúng định dạng."); } catch { toast.error("Không thể xuất Mẫu A. Vui lòng thử lại."); } }}><Download /> Tải mẫu gốc để in</Button>
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
  const pendingPaper = processing.filter((b) => b.physicalStatus === "chua_nhan");
  const paperDeadlines = [...new Set(pendingPaper.map((b) => b.paperDeadlineAt).filter((value): value is string => Boolean(value)))].sort();
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
    [cancelReason, setCancelReason] = useState(""),
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
              pendingPaper.length,
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
        {pendingPaper.length > 0 && (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="flex items-start gap-3 p-5">
              <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-700" />
              <div>
                <h2 className="font-semibold text-amber-950">Hạn nộp đơn bản cứng</h2>
                {paperDeadlines.map((deadline) => (
                  <p key={deadline} className="mt-1 text-sm text-amber-900">
                    {paperDeadlineLabel(deadline)} · {pendingPaper.filter((b) => b.paperDeadlineAt === deadline).length} đơn chờ nộp
                    {new Date(deadline).getTime() < Date.now() && <strong className="ml-2 text-red-700">Đã quá hạn, vui lòng liên hệ cán bộ</strong>}
                  </p>
                ))}
                {paperDeadlines.length === 0 && <p className="mt-1 text-sm text-amber-900">Vui lòng liên hệ cán bộ để xác nhận hạn nộp.</p>}
                <p className="mt-1 text-xs text-amber-800">Hạn mặc định: 15h thứ Năm của tuần trước tuần mượn. Hạn riêng sau gia hạn được hiển thị theo từng đơn.</p>
              </div>
            </CardContent>
          </Card>
        )}
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
                            {b.roomId ? roomName(b.roomId) : "Chưa chọn phòng"}
                            <p className="text-xs text-slate-500">
                              {fmt(b.startAt)}
                            </p>
                              {b.scanReuploadRequestedAt && <p className="text-xs text-amber-700">Cần nộp lại scan</p>}
                          </TableCell>
                          <TableCell>
                            <PhysicalStatusBadge status={b.physicalStatus} />
                            {b.physicalStatus === "chua_nhan" && b.paperDeadlineAt && ["pending_hold", "needs_revision"].includes(b.status) && (
                              <p className="mt-1 text-xs text-amber-800">Hạn: {paperDeadlineLabel(b.paperDeadlineAt)}</p>
                            )}
                          </TableCell>
                          <TableCell>
                            <BookingStatusBadge status={b.status} />
                            {(b.status === "pending_hold" || b.status === "draft") && (
                              <p>{b.status === "draft" && !b.roomId ? <span className="text-xs text-slate-500">Chưa giữ phòng · lưu không giới hạn</span> : b.physicalStatus === "da_nhan_ban_cung" ? <span className="text-xs text-emerald-700">Đã nhận bản cứng · chờ duyệt</span> : b.scanUploadedAt ? <span className="text-xs text-emerald-700">Đã nộp scan · tiếp tục giữ phòng</span> : <HoldCountdown expiresAt={b.holdExpiresAt} />}</p>
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
                              {b.scanUploadedAt ? <><Button size="sm" variant="outline" onClick={() => { void openBookingScan(b.id).catch(() => toast.error("Không thể mở bản scan.")); }}>Xem scan</Button>{["pending_hold", "needs_revision"].includes(b.status) && <Button size="sm" variant="outline" onClick={() => setDetail(b)}>Thay scan</Button>}</> : ["pending_hold", "needs_revision"].includes(b.status) ? <Button size="sm" variant="outline" onClick={() => setDetail(b)}>Nộp scan</Button> : null}
                              {b.physicalStatus === "da_nhan_ban_cung" && ["pending_hold", "needs_revision", "approved", "room_changed"].includes(b.status) && <Button size="sm" variant="outline" onClick={() => { setCancel(b); setCancelReason(""); }}>Yêu cầu hủy</Button>}
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
                                    {b.physicalStatus !== "da_nhan_ban_cung" && <DropdownMenuItem
                                      variant="destructive"
                                      onClick={() => setCancel(b)}
                                    >
                                      Hủy đơn
                                    </DropdownMenuItem>}
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
            <DialogTitle>{cancel?.physicalStatus === "da_nhan_ban_cung" ? "Yêu cầu cán bộ hủy đơn" : "Hủy đơn"} {cancel?.id}?</DialogTitle>
            <DialogDescription>
              {cancel?.physicalStatus === "da_nhan_ban_cung" ? "Đơn đã nhận bản cứng. Hãy nêu lý do để cán bộ xem xét và hủy theo quyền admin. Phòng chưa được trả ngay." : "Phòng sẽ được mở lại cho CLB khác đăng ký."}
            </DialogDescription>
          </DialogHeader>
          {cancel?.physicalStatus === "da_nhan_ban_cung" && <Input aria-label="Lý do yêu cầu hủy" placeholder="Lý do yêu cầu hủy" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancel(null)}>
              Giữ đơn
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (cancel) {
                  if (cancel.physicalStatus === "da_nhan_ban_cung") { if (!cancelReason.trim()) return toast.error("Vui lòng nhập lý do hủy."); await store.requestCancelBooking(cancel.id, cancelReason.trim()); toast.success("Đã gửi yêu cầu cho cán bộ."); }
                  else { await store.cancelBooking(cancel.id); toast.success("Đã hủy đơn và trả phòng"); }
                }
                setCancel(null);
              }}
            >
              {cancel?.physicalStatus === "da_nhan_ban_cung" ? "Gửi cho cán bộ" : "Xác nhận hủy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
export default ClubDashboard;
