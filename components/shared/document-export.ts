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
const run = (value: string, color = "000000", bold = false, size = 28) =>
  new TextRun({ text: value, color, bold, font: "Times New Roman", size });
const para = (value: string, options: { alignment?: (typeof AlignmentType)[keyof typeof AlignmentType]; bold?: boolean; size?: number; color?: string } = {}) =>
  new Paragraph({
    alignment: options.alignment ?? AlignmentType.LEFT,
    spacing: { before: 80, after: 100 },
    children: value.split("\n").flatMap((line, index) => [
      ...(index ? [new TextRun({ text: "", break: 1 })] : []),
      run(line, options.color ?? "000000", options.bold ?? false, options.size ?? 28),
    ]),
  });
const mixedPara = (label: string, value: string) => new Paragraph({
  spacing: { before: 80, after: 80 },
  children: [run(label, "000000", true), run(value)],
});
const cell = (value: string, width: number, bold = false) => new TableCell({
  width: { size: width, type: WidthType.DXA }, borders, verticalAlign: VerticalAlign.CENTER,
  children: [para(value, { alignment: AlignmentType.CENTER, bold, size: 24 })],
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
  const header = new Table({ width: { size: 9026, type: WidthType.DXA }, columnWidths: [4513, 4513], borders: noBorders, rows: [
    new TableRow({ children: [
      noBorderCell(4513, [para(template.leftHeader, { alignment: AlignmentType.CENTER, bold: true })]),
      noBorderCell(4513, [
        para(template.rightHeader, { alignment: AlignmentType.CENTER, bold: true }),
        para(options.issueDate ?? dateText(new Date()), { alignment: AlignmentType.CENTER }),
      ]),
    ] }),
  ] });
  const tableRows = [
    new TableRow({ tableHeader: true, children: [
      cell("STT", 550, true), cell("Thời gian", 2750, true), cell("Địa điểm", 1900, true),
      cell("Đơn vị", 2400, true), cell("Ghi chú", 1426, true),
    ] }),
    ...rows.map((row, index) => {
      const display = scheduleRowDisplay(row);
      const dynamicCell = (value: string, width: number) => new TableCell({
        width: { size: width, type: WidthType.DXA }, borders, verticalAlign: VerticalAlign.CENTER,
        children: [para(value, { alignment: AlignmentType.CENTER, size: 24, color: options.redDynamicText ? "EE0000" : "000000" })],
      });
      return new TableRow({ children: [
        cell(String(index + 1), 550), dynamicCell(display.time, 2750), dynamicCell(display.location, 1900),
        dynamicCell(display.organization, 2400), dynamicCell(display.note, 1426),
      ] });
    }),
  ];
  const signature = new Table({ width: { size: 9026, type: WidthType.DXA }, columnWidths: [4513, 4513], borders: noBorders, rows: [
    new TableRow({ children: [
      noBorderCell(4513, [para(template.leftSignature, { alignment: AlignmentType.CENTER, bold: true }), new Paragraph("\n\n\n")]),
      noBorderCell(4513, [para(template.rightSignature, { alignment: AlignmentType.CENTER, bold: true }), new Paragraph("\n\n\n"), para(template.rightSignerName, { alignment: AlignmentType.CENTER, bold: true })]),
    ] }),
  ] });
  const doc = new Document({
    styles: { default: { document: { run: { font: "Times New Roman", size: 28 } } } },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children: [
      header, para(template.title, { alignment: AlignmentType.CENTER, bold: true, size: 40 }),
      para(template.recipient, { alignment: AlignmentType.CENTER, bold: true }),
      para(template.intro),
      new Table({ width: { size: 9026, type: WidthType.DXA }, columnWidths: [550, 2750, 1900, 2400, 1426], rows: tableRows }),
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
  if (!win) return false;
  win.document.write(`<html><head><meta charset="utf-8"><title>${escapeHtml(template.title)}</title><style>@page{size:A4;margin:25.4mm}body{font:14pt/1.35 'Times New Roman',serif;color:#000}.heads,.sign{display:flex;justify-content:space-between;text-align:center;white-space:pre-line}.heads>div,.sign>div{width:50%}.heads,.sign{font-weight:bold}h1{text-align:center;font-size:20pt}p{white-space:pre-line;text-align:justify;margin:8px 0}table{width:100%;border-collapse:collapse;table-layout:fixed}td,th{border:1px solid;padding:6px;text-align:center;white-space:pre-line;overflow-wrap:anywhere}${options.redDynamicText ? 'td{color:#ee0000}' : ''}</style></head><body><div class="heads"><div>${escapeHtml(template.leftHeader)}</div><div>${escapeHtml(template.rightHeader)}<div>${escapeHtml(options.issueDate ?? dateText(new Date()))}</div></div></div><h1>${escapeHtml(template.title)}</h1><p style="text-align:center"><b>${escapeHtml(template.recipient)}</b></p><p>${escapeHtml(template.intro)}</p><table><tr><th>STT</th><th>Thời gian</th><th>Địa điểm</th><th>Đơn vị</th><th>Ghi chú</th></tr>${body}</table><p>${escapeHtml(template.commitment)}</p><p>${escapeHtml(template.closing)}</p><div class="sign"><div>${escapeHtml(template.leftSignature)}</div><div>${escapeHtml(template.rightSignature)}<br><br><br><br>${escapeHtml(template.rightSignerName)}</div></div></body></html>`);
  const layout = win.document.createElement("style");
  layout.textContent = "@page{size:A4;margin:18mm 20mm}body{font-size:13pt;line-height:1.35}h1{margin:24px 0 10px}.heads{align-items:flex-start;font-size:12pt;line-height:1.25}.heads>div{padding:0 8px}table{margin:14px 0;font-size:11pt;line-height:1.25}th{background:#f5f5f5}td,th{padding:6px 4px;vertical-align:middle;overflow-wrap:break-word}th:nth-child(1){width:6%}th:nth-child(2){width:29%}th:nth-child(3){width:22%}th:nth-child(4){width:27%}th:nth-child(5){width:16%}tr{break-inside:avoid}p{margin:10px 0}.sign{margin-top:24px;break-inside:avoid;font-size:12pt}";
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
  const header = new Table({ width: { size: 9026, type: WidthType.DXA }, columnWidths: [4513, 4513], borders: noBorders, rows: [
    new TableRow({ children: [
      noBorderCell(4513, [para(mauAFixed.institution, { alignment: AlignmentType.CENTER, size: 28 }), para(fields.clubName, { alignment: AlignmentType.CENTER, bold: true, size: 28 })]),
      noBorderCell(4513, [para(fields.issueDate, { alignment: AlignmentType.CENTER, size: 28 })]),
    ] }),
  ] });
  const signatures = new Table({ width: { size: 9026, type: WidthType.DXA }, columnWidths: [3008, 3009, 3009], borders: noBorders, rows: [
    new TableRow({ children: [
      noBorderCell(3008, [para("Ý KIẾN\nPHÒNG HCQT VÀ TCCB", { alignment: AlignmentType.CENTER, bold: true })]),
      noBorderCell(3009, [para("Ý KIẾN\nHỘI SINH VIÊN TRƯỜNG", { alignment: AlignmentType.CENTER, bold: true })]),
      noBorderCell(3009, [para("TM. BAN CHỦ NHIỆM", { alignment: AlignmentType.CENTER, bold: true }), para(fields.signerTitle, { alignment: AlignmentType.CENTER }), new Paragraph("\n\n\n"), para(fields.signerName, { alignment: AlignmentType.CENTER, bold: true })]),
    ] }),
  ] });
  const schedule = fields.slots.flatMap((slot, index) => [
    mixedPara(`Thời gian ${fields.slots.length > 1 ? index + 1 : ""}: `, slot.time),
    mixedPara(`Địa điểm ${fields.slots.length > 1 ? index + 1 : ""}: `, slot.location),
  ]);
  const doc = new Document({
    styles: { default: { document: { run: { font: "Times New Roman", size: 28 } } } },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children: [
      header, para(mauAFixed.title, { alignment: AlignmentType.CENTER, bold: true, size: 40 }),
      para(mauAFixed.recipient, { alignment: AlignmentType.CENTER, bold: true }),
      para(fields.intro), para(mauAFixed.request),
      para("Thời gian, địa điểm:", { bold: true }), ...schedule,
      mixedPara("Số lượng người tham gia: ", fields.participants),
      para(mauAFixed.commitment), para(mauAFixed.responsibility), para(mauAFixed.closing), signatures,
    ] }],
  });
  await download(doc, fileName);
}

export function printMauA(fields: MauAFields) {
  const schedule = fields.slots.map((slot, index) => `<p>Thời gian ${fields.slots.length > 1 ? index + 1 : ""}: <span class="red">${escapeHtml(slot.time)}</span><br>Địa điểm ${fields.slots.length > 1 ? index + 1 : ""}: <span class="red">${escapeHtml(slot.location)}</span></p>`).join("");
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(`<html><head><meta charset="utf-8"><title>Mẫu A</title><style>@page{size:A4;margin:25.4mm}body{font:14pt 'Times New Roman',serif;color:#000}.heads,.sign{display:flex;justify-content:space-between;text-align:center;white-space:pre-line}.heads{font-weight:bold}.sign>div{width:33%}h1{text-align:center;font-size:20pt}p{line-height:1.35;margin:8px 0;white-space:pre-line;text-align:justify}</style></head><body><div class="heads"><div>${escapeHtml(mauAFixed.institution)}<br><span>${escapeHtml(fields.clubName)}</span></div><div>${escapeHtml(fields.issueDate)}</div></div><h1>${escapeHtml(mauAFixed.title)}</h1><p style="text-align:center"><b>${escapeHtml(mauAFixed.recipient)}</b></p><p>${escapeHtml(fields.intro)} ${escapeHtml(mauAFixed.request)}</p><p><b>Thời gian, địa điểm:</b></p>${schedule}<p>Số lượng người tham gia: ${escapeHtml(fields.participants)}</p><p>${escapeHtml(mauAFixed.commitment)}</p><p>${escapeHtml(mauAFixed.responsibility)}</p><p>${escapeHtml(mauAFixed.closing).replace(/\n/g, "<br>")}</p><div class="sign"><div><b>Ý KIẾN<br>PHÒNG HCQT VÀ TCCB</b></div><div><b>Ý KIẾN<br>HỘI SINH VIÊN TRƯỜNG</b></div><div><b>TM. BAN CHỦ NHIỆM<br>${escapeHtml(fields.signerTitle)}</b><br><br><br><br><b>${escapeHtml(fields.signerName)}</b></div></div></body></html>`);
  printWhenReady(win);
  return true;
}
