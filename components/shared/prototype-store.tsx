"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import axios from "axios";
import { toast } from "sonner";
import { api, endpoints } from "@/lib/api";
import { isClubRole, useAuth } from "@/components/auth/auth-context";

export type CampusId = string;
export type Equipment =
  "projector" | "microphone" | "ac" | "whiteboard" | "sound";
export type BookingStatus =
  | "draft"
  | "pending_hold"
  | "needs_revision"
  | "approved"
  | "room_changed"
  | "completed"
  | "rejected"
  | "cancelled"
  | "expired";
export type PhysicalStatus =
  "chua_nhan" | "da_nhan_ban_cung";

export type Campus = { id: CampusId; name: string; code: string; address?: string; active?: boolean; archivedAt?: string | null };
export type Building = {
  id: string;
  campusId: CampusId;
  name: string;
  code: string;
  active?: boolean;
  archivedAt?: string | null;
};
export type Room = {
  id: string;
  buildingId: string;
  name: string;
  floor?: number;
  capacity: number | null;
  equipment: Equipment[];
  rentable: boolean;
  bufferMinutes: number;
  active?: boolean;
  archivedAt?: string | null;
};
export type OrganizationProfile = {
  id?: string;
  name?: string;
  abbreviation?: string;
  address?: string;
  representative_name?: string;
  hotline?: string;
  contact_email?: string;
  fanpage_url?: string;
};
export type Booking = {
  id: string;
  clubCode: string;
  clubName: string;
  activityName: string;
  description: string;
  roomId: string;
  roomName?: string;
  buildingName?: string;
  campusName?: string;
  backupRoomId?: string;
  startAt: string;
  endAt: string;
  participants: number;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
  contactRole?: string;
  equipment: Equipment[];
  status: BookingStatus;
  physicalStatus: PhysicalStatus;
  organizationProfile?: OrganizationProfile;
  hiddenDetails?: boolean;
  holdExpiresAt?: string;
  scanDeadlineAt?: string;
  paperDeadlineAt?: string;
  scanFileName?: string;
  scanUploadedAt?: string;
  scanConfirmedAt?: string;
  note?: string;
  createdAt: string;
};
export type Blackout = {
  id: string;
  roomIds: string[];
  scopeType?: "room" | "building" | "floor";
  buildingId?: string;
  floor?: number;
  startAt: string;
  endAt: string;
  reason: string;
  note?: string;
};
export type SupportContact = {
  name: string;
  role: string;
  phone: string;
  email: string;
  shift: string;
};
export type Notification = {
  id: string;
  audience: "club" | "admin";
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  bookingId?: string;
};
export type DocumentTemplateContent = {
  leftHeader: string;
  rightHeader: string;
  title: string;
  recipient: string;
  intro: string;
  commitment: string;
  closing: string;
  leftSignature: string;
  rightSignature: string;
  rightSignerName: string;
};
export type DocumentTemplate = {
  id?: string;
  templateType: "mau_a" | "mau_b";
  name: string;
  content: DocumentTemplateContent;
  active: boolean;
};

export const defaultDocumentTemplateContent: DocumentTemplateContent = {
  leftHeader: "ĐOÀN ĐẠI HỌC QUỐC GIA HÀ NỘI\nBCH TRƯỜNG ĐẠI HỌC CÔNG NGHỆ\n***",
  rightHeader: "ĐOÀN TNCS HỒ CHÍ MINH",
  title: "ĐƠN ĐỀ NGHỊ",
  recipient: "Kính gửi: Phòng Hành chính Quản trị và Tổ chức Cán bộ",
  intro: "Thực hiện nhiệm vụ kế hoạch năm học, các đơn vị trực thuộc ĐTN – HSV tiến hành tổ chức sinh hoạt. Để hoạt động diễn ra đúng kế hoạch và thành công tốt đẹp, kính đề nghị Quý phòng xem xét và hỗ trợ. Cụ thể theo danh sách:",
  commitment: "Các đơn vị trực thuộc ĐTN – HSV cam kết sau khi sử dụng phòng học xong sẽ trả đúng nguyên trạng ban đầu của phòng học. Ngoài ra, các đơn vị sử dụng phòng buổi tối sẽ tự chủ động mượn và hoàn trả lại thiết bị về đúng nơi quy định. Nếu xảy ra trường hợp hỏng hóc hay mất thiết bị, đơn vị sẽ hoàn toàn chịu trách nhiệm.",
  closing: "Kính mong nhận được sự giúp đỡ của Quý Phòng.\nXin trân trọng cảm ơn!",
  leftSignature: "Ý KIẾN\nPHÒNG HCQT & TCCB",
  rightSignature: "TM. BCH ĐOÀN TRƯỜNG\nUV BAN THƯỜNG VỤ",
  rightSignerName: "Nguyễn Thị Hằng",
};

