"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, format, isSameDay, startOfWeek } from "date-fns";
import { vi } from "date-fns/locale";
import {
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LockKeyhole,
  Plus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AuthControls } from "@/components/shared/dashboard-header";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateTime24Field, bookingTimeError } from "@/components/shared/date-time-24-field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  usePrototypeStore,
  type Booking,
  type Room,
  toLocalInput,
} from "@/components/shared/prototype-store";
import { isClubRole, useAuth } from "@/components/auth/auth-context";
import { api, endpoints } from "@/lib/api";

const START = 7 * 60;
const END = 21 * 60;
const SLOT_MINUTES = 30;
const TOTAL = END - START;
const slots = Array.from(
  { length: (END - START) / SLOT_MINUTES },
  (_, i) => i,
);
const active = ["pending_hold", "approved", "room_changed"];
const clock = (iso: string) => format(new Date(iso), "HH:mm");
const iso = (value: string) => new Date(value).toISOString();
const defaultQuickEnd = (start: string) => {
  const date = new Date(start);
  if (!Number.isFinite(date.getTime())) return "";
  const closing = new Date(date);
  closing.setHours(END / 60, 0, 0, 0);
  return toLocalInput(new Date(Math.min(date.getTime() + 60 * 60_000, closing.getTime())).toISOString());
};

function Event({
  booking,
  admin,
  open,
  date,
}: {
  booking: Booking;
  admin: boolean;
  open: () => void;
  date: Date;
}) {
  const s = new Date(booking.startAt),
    e = new Date(booking.endAt);
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const startMinute = (s.getTime() - dayStart.getTime()) / 60000;
  const endMinute = (e.getTime() - dayStart.getTime()) / 60000;
  const offset = Math.max(0, startMinute - START);
  const duration = Math.max(0, Math.min(END, endMinute) - Math.max(START, startMinute));
  const ok = ["approved", "room_changed"].includes(booking.status);
  const hidden = !admin && booking.hiddenDetails;
  return (
    <>
      <div
        className="pointer-events-none absolute top-5 h-10 rounded bg-slate-300/60"
        style={{
          left: `${(Math.max(0, offset - 15) / TOTAL) * 100}%`,
          width: `${((Math.min(TOTAL, offset + duration + 15) - Math.max(0, offset - 15)) / TOTAL) * 100}%`,
        }}
      />
      <button
        onClick={open}
        className={cn(
          "absolute top-3 z-10 h-14 overflow-hidden text-ellipsis whitespace-nowrap rounded-md border px-2 text-left text-xs shadow-sm",
          hidden
            ? "border-slate-400 bg-slate-300 text-slate-800"
            : ok
            ? "border-emerald-300 bg-emerald-100 text-emerald-900"
            : "border-amber-300 bg-amber-100 text-amber-900",
        )}
        style={{
          left: `${(offset / TOTAL) * 100}%`,
          width: `${(duration / TOTAL) * 100}%`,
        }}
      >
        <b className="block truncate">
          {hidden
            ? "Không khả dụng"
            : admin
              ? `${booking.clubName} - ${booking.activityName}`
              : booking.activityName}
        </b>
        <span className="block truncate opacity-75">
          {clock(booking.startAt)}-{clock(booking.endAt)} ·{" "}
          {hidden ? "Bận" : ok ? "Đã duyệt" : "Đang giữ"}
        </span>
      </button>
    </>
  );
}

