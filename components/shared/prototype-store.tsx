"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, endpoints } from "@/lib/api";

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
  "not_submitted" | "submitted" | "confirmed_received";

export type Campus = { id: CampusId; name: string; code: string };
export type Building = {
  id: string;
  campusId: CampusId;
  name: string;
  code: string;
};
export type Room = {
  id: string;
  buildingId: string;
  name: string;
  capacity: number;
  equipment: Equipment[];
  rentable: boolean;
  bufferMinutes: number;
};
export type Booking = {
  id: string;
  clubCode: string;
  clubName: string;
  activityName: string;
  description: string;
  roomId: string;
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
  scanName?: string;
  holdExpiresAt?: string;
  note?: string;
  createdAt: string;
};
export type Blackout = {
  id: string;
  roomIds: string[];
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

const campuses: Campus[] = [
  { id: "km", code: "KM", name: "Kiều Mai" },
  { id: "xt", code: "XT", name: "Xuân Thủy" },
  { id: "hl", code: "HL", name: "Hòa Lạc" },
];
const buildings: Building[] = [
  { id: "km-a", campusId: "km", code: "A", name: "Tòa A" },
  { id: "xt-g2", campusId: "xt", code: "G2", name: "Giảng đường G2" },
  { id: "xt-g3", campusId: "xt", code: "G3", name: "Giảng đường G3" },
  { id: "hl-alpha", campusId: "hl", code: "AL", name: "Alpha" },
];

const equipmentSets: Equipment[][] = [
  ["projector", "ac", "whiteboard"],
  ["projector", "microphone", "ac"],
  ["projector", "microphone", "sound", "ac"],
];
const initialRooms: Room[] = [
  ...Array.from({ length: 35 }, (_, index) => {
    const floor = Math.floor(index / 10) + 1;
    const number = floor * 100 + (index % 10) + 1;
    return {
      id: `km-${number}`,
      buildingId: "km-a",
      name: `KM-${number}`,
      capacity: 40 + (index % 4) * 10,
      equipment: equipmentSets[index % 3],
      rentable: index !== 8,
      bufferMinutes: 15,
    } satisfies Room;
  }),
  {
    id: "xt-g2-201",
    buildingId: "xt-g2",
    name: "G2-201",
    capacity: 70,
    equipment: equipmentSets[0],
    rentable: true,
    bufferMinutes: 15,
  },
  {
    id: "xt-g3-hall",
    buildingId: "xt-g3",
    name: "Hội trường G3",
    capacity: 180,
    equipment: equipmentSets[2],
    rentable: true,
    bufferMinutes: 15,
  },
  {
    id: "xt-g3-204",
    buildingId: "xt-g3",
    name: "G3-204",
    capacity: 65,
    equipment: equipmentSets[1],
    rentable: true,
    bufferMinutes: 15,
  },
  {
    id: "hl-alpha-101",
    buildingId: "hl-alpha",
    name: "AL-101",
    capacity: 90,
    equipment: equipmentSets[2],
    rentable: true,
    bufferMinutes: 15,
  },
];

function at(dayOffset: number, hour: number, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}
const initialBookings: Booking[] = [
  {
    id: "BR-2609-104",
    clubCode: "MEC",
    clubName: "CLB Truyền thông & Sự kiện",
    activityName: "Workshop UX cho tân sinh viên",
    description: "Thực hành quy trình thiết kế sản phẩm số.",
    roomId: "km-201",
    backupRoomId: "km-202",
    startAt: at(3, 8),
    endAt: at(3, 11),
    participants: 72,
    contactPerson: "Nguyễn Minh Anh",
    contactPhone: "0912 345 678",
    contactEmail: "minhanh.mec@university.edu.vn",
    equipment: ["projector", "microphone"],
    status: "pending_hold",
    physicalStatus: "submitted",
    scanName: "mau-a-mec.pdf",
    holdExpiresAt: at(2, 17),
    createdAt: at(-1, 9),
  },
  {
    id: "BR-2609-105",
    clubCode: "RBC",
    clubName: "CLB Robotics",
    activityName: "Demo robot tự hành",
    description: "Trình diễn sản phẩm cuối kỳ.",
    roomId: "xt-g3-hall",
    startAt: at(5, 18),
    endAt: at(5, 20, 30),
    participants: 150,
    contactPerson: "Trần Gia Huy",
    contactPhone: "0988 112 233",
    contactEmail: "robotics@university.edu.vn",
    equipment: ["projector", "microphone", "sound"],
    status: "pending_hold",
    physicalStatus: "confirmed_received",
    holdExpiresAt: at(2, 12),
    createdAt: at(-2, 10),
  },
  {
    id: "BR-2609-106",
    clubCode: "MEC",
    clubName: "CLB Truyền thông & Sự kiện",
    activityName: "Tập huấn MC nội bộ",
    description: "Huấn luyện dẫn chương trình.",
    roomId: "km-102",
    startAt: at(2, 14),
    endAt: at(2, 16),
    participants: 35,
    contactPerson: "Nguyễn Minh Anh",
    contactPhone: "0912 345 678",
    contactEmail: "minhanh.mec@university.edu.vn",
    equipment: ["microphone"],
    status: "needs_revision",
    physicalStatus: "not_submitted",
    holdExpiresAt: at(2, 18),
    note: "Bổ sung số điện thoại người phụ trách tại hiện trường.",
    createdAt: at(-1, 14),
  },
  {
    id: "BR-2609-107",
    clubCode: "ECS",
    clubName: "CLB Tiếng Anh",
    activityName: "English Speaking Night",
    description: "Sinh hoạt tiếng Anh theo chủ đề.",
    roomId: "km-101",
    startAt: at(0, 8),
    endAt: at(0, 10),
    participants: 44,
    contactPerson: "Phạm Quỳnh Chi",
    contactPhone: "0903 222 111",
    contactEmail: "english@university.edu.vn",
    equipment: ["projector"],
    status: "pending_hold",
    physicalStatus: "not_submitted",
    holdExpiresAt: at(1, 15),
    createdAt: at(-1, 8),
  },
  {
    id: "BR-2609-108",
    clubCode: "BKC",
    clubName: "CLB Sách",
    activityName: "Ngày hội trao đổi sách",
    description: "Trao đổi sách cũ và giao lưu tác giả.",
    roomId: "km-302",
    startAt: at(1, 13, 30),
    endAt: at(1, 16),
    participants: 60,
    contactPerson: "Vũ Hà Linh",
    contactPhone: "0911 777 555",
    contactEmail: "bookclub@university.edu.vn",
    equipment: ["projector", "ac"],
    status: "approved",
    physicalStatus: "confirmed_received",
    scanName: "mau-a-bkc.pdf",
    createdAt: at(-4, 9),
  },
];
const initialBlackouts: Blackout[] = [
  {
    id: "BO-001",
    roomIds: ["km-101", "km-102", "km-201", "km-302"],
    startAt: at(0, 10),
    endAt: at(0, 12),
    reason: "Phục vụ kỳ thi",
    note: "Khóa phục vụ kỳ thi",
  },
];

type NewBooking = Omit<
  Booking,
  "id" | "status" | "physicalStatus" | "holdExpiresAt" | "createdAt"
>;
type Store = {
  campuses: Campus[];
  buildings: Building[];
  rooms: Room[];
  bookings: Booking[];
  blackouts: Blackout[];
  addBooking: (data: NewBooking) => Booking;
  updateBooking: (id: string, patch: Partial<Booking>) => void;
  cancelBooking: (id: string) => void;
  uploadScan: (id: string, file: File | string) => void;
  addBlackout: (data: Omit<Blackout, "id">) => void;
  addRoom: (data: Omit<Room, "id">) => void;
  updateRoom: (id: string, patch: Partial<Room>) => void;
  isRoomAvailable: (
    roomId: string,
    startAt: string,
    endAt: string,
    excludeId?: string,
  ) => boolean;
  supportContact: SupportContact;
  updateSupportContact: (data: SupportContact) => void;
  notifications: Notification[];
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: (audience: "club" | "admin") => void;
};

const StoreContext = createContext<Store | null>(null);
const activeStatuses: BookingStatus[] = [
  "pending_hold",
  "needs_revision",
  "approved",
  "room_changed",
];

export function PrototypeStoreProvider({ children }: { children: ReactNode }) {
  const [campusList, setCampusList] = useState<Campus[]>([]);
  const [buildingList, setBuildingList] = useState<Building[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [blackouts, setBlackouts] = useState<Blackout[]>([]);
  const [supportContact, setSupportContact] = useState<SupportContact>({
      name: "Nguyễn Thu Hà",
      role: "Cán bộ VP Đoàn",
      phone: "024 3754 7461",
      email: "vpdoan@vnu.edu.vn",
      shift: "08:00 - 17:30, Thứ Hai - Thứ Sáu",
  });
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const mapCampus = (c: any): Campus => ({ id: String(c.id) as CampusId, code: c.code, name: c.name });
  const mapBuilding = (b: any): Building => ({ id: String(b.id), campusId: String(b.campus) as CampusId, code: b.campus_code ?? "", name: b.name });
  const mapRoom = (r: any): Room => ({
    id: String(r.id), buildingId: String(r.building), name: r.name, capacity: r.capacity,
    equipment: (["projector","microphone","ac","whiteboard","sound"] as Equipment[]).filter((e) =>
      e === "projector" ? r.has_projector : e === "microphone" ? r.has_microphone : e === "ac" ? r.has_ac : e === "whiteboard" ? r.has_whiteboard : r.has_sound_system),
    rentable: r.rentable && r.active, bufferMinutes: Math.max(r.buffer_before_minutes ?? 0, r.buffer_after_minutes ?? 0),
  });
  const mapBooking = (b: any): Booking => ({
    id: String(b.id), clubCode: b.organization?.toString() ?? "", clubName: b.organization_name ?? "CLB",
    activityName: b.activity_name, description: b.description, roomId: String(b.room), backupRoomId: b.secondary_room ? String(b.secondary_room) : undefined,
    startAt: b.start_time, endAt: b.end_time, participants: b.participant_count, contactPerson: b.contact_person,
    contactPhone: b.contact_phone, contactEmail: b.contact_email,     equipment: Object.entries(b.equipment_request ?? {})
      .filter(([, enabled]) => Boolean(enabled))
      .map(([name]) => name as Equipment),
    status: b.status, physicalStatus: b.physical_status, scanName: b.scan_file_url?.split("/").pop(),
    holdExpiresAt: b.hold_expires_at, note: b.notes, createdAt: b.created_at,
  });
  useEffect(() => {
    Promise.all([
      api.get(endpoints.campuses), api.get(endpoints.buildings), api.get(endpoints.rooms),
      api.get(endpoints.bookings), api.get(endpoints.blackouts),
    ]).then(([campusesResponse, buildingsResponse, roomsResponse, bookingsResponse, blackoutsResponse]) => {
      setCampusList((campusesResponse.data.results ?? campusesResponse.data).map(mapCampus));
      setBuildingList((buildingsResponse.data.results ?? buildingsResponse.data).map(mapBuilding));
      setRooms((roomsResponse.data.results ?? roomsResponse.data).map(mapRoom));
      setBookings((bookingsResponse.data.results ?? bookingsResponse.data).map(mapBooking));
      setBlackouts((blackoutsResponse.data.results ?? blackoutsResponse.data).map((b: any) => ({ ...b, id: String(b.id), roomIds: (b.room_ids ?? []).map(String), startAt: b.start_time, endAt: b.end_time, reason: b.reason ?? "", note: b.note })));
    }).catch(() => undefined);
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
  const isRoomAvailable = (
    roomId: string,
    startAt: string,
    endAt: string,
    excludeId?: string,
  ) => {
    const room = rooms.find((item) => item.id === roomId);
    if (!room?.rentable) return false;
    const start = new Date(startAt).getTime() - room.bufferMinutes * 60_000;
    const end = new Date(endAt).getTime() + room.bufferMinutes * 60_000;
    const bookingConflict = bookings.some(
      (item) =>
        item.id !== excludeId &&
        item.roomId === roomId &&
        activeStatuses.includes(item.status) &&
        start < new Date(item.endAt).getTime() + room.bufferMinutes * 60_000 &&
        end > new Date(item.startAt).getTime() - room.bufferMinutes * 60_000,
    );
    const blackoutConflict = blackouts.some(
      (item) =>
        item.roomIds.includes(roomId) &&
        start < new Date(item.endAt).getTime() &&
        end > new Date(item.startAt).getTime(),
    );
    return !bookingConflict && !blackoutConflict;
  };
  const value = useMemo<Store>(
    () => ({
      campuses: campusList.length ? campusList : campuses,
      buildings: buildingList.length ? buildingList : buildings,
      rooms,
      bookings,
      blackouts,
      addBooking: (data) => {
        const now = new Date();
        const booking: Booking = {
          ...data,
          id: `BR-${now.getFullYear().toString().slice(-2)}${String(now.getMonth() + 1).padStart(2, "0")}-${Math.floor(100 + Math.random() * 900)}`,
          status: "pending_hold",
          physicalStatus: "not_submitted",
          holdExpiresAt: new Date(
            now.getTime() + 48 * 60 * 60 * 1000,
          ).toISOString(),
          createdAt: now.toISOString(),
        };
        api.post(endpoints.bookings, {
          room: Number(data.roomId), secondary_room: data.backupRoomId ? Number(data.backupRoomId) : null,
          activity_name: data.activityName, description: data.description, participant_count: data.participants,
          contact_person: data.contactPerson, contact_phone: data.contactPhone, contact_email: data.contactEmail,
          start_time: data.startAt, end_time: data.endAt, equipment_request: Object.fromEntries(data.equipment.map((x) => [x, true])),
        }).then(({ data: remote }) =>
          api.post(`${endpoints.bookings}${remote.id}/submit/`).then(({ data: submitted }) =>
            setBookings((items) => [mapBooking(submitted), ...items]),
          ),
        ).catch(() => undefined);
        notify(
          "admin",
          "Có đơn mượn phòng mới",
          `${booking.clubName} vừa gửi ${booking.id}.`,
          booking.id,
        );
        return booking;
      },
      updateBooking: (id, patch) => {
        const action = patch.status === "approved" ? "approve" : patch.status === "rejected" ? "reject" : patch.status === "needs_revision" ? "request-revision" : undefined;
        if (patch.physicalStatus === "confirmed_received") {
          api.post(`${endpoints.bookings}${id}/confirm-physical/`)
            .then(({ data }) => setBookings((items) => items.map((item) => item.id === id ? mapBooking(data) : item)))
            .catch(() => undefined);
          setBookings((items) => items.map((item) => item.id === id ? { ...item, physicalStatus: "confirmed_received" } : item));
        }
        if (action) api.post(`${endpoints.bookings}${id}/${action}/`, { reason: patch.note }).then(() => api.get(`${endpoints.bookings}${id}/`).then(({ data }) => setBookings((items) => items.map((item) => item.id === id ? mapBooking(data) : item)))).catch(() => undefined);
        else if (patch.roomId) api.post(`${endpoints.bookings}${id}/change-room/`, { new_room: Number(patch.roomId), reason: patch.note }).catch(() => undefined);
        if (patch.status)
          notify(
            "club",
            patch.status === "needs_revision"
              ? "Đơn cần bổ sung"
              : "Trạng thái đơn đã thay đổi",
            `${id} đã chuyển sang ${patch.status}.`,
            id,
          );
      },
      cancelBooking: (id) => {
        api.post(`${endpoints.bookings}${id}/cancel/`).catch(() => undefined);
        setBookings((items) =>
          items.map((item) =>
            item.id === id ? { ...item, status: "cancelled" } : item,
          ),
        );
      },
      uploadScan: (id, file) => {
        const fileName = typeof file === "string" ? file : file.name;
        if (file instanceof File) {
          const form = new FormData();
          form.append("file", file);
          api.post(`${endpoints.bookings}${id}/upload-scan/`, form, { headers: { "Content-Type": "multipart/form-data" } }).catch(() => undefined);
        }
        setBookings((items) =>
          items.map((item) =>
            item.id === id
              ? { ...item, physicalStatus: "submitted", scanName: fileName }
              : item,
          ),
        );
        notify(
          "admin",
          "CLB đã upload bản scan",
          `${id} đã tải lên ${fileName}.`,
          id,
        );
      },
      addBlackout: (data) => {
        api.post(endpoints.blackouts, { scope_type: "room", room_ids: data.roomIds.map(Number), start_time: data.startAt, end_time: data.endAt, reason: data.reason, note: data.note }).then(({ data: remote }) => setBlackouts((items) => [{ ...data, id: String(remote.id) }, ...items])).catch(() => undefined);
      },
      addRoom: (data) =>
        setRooms((items) => [
          ...items,
          { ...data, id: `${data.buildingId}-${Date.now()}` },
        ]),
      updateRoom: (id, patch) =>
        setRooms((items) =>
          items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        ),
      isRoomAvailable,
      supportContact,
      updateSupportContact: setSupportContact,
      notifications,
      markNotificationRead: (id) =>
        setNotifications((items) =>
          items.map((item) =>
            item.id === id ? { ...item, read: true } : item,
          ),
        ),
      markAllNotificationsRead: (audience) =>
        setNotifications((items) =>
          items.map((item) =>
            item.audience === audience ? { ...item, read: true } : item,
          ),
        ),
    }),
    [campusList, buildingList, rooms, bookings, blackouts, supportContact, notifications],
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
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
