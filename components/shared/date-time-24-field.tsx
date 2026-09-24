import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
const minutes = Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, "0"));

export function DateTime24Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [date = "", time = "00:00"] = value.split("T");
  const [hour = "00", minute = "00"] = time.split(":");
  const selectClass = "h-9 rounded-md border border-input bg-background px-2 text-sm";

  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <div className="grid min-w-0 gap-2">
        <Input
          type="date"
          className="min-w-0 w-full"
          aria-label={`${label} - ngày`}
          value={date}
          onChange={(event) => onChange(event.target.value ? `${event.target.value}T${hour}:${minute}` : "")}
        />
        <div className="flex items-center gap-1" aria-label={`${label} - giờ 24h`}>
          <select
            aria-label={`${label} - giờ (00–23)`}
            className={selectClass}
            value={hour}
            disabled={!date}
            onChange={(event) => onChange(`${date}T${event.target.value}:${minute}`)}
          >
            {hours.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <span aria-hidden="true">:</span>
          <select
            aria-label={`${label} - phút (00–59)`}
            className={selectClass}
            value={minute}
            disabled={!date}
            onChange={(event) => onChange(`${date}T${hour}:${event.target.value}`)}
          >
            {minutes.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>
      </div>
      <p className="text-xs text-slate-500">Giờ 24h · {hour}:{minute}</p>
    </div>
  );
}

export function bookingTimeError(
  start: string,
  end: string,
  bounds?: { earliestMinute: number; latestMinute: number },
): string | null {
  if (!start || !end) return "Vui lòng chọn đủ ngày và giờ bắt đầu, kết thúc.";
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()))
    return "Ngày hoặc giờ đã chọn không hợp lệ.";
  if (start.slice(0, 10) !== end.slice(0, 10))
    return "Giờ bắt đầu và kết thúc phải cùng một ngày.";
  if (endDate <= startDate) return "Giờ kết thúc phải sau giờ bắt đầu.";
  if (startDate.getDay() === 0) return "Không nhận đăng ký mượn phòng vào Chủ nhật.";
  if (endDate.getHours() * 60 + endDate.getMinutes() > 21 * 60)
    return "Đơn mượn phòng phải kết thúc trước hoặc đúng 21:00.";
  if (bounds) {
    const startMinute = startDate.getHours() * 60 + startDate.getMinutes();
    const endMinute = endDate.getHours() * 60 + endDate.getMinutes();
    if (startMinute < bounds.earliestMinute || endMinute > bounds.latestMinute)
      return `Vui lòng chọn trong khoảng ${String(Math.floor(bounds.earliestMinute / 60)).padStart(2, "0")}:${String(bounds.earliestMinute % 60).padStart(2, "0")}–${String(Math.floor(bounds.latestMinute / 60)).padStart(2, "0")}:${String(bounds.latestMinute % 60).padStart(2, "0")}.`;
  }
  return null;
}
