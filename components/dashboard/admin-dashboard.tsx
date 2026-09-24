"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  FileCheck2,
  FileWarning,
  MoreHorizontal,
  Plus,
  Printer,
  Search,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { api, endpoints } from "@/lib/api";
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
  type Building,
  type Campus,
  defaultDocumentTemplateContent,
  type DocumentTemplateContent,
  type Room,
} from "@/components/shared/prototype-store";
import {
  exportScheduleDocx,
  printSchedule,
  scheduleRowDisplay,
  type ScheduleRow,
} from "@/components/shared/document-export";
import { DocumentDateField } from "@/components/shared/document-date-field";
const fmt = (iso: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
const dateKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
function ActionDialog({
  action,
  close,
}: {
  action: { type: "revision" | "reject" | "room" | "cancel"; booking: Booking } | null;
  close: () => void;
}) {
  const store = usePrototypeStore();
  const [reason, setReason] = useState("");
  const [room, setRoom] = useState("");
  const currentRoom = store.rooms.find((item) => item.id === action?.booking.roomId);
  const currentBuilding = store.buildings.find((item) => item.id === currentRoom?.buildingId);
  const [targetCampus, setTargetCampus] = useState(currentBuilding?.campusId ?? store.campuses[0]?.id ?? "");
  const [targetBuilding, setTargetBuilding] = useState(currentRoom?.buildingId ?? "");
  const [availableRoomIds, setAvailableRoomIds] = useState<string[] | null>(null);
  const [loadingRooms, setLoadingRooms] = useState(false);
  useEffect(() => {
    if (action?.type !== "room") return;
    let cancelled = false;
    setRoom("");
    setAvailableRoomIds(null);
    setLoadingRooms(true);
    api.get(endpoints.availableRooms, {
      params: {
        start_time: action.booking.startAt,
        end_time: action.booking.endAt,
        exclude_booking: action.booking.id,
        participant_count: action.booking.participants,
      },
    }).then(({ data }) => {
      if (!cancelled) setAvailableRoomIds(
        (data.results ?? data).map((item: { id: number | string }) => String(item.id)),
      );
    }).catch(() => {
      if (!cancelled) {
        setAvailableRoomIds([]);
        toast.error("Không thể tải danh sách phòng khả dụng");
      }
    }).finally(() => {
      if (!cancelled) setLoadingRooms(false);
    });
    return () => { cancelled = true; };
  }, [action?.type, action?.booking.id, action?.booking.startAt, action?.booking.endAt]);
  const alternatives = action?.type === "room" && availableRoomIds
    ? store.rooms.filter(
        (r) =>
          r.id !== action.booking.roomId &&
          r.buildingId === targetBuilding &&
          availableRoomIds.includes(r.id),
      )
    : [];
  const submit = async () => {
    if (!action) return;
    if (action.type === "room") {
      if (!room) return toast.error("Chọn phòng thay thế");
      try {
        const { data } = await api.get(endpoints.availableRooms, {
          params: {
            start_time: action.booking.startAt,
            end_time: action.booking.endAt,
            exclude_booking: action.booking.id,
            participant_count: action.booking.participants,
          },
        });
        const freshIds = (data.results ?? data).map((item: { id: number | string }) => String(item.id));
        setAvailableRoomIds(freshIds);
        if (!freshIds.includes(room)) {
          setRoom("");
          return toast.error("Phòng vừa được giữ chỗ. Vui lòng chọn phòng khác.");
        }
      } catch {
        return toast.error("Không thể kiểm tra phòng khả dụng. Vui lòng thử lại.");
      }
      await store.updateBooking(action.booking.id, {
        roomId: room,
        status: "room_changed",
        note: reason || "VP Đoàn điều chỉnh phòng",
      });
      toast.success("Đã đổi phòng và cập nhật Calendar");
    } else if (action.type === "cancel") {
      if (!reason.trim()) return toast.error("Vui lòng nhập lý do hủy");
      await store.cancelBooking(action.booking.id, reason);
      toast.success("Đã hủy đơn và giải phóng phòng");
    } else {
      if (!reason.trim()) return toast.error("Vui lòng nhập lý do");
      await store.updateBooking(action.booking.id, {
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
                : action?.type === "cancel"
                  ? "Hủy đơn"
                  : "Đổi phòng"}
          </DialogTitle>
          <DialogDescription>
            {action?.booking.id} · {action?.booking.activityName}
          </DialogDescription>
        </DialogHeader>
        {action?.type === "room" && (
          <div className="grid gap-2">
            <Label>Cơ sở</Label>
            <Select value={targetCampus} onValueChange={(value) => { setTargetCampus(value); setTargetBuilding(""); setRoom(""); }}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Chọn cơ sở" /></SelectTrigger>
              <SelectContent>{store.campuses.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
            </Select>
            <Label>Tòa nhà</Label>
            <Select value={targetBuilding} onValueChange={(value) => { setTargetBuilding(value); setRoom(""); }}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Chọn tòa nhà" /></SelectTrigger>
              <SelectContent>{store.buildings.filter((item) => item.campusId === targetCampus).map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
            </Select>
            <Label>Phòng còn trống</Label>
            <p className="text-xs text-slate-500">
              {loadingRooms ? "Đang kiểm tra phòng..." : alternatives.length === 0 ? "Không có phòng khả dụng trong khung giờ này." : `${alternatives.length} phòng khả dụng`}
            </p>
            <Select value={room} onValueChange={setRoom}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Chọn phòng" />
              </SelectTrigger>
              <SelectContent>
                {alternatives.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name} · {r.capacity === null ? "Chưa cập nhật sức chứa" : `${r.capacity} người`}
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
            className={action?.type === "cancel" ? "bg-red-600 hover:bg-red-700" : undefined}
            onClick={submit}
            disabled={action?.type === "room" && (loadingRooms || !room || !availableRoomIds?.includes(room))}
          >
            Xác nhận
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function ExportDialog({ open, close, openClubProfile }: { open: boolean; close: () => void; openClubProfile: (booking: Booking) => void }) {
  const store = usePrototypeStore();
  const template = store.documentTemplates.find((item) => item.templateType === "mau_b")?.content;
  const [draftTemplate, setDraftTemplate] = useState<DocumentTemplateContent>({ ...defaultDocumentTemplateContent, ...(template ?? {}) });
  const [issueDate, setIssueDate] = useState(() => {
    const date = new Date();
    return `Hà Nội, ngày ${date.getDate()} tháng ${date.getMonth() + 1} năm ${date.getFullYear()}`;
  });
  const [rowEdits, setRowEdits] = useState<Record<string, Partial<ReturnType<typeof scheduleRowDisplay>>>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  useEffect(() => { setDraftTemplate({ ...defaultDocumentTemplateContent, ...(template ?? {}) }); }, [template]);
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const localDateValue = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const [from, setFrom] = useState(localDateValue(monday));
  const [to, setTo] = useState(localDateValue(sunday));
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
  useEffect(() => { setSelectedIds(rows.map((row) => row.booking.id)); }, [rows]);
  const displayRows = rows.map((row) => ({
    ...row,
    display: { ...scheduleRowDisplay(row), ...(rowEdits[row.booking.id] ?? {}) },
  }));
  const selectedRows = displayRows.filter((row) => selectedIds.includes(row.booking.id));
  const editRow = (id: string, key: keyof ReturnType<typeof scheduleRowDisplay>, value: string) =>
    setRowEdits((current) => ({ ...current, [id]: { ...(current[id] ?? {}), [key]: value } }));
  const editTemplate = (key: keyof DocumentTemplateContent, value: string) =>
    setDraftTemplate((current) => ({ ...current, [key]: value }));
  const templateField = (key: keyof DocumentTemplateContent, label: string, rows = 2) => (
    <label className="grid gap-1 text-sm"><span className="font-semibold">{label}</span>
      <textarea className="rounded-md border bg-white p-2 font-serif text-black" rows={rows} value={draftTemplate[key]} onChange={(event) => editTemplate(key, event.target.value)} />
    </label>
  );
  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Xem trước Đơn đề nghị - Mẫu B</DialogTitle>
          <DialogDescription>
            Tổng hợp lịch đã duyệt. Admin có thể sửa nội dung và từng dòng riêng cho lần xuất này.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 rounded-lg border bg-slate-50 p-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>Từ ngày</Label>
            <DocumentDateField label="Từ ngày xuất Mẫu B" value={from} onChange={setFrom} />
          </div>
          <div className="grid gap-2">
            <Label>Đến ngày</Label>
            <DocumentDateField label="Đến ngày xuất Mẫu B" value={to} onChange={setTo} />
          </div>
        </div>
        <div className="grid gap-3 rounded-lg border bg-white p-4 sm:grid-cols-2">
          {templateField("leftHeader", "Header trái", 3)}
          <div className="grid gap-2">{templateField("rightHeader", "Header phải", 1)}
            <label className="grid gap-1 text-sm"><span className="font-semibold">Ngày lập đơn</span><Input className="font-serif" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} /></label>
          </div>
          {templateField("title", "Tiêu đề", 1)}
          {templateField("recipient", "Kính gửi", 1)}
          <div className="sm:col-span-2">{templateField("intro", "Đoạn mở đầu", 4)}</div>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead><input type="checkbox" aria-label="Chọn tất cả lịch" checked={rows.length > 0 && selectedIds.length === rows.length} onChange={(event) => setSelectedIds(event.target.checked ? rows.map((row) => row.booking.id) : [])} /></TableHead>
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
                    colSpan={6}
                    className="py-10 text-center text-slate-500"
                  >
                    Không có lịch đã duyệt trong khoảng ngày này.
                  </TableCell>
                </TableRow>
              ) : (
                displayRows.map((row, index) => (
                  <TableRow key={row.booking.id}>
                    <TableCell><input type="checkbox" aria-label={`Chọn lịch ${row.booking.id}`} checked={selectedIds.includes(row.booking.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, row.booking.id] : current.filter((id) => id !== row.booking.id))} /></TableCell>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell><textarea className="min-w-40 rounded border p-2 font-serif" rows={3} value={row.display.time} onChange={(event) => editRow(row.booking.id, "time", event.target.value)} /></TableCell>
                    <TableCell><textarea className="min-w-32 rounded border p-2 font-serif" rows={3} value={row.display.location} onChange={(event) => editRow(row.booking.id, "location", event.target.value)} /></TableCell>
                    <TableCell>
                      <Input className="min-w-40 font-serif" value={row.display.organization} onChange={(event) => editRow(row.booking.id, "organization", event.target.value)} />
                      <button className="mt-1 text-xs text-blue-700 hover:underline" onClick={() => openClubProfile(row.booking)}>Xem hồ sơ CLB</button>
                    </TableCell>
                    <TableCell><Input className="min-w-28 font-serif" value={row.display.note} onChange={(event) => editRow(row.booking.id, "note", event.target.value)} /></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="grid gap-3 rounded-lg border bg-white p-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{templateField("commitment", "Cam kết", 3)}</div>
          <div className="sm:col-span-2">{templateField("closing", "Lời kết", 2)}</div>
          {templateField("leftSignature", "Chữ ký trái", 3)}
          {templateField("rightSignature", "Chữ ký phải", 3)}
          {templateField("rightSignerName", "Họ tên người ký bên phải", 1)}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Đóng
          </Button>
          <Button
            variant="outline"
            disabled={!selectedRows.length}
            onClick={() => { if (!printSchedule(selectedRows, draftTemplate, { issueDate })) toast.error("Trình duyệt đã chặn cửa sổ in. Vui lòng cho phép popup cho trang này."); }}
          >
            <Printer />
            In đơn
          </Button>
          <Button
            disabled={!selectedRows.length}
            onClick={async () => {
              await exportScheduleDocx(selectedRows, `Mau-B-${from}-${to}.docx`, draftTemplate, { issueDate });
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
  const save = async () => {
    if (Object.values(form).some((value) => !value.trim()))
      return toast.error("Vui lòng điền đầy đủ thông tin cán bộ trực");
    try {
      await store.updateSupportContact(form);
    } catch {
      return;
    }
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

function TemplateDialog({ open, close }: { open: boolean; close: () => void }) {
  const store = usePrototypeStore();
  const current = store.documentTemplates.find((item) => item.templateType === "mau_b");
  const [form, setForm] = useState<DocumentTemplateContent>({
    ...defaultDocumentTemplateContent,
    ...(current?.content ?? {}),
  });

  const field = (key: keyof DocumentTemplateContent, value: string) =>
    setForm((state) => ({ ...state, [key]: value }));
  const save = async () => {
    await store.updateDocumentTemplate("mau_b", {
      name: "Mẫu B",
      content: form,
      active: true,
    });
    toast.success("Đã cập nhật mẫu đơn");
    close();
  };
  const input = (key: keyof DocumentTemplateContent, label: string, rows = 2) => (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <textarea
        className="min-h-20 rounded-md border bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        rows={rows}
        value={form[key]}
        onChange={(event) => field(key, event.target.value)}
      />
    </div>
  );
  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Quản lý Mẫu B mặc định</DialogTitle>
          <DialogDescription>
            Nội dung lưu trong cơ sở dữ liệu và áp dụng cho lần xuất đơn tiếp theo.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {input("leftHeader", "Header trái", 3)}
          {input("rightHeader", "Header phải", 3)}
          {input("title", "Tiêu đề", 1)}
          {input("recipient", "Kính gửi", 1)}
          <div className="sm:col-span-2">{input("intro", "Đoạn mở đầu", 4)}</div>
          <div className="sm:col-span-2">{input("commitment", "Cam kết", 3)}</div>
          <div className="sm:col-span-2">{input("closing", "Lời kết", 2)}</div>
          {input("leftSignature", "Chữ ký trái", 3)}
          {input("rightSignature", "Chữ ký phải", 3)}
          {input("rightSignerName", "Họ tên người ký bên phải", 1)}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Hủy
          </Button>
          <Button onClick={save}>Lưu mẫu</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClubProfileDialog({ booking, close }: { booking: Booking | null; close: () => void }) {
  const profile = booking?.organizationProfile;
  return (
    <Dialog open={!!booking} onOpenChange={(value) => !value && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{profile?.name ?? booking?.clubName ?? "Hồ sơ CLB"}</DialogTitle>
          <DialogDescription>Thông tin liên hệ dùng khi VP Đoàn cần đối soát đơn.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 rounded-md border bg-slate-50 p-4 text-sm">
          <p><b>Tên CLB:</b> {profile?.name ?? booking?.clubName}</p>
          <p><b>Fanpage:</b> {profile?.fanpage_url ? <a className="text-blue-700 underline" href={profile.fanpage_url} target="_blank" rel="noreferrer">{profile.fanpage_url}</a> : "Chưa cập nhật"}</p>
          <p><b>Người phụ trách:</b> {profile?.representative_name ?? booking?.contactPerson ?? "Chưa cập nhật"}</p>
          <p><b>Hotline:</b> {profile?.hotline ?? booking?.contactPhone ?? "Chưa cập nhật"}</p>
          <p><b>Email liên hệ:</b> {profile?.contact_email ?? booking?.contactEmail ?? "Chưa cập nhật"}</p>
        </div>
        <DialogFooter>
          <Button onClick={close}>Đóng</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Facility() {
  const store = usePrototypeStore();
  const [showArchived, setShowArchived] = useState(false);
  const [campusId, setCampusId] = useState(store.campuses[0]?.id ?? "");
  const campusBuildings = store.buildings.filter((item) => item.campusId === campusId);
  const [buildingId, setBuildingId] = useState(campusBuildings[0]?.id ?? "");
  const visibleRooms = store.rooms.filter((item) => item.buildingId === buildingId);
  const [campusForm, setCampusForm] = useState<Campus | null>(null);
  const [buildingForm, setBuildingForm] = useState<Building | null>(null);
  const [roomForm, setRoomForm] = useState<Room | null>(null);
  const [roomCampusId, setRoomCampusId] = useState(campusId);
  useEffect(() => {
    if (!store.campuses.some((item) => item.id === campusId)) {
      setCampusId(store.campuses[0]?.id ?? "");
    }
  }, [campusId, store.campuses]);
  useEffect(() => {
    if (campusId && !campusBuildings.some((item) => item.id === buildingId)) {
      setBuildingId(campusBuildings[0]?.id ?? "");
    }
  }, [buildingId, campusBuildings, campusId]);

  const toggle = (enabled: boolean) => enabled ? "Đang hiển thị" : "Đã ẩn";
  const openNewCampus = () => setCampusForm({ id: "", code: "", name: "", address: "", active: true });
  const openNewBuilding = () => setBuildingForm({ id: "", campusId, code: "", name: "", active: true });
  const openNewRoom = () => { setRoomCampusId(campusId); setRoomForm({ id: "", buildingId, name: "", capacity: 50, equipment: [], rentable: true, bufferMinutes: 15, active: true }); };
  const archive = async (kind: "campus" | "building" | "room", id: string, name: string) => {
    const label = kind === "campus" ? "cơ sở" : kind === "building" ? "tòa nhà" : "phòng";
    if (!window.confirm(`Xóa ${label} "${name}"? Đơn cũ vẫn được giữ. Các địa điểm bên dưới sẽ tạm ẩn.`)) return;
    try {
      if (kind === "campus") await store.archiveCampus(id);
      else if (kind === "building") await store.archiveBuilding(id);
      else await store.archiveRoom(id);
      toast.success(`Đã xóa ${label}`);
    } catch { /* Lỗi đã hiển thị trong store. */ }
  };
  const restore = async (kind: "campus" | "building" | "room", id: string) => {
    try {
      if (kind === "campus") await store.restoreCampus(id);
      else if (kind === "building") await store.restoreBuilding(id);
      else await store.restoreRoom(id);
      toast.success("Đã khôi phục địa điểm");
    } catch { /* Lỗi đã hiển thị trong store. */ }
  };

  const saveCampus = async () => {
    if (!campusForm?.name.trim() || !campusForm.code.trim()) return toast.error("Nhập tên và mã cơ sở");
    if (campusForm.id) await store.updateCampus(campusForm.id, campusForm);
    else await store.addCampus(campusForm);
    toast.success("Đã lưu cơ sở");
    setCampusForm(null);
  };
  const saveBuilding = async () => {
    if (!buildingForm?.name.trim() || !buildingForm.campusId) return toast.error("Nhập tên tòa và chọn cơ sở");
    if (buildingForm.id) await store.updateBuilding(buildingForm.id, buildingForm);
    else await store.addBuilding(buildingForm);
    toast.success("Đã lưu tòa nhà");
    setBuildingForm(null);
  };
  const saveRoom = async () => {
    if (!roomForm?.name.trim() || !roomForm.buildingId) return toast.error("Nhập tên phòng và chọn tòa");
    if (roomForm.id) await store.updateRoom(roomForm.id, roomForm);
    else await store.addRoom(roomForm);
    toast.success("Đã lưu phòng");
    setRoomForm(null);
  };

  return (
    <div className="space-y-4">
    <div className="flex justify-end"><Button variant="outline" onClick={() => setShowArchived((value) => !value)}>{showArchived ? "Xem đang dùng" : "Xem đã xóa"}</Button></div>
    <div className="grid gap-4 xl:grid-cols-3">
      <Card>
        <CardHeader><CardTitle>Cơ sở / Giảng đường</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {!showArchived && <Button onClick={openNewCampus}><Plus />Thêm cơ sở</Button>}
          {(showArchived ? store.archivedCampuses : store.campuses).map((item) => (
            <div key={item.id} className={`rounded-md border p-3 ${!showArchived && campusId === item.id ? "border-blue-500 bg-blue-50" : "bg-white"}`}>
              <button className="w-full text-left" onClick={() => !showArchived && setCampusId(item.id)}><b>{item.code} · {item.name}</b><p className="text-xs text-slate-500">{showArchived ? "Đã xóa" : toggle(item.active !== false)}</p></button>
              <div className="mt-2 flex gap-2">{showArchived ? <Button size="sm" variant="outline" onClick={() => void restore("campus", item.id)}>Khôi phục</Button> : <><Button size="sm" variant="outline" onClick={() => setCampusForm(item)}>Sửa</Button><Button size="sm" variant="destructive" onClick={() => void archive("campus", item.id, item.name)}>Xóa</Button></>}</div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Tòa nhà</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {!showArchived && <Button disabled={!campusId} onClick={openNewBuilding}><Plus />Thêm tòa nhà</Button>}
          {(showArchived ? store.archivedBuildings : campusBuildings).map((item) => (
            <div key={item.id} className={`rounded-md border p-3 ${!showArchived && buildingId === item.id ? "border-blue-500 bg-blue-50" : "bg-white"}`}>
              <button className="w-full text-left" onClick={() => !showArchived && setBuildingId(item.id)}><b>{item.name}</b><p className="text-xs text-slate-500">{showArchived ? `Đã xóa · ${[...store.campuses, ...store.archivedCampuses].find((campus) => campus.id === item.campusId)?.name ?? "Cơ sở"}` : toggle(item.active !== false)}</p></button>
              <div className="mt-2 flex gap-2">{showArchived ? <Button size="sm" variant="outline" onClick={() => void restore("building", item.id)}>Khôi phục</Button> : <><Button size="sm" variant="outline" onClick={() => setBuildingForm(item)}>Sửa</Button><Button size="sm" variant="destructive" onClick={() => void archive("building", item.id, item.name)}>Xóa</Button></>}</div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Phòng</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {!showArchived && <Button disabled={!buildingId} onClick={openNewRoom}><Plus />Thêm phòng</Button>}
          {(showArchived ? store.archivedRooms : visibleRooms).map((item) => (
            <div key={item.id} className="rounded-md border bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <b>{item.name}</b>
                  <p className="text-xs text-slate-500">{showArchived ? `Đã xóa · ${[...store.buildings, ...store.archivedBuildings].find((building) => building.id === item.buildingId)?.name ?? "Tòa nhà"}` : `${item.capacity === null ? "Chưa cập nhật sức chứa" : `${item.capacity} người`} · Buffer ${item.bufferMinutes} phút · ${item.rentable ? "Cho mượn" : "Tạm ngưng"}`}</p>
                </div>
                <div className="flex gap-2">{showArchived ? <Button size="sm" variant="outline" onClick={() => void restore("room", item.id)}>Khôi phục</Button> : <><Button size="sm" variant="outline" onClick={() => { setRoomCampusId(store.buildings.find((building) => building.id === item.buildingId)?.campusId ?? campusId); setRoomForm(item); }}>Sửa</Button><Button size="sm" variant="destructive" onClick={() => void archive("room", item.id, item.name)}>Xóa</Button></>}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!campusForm} onOpenChange={(value) => !value && setCampusForm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{campusForm?.id ? "Sửa cơ sở" : "Thêm cơ sở"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Label>Mã cơ sở</Label><Input value={campusForm?.code ?? ""} onChange={(e) => setCampusForm((value) => value && { ...value, code: e.target.value })} />
            <Label>Tên cơ sở / giảng đường</Label><Input value={campusForm?.name ?? ""} onChange={(e) => setCampusForm((value) => value && { ...value, name: e.target.value })} />
            <Label>Địa chỉ</Label><Input value={campusForm?.address ?? ""} onChange={(e) => setCampusForm((value) => value && { ...value, address: e.target.value })} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={campusForm?.active !== false} onChange={(e) => setCampusForm((value) => value && { ...value, active: e.target.checked })} /> Active</label>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCampusForm(null)}>Hủy</Button><Button onClick={saveCampus}>Lưu</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!buildingForm} onOpenChange={(value) => !value && setBuildingForm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{buildingForm?.id ? "Sửa tòa nhà" : "Thêm tòa nhà"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Label>Cơ sở</Label>
            <Select value={buildingForm?.campusId ?? ""} onValueChange={(value) => setBuildingForm((state) => state && { ...state, campusId: value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{store.campuses.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
            </Select>
            <Label>Tên tòa nhà</Label><Input value={buildingForm?.name ?? ""} onChange={(e) => setBuildingForm((value) => value && { ...value, name: e.target.value })} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={buildingForm?.active !== false} onChange={(e) => setBuildingForm((value) => value && { ...value, active: e.target.checked })} /> Active</label>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setBuildingForm(null)}>Hủy</Button><Button onClick={saveBuilding}>Lưu</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!roomForm} onOpenChange={(value) => !value && setRoomForm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{roomForm?.id ? "Sửa phòng" : "Thêm phòng"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Label>Cơ sở</Label>
            <Select value={roomCampusId} onValueChange={(value) => { setRoomCampusId(value); setRoomForm((state) => state && { ...state, buildingId: store.buildings.find((item) => item.campusId === value)?.id ?? "" }); }}>
              <SelectTrigger><SelectValue placeholder="Chọn cơ sở" /></SelectTrigger>
              <SelectContent>{store.campuses.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
            </Select>
            <Label>Tòa nhà</Label>
            <Select value={roomForm?.buildingId ?? ""} onValueChange={(value) => setRoomForm((state) => state && { ...state, buildingId: value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{store.buildings.filter((item) => item.campusId === roomCampusId).map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
            </Select>
            <Label>Tên phòng</Label><Input value={roomForm?.name ?? ""} onChange={(e) => setRoomForm((value) => value && { ...value, name: e.target.value })} />
            <Label>Sức chứa</Label><Input type="number" min="1" value={roomForm?.capacity ?? ""} onChange={(e) => setRoomForm((value) => value && { ...value, capacity: e.target.value ? Number(e.target.value) : null })} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={roomForm?.rentable !== false} onChange={(e) => setRoomForm((value) => value && { ...value, rentable: e.target.checked })} /> Cho CLB mượn</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={roomForm?.active !== false} onChange={(e) => setRoomForm((value) => value && { ...value, active: e.target.checked })} /> Active</label>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setRoomForm(null)}>Hủy</Button><Button onClick={saveRoom}>Lưu</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
}
export function AdminDashboard() {
  const store = usePrototypeStore();
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [physical, setPhysical] = useState("all"),
    [campus, setCampus] = useState("all"),
    [buildingFilter, setBuildingFilter] = useState("all"),
    [roomFilter, setRoomFilter] = useState("all"),
    [fromDate, setFromDate] = useState(""),
    [toDate, setToDate] = useState(""),
    [sortBy, setSortBy] = useState("start_asc"),
    [weekDate, setWeekDate] = useState(dateKey(new Date())),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [action, setAction] = useState<{
      type: "revision" | "reject" | "room" | "cancel";
      booking: Booking;
    } | null>(null),
    [exporting, setExporting] = useState(false),
    [supportOpen, setSupportOpen] = useState(false),
    [templateOpen, setTemplateOpen] = useState(false),
    [clubProfile, setClubProfile] = useState<Booking | null>(null);
  const visibleBookings = useMemo(() => store.bookings.filter((b) => b.status !== "draft"), [store.bookings]);
  const filtered = useMemo(
    () =>
      visibleBookings.filter((b) => {
        const room = store.rooms.find((r) => r.id === b.roomId),
          building = store.buildings.find((x) => x.id === room?.buildingId);
        const day = b.startAt ? dateKey(new Date(b.startAt)) : "";
        return (
          `${b.id} ${b.clubName} ${b.activityName} ${b.contactPerson} ${b.contactPhone}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()) &&
          (status === "all" || b.status === status) &&
          (physical === "all" || b.physicalStatus === physical) &&
          (campus === "all" || building?.campusId === campus) &&
          (buildingFilter === "all" || room?.buildingId === buildingFilter) &&
          (roomFilter === "all" || b.roomId === roomFilter) &&
          (!fromDate || day >= fromDate) && (!toDate || day <= toDate)
        );
      }).sort((a, b) => {
        if (sortBy === "start_desc") return new Date(b.startAt).getTime() - new Date(a.startAt).getTime();
        if (sortBy === "created_desc") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        if (sortBy === "club") return a.clubName.localeCompare(b.clubName, "vi");
        if (sortBy === "room") return (a.roomName ?? "").localeCompare(b.roomName ?? "", "vi");
        return new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
      }),
    [visibleBookings, store.rooms, store.buildings, search, status, physical, campus, buildingFilter, roomFilter, fromDate, toDate, sortBy],
  );
  const weekStart = new Date(`${weekDate}T00:00:00`);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weeklyBookings = visibleBookings.filter((b) => new Date(b.startAt) >= weekStart && new Date(b.startAt) < weekEnd)
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  const metrics = [
    [
      "Đơn chờ xử lý",
      visibleBookings.filter((b) =>
        ["pending_hold", "needs_revision"].includes(b.status),
      ).length,
      <Clock3 />,
    ],
    [
      "Chưa nhận bản giấy",
      visibleBookings.filter((b) => b.physicalStatus === "chua_nhan").length,
      <FileWarning />,
    ],
    [
      "Đã nhận & chờ duyệt",
      visibleBookings.filter(
        (b) =>
          b.physicalStatus === "da_nhan_ban_cung" &&
          b.status === "pending_hold",
      ).length,
      <FileCheck2 />,
    ],
    [
      "Đã duyệt",
      visibleBookings.filter((b) =>
        ["approved", "room_changed"].includes(b.status),
      ).length,
      <CheckCircle2 />,
    ],
    [
      "7 ngày tới",
      visibleBookings.filter(
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
        navItems={[
          { id: "dashboard", label: "Dashboard", active: true },
          { id: "calendar", label: "Lịch phòng", onClick: () => window.location.assign("/calendar") },
          { id: "users", label: "Quản lý CLB và tài khoản", onClick: () => window.location.assign("/admin/users") },
        ]}
        primaryAction={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setTemplateOpen(true)}>
              <FileCheck2 />
              Mẫu B mặc định
            </Button>
            <Button variant="outline" onClick={() => setSupportOpen(true)}>
              <Settings2 />
              Cán bộ trực hỗ trợ
            </Button>
          </div>
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
            <TabsTrigger value="weekly">Đơn theo tuần</TabsTrigger>
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
                <Select value={campus} onValueChange={(value) => { setCampus(value); setBuildingFilter("all"); setRoomFilter("all"); }}>
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
                      "completed",
                      "expired",
                    ].map((s) => (
                      <SelectItem key={s} value={s}>
                        {({ pending_hold: "Đang giữ chỗ", needs_revision: "Cần chỉnh sửa", approved: "Đã duyệt", room_changed: "Đã đổi phòng", rejected: "Bị từ chối", cancelled: "Đã hủy", completed: "Đã hoàn thành", expired: "Hết hạn" } as Record<string, string>)[s] ?? s}
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
                    {["chua_nhan", "da_nhan_ban_cung"].map(
                      (s) => (
                        <SelectItem key={s} value={s}>
                          {s === "chua_nhan" ? "Chưa nhận bản cứng" : "Đã nhận bản cứng"}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
                <Select value={buildingFilter} onValueChange={(value) => { setBuildingFilter(value); setRoomFilter("all"); }}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Tòa nhà" /></SelectTrigger>
                  <SelectContent><SelectItem value="all">Tất cả tòa nhà</SelectItem>{store.buildings.filter((item) => campus === "all" || item.campusId === campus).map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={roomFilter} onValueChange={setRoomFilter}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Phòng" /></SelectTrigger>
                  <SelectContent><SelectItem value="all">Tất cả phòng</SelectItem>{store.rooms.filter((item) => buildingFilter === "all" ? (campus === "all" || store.buildings.some((b) => b.id === item.buildingId && b.campusId === campus)) : item.buildingId === buildingFilter).map((item) => <SelectItem key={item.id} value={item.id}>{item.name} · {store.buildings.find((b) => b.id === item.buildingId)?.name}</SelectItem>)}</SelectContent>
                </Select>
                <label className="grid gap-1 text-xs text-slate-600">Từ ngày<Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
                <label className="grid gap-1 text-xs text-slate-600">Đến ngày<Input type="date" min={fromDate || undefined} value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Sắp xếp" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="start_asc">Lịch gần nhất trước</SelectItem>
                    <SelectItem value="start_desc">Lịch xa nhất trước</SelectItem>
                    <SelectItem value="created_desc">Đơn mới tạo trước</SelectItem>
                    <SelectItem value="club">Tên CLB A–Z</SelectItem>
                    <SelectItem value="room">Tên phòng A–Z</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => { setSearch(""); setStatus("all"); setPhysical("all"); setCampus("all"); setBuildingFilter("all"); setRoomFilter("all"); setFromDate(""); setToDate(""); setSortBy("start_asc"); }}>Xóa bộ lọc</Button>
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
                        canApproveStatus = [
                          "pending_hold",
                          "needs_revision",
                        ].includes(b.status);
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
                            <button
                              className="block text-left text-xs text-blue-700 hover:underline"
                              onClick={() => setClubProfile(b)}
                            >
                              {b.clubName}
                            </button>
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
                            {store.rooms.find((r) => r.id === b.roomId)?.name ?? b.roomName}
                            <p className="text-xs text-slate-500">
                              {fmt(b.startAt)}–{new Date(b.endAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                            <p className="text-xs text-slate-400">{b.buildingName} · {b.campusName}</p>
                          </TableCell>
                          <TableCell>
                            <PhysicalStatusBadge status={b.physicalStatus} />
                          </TableCell>
                          <TableCell>
                            <BookingStatusBadge status={b.status} />
                            {b.status === "pending_hold" && b.holdExpiresAt && <p className="mt-1 text-xs text-amber-700">Giữ đến {new Date(b.holdExpiresAt).toLocaleString("vi-VN")}</p>}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                disabled={!canApproveStatus}
                                onClick={async () => {
                                  try {
                                    await store.updateBooking(b.id, { status: "approved" });
                                    toast.success("Đã nhận bản cứng và duyệt đơn");
                                  } catch {
                                    // Store displays the API error.
                                  }
                                }}
                              >
                                Nhận bản cứng & duyệt
                              </Button>
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
                                    disabled={["cancelled", "rejected", "expired", "completed"].includes(b.status)}
                                    onClick={() =>
                                      setAction({ type: "cancel", booking: b })
                                    }
                                  >
                                    Hủy đơn
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
          <TabsContent value="weekly" className="space-y-4">
            <Card><CardContent className="flex flex-wrap items-end gap-3 p-4">
              <Button variant="outline" onClick={() => { const day = new Date(`${weekDate}T12:00:00`); day.setDate(day.getDate() - 7); setWeekDate(dateKey(day)); }}>Tuần trước</Button>
              <div className="min-w-48"><Label>Chọn ngày trong tuần</Label><DocumentDateField label="Chọn tuần xem đơn" value={weekDate} onChange={setWeekDate} /></div>
              <Button variant="outline" onClick={() => { const day = new Date(`${weekDate}T12:00:00`); day.setDate(day.getDate() + 7); setWeekDate(dateKey(day)); }}>Tuần sau</Button>
              <p className="text-sm text-slate-600">{weekStart.toLocaleDateString("vi-VN")} – {new Date(weekEnd.getTime() - 1).toLocaleDateString("vi-VN")} · {weeklyBookings.length} đơn</p>
            </CardContent></Card>
            <div className="grid gap-3 lg:grid-cols-2">
              {Array.from({ length: 7 }, (_, index) => {
                const day = new Date(weekStart);
                day.setDate(day.getDate() + index);
                const bookings = weeklyBookings.filter((b) => dateKey(new Date(b.startAt)) === dateKey(day));
                return <Card key={dateKey(day)}><CardHeader><CardTitle className="text-base">{day.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" })} · {bookings.length} đơn</CardTitle></CardHeader>
                  <CardContent className="space-y-2">{bookings.length ? bookings.map((b) => <div key={b.id} className="rounded-md border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2"><b>#{b.id} · {b.clubName}</b><BookingStatusBadge status={b.status} /></div>
                    <p>{b.activityName}</p><p className="text-slate-600">{b.roomName ?? b.roomId} · {new Date(b.startAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}–{new Date(b.endAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} · {b.participants} người</p>
                  </div>) : <p className="text-sm text-slate-500">Không có đơn</p>}</CardContent>
                </Card>;
              })}
            </div>
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
        <ExportDialog open={exporting} close={() => setExporting(false)} openClubProfile={(booking) => { setExporting(false); setClubProfile(booking); }} />
      )}
      {supportOpen && (
        <SupportDialog open={supportOpen} close={() => setSupportOpen(false)} />
      )}
      {templateOpen && (
        <TemplateDialog open={templateOpen} close={() => setTemplateOpen(false)} />
      )}
      <ClubProfileDialog booking={clubProfile} close={() => setClubProfile(null)} />
    </main>
  );
}
export default AdminDashboard;
