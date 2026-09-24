import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import type { Booking, Building, Campus, DocumentTemplateContent, Room } from "./prototype-store";
import { defaultDocumentTemplateContent } from "./prototype-store";

export type ScheduleRow = {
  booking: Booking;
  room?: Room;
  building?: Building;
  campus?: Campus;
  display?: { time: string; location: string; organization: string; note: string };
};

export type MauASlot = { bookingId: string; time: string; location: string };
export type MauAFields = {
  clubName: string;
  issueDate: string;
  intro: string;
  participants: string;
  signerTitle: string;
  signerName: string;
  equipment: string;
  slots: MauASlot[];
};

const weekday = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
const borders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
};
const noBorders = {
  top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
  left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
  insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
};
const hm = (date: Date) => `${String(date.getHours()).padStart(2, "0")}h${String(date.getMinutes()).padStart(2, "0")}`;
const dateText = (date: Date) => `Hà Nội, ngày ${date.getDate()} tháng ${date.getMonth() + 1} năm ${date.getFullYear()}`;
const run = (value: string, color = "000000", bold = false, size = 24) =>
  new TextRun({ text: value, color, bold, font: "Times New Roman", size });
const para = (value: string, options: { alignment?: (typeof AlignmentType)[keyof typeof AlignmentType]; bold?: boolean; size?: number; color?: string } = {}) =>
  new Paragraph({
    alignment: options.alignment ?? AlignmentType.LEFT,
    spacing: { before: 80, after: 80 },
    children: value.split("\n").flatMap((line, index) => [
      ...(index ? [new TextRun({ text: "", break: 1 })] : []),
      run(line, options.color ?? "000000", options.bold ?? false, options.size ?? 24),
    ]),
  });
const mixedPara = (label: string, value: string) => new Paragraph({
  spacing: { before: 80, after: 80 },
  children: [run(label, "000000", true), run(value, "EE0000")],
});
const cell = (value: string, width: number, bold = false) => new TableCell({
  width: { size: width, type: WidthType.DXA }, borders, verticalAlign: VerticalAlign.CENTER,
  children: [para(value, { alignment: AlignmentType.CENTER, bold, size: 22 })],
});
const noBorderCell = (width: number, paragraphs: Paragraph[]) => new TableCell({
  width: { size: width, type: WidthType.DXA }, borders: noBorders, children: paragraphs,
});
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
const download = async (doc: Document, fileName: string) => {
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
const templateOrDefault = (value?: DocumentTemplateContent) => ({ ...defaultDocumentTemplateContent, ...(value ?? {}) });

export function scheduleRowDisplay(row: ScheduleRow) {
  const start = new Date(row.booking.startAt);
  const end = new Date(row.booking.endAt);
  return row.display ?? {
    time: `${hm(start)} - ${hm(end)}\n${weekday[start.getDay()]}\n(Ngày ${String(start.getDate()).padStart(2, "0")}/${String(start.getMonth() + 1).padStart(2, "0")}/${start.getFullYear()})`,
    location: [row.room?.name ?? row.booking.roomName, row.building?.name ?? row.booking.buildingName, row.campus?.name ?? row.booking.campusName].filter(Boolean).join("\n"),
    organization: row.booking.clubName,
    note: row.booking.note ?? "",
  };
}

export async function exportScheduleDocx(
  rows: ScheduleRow[], fileName: string, rawTemplate?: DocumentTemplateContent,
  options: { redDynamicText?: boolean; issueDate?: string } = {},
) {
  const template = templateOrDefault(rawTemplate);
  const header = new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [5000, 4360], borders: noBorders, rows: [
    new TableRow({ children: [
      noBorderCell(5000, [para(template.leftHeader, { alignment: AlignmentType.CENTER, bold: true, size: 22 })]),
      noBorderCell(4360, [
        para(template.rightHeader, { alignment: AlignmentType.CENTER, bold: true, size: 22 }),
        para(options.issueDate ?? dateText(new Date()), { alignment: AlignmentType.CENTER, size: 22 }),
      ]),
    ] }),
  ] });
  const tableRows = [
    new TableRow({ tableHeader: true, children: [
      cell("STT", 600, true), cell("Thời gian", 3100, true), cell("Địa điểm", 1800, true),
      cell("Đơn vị", 2500, true), cell("Ghi chú", 1360, true),
    ] }),
    ...rows.map((row, index) => {
      const display = scheduleRowDisplay(row);
      const dynamicCell = (value: string, width: number) => new TableCell({
        width: { size: width, type: WidthType.DXA }, borders, verticalAlign: VerticalAlign.CENTER,
        children: [para(value, { alignment: AlignmentType.CENTER, size: 22, color: options.redDynamicText ? "EE0000" : "000000" })],
      });
      return new TableRow({ children: [
        cell(String(index + 1), 600), dynamicCell(display.time, 3100), dynamicCell(display.location, 1800),
        dynamicCell(display.organization, 2500), dynamicCell(display.note, 1360),
      ] });
    }),
  ];
  const signature = new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [4680, 4680], borders: noBorders, rows: [
    new TableRow({ children: [
      noBorderCell(4680, [para(template.leftSignature, { alignment: AlignmentType.CENTER, bold: true, size: 22 }), new Paragraph("\n\n\n")]),
      noBorderCell(4680, [para(template.rightSignature, { alignment: AlignmentType.CENTER, bold: true, size: 22 }), new Paragraph("\n\n\n")]),
    ] }),
  ] });
  const doc = new Document({
    styles: { default: { document: { run: { font: "Times New Roman", size: 24 } } } },
    sections: [{ properties: { page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } }, children: [
      header, para(template.title, { alignment: AlignmentType.CENTER, bold: true, size: 32 }),
      para(template.recipient, { alignment: AlignmentType.CENTER, bold: true }),
      para(template.intro),
      new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [600, 3100, 1800, 2500, 1360], rows: tableRows }),
      para(template.commitment), para(template.closing), signature,
    ] }],
  });
  await download(doc, fileName);
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
  if (!win) return;
  win.document.write(`<html><head><title>${escapeHtml(template.title)}</title><style>body{font:14px 'Times New Roman';margin:35px;color:#000}.heads,.sign{display:flex;justify-content:space-between;text-align:center;font-weight:bold;white-space:pre-line}h1{text-align:center;font-size:20px}p{white-space:pre-line}table{width:100%;border-collapse:collapse}td,th{border:1px solid;padding:8px;text-align:center;white-space:pre-line}${options.redDynamicText ? 'td{color:#ee0000}' : ''}</style></head><body><div class="heads"><div>${escapeHtml(template.leftHeader)}</div><div>${escapeHtml(template.rightHeader)}<div>${escapeHtml(options.issueDate ?? dateText(new Date()))}</div></div></div><h1>${escapeHtml(template.title)}</h1><p style="text-align:center"><b>${escapeHtml(template.recipient)}</b></p><p>${escapeHtml(template.intro)}</p><table><tr><th>STT</th><th>Thời gian</th><th>Địa điểm</th><th>Đơn vị</th><th>Ghi chú</th></tr>${body}</table><p>${escapeHtml(template.commitment)}</p><p>${escapeHtml(template.closing)}</p><div class="sign"><div>${escapeHtml(template.leftSignature)}</div><div>${escapeHtml(template.rightSignature)}</div></div></body></html>`);
  win.document.close();
  win.print();
}

