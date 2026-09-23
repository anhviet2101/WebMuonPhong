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
  UploadCloud,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  BookingStatusBadge,
  PhysicalStatusBadge,
} from "@/components/shared/status-badges";
import {
  toLocalInput,
  usePrototypeStore,
  type Booking,
  type Equipment,
} from "@/components/shared/prototype-store";
import {
  exportScheduleDocx,
  printSchedule,
  type ScheduleRow,
} from "@/components/shared/document-export";
import { useAuth } from "@/components/auth/auth-context";
import { api, endpoints } from "@/lib/api";

const equipment: { id: Equipment; label: string }[] = [
  { id: "projector", label: "Máy chiếu" },
  { id: "microphone", label: "Micro" },
  { id: "ac", label: "Điều hòa" },
  { id: "whiteboard", label: "Bảng" },
  { id: "sound", label: "Âm thanh" },
];
const fmt = (iso: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
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
function BookingWizard({
  open,
  close,
  editing,
}: {
  open: boolean;
  close: () => void;
  editing: Booking | null;
}) {
  const store = usePrototypeStore();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
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
  const [selected, setSelected] = useState<Equipment[]>(
    editing?.equipment ?? [],
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
  const validTime = start && end && new Date(end) > new Date(start);
  const loadAvailableRoomIds = async () => {
    const { data } = await api.get(endpoints.availableRooms, {
      params: {
        start_time: new Date(start).toISOString(),
        end_time: new Date(end).toISOString(),
        building_id: building,
        exclude_booking: editing?.id,
      },
    });
    return (data.results ?? data).map((item: { id: number | string }) =>
      String(item.id),
    );
  };
  useEffect(() => {
    if (!validTime || !building) {
      setRemoteAvailableIds(null);
      return;
    }
    let cancelled = false;
    setLoadingRooms(true);
    loadAvailableRoomIds()
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
      });
    return () => {
      cancelled = true;
    };
  }, [backup, building, editing?.id, end, room, start, validTime]);
  const resetBuilding = (value: string) => {
    setCampus(value);
    const first = store.buildings.find((b) => b.campusId === value);
    setBuilding(first?.id ?? "");
    setRoom("");
    setBackup("none");
  };
  const submit = async () => {
    if (!name.trim() || !room)
      return toast.error("Vui lòng điền tên hoạt động và chọn phòng");
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
        setStep(2);
        return toast.error(
          "Phòng đã có đơn khác giữ trong khung giờ này. Vui lòng chọn phòng khác.",
        );
      }
    } catch {
      setStep(2);
      return toast.error(
        "Không thể kiểm tra phòng khả dụng. Vui lòng thử lại trước khi gửi đơn.",
      );
    }
    if (
      !contactPerson.trim() ||
      !contactPhone.trim() ||
      !contactEmail.trim()
    )
      return toast.error("Vui lòng điền đầy đủ thông tin người đại diện");
    if (!/^\S+@\S+\.\S+$/.test(contactEmail))
      return toast.error("Email người đại diện chưa hợp lệ");
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
      equipment: selected,
    };
    try {
      if (editing) {
        await store.updateBooking(editing.id, data);
        if (editing.status === "needs_revision" || editing.status === "draft") {
          await store.updateBooking(editing.id, { status: "pending_hold" });
        }
        toast.success("Đã cập nhật đơn");
      } else {
        const b = await store.addBooking(data);
        toast.success(`${b.id} đã được giữ chỗ trong 48 giờ`);
      }
      close();
    } catch {
      // The store reports the API error and keeps the form open for correction.
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
            Bước {step}/3 · Buffer 15 phút được tính khi lọc phòng.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          {["Thời gian", "Phòng", "Hoạt động"].map((x, i) => (
            <Badge key={x} variant={step === i + 1 ? "default" : "outline"}>
              {i + 1}. {x}
            </Badge>
          ))}
        </div>
        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Bắt đầu</Label>
              <Input
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Kết thúc</Label>
              <Input
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
            {!validTime && (
              <p className="text-sm text-red-600 sm:col-span-2">
                Giờ kết thúc phải sau giờ bắt đầu.
              </p>
            )}
          </div>
        )}
        {step === 2 && (
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
            </div>
            <div className="grid gap-2">
              <Label>Tòa nhà</Label>
              <Select
                value={building}
                onValueChange={(v) => {
                  setBuilding(v);
                  setRoom("");
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
            </div>
            <div className="grid gap-2">
              <Label>Phòng chính</Label>
              <Select value={room} onValueChange={setRoom}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Chọn phòng trống" />
                </SelectTrigger>
                <SelectContent>
                  {loadingRooms && (
                    <SelectItem value="loading" disabled>
                      Đang kiểm tra phòng trống...
                    </SelectItem>
                  )}
                  {!loadingRooms && available.length === 0 && (
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
            {!loadingRooms && available.length === 0 && (
              <p className="text-sm text-amber-700 sm:col-span-2">
                Không có phòng khả dụng trong khung giờ đã chọn. Vui lòng đổi
                thời gian hoặc tòa nhà.
              </p>
            )}
          </div>
        )}
        {step === 3 && (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Tên hoạt động</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Mô tả</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Số người</Label>
              <Input
                type="number"
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
            </div>
            <div className="grid gap-4 rounded-lg border bg-slate-50 p-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Họ và tên người đại diện *</Label>
                <Input
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Số điện thoại / Zalo *</Label>
                <Input
                  inputMode="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Thiết bị</Label>
              <div className="flex flex-wrap gap-2">
                {equipment.map((e) => (
                  <label
                    key={e.id}
                    className="flex items-center gap-2 rounded-md border p-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(e.id)}
                      onChange={() =>
                        setSelected((v) =>
                          v.includes(e.id)
                            ? v.filter((x) => x !== e.id)
                            : [...v, e.id],
                        )
                      }
                    />
                    {e.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Đóng
          </Button>
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
              Quay lại
            </Button>
          )}
          {step < 3 ? (
            <Button
              disabled={step === 1 ? !validTime : !room}
              onClick={() => setStep((s) => s + 1)}
            >
              Tiếp tục
            </Button>
          ) : (
            <Button onClick={submit}>Gửi đơn</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function Upload({
  booking,
  close,
}: {
  booking: Booking | null;
  close: () => void;
}) {
  const { uploadScan } = usePrototypeStore();
  const [file, setFile] = useState<File | null>(null);
  const submit = async () => {
    if (!booking || !file) return toast.error("Chọn file JPG, PNG hoặc PDF");
    if (file.size > 10 * 1024 * 1024) return toast.error("File vượt quá 10MB");
    await uploadScan(booking.id, file);
    toast.success("Đã upload scan và cập nhật trạng thái");
    close();
  };
  return (
    <Dialog open={!!booking} onOpenChange={(v) => !v && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload scan</DialogTitle>
          <DialogDescription>JPG, PNG hoặc PDF; tối đa 10MB.</DialogDescription>
        </DialogHeader>
        <label className="grid cursor-pointer place-items-center gap-2 rounded-lg border-2 border-dashed p-10">
          <UploadCloud />
          <span>{file?.name ?? "Chọn file từ máy"}</span>
          <Input
            className="sr-only"
            type="file"
            accept=".jpg,.jpeg,.png,.pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Hủy
          </Button>
          <Button onClick={submit}>Xác nhận upload</Button>
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
  const equipmentLabels = booking?.equipment
    .map((item) => equipment.find((option) => option.id === item)?.label ?? item)
    .join(", ");

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
                  {room?.name ?? booking.roomId}
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
              <div>
                <p className="text-xs font-medium uppercase text-slate-500">Thiết bị</p>
                <p className="mt-1 text-slate-700">{equipmentLabels || "Không yêu cầu"}</p>
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

function weekBounds(value: string) {
  const selected = new Date(`${value}T00:00:00`);
  const mondayOffset = (selected.getDay() + 6) % 7;
  const from = new Date(selected);
  from.setDate(selected.getDate() - mondayOffset);
  const to = new Date(from);
  to.setDate(from.getDate() + 6);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

const localDateValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function MauAPreview({ open, close }: { open: boolean; close: () => void }) {
  const store = usePrototypeStore();
  const template = store.documentTemplates.find((item) => item.templateType === "mau_a")?.content;
  const [weekDate, setWeekDate] = useState(
    localDateValue(new Date()),
  );
  const { from, to } = weekBounds(weekDate);
  const rows = useMemo<ScheduleRow[]>(
    () =>
      store.bookings
        .filter(
          (booking) =>
            ["approved", "room_changed"].includes(booking.status) &&
            new Date(booking.startAt) >= from &&
            new Date(booking.startAt) <= to,
        )
        .sort(
          (a, b) =>
            new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
        )
        .map((booking) => {
          const room = store.rooms.find((item) => item.id === booking.roomId);
          const building = store.buildings.find(
            (item) => item.id === room?.buildingId,
          );
          return {
            booking,
            room,
            building,
            campus: store.campuses.find(
              (item) => item.id === building?.campusId,
            ),
          };
        }),
    [store.bookings, store.rooms, store.buildings, store.campuses, from, to],
  );
  const formatDate = (date: Date) =>
    date.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Xem trước Đơn đề nghị - Mẫu A</DialogTitle>
          <DialogDescription>
            Chỉ tổng hợp lịch đã duyệt của CLB từ Thứ Hai đến Chủ Nhật.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 rounded-lg border bg-slate-50 p-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid gap-2">
            <Label>Chọn một ngày trong tuần</Label>
            <Input
              type="date"
              value={weekDate}
              onChange={(event) => setWeekDate(event.target.value)}
            />
          </div>
          <p className="text-sm text-slate-600">
            Tuần {formatDate(from)} - {formatDate(to)} · {rows.length} lịch
          </p>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>STT</TableHead>
                <TableHead>Thời gian</TableHead>
                <TableHead>Địa điểm</TableHead>
                <TableHead>Đơn vị</TableHead>
                <TableHead>Ghi chú</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-10 text-center text-slate-500"
                  >
                    Tuần này chưa có lịch đã được duyệt.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, index) => (
                  <TableRow key={row.booking.id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>
                      {fmt(row.booking.startAt)} -{" "}
                      {new Date(row.booking.endAt).toLocaleTimeString("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell>
                      {row.room?.name} - {row.building?.name}
                    </TableCell>
                    <TableCell>{row.booking.clubName}</TableCell>
                    <TableCell>{row.booking.note || ""}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Đóng
          </Button>
          <Button
            variant="outline"
            disabled={!rows.length}
            onClick={() => printSchedule(rows, template, { redDynamicText: true })}
          >
            <Printer />
            In đơn
          </Button>
          <Button
            disabled={!rows.length}
            onClick={async () => {
              await exportScheduleDocx(rows, `Mau-A-${weekDate}.docx`, template, { redDynamicText: true });
              toast.success("Đã tạo Mẫu A theo đúng lịch tuần được chọn");
            }}
          >
            <Download />
            Tải DOCX
          </Button>
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
  const processing = mine.filter((b) =>
    ["draft", "pending_hold", "needs_revision"].includes(b.status),
  );
  const upcoming = mine.filter(
    (b) =>
      ["approved", "room_changed"].includes(b.status) &&
      new Date(b.startAt) > new Date(),
  );
  const history = mine.filter((b) =>
    ["completed", "rejected", "cancelled", "expired"].includes(b.status),
  );
  const [wizard, setWizard] = useState(false),
    [editing, setEditing] = useState<Booking | null>(null),
    [upload, setUpload] = useState<Booking | null>(null),
    [cancel, setCancel] = useState<Booking | null>(null),
    [detail, setDetail] = useState<Booking | null>(null),
    [mauAOpen, setMauAOpen] = useState(false);
  const roomName = (id: string) =>
    store.rooms.find((r) => r.id === id)?.name ?? id;
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
          <Button onClick={() => setWizard(true)}>
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
              processing.filter((b) => b.physicalStatus === "not_submitted")
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
            <Button
              variant="outline"
              className="bg-white"
              onClick={() => setMauAOpen(true)}
            >
              <FileText />
              Xuất Mẫu A theo tuần
            </Button>
          </CardContent>
        </Card>
        <Tabs defaultValue="processing">
          <TabsList>
            <TabsTrigger value="processing">Đơn đang xử lý</TabsTrigger>
            <TabsTrigger value="upcoming">Lịch sắp tới</TabsTrigger>
            <TabsTrigger value="history">Lịch sử</TabsTrigger>
          </TabsList>
          {[
            ["processing", processing],
            ["upcoming", upcoming],
            ["history", history],
          ].map(([tab, list]) => (
            <TabsContent key={String(tab)} value={String(tab)}>
              <Card>
                <CardHeader>
                  <CardTitle>
                    {tab === "processing"
                      ? "Đơn đang xử lý"
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
                          b.physicalStatus !== "confirmed_received";
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
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setMauAOpen(true)}
                              >
                                <Download />
                                Mẫu A
                              </Button>
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
                                    <DropdownMenuItem
                                      onClick={() => setUpload(b)}
                                    >
                                      <UploadCloud />
                                      Upload scan
                                    </DropdownMenuItem>
                                    {canEdit && (
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setEditing(b);
                                          setWizard(true);
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
      {wizard && (
        <BookingWizard
          key={editing?.id ?? "new"}
          open={wizard}
          editing={editing}
          close={() => {
            setWizard(false);
            setEditing(null);
          }}
        />
      )}
      {upload && (
        <Upload
          key={upload.id}
          booking={upload}
          close={() => setUpload(null)}
        />
      )}
      {mauAOpen && (
        <MauAPreview open={mauAOpen} close={() => setMauAOpen(false)} />
      )}
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