type NewBooking = Omit<
  Booking,
  "id" | "status" | "physicalStatus" | "holdExpiresAt" | "createdAt"
>;
// Admin-created bookings may be assigned to a club other than the signed-in user.
type Store = {
  campuses: Campus[];
  archivedCampuses: Campus[];
  buildings: Building[];
  archivedBuildings: Building[];
  rooms: Room[];
  archivedRooms: Room[];
  bookings: Booking[];
  blackouts: Blackout[];
  documentTemplates: DocumentTemplate[];
  addCampus: (data: Omit<Campus, "id">) => Promise<void>;
  updateCampus: (id: string, patch: Partial<Campus>) => Promise<void>;
  archiveCampus: (id: string) => Promise<void>;
  restoreCampus: (id: string) => Promise<void>;
  addBuilding: (data: Omit<Building, "id">) => Promise<void>;
  updateBuilding: (id: string, patch: Partial<Building>) => Promise<void>;
  archiveBuilding: (id: string) => Promise<void>;
  restoreBuilding: (id: string) => Promise<void>;
  addBooking: (data: NewBooking) => Promise<Booking>;
  saveDraft: (data: NewBooking, id?: string) => Promise<Booking>;
  uploadScan: (id: string, file: File) => Promise<Booking>;
  confirmScan: (id: string) => Promise<Booking>;
  confirmPhysical: (id: string) => Promise<Booking>;
  extendDeadlines: (id: string, patch: { scan_deadline_at?: string; paper_deadline_at?: string }) => Promise<Booking>;
  updateBooking: (id: string, patch: Partial<Booking>) => Promise<void>;
  cancelBooking: (id: string, reason?: string) => Promise<void>;
  addBlackout: (data: Omit<Blackout, "id">) => Promise<void>;
  addRoom: (data: Omit<Room, "id">) => Promise<void>;
  updateRoom: (id: string, patch: Partial<Room>) => Promise<void>;
  archiveRoom: (id: string) => Promise<void>;
  restoreRoom: (id: string) => Promise<void>;
  updateDocumentTemplate: (
    templateType: DocumentTemplate["templateType"],
    patch: Partial<DocumentTemplate>,
  ) => Promise<void>;
  supportContact: SupportContact;
  updateSupportContact: (data: SupportContact) => Promise<void>;
  notifications: Notification[];
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: (audience: "club" | "admin") => Promise<void>;
};

const StoreContext = createContext<Store | null>(null);