const equipmentName: Record<string, string> = {
  projector: "Máy chiếu", microphone: "Micro", ac: "Điều hòa", whiteboard: "Bảng", sound: "Âm thanh",
};
export function mauAFieldsFromBookings(bookings: Booking[]): MauAFields {
  const first = bookings[0];
  const clubName = first?.clubName ?? "";
  const activities = [...new Set(bookings.map((booking) => booking.activityName).filter(Boolean))].join(", ");
  const descriptions = [...new Set(bookings.map((booking) => booking.description).filter(Boolean))].join(" ");
  return {
    clubName,
    issueDate: dateText(new Date()),
    intro: `Thực hiện kế hoạch năm học, ${clubName} tổ chức ${activities}. ${descriptions}`.trim(),
    participants: bookings.length ? `${Math.max(...bookings.map((booking) => booking.participants))} người` : "",
    signerTitle: "CHỦ NHIỆM",
    signerName: first?.contactPerson ?? "",
    equipment: [...new Set(bookings.flatMap((booking) => booking.equipment).map((item) => equipmentName[item] ?? item))].join(", ") || "Không yêu cầu",
    slots: bookings.map((booking) => ({
      bookingId: booking.id,
      time: scheduleRowDisplay({ booking }).time.replace(/\n/g, ", "),
      location: [booking.roomName, booking.buildingName, booking.campusName].filter(Boolean).join(" - "),
    })),
  };
}

export const mauAFixed = {
  institution: "HỘI SINH VIÊN TRƯỜNG ĐẠI HỌC CÔNG NGHỆ",
  title: "ĐƠN ĐỀ NGHỊ",
  recipient: "Kính gửi: Phòng Hành chính Quản trị và Tổ chức cán bộ",
  request: "Kính đề nghị Quý phòng xem xét, hỗ trợ cụ thể như sau:",
  commitment: "CLB cam kết sau khi sử dụng xong sẽ bố trí lại giảng đường như ban đầu.",
  closing: "Kính mong nhận được sự giúp đỡ của Quý Phòng!\nXin chân thành cảm ơn!",
};

