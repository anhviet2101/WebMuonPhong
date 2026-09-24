import type { Booking, Building, Campus, DocumentTemplateContent, Room } from "./prototype-store";
import { defaultDocumentTemplateContent } from "./prototype-store";
import { api, endpoints } from "@/lib/api";

export type ScheduleRow = {
  booking: Booking;
  room?: Room;
  building?: Building;
  campus?: Campus;
  display?: { time: string; location: string; organization: string; note: string };
};

export type MauASlot = { bookingId: string; time: string; location: string };
export type MauAFields = {
  headerType: "hsv" | "doan";
  clubName: string;
  issueDate: string;
  intro: string;
  participants: string;
  signerTitle: string;
  signerName: string;
  slots: MauASlot[];
};

const weekday = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
const hm = (date: Date) => `${String(date.getHours()).padStart(2, "0")}h${String(date.getMinutes()).padStart(2, "0")}`;
const dateText = (date: Date) => `Hà Nội, ngày ${date.getDate()} tháng ${date.getMonth() + 1} năm ${date.getFullYear()}`;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
const printWhenReady = (win: Window) => {
  win.document.close();
  win.setTimeout(() => {
    void Promise.resolve(win.document.fonts?.ready).then(() => {
      win.focus();
      win.print();
    });
  }, 250);
};
const templateOrDefault = (value?: DocumentTemplateContent) => ({ ...defaultDocumentTemplateContent, ...(value ?? {}) });

export function scheduleRowDisplay(row: ScheduleRow) {
  const start = new Date(row.booking.startAt);
  const end = new Date(row.booking.endAt);
  return row.display ?? {
    time: `${hm(start)} – ${hm(end)}\n${weekday[start.getDay()]}\n(Ngày ${String(start.getDate()).padStart(2, "0")}/${String(start.getMonth() + 1).padStart(2, "0")}/${start.getFullYear()})`,
    location: [row.room?.name ?? row.booking.roomName, row.building?.name ?? row.booking.buildingName].filter(Boolean).join("\n"),
    organization: row.booking.clubName,
    note: row.booking.note ?? "",
  };
}

export async function exportScheduleDocx(
  rows: ScheduleRow[], fileName: string, rawTemplate?: DocumentTemplateContent,
  options: { redDynamicText?: boolean; issueDate?: string } = {},
) {
  const template = templateOrDefault(rawTemplate);
  const { data } = await api.post(`${endpoints.bookings}export-mau-b/`, {
    rows: rows.map(scheduleRowDisplay), template, issueDate: options.issueDate ?? dateText(new Date()),
  }, { responseType: "blob" });
  downloadBlob(data, fileName);
}

export function printSchedule(
  rows: ScheduleRow[], rawTemplate?: DocumentTemplateContent,
  options: { redDynamicText?: boolean; issueDate?: string } = {},
) {
  const template = templateOrDefault(rawTemplate);
  const body = rows.map((row, index) => {
    const display = scheduleRowDisplay(row);
    return `<tr><td>${index + 1}</td><td>${escapeHtml(display.time)}</td><td>${escapeHtml(display.location)}</td><td>${escapeHtml(display.organization)}</td><td>${escapeHtml(display.note)}</td></tr>`;
  }).join("");
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(`<html><head><meta charset="utf-8"><title>${escapeHtml(template.title)}</title><style>@page{size:A4;margin:25.4mm}body{font:14pt/1.35 'Times New Roman',serif;color:#000}.heads,.sign{display:flex;justify-content:space-between;text-align:center;white-space:pre-line}.heads>div,.sign>div{width:50%}.heads,.sign{font-weight:bold}h1{text-align:center;font-size:20pt}p{white-space:pre-line;text-align:justify;margin:8px 0}table{width:100%;border-collapse:collapse;table-layout:fixed}td,th{border:1px solid;padding:6px;text-align:center;white-space:pre-line;overflow-wrap:anywhere}${options.redDynamicText ? 'td{color:#ee0000}' : ''}</style></head><body><div class="heads"><div>${escapeHtml(template.leftHeader)}</div><div>${escapeHtml(template.rightHeader)}<div>${escapeHtml(options.issueDate ?? dateText(new Date()))}</div></div></div><h1>${escapeHtml(template.title)}</h1><p style="text-align:center"><b>${escapeHtml(template.recipient)}</b></p><p>${escapeHtml(template.intro)}</p><table><tr><th>STT</th><th>Thời gian</th><th>Địa điểm</th><th>Đơn vị</th><th>Ghi chú</th></tr>${body}</table><p>${escapeHtml(template.commitment)}</p><p>${escapeHtml(template.closing)}</p><div class="sign"><div>${escapeHtml(template.leftSignature)}</div><div>${escapeHtml(template.rightSignature)}<br><br><br><br>${escapeHtml(template.rightSignerName)}</div></div></body></html>`);
  const layout = win.document.createElement("style");
  layout.textContent = "@page{size:A4;margin:25.4mm}body{font-size:14pt;line-height:1.15}h1{margin:22px 0 16px}.heads{align-items:flex-start;font-size:14pt;line-height:1.15}.heads>div{padding:0 4px}.heads>div:first-child::first-line{font-weight:normal}table{margin:18px 0;font-size:14pt;line-height:1.12}td,th{padding:5px 3px;vertical-align:middle;overflow-wrap:break-word}th:nth-child(1){width:6%}th:nth-child(2){width:29%}th:nth-child(3){width:22%}th:nth-child(4){width:27%}th:nth-child(5){width:16%}tr{break-inside:avoid}p{margin:9px 0}.sign{margin-top:26px;break-inside:avoid;font-size:14pt}";
  win.document.head.append(layout);
  printWhenReady(win);
  return true;
}

