"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
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
  action: { type: "revision" | "reject" | "room" | "cancel"; booking: Booking } | null;
  close: () => void;
}) {
  const store = usePrototypeStore();
  const [reason, setReason] = useState("");
  const [room, setRoom] = useState("");
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
                      {row.room?.name ?? row.booking.roomName} - {row.building?.name ?? row.booking.buildingName}
                    </TableCell>
                    <TableCell>
                      <button className="font-semibold text-blue-700 hover:underline" onClick={() => openClubProfile(row.booking)}>{row.booking.clubName}</button>
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
            onClick={() => printSchedule(rows, template)}
          >
            <Printer />
            In đơn
          </Button>
          <Button
            disabled={!rows.length}
            onClick={async () => {
              await exportScheduleDocx(rows, `Mau-B-${from}-${to}.docx`, template);
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
  const [type, setType] = useState<"mau_a" | "mau_b">("mau_a");
  const current = store.documentTemplates.find((item) => item.templateType === type);
  const [form, setForm] = useState<DocumentTemplateContent>({
    ...defaultDocumentTemplateContent,
    ...(current?.content ?? {}),
  });

  const selectType = (value: "mau_a" | "mau_b") => {
    const next = store.documentTemplates.find((item) => item.templateType === value);
    setType(value);
    setForm({ ...defaultDocumentTemplateContent, ...(next?.content ?? {}) });
  };
  const field = (key: keyof DocumentTemplateContent, value: string) =>
    setForm((state) => ({ ...state, [key]: value }));
  const save = async () => {
    await store.updateDocumentTemplate(type, {
      name: type === "mau_a" ? "Mẫu A" : "Mẫu B",
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
          <DialogTitle>Quản lý Mẫu A/B</DialogTitle>
          <DialogDescription>
            Nội dung lưu trong cơ sở dữ liệu và áp dụng cho lần xuất đơn tiếp theo.
          </DialogDescription>
        </DialogHeader>
        <Select value={type} onValueChange={(value) => selectType(value as "mau_a" | "mau_b")}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mau_a">Mẫu A</SelectItem>
            <SelectItem value="mau_b">Mẫu B</SelectItem>
          </SelectContent>
        </Select>
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

function ScanPreviewDialog({ booking, close }: { booking: Booking | null; close: () => void }) {
  const url = booking?.scanFileUrl;
  const lower = url?.toLowerCase() ?? "";
  const [previewUrl, setPreviewUrl] = useState<string | undefined>();
  const [previewMime, setPreviewMime] = useState("");
  const [previewError, setPreviewError] = useState(false);
  useEffect(() => {
    setPreviewMime("");
    setPreviewError(false);
    if (!booking || !url) {
      setPreviewUrl(undefined);
      return;
    }
    if (!url.startsWith("/media/") && !url.startsWith("media/")) {
      setPreviewUrl(url);
      if (url.startsWith("blob:")) {
        let active = true;
        void fetch(url)
          .then((response) => response.blob())
          .then((blob) => { if (active) setPreviewMime(blob.type); })
          .catch(() => { if (active) setPreviewError(true); });
        return () => { active = false; };
      }
      return;
    }
    let active = true;
    let blobUrl: string | undefined;
    setPreviewUrl(undefined);
    api.get(`${endpoints.bookings}${booking.id}/scan/`, { responseType: "blob" })
      .then(({ data }) => {
        blobUrl = URL.createObjectURL(data);
        if (active) {
          setPreviewMime(data.type);
          setPreviewUrl(blobUrl);
        }
        else URL.revokeObjectURL(blobUrl);
      })
      .catch(() => { if (active) setPreviewError(true); });
    return () => {
      active = false;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [booking?.id, url]);
  const isPdf = previewMime.toLowerCase().includes("application/pdf") || /\.pdf(?:[?#]|$)/.test(lower) ||
    booking?.scanName?.toLowerCase().endsWith(".pdf") ||
    lower.startsWith("data:application/pdf");
  return (
    <Dialog open={!!booking} onOpenChange={(value) => !value && close()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Bản scan {booking?.id}</DialogTitle>
          <DialogDescription>{booking?.activityName}</DialogDescription>
        </DialogHeader>
        {!url ? (
          <div className="rounded-md border bg-slate-50 p-6 text-sm text-slate-600">
            Đơn này chưa có bản scan.
          </div>
        ) : previewError ? (
          <div className="rounded-md border bg-slate-50 p-6 text-sm text-slate-600">Không thể tải bản scan.</div>
        ) : !previewUrl ? (
          <div className="rounded-md border bg-slate-50 p-6 text-sm text-slate-600">Đang tải bản scan...</div>
        ) : isPdf ? (
          <iframe title="Bản scan PDF" src={previewUrl} className="h-[70vh] w-full rounded-md border" />
        ) : (
          <img src={previewUrl} alt={`Bản scan ${booking?.id}`} className="max-h-[70vh] w-full rounded-md border object-contain" />
        )}
        <DialogFooter>
          {previewUrl && (
            <Button variant="outline" asChild>
              <a href={previewUrl} target="_blank" rel="noreferrer">
                <ExternalLink />
                Mở tab mới
              </a>
            </Button>
          )}
          <Button onClick={close}>Đóng</Button>
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
  const openNewRoom = () => setRoomForm({ id: "", buildingId, name: "", capacity: 50, equipment: ["projector", "ac", "whiteboard"], rentable: true, bufferMinutes: 15, active: true });
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
                <div className="flex gap-2">{showArchived ? <Button size="sm" variant="outline" onClick={() => void restore("room", item.id)}>Khôi phục</Button> : <><Button size="sm" variant="outline" onClick={() => setRoomForm(item)}>Sửa</Button><Button size="sm" variant="destructive" onClick={() => void archive("room", item.id, item.name)}>Xóa</Button></>}</div>
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
            <Label>Tòa nhà</Label>
            <Select value={roomForm?.buildingId ?? ""} onValueChange={(value) => setRoomForm((state) => state && { ...state, buildingId: value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{store.buildings.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
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
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [action, setAction] = useState<{
      type: "revision" | "reject" | "room" | "cancel";
      booking: Booking;
    } | null>(null),
    [exporting, setExporting] = useState(false),
    [supportOpen, setSupportOpen] = useState(false),
    [templateOpen, setTemplateOpen] = useState(false),
    [scanPreview, setScanPreview] = useState<Booking | null>(null),
    [clubProfile, setClubProfile] = useState<Booking | null>(null),
    [directReceipt, setDirectReceipt] = useState<Set<string>>(new Set());
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
        navItems={[
          { id: "dashboard", label: "Dashboard", active: true },
          { id: "calendar", label: "Lịch phòng", onClick: () => window.location.assign("/calendar") },
          { id: "users", label: "Quản lý CLB và tài khoản", onClick: () => window.location.assign("/admin/users") },
        ]}
        primaryAction={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setTemplateOpen(true)}>
              <FileCheck2 />
              Mẫu A/B
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
                        canApproveStatus = [
                          "pending_hold",
                          "needs_revision",
                        ].includes(b.status),
                        direct = directReceipt.has(b.id),
                        canApprove =
                          canApproveStatus &&
                          (b.physicalStatus === "confirmed_received" || direct);
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
                              {fmt(b.startAt)}
                            </p>
                          </TableCell>
                          <TableCell>
                            <PhysicalStatusBadge status={b.physicalStatus} />
                            {b.physicalStatus === "not_submitted" && canApproveStatus && (
                              <label className="mt-2 flex items-start gap-2 text-xs text-slate-600">
                                <input
                                  type="checkbox"
                                  checked={direct}
                                  onChange={(event) =>
                                    setDirectReceipt((current) => {
                                      const next = new Set(current);
                                      event.target.checked ? next.add(b.id) : next.delete(b.id);
                                      return next;
                                    })
                                  }
                                />
                                Xác nhận nhận bản cứng trực tiếp tại VP
                              </label>
                            )}
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
                                  onClick={async () => {
                                    await store.updateBooking(b.id, {
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
                                           onClick={async () => {
                                            if (direct && b.physicalStatus !== "confirmed_received") {
                                              await store.updateBooking(b.id, {
                                                physicalStatus: "confirmed_received",
                                              });
                                            }
                                            await store.updateBooking(b.id, {
                                              status: "approved",
                                            });
                                            setDirectReceipt((current) => {
                                              const next = new Set(current);
                                              next.delete(b.id);
                                              return next;
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
                                    disabled={!b.scanFileUrl}
                                    onClick={() => setScanPreview(b)}
                                  >
                                    <Eye />
                                    Xem bản scan
                                  </DropdownMenuItem>
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
      <ScanPreviewDialog booking={scanPreview} close={() => setScanPreview(null)} />
      <ClubProfileDialog booking={clubProfile} close={() => setClubProfile(null)} />
    </main>
  );
}
export default AdminDashboard;