export async function exportMauADocx(fields: MauAFields, fileName: string) {
  const header = new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [5000, 4360], borders: noBorders, rows: [
    new TableRow({ children: [
      noBorderCell(5000, [para(mauAFixed.institution, { alignment: AlignmentType.CENTER, bold: true, size: 22 }), para(fields.clubName, { alignment: AlignmentType.CENTER, bold: true, size: 22, color: "EE0000" })]),
      noBorderCell(4360, [para(fields.issueDate, { alignment: AlignmentType.CENTER, size: 22, color: "EE0000" })]),
    ] }),
  ] });
  const signatures = new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [3120, 3120, 3120], borders: noBorders, rows: [
    new TableRow({ children: [
      noBorderCell(3120, [para("Ý KIẾN\nPHÒNG HCQT VÀ TCCB", { alignment: AlignmentType.CENTER, bold: true, size: 22 })]),
      noBorderCell(3120, [para("Ý KIẾN\nHỘI SINH VIÊN TRƯỜNG", { alignment: AlignmentType.CENTER, bold: true, size: 22 })]),
      noBorderCell(3120, [para("TM. BAN CHỦ NHIỆM", { alignment: AlignmentType.CENTER, bold: true, size: 22 }), para(fields.signerTitle, { alignment: AlignmentType.CENTER, bold: true, size: 22, color: "EE0000" }), new Paragraph("\n\n\n"), para(fields.signerName, { alignment: AlignmentType.CENTER, bold: true, size: 22, color: "EE0000" })]),
    ] }),
  ] });
  const schedule = fields.slots.flatMap((slot, index) => [
    mixedPara(`Thời gian ${fields.slots.length > 1 ? index + 1 : ""}: `, slot.time),
    mixedPara(`Địa điểm ${fields.slots.length > 1 ? index + 1 : ""}: `, slot.location),
  ]);
  const doc = new Document({
    styles: { default: { document: { run: { font: "Times New Roman", size: 24 } } } },
    sections: [{ properties: { page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } }, children: [
      header, para(mauAFixed.title, { alignment: AlignmentType.CENTER, bold: true, size: 32 }),
      para(mauAFixed.recipient, { alignment: AlignmentType.CENTER, bold: true }),
      para(fields.intro, { color: "EE0000" }), para(mauAFixed.request),
      para("Thời gian, địa điểm:", { bold: true }), ...schedule,
      para(`Cơ sở vật chất: ${fields.equipment}`),
      mixedPara("Số lượng người tham gia: ", fields.participants),
      para(mauAFixed.commitment), para(mauAFixed.closing), signatures,
    ] }],
  });
  await download(doc, fileName);
}

export function printMauA(fields: MauAFields) {
  const schedule = fields.slots.map((slot, index) => `<p>Thời gian ${fields.slots.length > 1 ? index + 1 : ""}: <span class="red">${escapeHtml(slot.time)}</span><br>Địa điểm ${fields.slots.length > 1 ? index + 1 : ""}: <span class="red">${escapeHtml(slot.location)}</span></p>`).join("");
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<html><head><title>Mẫu A</title><style>body{font:14px 'Times New Roman';margin:38px;color:#000}.heads,.sign{display:flex;justify-content:space-between;text-align:center;white-space:pre-line}.heads{font-weight:bold}.sign>div{width:33%}.red{color:#ee0000}h1{text-align:center;font-size:20px}p{line-height:1.35;margin:8px 0;white-space:pre-line}</style></head><body><div class="heads"><div>${escapeHtml(mauAFixed.institution)}<br><span class="red">${escapeHtml(fields.clubName)}</span></div><div class="red">${escapeHtml(fields.issueDate)}</div></div><h1>${escapeHtml(mauAFixed.title)}</h1><p style="text-align:center"><b>${escapeHtml(mauAFixed.recipient)}</b></p><p class="red">${escapeHtml(fields.intro)}</p><p>${escapeHtml(mauAFixed.request)}</p><p><b>Thời gian, địa điểm:</b></p>${schedule}<p>Cơ sở vật chất: ${escapeHtml(fields.equipment)}</p><p>Số lượng người tham gia: <span class="red">${escapeHtml(fields.participants)}</span></p><p>${escapeHtml(mauAFixed.commitment)}</p><p>${escapeHtml(mauAFixed.closing).replace(/\n/g, "<br>")}</p><div class="sign"><div><b>Ý KIẾN<br>PHÒNG HCQT VÀ TCCB</b></div><div><b>Ý KIẾN<br>HỘI SINH VIÊN TRƯỜNG</b></div><div><b>TM. BAN CHỦ NHIỆM<br><span class="red">${escapeHtml(fields.signerTitle)}</span></b><br><br><br><br><b class="red">${escapeHtml(fields.signerName)}</b></div></div></body></html>`);
  win.document.close();
  win.print();
}
