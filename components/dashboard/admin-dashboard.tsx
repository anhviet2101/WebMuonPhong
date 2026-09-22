"use client";
import { useMemo, useState } from "react";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  FileCheck2,
  FileWarning,
  MoreHorizontal,
  Plus,
  Printer,
  Search,
  Settings2,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DashboardHeader } from "@/components/shared/dashboard-header";
import {
  BookingStatusBadge,
  PhysicalStatusBadge,
} from "@/components/shared/status-badges";
import {
  usePrototypeStore,
  type Booking,
  type BookingStatus,
  type PhysicalStatus,
  type Room,
} from "@/components/shared/prototype-store";
import {
  exportScheduleDocx,
  printSchedule,
  type ScheduleRow,
} from "@/components/shared/document-export";
const fmt = (iso: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
function ActionDialog({
  action,
  close,
}: {
  action: { type: "revision" | "reject" | "room"; booking: Booking } | null;
  close: () => void;
}) {
  const store = usePrototypeStore();
  const [reason, setReason] = useState("");
  const [room, setRoom] = useState("");
  const alternatives = action
    ? store.rooms.filter(
        (r) =>
          r.id !== action.booking.roomId &&
          store.isRoomAvailable(
            r.id,
            action.booking.startAt,
            action.booking.endAt,
          ),
      )
    : [];
  const submit = () => {
    if (!action) return;
    if (action.type === "room") {
      if (!room) return toast.error("Chọn phòng thay thế");
      store.updateBooking(action.booking.id, {
        roomId: room,
        status: "room_changed",
        note: reason || "VP Đoàn điều chỉnh phòng",
      });
      toast.success("Đã đổi phòng và cập nhật Calendar");
    } else {
      if (!reason.trim()) return toast.error("Vui lòng nhập lý do");
      store.updateBooking(action.booking.id, {
        status: action.type === "revision" ? "needs_revision" : "rejected",
        note: reason,
      });
      toast.success(
        action.type === "revision" ? "Đã gửi yêu cầu sửa" : "Đã từ chối đơn",
      );
    }
    close();
  };
  return (
    <Dialog open={!!action} onOpenChange={(v) => !v && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {action?.type === "revision"
              ? "Yêu cầu CLB sửa"
              : action?.type === "reject"
                ? "Từ chối đơn"
                : "Đổi phòng"}
          </DialogTitle>
          <DialogDescription>
            {action?.booking.id} · {action?.booking.activityName}
          </DialogDescription>
        </DialogHeader>
        {action?.type === "room" && (
          <div className="grid gap-2">
            <Label>Phòng còn trống</Label>
            <Select value={room} onValueChange={setRoom}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Chọn phòng" />
              </SelectTrigger>
              <SelectContent>
                {alternatives.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name} · {r.capacity} người
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid gap-2">
          <Label>Lý do / ghi chú</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Hủy
          </Button>
          <Button
            variant={action?.type === "reject" ? "destructive" : "default"}
            onClick={submit}
          >
            Xác nhận
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function ExportDialog({ open, close }: { open: boolean; close: () => void }) {
  const store = usePrototypeStore();
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const [from, setFrom] = useState(monday.toISOString().slice(0, 10));
  const [to, setTo] = useState(sunday.toISOString().slice(0, 10));
  const rows = useMemo<ScheduleRow[]>(() => {
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T23:59:59`);
    return store.bookings
      .filter(
        (booking) =>
          ["approved", "room_changed"].includes(booking.status) &&
          new Date(booking.startAt) >= start &&
          new Date(booking.startAt) <= end,
      )
      .sort(
        (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
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
          campus: store.campuses.find((item) => item.id === building?.campusId),
        };
      });
  }, [from, to, store.bookings, store.rooms, store.buildings, store.campuses]);
  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Xem trước Đơn đề nghị - Mẫu B</DialogTitle>
          <DialogDescription>
            Tổng hợp lịch đã duyệt của tất cả CLB theo khoảng ngày.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 rounded-lg border bg-slate-50 p-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>Từ ngày</Label>
            <Input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Đến ngày</Label>
            <Input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
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
                    Không có lịch đã duyệt trong khoảng ngày này.
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
                    <TableCell>
                      <b>{row.booking.clubName}</b>
                      <p className="text-xs text-slate-500">
                        {row.booking.activityName}
                      </p>
                    </TableCell>
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
            onClick={() => printSchedule(rows)}
          >
            <Printer />
            In đơn
          </Button>
          <Button
            disabled={!rows.length}
            onClick={async () => {
              await exportScheduleDocx(rows, `Mau-B-${from}-${to}.docx`);
              toast.success("Đã tải Mẫu B tổng hợp");
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

function SupportDialog({ open, close }: { open: boolean; close: () => void }) {
  const store = usePrototypeStore();
  const [form, setForm] = useState(store.supportContact);
  const field = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const save = () => {
    if (Object.values(form).some((value) => !value.trim()))
      return toast.error("Vui lòng điền đầy đủ thông tin cán bộ trực");
    store.updateSupportContact(form);
    toast.success("Đã cập nhật đầu mối hỗ trợ hiển thị cho CLB");
    close();
  };
  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cấu hình cán bộ trực hỗ trợ</DialogTitle>
          <DialogDescription>
            Thông tin này được đồng bộ ngay sang Dashboard CLB.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>Họ và tên</Label>
            <Input
              value={form.name}
              onChange={(e) => field("name", e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Chức vụ</Label>
            <Input
              value={form.role}
              onChange={(e) => field("role", e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Số điện thoại</Label>
            <Input
              value={form.phone}
              onChange={(e) => field("phone", e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => field("email", e.target.value)}
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label>Ca trực</Label>
            <Input
              value={form.shift}
              onChange={(e) => field("shift", e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Hủy
          </Button>
          <Button onClick={save}>Lưu cấu hình</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function Facility() {
  const store = usePrototypeStore();
  const [building, setBuilding] = useState("km-a"),
    [edit, setEdit] = useState<Room | null>(null),
    [add, setAdd] = useState(false),
    [name, setName] = useState(""),
    [capacity, setCapacity] = useState("50");
  const save = () => {
    if (!name.trim()) return toast.error("Nhập tên phòng");
    if (edit) {
      store.updateRoom(edit.id, { name, capacity: Number(capacity) });
      toast.success("Đã cập nhật phòng");
    } else {
      store.addRoom({
        buildingId: building,
        name,
        capacity: Number(capacity),
        equipment: ["projector", "ac", "whiteboard"],
        rentable: true,
        bufferMinutes: 15,
      });
      toast.success("Đã thêm phòng mới");
    }
    setEdit(null);
    setAdd(false);
    setName("");
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <Select value={building} onValueChange={setBuilding}>
          <SelectTrigger className="w-full sm:w-72">
            <Building2 />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {store.buildings.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {store.campuses.find((c) => c.id === b.campusId)?.name} ·{" "}
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => setAdd(true)}>
          <Plus />
          Thêm phòng
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {store.rooms
          .filter((r) => r.buildingId === building)
          .map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex justify-between gap-2">
                  <div>
                    <b>{r.name}</b>
                    <p className="text-sm text-slate-500">
                      {r.capacity} người · Buffer {r.bufferMinutes} phút
                    </p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={r.rentable}
                    onClick={() => {
                      store.updateRoom(r.id, { rentable: !r.rentable });
                      toast.success(
                        `${r.name}: ${!r.rentable ? "đã bật cho mượn" : "đã tạm ngưng"}`,
                      );
                    }}
                    className={`h-6 w-11 rounded-full p-1 ${r.rentable ? "bg-emerald-500" : "bg-slate-300"}`}
                  >
                    <span
                      className={`block size-4 rounded-full bg-white transition-transform ${r.rentable ? "translate-x-5" : ""}`}
                    />
                  </button>
                </div>
                <Button
                  className="mt-4"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEdit(r);
                    setName(r.name);
                    setCapacity(String(r.capacity));
                  }}
                >
                  Sửa phòng
                </Button>
              </CardContent>
            </Card>
          ))}
      </div>
      <Dialog
        open={add || !!edit}
        onOpenChange={(v) => {
          if (!v) {
            setAdd(false);
            setEdit(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit ? "Sửa phòng" : "Thêm phòng"}</DialogTitle>
            <DialogDescription>
              Cập nhật danh mục phòng dùng chung cho Calendar và booking.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Tên phòng</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Sức chứa</Label>
              <Input
                type="number"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAdd(false);
                setEdit(null);
              }}
            >
              Hủy
            </Button>
            <Button onClick={save}>Lưu phòng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
export function AdminDashboard() {
  const store = usePrototypeStore();
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [physical, setPhysical] = useState("all"),
    [campus, setCampus] = useState("all"),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [action, setAction] = useState<{
      type: "revision" | "reject" | "room";
      booking: Booking;
    } | null>(null),
    [exporting, setExporting] = useState(false),
    [supportOpen, setSupportOpen] = useState(false);
  const filtered = useMemo(
    () =>
      store.bookings.filter((b) => {
        const room = store.rooms.find((r) => r.id === b.roomId),
          building = store.buildings.find((x) => x.id === room?.buildingId);
        return (
          `${b.id} ${b.clubName} ${b.activityName}`
            .toLowerCase()
            .includes(search.toLowerCase()) &&
          (status === "all" || b.status === status) &&
          (physical === "all" || b.physicalStatus === physical) &&
          (campus === "all" || building?.campusId === campus)
        );
      }),
    [store.bookings, store.rooms, search, status, physical, campus],
  );
  const metrics = [
    [
      "Đơn chờ xử lý",
      store.bookings.filter((b) =>
        ["pending_hold", "needs_revision"].includes(b.status),
      ).length,
      <Clock3 />,
    ],
    [
      "Chưa nhận bản giấy",
      store.bookings.filter((b) => b.physicalStatus === "not_submitted").length,
      <FileWarning />,
    ],
    [
      "Đã nhận & chờ duyệt",
      store.bookings.filter(
        (b) =>
          b.physicalStatus === "confirmed_received" &&
          b.status === "pending_hold",
      ).length,
      <FileCheck2 />,
    ],
    [
      "Đã duyệt",
      store.bookings.filter((b) =>
        ["approved", "room_changed"].includes(b.status),
      ).length,
      <CheckCircle2 />,
    ],
    [
      "7 ngày tới",
      store.bookings.filter(
        (b) =>
          new Date(b.startAt) < new Date(Date.now() + 7 * 86400000) &&
          new Date(b.startAt) > new Date(),
      ).length,
      <CalendarDays />,
    ],
  ];
  return (
    <main className="min-h-screen bg-slate-50">
      <DashboardHeader
        badge="VP"
        eyebrow="Admin - Văn phòng Đoàn"
        title="Dashboard xử lý mượn phòng CLB"
        subtitle="Đối soát bản giấy, duyệt đơn, quản lý phòng và blackout."
        userName="Cán bộ trực VP Đoàn"
        userRole="YU_ADMIN"
        userInitials="VP"
        notificationAudience="admin"
        primaryAction={
          <Button variant="outline" onClick={() => setSupportOpen(true)}>
            <Settings2 />
            Cán bộ trực hỗ trợ
          </Button>
        }
      />
      <div className="mx-auto max-w-[1500px] space-y-6 px-4 py-6 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {metrics.map(([label, value, icon]) => (
            <Card key={String(label)}>
              <CardContent className="flex justify-between p-5">
                <div>
                  <p className="text-sm text-slate-500">{label}</p>
                  <p className="text-3xl font-semibold">{value}</p>
                </div>
                <span className="text-blue-600">{icon}</span>
              </CardContent>
            </Card>
          ))}
        </div>
        <Tabs defaultValue="bookings">
          <TabsList>
            <TabsTrigger value="bookings">Danh sách đơn</TabsTrigger>
            <TabsTrigger value="facilities">Quản lý cơ sở & phòng</TabsTrigger>
          </TabsList>
          <TabsContent value="bookings" className="space-y-4">
            <Card>
              <CardContent className="grid gap-3 p-4 lg:grid-cols-4">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 size-4 text-slate-400" />
                  <Input
                    className="pl-9"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="CLB, hoạt động, mã đơn"
                  />
                </div>
                <Select value={campus} onValueChange={setCampus}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả cơ sở</SelectItem>
                    {store.campuses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả trạng thái</SelectItem>
                    {[
                      "pending_hold",
                      "needs_revision",
                      "approved",
                      "room_changed",
                      "rejected",
                      "cancelled",
                    ].map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={physical} onValueChange={setPhysical}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả bản cứng</SelectItem>
                    {["not_submitted", "submitted", "confirmed_received"].map(
                      (s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
            <div className="flex justify-end">
              <Button onClick={() => setExporting(true)}>
                <Download />
                Xuất Mẫu B theo thời gian
              </Button>
            </div>
            <Card>
              <CardContent className="overflow-x-auto p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <input
                          type="checkbox"
                          checked={
                            filtered.length > 0 &&
                            filtered.every((b) => selected.has(b.id))
                          }
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? new Set(filtered.map((b) => b.id))
                                : new Set(),
                            )
                          }
                        />
                      </TableHead>
                      <TableHead>Mã đơn / CLB</TableHead>
                      <TableHead>Hoạt động</TableHead>
                      <TableHead>Phòng / Thời gian</TableHead>
                      <TableHead>Bản cứng</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="py-12 text-center text-slate-500"
                        >
                          Không có đơn phù hợp bộ lọc
                        </TableCell>
                      </TableRow>
                    )}
                    {filtered.map((b) => {
                      const canProcess = [
                          "pending_hold",
                          "needs_revision",
                        ].includes(b.status),
                        canApprove =
                          canProcess &&
                          b.physicalStatus === "confirmed_received";
                      return (
                        <TableRow key={b.id}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selected.has(b.id)}
                              onChange={(e) =>
                                setSelected((current) => {
                                  const next = new Set(current);
                                  e.target.checked
                                    ? next.add(b.id)
                                    : next.delete(b.id);
                                  return next;
                                })
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <b>{b.id}</b>
                            <p className="text-xs text-slate-500">
                              {b.clubName}
                            </p>
                            <p className="mt-1 text-xs text-slate-600">
                              <b>{b.contactPerson}</b> ·{" "}
                              {b.contactRole || "Đại diện CLB"}
                            </p>
                            <p className="text-xs text-slate-500">
                              {b.contactPhone} · {b.contactEmail}
                            </p>
                          </TableCell>
                          <TableCell>
                            {b.activityName}
                            <p className="text-xs text-slate-500">
                              {b.participants} người
                            </p>
                          </TableCell>
                          <TableCell>
                            {store.rooms.find((r) => r.id === b.roomId)?.name}
                            <p className="text-xs text-slate-500">
                              {fmt(b.startAt)}
                            </p>
                          </TableCell>
                          <TableCell>
                            <PhysicalStatusBadge status={b.physicalStatus} />
                          </TableCell>
                          <TableCell>
                            <BookingStatusBadge status={b.status} />
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              {b.physicalStatus === "submitted" &&
                              canProcess ? (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    store.updateBooking(b.id, {
                                      physicalStatus: "confirmed_received",
                                    });
                                    toast.success("Đã xác nhận nhận bản cứng");
                                  }}
                                >
                                  Nhận bản cứng
                                </Button>
                              ) : (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span>
                                        <Button
                                          size="sm"
                                          disabled={!canApprove}
                                          onClick={() => {
                                            store.updateBooking(b.id, {
                                              status: "approved",
                                            });
                                            toast.success(
                                              "Đã duyệt đơn; Calendar chuyển màu xanh",
                                            );
                                          }}
                                        >
                                          Duyệt
                                        </Button>
                                      </span>
                                    </TooltipTrigger>
                                    {!canApprove && (
                                      <TooltipContent>
                                        Cần xác nhận nhận bản cứng trước khi
                                        duyệt
                                      </TooltipContent>
                                    )}
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="icon-sm" variant="outline">
                                    <MoreHorizontal />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    disabled={!canProcess}
                                    onClick={() =>
                                      setAction({
                                        type: "revision",
                                        booking: b,
                                      })
                                    }
                                  >
                                    Yêu cầu sửa
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      setAction({ type: "room", booking: b })
                                    }
                                  >
                                    Đổi phòng
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    variant="destructive"
                                    disabled={!canProcess}
                                    onClick={() =>
                                      setAction({ type: "reject", booking: b })
                                    }
                                  >
                                    Từ chối
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
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
          <TabsContent value="facilities">
            <Facility />
          </TabsContent>
        </Tabs>
      </div>
      {action && (
        <ActionDialog
          key={`${action.type}-${action.booking.id}`}
          action={action}
          close={() => setAction(null)}
        />
      )}
      {exporting && (
        <ExportDialog open={exporting} close={() => setExporting(false)} />
      )}
      {supportOpen && (
        <SupportDialog open={supportOpen} close={() => setSupportOpen(false)} />
      )}
    </main>
  );
}
export default AdminDashboard;