function QuickBooking({
  draft,
  close,
}: {
  draft: { room: Room; start: string } | null;
  close: () => void;
}) {
  const { addBooking } = usePrototypeStore();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [count, setCount] = useState("30");
  const [contactPerson, setContactPerson] = useState(
    user?.organization?.representative_name || user?.fullName || "",
  );
  const [contactPhone, setContactPhone] = useState(
    user?.organization?.hotline || user?.phone || "",
  );
  const [contactEmail, setContactEmail] = useState(
    user?.organization?.contact_email || user?.email || "",
  );
  const [start, setStart] = useState(draft?.start ?? "");
  const [end, setEnd] = useState(draft ? defaultQuickEnd(draft.start) : "");
  const timeError = bookingTimeError(start, end, { earliestMinute: START, latestMinute: END });
  const changeStart = (value: string) => {
    setStart(value);
    const nextStart = new Date(value);
    if (!Number.isFinite(nextStart.getTime())) return;
    if (start.slice(0, 10) !== value.slice(0, 10) || !Number.isFinite(new Date(end).getTime()) || new Date(end) <= nextStart)
      setEnd(defaultQuickEnd(value));
  };
  const submit = async () => {
    if (!draft || !name.trim())
      return toast.error("Vui lòng nhập tên hoạt động");
    if (timeError) return toast.error(timeError);
    if (new Date(start) <= new Date()) return toast.error("Vui lòng chọn thời gian trong tương lai.");
    if (!contactPerson.trim() || !contactPhone.trim() || !/^\S+@\S+\.\S+$/.test(contactEmail))
      return toast.error("Vui lòng nhập đầy đủ tên, số điện thoại và email liên hệ hợp lệ");
    try {
      const { data } = await api.get(endpoints.availableRooms, {
        params: { start_time: iso(start), end_time: iso(end) },
      });
      const availableIds = (data.results ?? data).map((item: { id: number | string }) => String(item.id));
      if (!availableIds.includes(draft.room.id))
        return toast.error("Phòng đã có đơn giữ hoặc blackout trong khung giờ này");
    } catch {
      return toast.error("Không thể kiểm tra phòng khả dụng. Vui lòng thử lại.");
    }
    const b = await addBooking({
      clubCode: user?.organization?.abbreviation ?? "",
      clubName: user?.organization?.name ?? user?.organizationName ?? "",
      activityName: name,
      description: "Đăng ký nhanh từ lịch",
      roomId: draft.room.id,
      startAt: iso(start),
      endAt: iso(end),
      participants: Number(count),
      contactPerson: contactPerson.trim(),
      contactPhone: contactPhone.trim(),
      contactEmail: contactEmail.trim(),
      equipment: [],
    });
    toast.success(`Đã tạo ${b.id} và giữ chỗ 48 giờ`);
    close();
  };
  return (
    <Dialog open={!!draft} onOpenChange={(v) => !v && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đăng ký nhanh · {draft?.room.name}</DialogTitle>
          <DialogDescription>
            Hệ thống kiểm tra buffer 15 phút trước và sau.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Tên hoạt động</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <DateTime24Field label="Bắt đầu" value={start} onChange={changeStart} />
            <DateTime24Field label="Kết thúc" value={end} onChange={setEnd} />
          </div>
          {timeError && <p className="text-sm text-red-600">{timeError}</p>}
          <div className="grid gap-2">
            <Label>Số người</Label>
            <Input
              type="number"
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Người liên hệ</Label><Input value={contactPerson} onChange={(event) => setContactPerson(event.target.value)} /></div>
            <div className="grid gap-2"><Label>Số điện thoại</Label><Input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} /></div>
            <div className="grid gap-2 sm:col-span-2"><Label>Email</Label><Input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Hủy
          </Button>
          <Button onClick={submit}>Gửi đơn</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Blackout({
  open,
  close,
  buildingId,
}: {
  open: boolean;
  close: () => void;
  buildingId: string;
}) {
  const { rooms, addBlackout } = usePrototypeStore();
  const list = rooms.filter((r) => r.buildingId === buildingId);
  const [room, setRoom] = useState(list[0]?.id ?? "");
  const [start, setStart] = useState(toLocalInput(new Date().toISOString()));
  const [end, setEnd] = useState(
    toLocalInput(new Date(Date.now() + 7200000).toISOString()),
  );
  const [reason, setReason] = useState("Phục vụ kỳ thi");
  const [note, setNote] = useState("");
  const submit = async () => {
    if (!room || !Number.isFinite(new Date(start).getTime()) || !Number.isFinite(new Date(end).getTime()) || new Date(end) <= new Date(start))
      return toast.error("Khung khóa chưa hợp lệ");
    await addBlackout({
      roomIds: [room],
      startAt: iso(start),
      endAt: iso(end),
      reason,
      note,
    });
    toast.success("Đã tạo blackout trên Calendar");
    close();
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Khóa phòng</DialogTitle>
          <DialogDescription>
            Block được đồng bộ ngay với lịch dùng chung.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Phòng</Label>
            <Select value={room} onValueChange={setRoom}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {list.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <DateTime24Field label="Bắt đầu" value={start} onChange={setStart} />
            <DateTime24Field label="Kết thúc" value={end} onChange={setEnd} />
          </div>
          <div className="grid gap-2">
            <Label>Lý do</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  "Bảo trì cơ sở vật chất",
                  "Phục vụ kỳ thi",
                  "Sự kiện Nhà trường",
                  "Lý do khác",
                ].map((x) => (
                  <SelectItem key={x} value={x}>
                    {x}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Ghi chú</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Hủy
          </Button>
          <Button onClick={submit}>
            <LockKeyhole />
            Xác nhận khóa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RoomCalendar() {
  const { campuses, buildings, rooms, bookings, blackouts } =
    usePrototypeStore();
  const { user } = useAuth();
  const admin = Boolean(user && !isClubRole(user.role));
  const [campusId, setCampusId] = useState(""),
    [buildingId, setBuildingId] = useState(""),
    [roomId, setRoomId] = useState("all"),
    [date, setDate] = useState(new Date()),
    [week, setWeek] = useState(false),
    [blackout, setBlackout] = useState(false),
    [calendarBookings, setCalendarBookings] = useState<Booking[]>([]);
  const [draft, setDraft] = useState<{ room: Room; start: string } | null>(
      null,
    ),
    [detail, setDetail] = useState<Booking | null>(null);
  const filteredBuildings = buildings.filter((b) => !campusId || b.campusId === campusId);
  const campusBuildingIds = new Set(filteredBuildings.map((item) => item.id));
  const visible = rooms.filter((r) =>
      (buildingId ? r.buildingId === buildingId : campusBuildingIds.has(r.buildingId)) &&
      (roomId === "all" || r.id === roomId) && r.active !== false,
    ),
    building = buildings.find((b) => b.id === buildingId),
    campus = campuses.find((c) => c.id === (building?.campusId ?? campusId));
  const roomLabel = (room: Room) => {
    const parent = buildings.find((item) => item.id === room.buildingId);
    const parentCampus = campuses.find((item) => item.id === parent?.campusId);
    const location = parentCampus?.code === "KM"
      ? `GĐ ${parentCampus.name}`
      : parent?.name ?? parentCampus?.name ?? "Chưa rõ tòa";
    return `${room.name} (${location})`;
  };
  const mapCalendarBooking = (b: any): Booking => ({
    id: String(b.id),
    clubCode: b.organization?.toString() ?? "",
    clubName: b.organization_name ?? "",
    activityName: b.activity_name,
    description: b.description ?? "",
    roomId: String(b.room),
    backupRoomId: b.secondary_room ? String(b.secondary_room) : undefined,
    startAt: b.start_time,
    endAt: b.end_time,
    participants: b.participant_count ?? 0,
    contactPerson: b.contact_person ?? "",
    contactPhone: b.contact_phone ?? "",
    contactEmail: b.contact_email ?? "",
    equipment: [],
    status: b.status,
    physicalStatus: b.physical_status,
    organizationProfile: b.organization_profile,
    hiddenDetails: Boolean(b.hidden_details),
    holdExpiresAt: b.hold_expires_at,
    note: b.notes,
    createdAt: b.created_at,
  });
  useEffect(() => {
    const first = campuses.find((item) => item.active !== false) ?? campuses[0];
    if (!campusId && first) setCampusId(first.id);
  }, [campuses, campusId]);
  useEffect(() => {
    if (buildingId && filteredBuildings.some((item) => item.id === buildingId)) return;
    setBuildingId(filteredBuildings.find((item) => item.active !== false)?.id ?? filteredBuildings[0]?.id ?? "");
  }, [buildingId, filteredBuildings]);
  useEffect(() => {
    let cancelled = false;
    api.get(endpoints.bookingCalendar)
      .then(({ data }) => {
        if (!cancelled) setCalendarBookings((data.results ?? data).map(mapCalendarBooking));
      })
      .catch(() => {
        if (!cancelled) setCalendarBookings(bookings);
      });
    return () => { cancelled = true; };
  }, [bookings]);
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        addDays(startOfWeek(date, { weekStartsOn: 1 }), i),
      ),
    [date],
  );
  const move = (n: number) => setDate((d) => addDays(d, n * (week ? 7 : 1)));
  const goDashboard = () => window.location.assign(admin ? "/admin-doan" : "/clb");
  const slotClick = (room: Room, i: number) => {
    const d = new Date(date);
    d.setHours(
      Math.floor(START / 60) + Math.floor((i * SLOT_MINUTES) / 60),
      (i * SLOT_MINUTES) % 60,
      0,
      0,
    );
    if (d <= new Date()) return toast.error("Vui lòng chọn khung giờ trong tương lai.");
    setDraft({ room, start: toLocalInput(d.toISOString()) });
  };
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium text-blue-700">
                Hệ thống Mượn phòng CLB
              </p>
              <h1 className="text-2xl font-semibold">
                {admin ? "Lịch phòng & khóa phòng" : "Lịch phòng"}
              </h1>
              <p className="text-sm text-slate-600">
                {admin
                  ? "Một nguồn lịch cho booking, buffer và blackout."
                  : "Xem phòng trống và click ô thời gian để đăng ký mượn phòng."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={goDashboard}>
                <LayoutDashboard />
                Dashboard
              </Button>
              <AuthControls />
              {admin && (
                <Button onClick={() => setBlackout(true)}>
                  <Plus />
                  Khóa phòng
                </Button>
              )}
            </div>
          </div>
          <Card className="mt-5">
            <CardContent className="grid gap-3 p-4 lg:grid-cols-[180px_180px_180px_auto_auto_auto_1fr]">
              <Select value={campusId} onValueChange={(value) => { setCampusId(value); setBuildingId(""); setRoomId("all"); }}>
                <SelectTrigger className="w-full">
                  <Building2 />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {campuses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code} · {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={buildingId} onValueChange={(value) => { setBuildingId(value); setRoomId("all"); }}>
                <SelectTrigger className="w-full">
                  <Building2 />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {filteredBuildings.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={roomId} onValueChange={setRoomId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Phòng" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả phòng</SelectItem>
                  {rooms.filter((room) => room.buildingId === buildingId && room.active !== false).map((room) => (
                    <SelectItem key={room.id} value={room.id}>{room.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex rounded-lg border bg-slate-100 p-1">
                <Button
                  size="sm"
                  variant={!week ? "default" : "ghost"}
                  onClick={() => setWeek(false)}
                >
                  Ngày
                </Button>
                <Button
                  size="sm"
                  variant={week ? "default" : "ghost"}
                  onClick={() => setWeek(true)}
                >
                  Tuần
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  size="icon-sm"
                  variant="outline"
                  onClick={() => move(-1)}
                >
                  <ChevronLeft />
                </Button>
                <Button variant="outline" onClick={() => setDate(new Date())}>
                  Hôm nay
                </Button>
                <Button
                  size="icon-sm"
                  variant="outline"
                  onClick={() => move(1)}
                >
                  <ChevronRight />
                </Button>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline">
                    <CalendarDays />
                    {format(date, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => d && setDate(d)}
                  />
                </PopoverContent>
              </Popover>
              <Button className="lg:ml-auto" variant="outline">
                <Users />
                {admin ? "Admin VP Đoàn" : "Chế độ CLB"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </header>
      <div className="mx-auto max-w-[1600px] space-y-4 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">
              {campus?.code} - {campus?.name}
              {building ? ` · ${building.name}` : ""}
            </h2>
            <p className="text-sm text-slate-600">
              07:00-21:00 · 30 phút/ô · Click ô trống để đăng ký.
            </p>
          </div>
          <div className="flex gap-2">
            <Badge className="bg-amber-100 text-amber-800">Pending Hold</Badge>
            <Badge className="bg-emerald-100 text-emerald-800">Approved</Badge>
            <Badge className="bg-slate-700 text-white">Blackout</Badge>
          </div>
        </div>
        {week && (
          <div className="flex gap-2 overflow-x-auto">
            {days.map((d) => (
              <Button
                key={d.toISOString()}
                variant={isSameDay(d, date) ? "default" : "outline"}
                onClick={() => setDate(d)}
              >
                {format(d, "EEE dd/MM", { locale: vi })}
              </Button>
            ))}
          </div>
        )}
        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <div className="overflow-x-auto">
            <div className="min-w-[1880px]">
              <div
                className="grid border-b bg-slate-50"
                style={{
                  gridTemplateColumns: "200px repeat(28, minmax(60px, 1fr))",
                }}
              >
                <div className="sticky left-0 z-20 flex items-center border-r bg-background px-4 font-semibold">
                  Phòng
                </div>
                {slots.map((i) => (
                  <div
                    key={i}
                    className="border-r py-3 text-center text-xs text-slate-500"
                  >
                    {`${String(
                      Math.floor((START + i * SLOT_MINUTES) / 60),
                    ).padStart(2, "0")}:${String(
                      (START + i * SLOT_MINUTES) % 60,
                    ).padStart(2, "0")}`}
                  </div>
                ))}
              </div>
              {visible.length === 0 && (
                <div
                  className="grid min-h-24 border-b"
                  style={{
                    gridTemplateColumns:
                      "200px repeat(28, minmax(60px, 1fr))",
                  }}
                >
                  <div className="sticky left-0 z-20 border-r bg-background p-4 text-sm text-slate-500">
                    Chưa có phòng
                  </div>
                  <div className="col-span-28 flex items-center px-4 text-sm text-slate-500">
                    Cơ sở/tòa nhà này chưa có phòng đang hoạt động để hiển thị.
                  </div>
                </div>
              )}
              {visible.map((room) => {
                const dayStart = new Date(date);
                dayStart.setHours(0, 0, 0, 0);
                const gridStart = new Date(dayStart);
                gridStart.setHours(START / 60, 0, 0, 0);
                const gridEnd = new Date(dayStart);
                gridEnd.setHours(END / 60, 0, 0, 0);
                const bs = calendarBookings.filter(
                  (b) =>
                    b.roomId === room.id &&
                    active.includes(b.status) &&
                    new Date(b.startAt) < gridEnd && new Date(b.endAt) > gridStart,
                );
                const bos = blackouts.filter(
                  (b) =>
                    (b.roomIds.includes(room.id) ||
                      (b.scopeType === "building" && b.buildingId === room.buildingId) ||
                      (b.scopeType === "floor" && b.buildingId === room.buildingId && b.floor === room.floor)) &&
                    new Date(b.startAt) < gridEnd && new Date(b.endAt) > gridStart,
                );
                return (
                  <div
                    key={room.id}
                    className="grid min-h-24 border-b"
                    style={{
                      gridTemplateColumns:
                        "200px repeat(28, minmax(60px, 1fr))",
                    }}
                  >
                    <div className="sticky left-0 z-20 border-r bg-background p-4">
                      <b>{roomLabel(room)}</b>
                      <p className="text-xs text-slate-500">
                        • {room.capacity === null ? "Chưa cập nhật sức chứa" : `${room.capacity} người`}
                      </p>
                    </div>
                    <div
                      className="relative col-span-28 grid"
                      style={{
                        gridTemplateColumns: "repeat(28, minmax(60px, 1fr))",
                      }}
                    >
                      {slots.map((i) => (
                        <button
                          aria-label={`${room.name} slot ${i}`}
                          key={i}
                          disabled={!room.rentable}
                          onClick={() => slotClick(room, i)}
                          className="border-r hover:bg-blue-50 disabled:bg-slate-100"
                        />
                      ))}
                      {bs.map((b) => (
                        <Event
                          key={b.id}
                          booking={b}
                          admin={admin}
                          date={date}
                          open={() => setDetail(b)}
                        />
                      ))}
                      {bos.map((b) => {
                        const s = new Date(b.startAt),
                          e = new Date(b.endAt),
                          startMinute = (s.getTime() - dayStart.getTime()) / 60000,
                          endMinute = (e.getTime() - dayStart.getTime()) / 60000,
                          o = Math.max(0, startMinute - START),
                          d = Math.max(0, Math.min(END, endMinute) - Math.max(START, startMinute));
                        return (
                          <button
                            key={b.id}
                            onClick={() =>
                              toast.info(
                                `${b.reason}: ${b.note || "Không có ghi chú"}`,
                              )
                            }
                            className="absolute top-3 z-10 h-14 overflow-hidden text-ellipsis whitespace-nowrap rounded-md border bg-slate-700 px-2 text-left text-xs text-white"
                            style={{
                              left: `${(o / TOTAL) * 100}%`,
                              width: `${(d / TOTAL) * 100}%`,
                              backgroundImage:
                                "repeating-linear-gradient(135deg,rgba(255,255,255,.17) 0 6px,transparent 6px 12px)",
                            }}
                          >
                            <b className="block truncate">
                              <LockKeyhole className="mr-1 inline size-3" />
                              {b.reason}
                            </b>
                            <span className="block truncate">{b.note}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {draft && (
        <QuickBooking
          key={`${draft.room.id}-${draft.start}`}
          draft={draft}
          close={() => setDraft(null)}
        />
      )}
      {admin && blackout && (
        <Blackout
          key={buildingId}
          open={blackout}
          close={() => setBlackout(false)}
          buildingId={buildingId}
        />
      )}
      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detail?.hiddenDetails && !admin ? "Không khả dụng" : detail?.activityName}</DialogTitle>
            <DialogDescription>
              {detail?.hiddenDetails && !admin ? "Thông tin chi tiết được ẩn với tài khoản CLB." : `${detail?.id} · ${detail?.clubName}`}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="grid gap-2 rounded-lg border bg-slate-50 p-4 text-sm">
              <p>
                <b>Phòng:</b> {roomLabel(rooms.find((r) => r.id === detail.roomId) ?? ({ id: detail.roomId, buildingId: "", name: detail.roomId, capacity: 0, equipment: [], rentable: false, bufferMinutes: 15 } as Room))}
              </p>
              <p>
                <b>Thời gian:</b>{" "}
                {format(new Date(detail.startAt), "dd/MM/yyyy HH:mm")} -{" "}
                {clock(detail.endAt)}
              </p>
              {!detail.hiddenDetails && <p>
                <b>Trạng thái:</b> {detail.status}
              </p>}
              {!detail.hiddenDetails && (
                <p>
                  <b>Quy mô:</b> {detail.participants} người
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setDetail(null)}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
export default RoomCalendar;
