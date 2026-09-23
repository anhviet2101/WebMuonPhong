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
import type {
  Booking,
  Building,
  Campus,
  DocumentTemplateContent,
  Room,
} from "./prototype-store";
import { defaultDocumentTemplateContent } from "./prototype-store";

export type ScheduleRow = {
  booking: Booking;
  room?: Room;
  building?: Building;
  campus?: Campus;
};

const weekday = [
  "Chủ Nhật",
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
];

const borders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
};

const noBorders = {
  top: { style: BorderStyle.NONE },
  bottom: { style: BorderStyle.NONE },
  left: { style: BorderStyle.NONE },
  right: { style: BorderStyle.NONE },
  insideHorizontal: { style: BorderStyle.NONE },
  insideVertical: { style: BorderStyle.NONE },
};

const hm = (date: Date) =>
  `${String(date.getHours()).padStart(2, "0")}h${String(date.getMinutes()).padStart(2, "0")}`;

const timeText = (row: ScheduleRow) => {
  const start = new Date(row.booking.startAt);
  const end = new Date(row.booking.endAt);
  return `${hm(start)} - ${hm(end)}, ${weekday[start.getDay()]}, ngày ${String(start.getDate()).padStart(2, "0")}/${String(start.getMonth() + 1).padStart(2, "0")}/${start.getFullYear()}`;
};

const lineRuns = (text: string, bold = false, size = 22) =>
  text.split("\n").flatMap((line, index) => [
    ...(index > 0 ? [new TextRun({ text: "", break: 1 })] : []),
    new TextRun({ text: line, bold, font: "Times New Roman", size }),
  ]);

const para = (
  text: string,
  {
    alignment = AlignmentType.LEFT,
    bold = false,
    size = 24,
  }: { alignment?: (typeof AlignmentType)[keyof typeof AlignmentType]; bold?: boolean; size?: number } = {},
) =>
  new Paragraph({
    alignment,
    spacing: { before: 80, after: 80 },
    children: lineRuns(text, bold, size),
  });

const cell = (text: string, width: number, bold = false, color = "000000") =>
  new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders,
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 60, after: 60 },
        children: [new TextRun({ text, bold, font: "Times New Roman", size: 22, color })],
      }),
    ],
  });

const templateOrDefault = (template?: DocumentTemplateContent) => ({
  ...defaultDocumentTemplateContent,
  ...(template ?? {}),
});

