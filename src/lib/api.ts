import axios, {
  type AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";

const API_URL =
  import.meta.env.VITE_API_URL ??
  (import.meta.env.DEV ? "http://127.0.0.1:8000/api" : "/api");
export const accessTokenKey = "room-booking:access-token";
export const refreshTokenKey = "room-booking:refresh-token";

export type UserRole = "club" | "admin" | "facility" | "super_admin" | string;
export type AuthUser = {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: UserRole;
  organizationId?: string;
  organizationName?: string;
  isActive: boolean;
  mustChangePassword: boolean;
};
export type OrganizationProfile = {
  id?: string;
  active?: boolean;
  name: string;
  abbreviation?: string;
  address: string;
  representative_name?: string;
  hotline?: string;
  contact_email: string;
  fanpage_url?: string;
};
export type UserProfile = AuthUser & {
  organization?: OrganizationProfile;
  phone?: string;
  title?: string;
};
export type UserRecord = UserProfile & { lastLogin?: string; dateJoined?: string };
export type LoginResponse = {
  access: string;
  refresh?: string;
  user?: Partial<UserProfile> & {
    role?: UserRole;
    full_name?: string;
    organization_id?: string;
    organization_name?: string;
    is_active?: boolean;
    must_change_password?: boolean;
  };
  must_change_password?: boolean;
};

export const api = axios.create({
  baseURL: API_URL.replace(/\/$/, ""),
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem(accessTokenKey);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (error.response?.status !== 401 || !original || original._retry || original.url?.includes("/auth/")) {
      return Promise.reject(error);
    }
    const refresh = localStorage.getItem(refreshTokenKey);
    if (!refresh) return Promise.reject(error);
    original._retry = true;
    refreshing ??= axios
      .post<{ access: string }>(`${API_URL}/auth/refresh`, { refresh })
      .then(({ data }) => {
        setAuthTokens(data.access);
        return data.access;
      })
      .catch(() => {
        clearAuthTokens();
        return null;
      })
      .finally(() => {
        refreshing = null;
      });
    const token = await refreshing;
    if (!token) return Promise.reject(error);
    original.headers.Authorization = `Bearer ${token}`;
    return api(original);
  },
);

export function setAuthTokens(access: string, refresh?: string) {
  localStorage.setItem(accessTokenKey, access);
  if (refresh) localStorage.setItem(refreshTokenKey, refresh);
}
export function clearAuthTokens() {
  localStorage.removeItem(accessTokenKey);
  localStorage.removeItem(refreshTokenKey);
  localStorage.removeItem("room-booking:user");
}
export function getAccessToken() {
  return localStorage.getItem(accessTokenKey);
}
export function authRequest<T>(config: AxiosRequestConfig) {
  return api.request<T>(config);
}

export const endpoints = {
  authLogin: "/auth/login",
  authRefresh: "/auth/refresh",
  me: "/auth/me",
  profile: "/profile",
  organizationProfile: "/organization/profile",
  changePassword: "/auth/change-password",
  users: "/users",
  organizations: "/organizations/",
  campuses: "/campuses/",
  buildings: "/buildings/",
  rooms: "/rooms/",
  availableRooms: "/rooms/available/",
  bookings: "/bookings/",
  bookingCalendar: "/bookings/calendar/",
  blackouts: "/blackouts/",
  ruleConfigs: "/rule-configs/",
  documentTemplates: "/document-templates/",
  notifications: "/notifications/",
  auditLogs: "/audit-logs/",
};

type AuthTokens = { access: string; refresh?: string };

export function changePasswordErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) return "Không thể đổi mật khẩu. Vui lòng thử lại.";
  const data = error.response?.data;
  if (data && typeof data === "object") {
    const details = data as Record<string, unknown>;
    for (const key of ["old_password", "new_password", "detail", "non_field_errors"]) {
      const value = details[key];
      if (typeof value === "string" && value.trim()) return value;
      if (Array.isArray(value)) {
        const message = value.find((item): item is string => typeof item === "string" && !!item.trim());
        if (message) return message;
      }
    }
  }
  if (error.response) return `Không thể đổi mật khẩu (HTTP ${error.response.status}).`;
  return "Không kết nối được máy chủ. Vui lòng thử lại.";
}

export const authApi = {
  login: (username: string, password: string) =>
    api.post<LoginResponse>(endpoints.authLogin, { username, password }),
  me: () => api.get<UserProfile>(endpoints.me),
  updateProfile: (data: Partial<UserProfile>) => api.patch<UserProfile>(endpoints.profile, data),
  updateOrganization: (data: Partial<OrganizationProfile>) =>
    api.patch<OrganizationProfile>(endpoints.organizationProfile, data),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<AuthTokens>(endpoints.changePassword, { old_password: currentPassword, new_password: newPassword }),
  listUsers: () => api.get<{ results?: UserRecord[] } | UserRecord[]>(endpoints.users),
  createUser: (data: Record<string, unknown>) => api.post<UserRecord & { password?: string }>(endpoints.users, data),
  toggleUser: (id: string, isActive: boolean) => api.patch<UserRecord>(`${endpoints.users}/${id}`, { is_active: isActive }),
  resetUserPassword: (id: string) => api.post<{ password?: string }>(`${endpoints.users}/${id}/reset-password`),
};

export default api;