export function mauAFieldsFromBookings(bookings: Booking[]): MauAFields {
  const first = bookings[0];
  const clubName = first?.clubName ?? "";
  const activities = [...new Set(bookings.map((booking) => booking.activityName).filter(Boolean))].join(", ");
  const descriptions = [...new Set(bookings.map((booking) => booking.description).filter(Boolean))].join(" ");
  const purpose = descriptions.replace(/[.!?\s]+$/u, "") || "sinh hoạt câu lạc bộ";
  return {
    headerType: "hsv",
    clubName,
    issueDate: dateText(new Date()),
    intro: `Thực hiện kế hoạch trong năm học về kế hoạch công tác sinh hoạt và phổ biến các hoạt động định hướng, ${clubName || "Câu lạc bộ"} tiến hành tổ chức ${activities || "hoạt động"} với mục đích ${purpose}.`,
    participants: bookings.length ? `${Math.max(...bookings.map((booking) => booking.participants))} người` : "",
    signerTitle: "CHỦ NHIỆM",
    signerName: first?.contactPerson ?? "",
    slots: bookings.map((booking) => ({
      bookingId: booking.id,
      time: `${hm(new Date(booking.startAt))} - ${hm(new Date(booking.endAt))}, ${weekday[new Date(booking.startAt).getDay()].toLowerCase()} ngày ${new Date(booking.startAt).getDate()} tháng ${new Date(booking.startAt).getMonth() + 1} năm ${new Date(booking.startAt).getFullYear()}.`,
      location: [booking.roomName ? `Phòng ${booking.roomName}` : "", booking.buildingName].filter(Boolean).join(" - "),
    })),
  };
}

export const mauAFixed = {
  institution: "HỘI SINH VIÊN TRƯỜNG ĐẠI HỌC CÔNG NGHỆ",
  title: "ĐƠN ĐỀ NGHỊ",
  recipient: "Kính gửi: Phòng Hành chính Quản trị và Tổ chức cán bộ",
  request: "Kính đề nghị Quý phòng xem xét, hỗ trợ cụ thể như sau:",
  commitment: "CLB cam kết sau khi sử dụng xong sẽ bố trí lại giảng đường như ban đầu.",
  responsibility: "Ngoài ra, đơn vị sẽ tự chủ động mượn và hoàn trả lại thiết bị về đúng nơi quy định. Nếu xảy ra trường hợp hỏng hóc hay mất thiết bị, đơn vị sẽ hoàn toàn chịu trách nhiệm.",
  closing: "Kính mong nhận được sự giúp đỡ của Quý Phòng!\nXin chân thành cảm ơn!",
};

export async function exportMauADocx(fields: MauAFields, fileName: string) {
  const { data } = await api.post(`${endpoints.bookings}export-mau-a/`, { fields }, { responseType: "blob" });
  downloadBlob(data, fileName);
}

export function printMauA(fields: MauAFields) {
  const schedule = fields.slots.map((slot, index) => `<p>Thời gian ${fields.slots.length > 1 ? index + 1 : ""}: <span class="red">${escapeHtml(slot.time)}</span><br>Địa điểm ${fields.slots.length > 1 ? index + 1 : ""}: <span class="red">${escapeHtml(slot.location)}</span></p>`).join("");
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(`<html><head><meta charset="utf-8"><title>Mẫu A</title><style>@page{size:A4;margin:25.4mm}body{font:14pt 'Times New Roman',serif;color:#000}.heads,.sign{display:flex;justify-content:space-between;text-align:center;white-space:pre-line}.heads{font-weight:bold}.sign>div{width:33%}h1{text-align:center;font-size:20pt}p{line-height:1.35;margin:8px 0;white-space:pre-line;text-align:justify}</style></head><body><div class="heads"><div>${escapeHtml(mauAFixed.institution)}<br><span>${escapeHtml(fields.clubName)}</span></div><div>${escapeHtml(fields.issueDate)}</div></div><h1>${escapeHtml(mauAFixed.title)}</h1><p style="text-align:center"><b>${escapeHtml(mauAFixed.recipient)}</b></p><p>${escapeHtml(fields.intro)} ${escapeHtml(mauAFixed.request)}</p><p><b>Thời gian, địa điểm:</b></p>${schedule}<p>Số lượng người tham gia: ${escapeHtml(fields.participants)}</p><p>${escapeHtml(mauAFixed.commitment)}</p><p>${escapeHtml(mauAFixed.responsibility)}</p><p>${escapeHtml(mauAFixed.closing).replace(/\n/g, "<br>")}</p><div class="sign"><div><b>Ý KIẾN<br>PHÒNG HCQT VÀ TCCB</b></div><div><b>Ý KIẾN<br>HỘI SINH VIÊN TRƯỜNG</b></div><div><b>TM. BAN CHỦ NHIỆM<br>${escapeHtml(fields.signerTitle)}</b><br><br><br><br><b>${escapeHtml(fields.signerName)}</b></div></div></body></html>`);
  const layout = win.document.createElement("style");
  layout.textContent = "@page{size:A4;margin:20mm 25.4mm 19.5mm 27.5mm}body{font:14pt/1.2 'Times New Roman',serif}.heads{font-weight:normal;align-items:flex-start;min-height:48px}.heads>div{width:50%}.heads span{font-weight:bold}h1{font-size:20pt;margin:24px 0 14px}p{margin:8px 0;line-height:1.2}.sign{margin-top:22px;break-inside:avoid}.sign>div{width:33.333%;font-size:14pt}.red{color:#000}";
  win.document.head.append(layout);
  printWhenReady(win);
  return true;
}
