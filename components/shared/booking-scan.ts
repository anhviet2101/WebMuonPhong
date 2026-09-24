import { api, endpoints } from "@/lib/api";

export async function openBookingScan(bookingId: string) {
  const viewer = window.open("", "_blank");
  try {
    const { data } = await api.get(`${endpoints.bookings}${bookingId}/scan/`, { responseType: "blob" });
    const url = URL.createObjectURL(data);
    if (viewer) viewer.location.href = url;
    else {
      const link = document.createElement("a");
      link.href = url;
      link.download = `ban-scan-don-${bookingId}`;
      link.click();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 300_000);
  } catch (error) {
    viewer?.close();
    throw error;
  }
}