export async function exportScheduleDocx(
  rows: ScheduleRow[],
  fileName: string,
  rawTemplate?: DocumentTemplateContent,
  options: { redDynamicText?: boolean } = {},
) {
  const template = templateOrDefault(rawTemplate);
  const now = new Date();
  const header = new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [5000, 4360],
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 5000, type: WidthType.DXA },
            borders: noBorders,
            children: [para(template.leftHeader, { alignment: AlignmentType.CENTER, bold: true, size: 22 })],
          }),
          new TableCell({
            width: { size: 4360, type: WidthType.DXA },
            borders: noBorders,
            children: [
              para(template.rightHeader, { alignment: AlignmentType.CENTER, bold: true, size: 22 }),
              para(`Hà Nội, ngày ${String(now.getDate()).padStart(2, "0")} tháng ${String(now.getMonth() + 1).padStart(2, "0")} năm ${now.getFullYear()}`, {
                alignment: AlignmentType.CENTER,
                size: 22,
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const tableRows = [
    new TableRow({
      tableHeader: true,
      children: [
        cell("STT", 600, true),
        cell("Thời gian", 3100, true),
        cell("Địa điểm", 1800, true),
        cell("Đơn vị", 2500, true),
        cell("Ghi chú", 1360, true),
      ],
    }),
    ...rows.map(
      (row, index) =>
        new TableRow({
          children: [
            cell(String(index + 1), 600, false, options.redDynamicText ? "C00000" : "000000"),
            cell(timeText(row), 3100, false, options.redDynamicText ? "C00000" : "000000"),
            cell(`${row.room?.name ?? ""} - ${row.building?.name ?? row.campus?.name ?? ""}`, 1800, false, options.redDynamicText ? "C00000" : "000000"),
            cell(row.booking.clubName, 2500, false, options.redDynamicText ? "C00000" : "000000"),
            cell(row.booking.note ?? "", 1360, false, options.redDynamicText ? "C00000" : "000000"),
          ],
        }),
    ),
  ];

  const signature = new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [4680, 4680],
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 4680, type: WidthType.DXA },
            borders: noBorders,
            children: [para(template.leftSignature, { alignment: AlignmentType.CENTER, bold: true, size: 22 }), new Paragraph("\n\n\n")],
          }),
          new TableCell({
            width: { size: 4680, type: WidthType.DXA },
            borders: noBorders,
            children: [para(template.rightSignature, { alignment: AlignmentType.CENTER, bold: true, size: 22 }), new Paragraph("\n\n\n")],
          }),
        ],
      }),
    ],
  });

  const doc = new Document({
    styles: { default: { document: { run: { font: "Times New Roman", size: 26 } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } },
        children: [
          header,
          para(template.title, { alignment: AlignmentType.CENTER, bold: true, size: 32 }),
          para(template.recipient, { alignment: AlignmentType.CENTER, bold: true, size: 26 }),
          para(template.intro, { alignment: AlignmentType.JUSTIFIED, size: 24 }),
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [600, 3100, 1800, 2500, 1360],
            rows: tableRows,
          }),
          para(template.commitment, { alignment: AlignmentType.JUSTIFIED, size: 24 }),
          para(template.closing, { alignment: AlignmentType.JUSTIFIED, size: 24 }),
          signature,
        ],
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function printSchedule(
  rows: ScheduleRow[],
  rawTemplate?: DocumentTemplateContent,
  options: { redDynamicText?: boolean } = {},
) {
  const template = templateOrDefault(rawTemplate);
  const now = new Date();
  const issueDate = `Hà Nội, ngày ${String(now.getDate()).padStart(2, "0")} tháng ${String(now.getMonth() + 1).padStart(2, "0")} năm ${now.getFullYear()}`;
  const escape = (value: string) =>
    value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char] ?? char);
  const body = rows
    .map(
      (row, i) =>
        `<tr class="${options.redDynamicText ? "dynamic" : ""}"><td>${i + 1}</td><td>${escape(timeText(row))}</td><td>${escape(`${row.room?.name ?? ""} - ${row.building?.name ?? ""}`)}</td><td>${escape(row.booking.clubName)}</td><td>${escape(row.booking.note ?? "")}</td></tr>`,
    )
    .join("");
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(
    `<html><head><title>${escape(template.title)}</title><style>body{font:14px 'Times New Roman';margin:35px}h1{text-align:center;font-size:20px;white-space:pre-line}.heads,.sign{display:flex;justify-content:space-between;text-align:center;font-weight:bold;white-space:pre-line}table{width:100%;border-collapse:collapse}td,th{border:1px solid;padding:8px;text-align:center}.dynamic td{color:#c00000}</style></head><body><div class="heads"><div>${escape(template.leftHeader)}</div><div>${escape(template.rightHeader)}<div>${escape(issueDate)}</div></div></div><h1>${escape(template.title)}</h1><p style="text-align:center"><b>${escape(template.recipient)}</b></p><p>${escape(template.intro)}</p><table><tr><th>STT</th><th>Thời gian</th><th>Địa điểm</th><th>Đơn vị</th><th>Ghi chú</th></tr>${body}</table><p>${escape(template.commitment)}</p><p>${escape(template.closing)}</p><div class="sign"><div>${escape(template.leftSignature)}</div><div>${escape(template.rightSignature)}</div></div></body></html>`,
  );
  win.document.close();
  win.print();
}
