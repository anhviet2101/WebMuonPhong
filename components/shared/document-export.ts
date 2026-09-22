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
import type { Booking, Building, Campus, Room } from "./prototype-store";

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
const timeText = (row: ScheduleRow) => {
  const start = new Date(row.booking.startAt),
    end = new Date(row.booking.endAt);
  const hm = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}h${String(d.getMinutes()).padStart(2, "0")}`;
  return `${hm(start)} - ${hm(end)}, ${weekday[start.getDay()]}, Ngày ${String(start.getDate()).padStart(2, "0")}/${String(start.getMonth() + 1).padStart(2, "0")}/${start.getFullYear()}`;
};
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
const cell = (text: string, width: number, bold = false) =>
  new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders,
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 60, after: 60 },
        children: [
          new TextRun({ text, bold, font: "Times New Roman", size: 22 }),
        ],
      }),
    ],
  });
export async function exportScheduleDocx(
  rows: ScheduleRow[],
  fileName: string,
) {
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
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: "ĐOÀN ĐẠI HỌC QUỐC GIA HÀ NỘI",
                    bold: true,
                    font: "Times New Roman",
                    size: 22,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: "BCH TRƯỜNG ĐẠI HỌC CÔNG NGHỆ",
                    bold: true,
                    font: "Times New Roman",
                    size: 22,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: "***",
                    bold: true,
                    font: "Times New Roman",
                    size: 22,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 4360, type: WidthType.DXA },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: "ĐOÀN TNCS HỒ CHÍ MINH",
                    bold: true,
                    font: "Times New Roman",
                    size: 22,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 200 },
                children: [
                  new TextRun({
                    text: `Hà Nội, ngày ${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()}`,
                    italics: true,
                    font: "Times New Roman",
                    size: 22,
                  }),
                ],
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
            cell(String(index + 1), 600),
            cell(timeText(row), 3100),
            cell(
              `${row.room?.name ?? ""} - ${row.building?.name ?? row.campus?.name ?? ""}`,
              1800,
            ),
            cell(row.booking.clubName, 2500),
            cell(row.booking.note ?? "", 1360),
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
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: "Ý KIẾN PHÒNG HCQT & TCCB",
                    bold: true,
                    font: "Times New Roman",
                    size: 22,
                  }),
                ],
              }),
              new Paragraph("\n\n\n"),
            ],
          }),
          new TableCell({
            width: { size: 4680, type: WidthType.DXA },
            borders: noBorders,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: "TM. BCH ĐOÀN TRƯỜNG",
                    bold: true,
                    font: "Times New Roman",
                    size: 22,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: "UV BAN THƯỜNG VỤ",
                    bold: true,
                    font: "Times New Roman",
                    size: 22,
                  }),
                ],
              }),
              new Paragraph("\n\n\n"),
            ],
          }),
        ],
      }),
    ],
  });
  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Times New Roman", size: 26 } } },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
          },
        },
        children: [
          header,
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 240, after: 160 },
            children: [
              new TextRun({
                text: "ĐƠN ĐỀ NGHỊ",
                bold: true,
                font: "Times New Roman",
                size: 32,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [
              new TextRun({
                text: "Kính gửi: Phòng Hành chính Quản trị và Tổ chức Cán bộ",
                bold: true,
                font: "Times New Roman",
                size: 26,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            indent: { firstLine: 720 },
            spacing: { after: 180, line: 360 },
            children: [
              new TextRun(
                "Thực hiện nhiệm vụ kế hoạch năm học, các đơn vị trực thuộc ĐTN - HSV tiến hành tổ chức sinh hoạt. Để hoạt động diễn ra đúng kế hoạch và thành công tốt đẹp, kính đề nghị Quý phòng xem xét và hỗ trợ. Cụ thể theo danh sách:",
              ),
            ],
          }),
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [600, 3100, 1800, 2500, 1360],
            rows: tableRows,
          }),
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            indent: { firstLine: 720 },
            spacing: { before: 180, after: 120 },
            children: [
              new TextRun(
                "Các đơn vị trực thuộc ĐTN - HSV cam kết sau khi sử dụng phòng học xong sẽ trả đúng nguyên trạng ban đầu của phòng học.",
              ),
            ],
          }),
          new Paragraph({
            indent: { firstLine: 720 },
            children: [
              new TextRun("Kính mong nhận được sự giúp đỡ của Quý Phòng."),
            ],
          }),
          new Paragraph({
            indent: { firstLine: 720 },
            children: [new TextRun("Xin trân trọng cảm ơn!")],
          }),
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
  URL.revokeObjectURL(url);
}
export function printSchedule(rows: ScheduleRow[]) {
  const body = rows
    .map(
      (row, i) =>
        `<tr><td>${i + 1}</td><td>${timeText(row)}</td><td>${row.room?.name ?? ""} - ${row.building?.name ?? ""}</td><td>${row.booking.clubName}</td><td>${row.booking.note ?? ""}</td></tr>`,
    )
    .join("");
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(
    `<html><head><title>Đơn đề nghị</title><style>body{font:14px 'Times New Roman';margin:35px}h1{text-align:center;font-size:20px}table{width:100%;border-collapse:collapse}td,th{border:1px solid;padding:8px;text-align:center}.heads{display:flex;justify-content:space-between;text-align:center;font-weight:bold}.sign{display:flex;justify-content:space-between;text-align:center;font-weight:bold;margin-top:24px}</style></head><body><div class="heads"><div>ĐOÀN ĐẠI HỌC QUỐC GIA HÀ NỘI<br>BCH TRƯỜNG ĐẠI HỌC CÔNG NGHỆ<br>***</div><div>ĐOÀN TNCS HỒ CHÍ MINH</div></div><h1>ĐƠN ĐỀ NGHỊ</h1><p style="text-align:center"><b>Kính gửi: Phòng Hành chính Quản trị và Tổ chức Cán bộ</b></p><p>Thực hiện nhiệm vụ kế hoạch năm học, các đơn vị trực thuộc ĐTN - HSV tiến hành tổ chức sinh hoạt. Kính đề nghị Quý phòng xem xét và hỗ trợ:</p><table><tr><th>STT</th><th>Thời gian</th><th>Địa điểm</th><th>Đơn vị</th><th>Ghi chú</th></tr>${body}</table><p>Các đơn vị cam kết hoàn trả nguyên trạng cơ sở vật chất sau khi sử dụng.</p><div class="sign"><div>Ý KIẾN<br>PHÒNG HCQT & TCCB</div><div>TM. BCH ĐOÀN TRƯỜNG<br>UV BAN THƯỜNG VỤ</div></div></body></html>`,
  );
  w.document.close();
  w.print();
}