export function PrototypeStoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const admin = Boolean(user && !isClubRole(user.role));
  const [campusList, setCampusList] = useState<Campus[]>([]);
  const [archivedCampuses, setArchivedCampuses] = useState<Campus[]>([]);
  const [buildingList, setBuildingList] = useState<Building[]>([]);
  const [archivedBuildings, setArchivedBuildings] = useState<Building[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [archivedRooms, setArchivedRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [blackouts, setBlackouts] = useState<Blackout[]>([]);
  const [documentTemplates, setDocumentTemplates] = useState<DocumentTemplate[]>([]);
  const [supportContact, setSupportContact] = useState<SupportContact>({
      name: "",
      role: "",
      phone: "",
      email: "",
      shift: "",
  });
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const extractApiErrorMessage = (error: unknown): string => {
    if (!axios.isAxiosError(error)) return "";

    const payload = error.response?.data;
    if (Array.isArray(payload)) {
      return payload.filter((item) => typeof item === "string" && item.trim()).join(", ");
    }
    if (typeof payload === "string") {
      return payload.trim();
    }
    if (payload && typeof payload === "object") {
      const detail = (payload as { detail?: unknown }).detail;
      if (typeof detail === "string" && detail.trim()) return detail.trim();
      if (Array.isArray(detail)) {
        const message = detail.filter((item) => typeof item === "string" && item.trim()).join(", ");
        if (message) return message;
      }

      const nonFieldErrors = (payload as { non_field_errors?: unknown[] }).non_field_errors;
      if (Array.isArray(nonFieldErrors)) {
        const message = nonFieldErrors.filter((item) => typeof item === "string" && item.trim()).join(", ");
        if (message) return message;
      }

      const message = (payload as { message?: unknown }).message;
      if (typeof message === "string" && message.trim()) return message.trim();
    }

    return "";
  };
  const showApiError = (error: unknown, fallback: string) => {
    const detail = extractApiErrorMessage(error);
    toast.error(detail ? `${fallback}: ${detail}` : fallback);
  };
  const mapCampus = (c: any): Campus => ({ id: String(c.id) as CampusId, code: c.code, name: c.name, address: c.address, active: c.active, archivedAt: c.archived_at });
  const mapBuilding = (b: any): Building => ({ id: String(b.id), campusId: String(b.campus) as CampusId, code: b.campus_code ?? "", name: b.name, active: b.active, archivedAt: b.archived_at });
  const mapRoom = (r: any): Room => ({
    id: String(r.id), buildingId: String(r.building), name: r.name, floor: r.floor, capacity: r.capacity,
    equipment: (["projector","microphone","ac","whiteboard","sound"] as Equipment[]).filter((e) =>
      e === "projector" ? r.has_projector : e === "microphone" ? r.has_microphone : e === "ac" ? r.has_ac : e === "whiteboard" ? r.has_whiteboard : r.has_sound_system),
    rentable: Boolean(r.rentable), bufferMinutes: Math.max(15, r.buffer_before_minutes ?? 0, r.buffer_after_minutes ?? 0), active: r.active, archivedAt: r.archived_at,
  });
  const mapBooking = (b: any): Booking => ({
    id: String(b.id), clubCode: b.organization?.toString() ?? "", clubName: b.organization_name ?? "CLB",
    activityName: b.activity_name ?? "", description: b.description ?? "", roomId: b.room ? String(b.room) : "", roomName: b.room_name, buildingName: b.building_name, campusName: b.campus_name, backupRoomId: b.secondary_room ? String(b.secondary_room) : undefined,
    startAt: b.start_time ?? "", endAt: b.end_time ?? "", participants: b.participant_count ?? 0, contactPerson: b.contact_person ?? "",
    contactPhone: b.contact_phone, contactEmail: b.contact_email,     equipment: Object.entries(b.equipment_request ?? {})
      .filter(([, enabled]) => Boolean(enabled))
      .map(([name]) => name as Equipment),
    status: b.status, physicalStatus: b.physical_status,
    organizationProfile: b.organization_profile, hiddenDetails: Boolean(b.hidden_details),
    holdExpiresAt: b.hold_expires_at, note: b.notes, createdAt: b.created_at,
    scanDeadlineAt: b.scan_deadline_at, paperDeadlineAt: b.paper_deadline_at,
    scanFileName: b.scan_file_name, scanUploadedAt: b.scan_uploaded_at, scanConfirmedAt: b.scan_confirmed_at,
  });
  const mapNotification = (n: any): Notification => ({
    id: String(n.id),
    audience: window.location.pathname.includes("admin") ? "admin" : "club",
    title: notificationTitle(n.type),
    message: n.message,
    createdAt: n.created_at,
    read: Boolean(n.is_read),
    bookingId: n.related_booking ? String(n.related_booking) : undefined,
  });
  const mapDocumentTemplate = (template: any): DocumentTemplate => ({
    id: String(template.id),
    templateType: template.template_type,
    name: template.name,
    content: { ...defaultDocumentTemplateContent, ...(template.content ?? {}) },
    active: Boolean(template.active),
  });
  const notificationTitle = (type: string) =>
    ({
      submitted: "Cập nhật đơn",
      approved: "Đơn đã được duyệt",
      rejected: "Đơn bị từ chối",
      needs_revision: "Đơn cần chỉnh sửa",
      room_changed: "Phòng đã thay đổi",
      cancelled: "Đơn đã bị hủy",
      physical_reminder: "Nhắc nộp bản cứng",
      expired: "Đơn hết hạn giữ chỗ",
    })[type] ?? "Thông báo";
  useEffect(() => {
    const load = async <T,>(
      request: Promise<{ data: T }>,
      apply: (data: T) => void,
      fallback: string,
      options: { quiet?: boolean; quietForbidden?: boolean } = {},
    ) => {
      try {
        const { data } = await request;
        apply(data);
      } catch (error) {
        if (options.quiet) return;
        if (
          options.quietForbidden &&
          axios.isAxiosError(error) &&
          [401, 403, 404].includes(error.response?.status ?? 0)
        ) {
          return;
        }
        showApiError(error, fallback);
      }
    };
    const requests = [
      load(api.get(endpoints.campuses), (data: any) => setCampusList((data.results ?? data).map(mapCampus)), "Không thể tải danh sách cơ sở"),
      load(api.get(endpoints.buildings), (data: any) => setBuildingList((data.results ?? data).map(mapBuilding)), "Không thể tải danh sách tòa nhà"),
      load(api.get(endpoints.rooms), (data: any) => setRooms((data.results ?? data).map(mapRoom)), "Không thể tải danh sách phòng"),
      ...(admin ? [
        load(api.get(`${endpoints.campuses}?archived=1`), (data: any) => setArchivedCampuses((data.results ?? data).map(mapCampus)), "Không thể tải cơ sở đã xóa"),
        load(api.get(`${endpoints.buildings}?archived=1`), (data: any) => setArchivedBuildings((data.results ?? data).map(mapBuilding)), "Không thể tải tòa nhà đã xóa"),
        load(api.get(`${endpoints.rooms}?archived=1`), (data: any) => setArchivedRooms((data.results ?? data).map(mapRoom)), "Không thể tải phòng đã xóa"),
      ] : []),
      load(api.get(endpoints.bookings), (data: any) => setBookings((data.results ?? data).map(mapBooking)), "Không thể tải danh sách đơn"),
      load(api.get(endpoints.blackouts), (data: any) => setBlackouts((data.results ?? data).map((b: any) => ({ id: String(b.id), roomIds: (b.room_ids ?? []).map(String), scopeType: b.scope_type, buildingId: b.building ? String(b.building) : undefined, floor: b.floor, startAt: b.start_time, endAt: b.end_time, reason: b.reason ?? "", note: b.note }))), "Không thể tải danh sách khóa phòng", { quiet: !admin }),
      load(api.get(endpoints.notifications), (data: any) => setNotifications((data.results ?? data).map(mapNotification)), "Không thể tải thông báo", { quiet: true }),
      load(api.get(endpoints.documentTemplates), (data: any) => setDocumentTemplates((data.results ?? data).map(mapDocumentTemplate)), "Không thể tải mẫu đơn", { quiet: !admin }),
      load(api.get(`${endpoints.ruleConfigs}support_contact/`), (data: any) => {
        if (data.value && typeof data.value === "object") {
          setSupportContact((current) => ({ ...current, ...data.value }));
        }
      }, "Không thể tải cán bộ trực", { quiet: true }),
    ];
    void Promise.all(requests);
  }, [admin]);
  useEffect(() => {
    const refreshBookings = () => {
      if (document.hidden) return;
      void api.get(endpoints.bookings).then(({ data }) => {
        setBookings((data.results ?? data).map(mapBooking));
      }).catch(() => { /* Keep the last known list during a temporary network error. */ });
    };
    const timer = window.setInterval(refreshBookings, 60_000);
    document.addEventListener("visibilitychange", refreshBookings);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshBookings);
    };
  }, []);
  useEffect(() => {
    const checkExpiringHolds = () => {
      const now = Date.now();
      const expiring = bookings.filter((booking) => {
        if (!booking.holdExpiresAt) return false;
        const remaining = new Date(booking.holdExpiresAt).getTime() - now;
        return (
          booking.status === "pending_hold" &&
          remaining > 0 &&
          remaining <= 12 * 60 * 60 * 1000
        );
      });
      if (expiring.length === 0) return;
      setNotifications((items) => {
        const additions = expiring
          .filter(
            (booking) =>
              !items.some(
                (item) =>
                  item.audience === "club" &&
                  item.bookingId === booking.id &&
                  item.title === "Đơn sắp hết hạn giữ chỗ",
              ),
          )
          .map((booking) => ({
            id: `NT-expiry-${booking.id}`,
            audience: "club" as const,
            title: "Đơn sắp hết hạn giữ chỗ",
            message: `${booking.id} còn dưới 12 giờ để hoàn tất bản cứng.`,
            bookingId: booking.id,
            createdAt: new Date().toISOString(),
            read: false,
          }));
        return additions.length ? [...additions, ...items] : items;
      });
    };
    checkExpiringHolds();
    const timer = window.setInterval(checkExpiringHolds, 60_000);
    return () => window.clearInterval(timer);
  }, [bookings]);
  const refreshFacilities = async () => {
    const requests = [
      api.get(endpoints.campuses), api.get(endpoints.buildings), api.get(endpoints.rooms),
      api.get(`${endpoints.campuses}?archived=1`),
      api.get(`${endpoints.buildings}?archived=1`),
      api.get(`${endpoints.rooms}?archived=1`),
    ];
    const results = await Promise.all(requests);
    setCampusList((results[0].data.results ?? results[0].data).map(mapCampus));
    setBuildingList((results[1].data.results ?? results[1].data).map(mapBuilding));
    setRooms((results[2].data.results ?? results[2].data).map(mapRoom));
    setArchivedCampuses((results[3].data.results ?? results[3].data).map(mapCampus));
    setArchivedBuildings((results[4].data.results ?? results[4].data).map(mapBuilding));
    setArchivedRooms((results[5].data.results ?? results[5].data).map(mapRoom));
  };
  const notify = (
    audience: "club" | "admin",
    title: string,
    message: string,
    bookingId?: string,
  ) =>
    setNotifications((items) => [
      {
        id: `NT-${Date.now()}-${Math.random()}`,
        audience,
        title,
        message,
        bookingId,
        createdAt: new Date().toISOString(),
        read: false,
      },
      ...items,
    ]);
  const value = useMemo<Store>(
    () => ({
      campuses: campusList,
      archivedCampuses,
      buildings: buildingList,
      archivedBuildings,
      rooms,
      archivedRooms,
      bookings,
      blackouts,
      documentTemplates,
      addCampus: async (data) => {
        try {
          const { data: remote } = await api.post(endpoints.campuses, {
            name: data.name,
            code: data.code,
            address: data.address ?? "",
            active: data.active ?? true,
          });
          setCampusList((items) => [...items, mapCampus(remote)]);
        } catch (error) {
          showApiError(error, "Không thể thêm cơ sở");
          throw error;
        }
      },
      updateCampus: async (id, patch) => {
        try {
          const { data } = await api.patch(`${endpoints.campuses}${id}/`, patch);
          setCampusList((items) => items.map((item) => item.id === id ? mapCampus(data) : item));
        } catch (error) {
          showApiError(error, "Không thể cập nhật cơ sở");
          throw error;
        }
      },
      archiveCampus: async (id) => {
        try {
          await api.delete(`${endpoints.campuses}${id}/`);
          await refreshFacilities();
        } catch (error) {
          showApiError(error, "Không thể xóa cơ sở");
          throw error;
        }
      },
      restoreCampus: async (id) => {
        try {
          await api.post(`${endpoints.campuses}${id}/restore/`);
          await refreshFacilities();
        } catch (error) {
          showApiError(error, "Không thể khôi phục cơ sở");
          throw error;
        }
      },
      addBuilding: async (data) => {
        try {
          const { data: remote } = await api.post(endpoints.buildings, {
            campus: Number(data.campusId),
            name: data.name,
            floor_count: 1,
            active: data.active ?? true,
          });
          setBuildingList((items) => [...items, mapBuilding(remote)]);
        } catch (error) {
          showApiError(error, "Không thể thêm tòa nhà");
          throw error;
        }
      },
      updateBuilding: async (id, patch) => {
        try {
          const { data } = await api.patch(`${endpoints.buildings}${id}/`, {
            campus: patch.campusId ? Number(patch.campusId) : undefined,
            name: patch.name,
            active: patch.active,
          });
          setBuildingList((items) => items.map((item) => item.id === id ? mapBuilding(data) : item));
        } catch (error) {
          showApiError(error, "Không thể cập nhật tòa nhà");
          throw error;
        }
      },
      archiveBuilding: async (id) => {
        try {
          await api.delete(`${endpoints.buildings}${id}/`);
          await refreshFacilities();
        } catch (error) {
          showApiError(error, "Không thể xóa tòa nhà");
          throw error;
        }
      },
      restoreBuilding: async (id) => {
        try {
          await api.post(`${endpoints.buildings}${id}/restore/`);
          await refreshFacilities();
        } catch (error) {
          showApiError(error, "Không thể khôi phục tòa nhà");
          throw error;
        }
      },
      addBooking: async (data) => {
        try {
          const { data: remote } = await api.post(endpoints.bookings, {
            organization: data.clubCode && /^\d+$/.test(data.clubCode) ? Number(data.clubCode) : undefined,
            room: Number(data.roomId),
            secondary_room: data.backupRoomId ? Number(data.backupRoomId) : null,
            activity_name: data.activityName,
            description: data.description,
            participant_count: data.participants,
            contact_person: data.contactPerson,
            contact_phone: data.contactPhone,
            contact_email: data.contactEmail,
            start_time: data.startAt,
            end_time: data.endAt,
            equipment_request: Object.fromEntries(data.equipment.map((x) => [x, true])),
          });
          const booking = mapBooking(remote);
          setBookings((items) => [booking, ...items]);
          return booking;
        } catch (error) {
          showApiError(error, "Không thể tạo đơn mượn phòng");
          throw error;
        }
      },
      saveDraft: async (data, id) => {
        const payload = {
          room: data.roomId ? Number(data.roomId) : null,
          secondary_room: data.backupRoomId ? Number(data.backupRoomId) : null,
          activity_name: data.activityName,
          description: data.description,
          participant_count: Number.isInteger(data.participants) && data.participants > 0 ? data.participants : null,
          contact_person: data.contactPerson,
          contact_phone: data.contactPhone,
          contact_email: data.contactEmail,
          start_time: data.startAt || null,
          end_time: data.endAt || null,
          equipment_request: {},
        };
        try {
          const { data: remote } = id
            ? await api.patch(`${endpoints.bookings}${id}/`, payload)
            : await api.post(`${endpoints.bookings}drafts/`, payload);
          const booking = mapBooking(remote);
          setBookings((items) => id
            ? items.map((item) => item.id === id ? booking : item)
            : [booking, ...items]);
          return booking;
        } catch (error) {
          showApiError(error, "Không thể lưu bản nháp");
          throw error;
        }
      },
      uploadScan: async (id, file) => {
        const payload = new FormData();
        payload.append("file", file);
        try {
          const { data } = await api.post(`${endpoints.bookings}${id}/scan/`, payload, { headers: { "Content-Type": "multipart/form-data" } });
          const booking = mapBooking(data);
          setBookings((items) => items.map((item) => item.id === id ? booking : item));
          return booking;
        } catch (error) { showApiError(error, "Không thể tải bản scan"); throw error; }
      },
      confirmScan: async (id) => {
        const { data } = await api.post(`${endpoints.bookings}${id}/confirm-scan/`);
        const booking = mapBooking(data);
        setBookings((items) => items.map((item) => item.id === id ? booking : item));
        return booking;
      },
      confirmPhysical: async (id) => {
        const { data } = await api.post(`${endpoints.bookings}${id}/confirm-physical/`);
        const booking = mapBooking(data);
        setBookings((items) => items.map((item) => item.id === id ? booking : item));
        return booking;
      },
      extendDeadlines: async (id, patch) => {
        const { data } = await api.patch(`${endpoints.bookings}${id}/deadlines/`, patch);
        const booking = mapBooking(data);
        setBookings((items) => items.map((item) => item.id === id ? booking : item));
        return booking;
      },
      updateBooking: async (id, patch) => {
        const action = patch.status === "approved" ? "approve" : patch.status === "rejected" ? "reject" : patch.status === "needs_revision" ? "request-revision" : patch.status === "pending_hold" ? "submit" : undefined;
        const payload = {
          room: patch.roomId ? Number(patch.roomId) : undefined,
          secondary_room: "backupRoomId" in patch ? (patch.backupRoomId ? Number(patch.backupRoomId) : null) : undefined,
          activity_name: patch.activityName,
          description: patch.description,
          participant_count: patch.participants,
          contact_person: patch.contactPerson,
          contact_phone: patch.contactPhone,
          contact_email: patch.contactEmail,
          start_time: patch.startAt,
          end_time: patch.endAt,
          notes: patch.note,
          equipment_request: patch.equipment ? Object.fromEntries(patch.equipment.map((x) => [x, true])) : undefined,
        };
        try {
          if (patch.status === "pending_hold" && patch.roomId) {
            const { data } = await api.patch(`${endpoints.bookings}${id}/update-and-submit/`, payload);
            setBookings((items) => items.map((item) => item.id === id ? mapBooking(data) : item));
            return;
          }
          if (action) {
            const { data } = await api.post(`${endpoints.bookings}${id}/${action}/`, { reason: patch.note });
            setBookings((items) => items.map((item) => item.id === id ? mapBooking(data) : item));
            return;
          }
          if (patch.roomId && patch.status === "room_changed") {
            const { data } = await api.post(`${endpoints.bookings}${id}/change-room/`, { new_room: Number(patch.roomId), reason: patch.note });
            setBookings((items) => items.map((item) => item.id === id ? mapBooking(data) : item));
            return;
          }
          const { data } = await api.patch(`${endpoints.bookings}${id}/`, payload);
          setBookings((items) => items.map((item) => item.id === id ? mapBooking(data) : item));
        } catch (error) {
          showApiError(error, "Không thể cập nhật đơn");
          throw error;
        }
      },
      cancelBooking: async (id, reason) => {
        try {
          const { data } = await api.post(`${endpoints.bookings}${id}/cancel/`, { reason });
          setBookings((items) => items.map((item) => item.id === id ? mapBooking(data) : item));
        } catch (error) {
          showApiError(error, "Không thể hủy đơn");
          throw error;
        }
      },
      addBlackout: async (data) => {
        try {
          const { data: remote } = await api.post(endpoints.blackouts, {
            scope_type: data.scopeType ?? "room",
            room_ids: data.roomIds.map(Number),
            building: data.buildingId ? Number(data.buildingId) : null,
            floor: data.floor ?? null,
            start_time: data.startAt,
            end_time: data.endAt,
            reason: data.reason,
          });
          setBlackouts((items) => [{ ...data, id: String(remote.id) }, ...items]);
        } catch (error) {
          showApiError(error, "Không thể tạo blackout");
          throw error;
        }
      },
      addRoom: async (data) => {
        try {
          const { data: remote } = await api.post(endpoints.rooms, {
            building: Number(data.buildingId),
            name: data.name,
            floor: 1,
            capacity: data.capacity,
            type: "meeting",
            has_projector: data.equipment.includes("projector"),
            has_microphone: data.equipment.includes("microphone"),
            has_ac: data.equipment.includes("ac"),
            has_whiteboard: data.equipment.includes("whiteboard"),
            has_sound_system: data.equipment.includes("sound"),
            rentable: data.rentable,
            buffer_before_minutes: data.bufferMinutes,
            buffer_after_minutes: data.bufferMinutes,
            active: data.active ?? true,
          });
          setRooms((items) => [...items, mapRoom(remote)]);
        } catch (error) {
          showApiError(error, "Không thể thêm phòng");
          throw error;
        }
      },
      updateRoom: async (id, patch) => {
        try {
          const { data } = await api.patch(`${endpoints.rooms}${id}/`, {
            building: patch.buildingId ? Number(patch.buildingId) : undefined,
            name: patch.name,
            capacity: patch.capacity,
            rentable: patch.rentable,
            active: patch.active,
          });
          setRooms((items) => items.map((item) => item.id === id ? mapRoom(data) : item));
        } catch (error) {
          showApiError(error, "Không thể cập nhật phòng");
          throw error;
        }
      },
      archiveRoom: async (id) => {
        try {
          await api.delete(`${endpoints.rooms}${id}/`);
          await refreshFacilities();
        } catch (error) {
          showApiError(error, "Không thể xóa phòng");
          throw error;
        }
      },
      restoreRoom: async (id) => {
        try {
          await api.post(`${endpoints.rooms}${id}/restore/`);
          await refreshFacilities();
        } catch (error) {
          showApiError(error, "Không thể khôi phục phòng");
          throw error;
        }
      },
      updateDocumentTemplate: async (templateType, patch) => {
        try {
          const current = documentTemplates.find((item) => item.templateType === templateType);
          const { data } = await api.patch(`${endpoints.documentTemplates}${templateType}/`, {
            name: patch.name ?? current?.name,
            content: patch.content ?? current?.content,
            active: patch.active ?? current?.active ?? true,
          });
          setDocumentTemplates((items) => items.map((item) => item.templateType === templateType ? mapDocumentTemplate(data) : item));
        } catch (error) {
          showApiError(error, "Không thể cập nhật mẫu đơn");
          throw error;
        }
      },
      supportContact,
      updateSupportContact: async (data) => {
        try {
          try {
            await api.patch(`${endpoints.ruleConfigs}support_contact/`, { value: data });
          } catch (error) {
            if (!axios.isAxiosError(error) || error.response?.status !== 404) throw error;
            await api.post(endpoints.ruleConfigs, {
              key: "support_contact",
              value: data,
              description: "Cán bộ trực hỗ trợ CLB",
            });
          }
          setSupportContact(data);
        } catch (error) {
          showApiError(error, "Không thể lưu cán bộ trực");
          throw error;
        }
      },
      notifications,
      markNotificationRead: async (id) => {
        setNotifications((items) => items.map((item) => item.id === id ? { ...item, read: true } : item));
        try {
          await api.patch(`${endpoints.notifications}${id}/`, { is_read: true });
        } catch (error) {
          showApiError(error, "Không thể cập nhật thông báo");
        }
      },
      markAllNotificationsRead: async (audience) => {
        setNotifications((items) => items.map((item) => item.audience === audience ? { ...item, read: true } : item));
        try {
          await api.post(`${endpoints.notifications}mark-all-read/`);
        } catch (error) {
          showApiError(error, "Không thể cập nhật thông báo");
        }
      },
    }),
    [campusList, archivedCampuses, buildingList, archivedBuildings, rooms, archivedRooms, bookings, blackouts, documentTemplates, supportContact, notifications],
  );
  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export function usePrototypeStore() {
  const value = useContext(StoreContext);
  if (!value) throw new Error("PrototypeStoreProvider is missing");
  return value;
}
export function toLocalInput(iso: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
