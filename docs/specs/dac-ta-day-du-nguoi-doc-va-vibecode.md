# ĐẶC TẢ HỆ THỐNG QUẢN LÝ ĐĂNG KÝ MƯỢN PHÒNG CHO HOẠT ĐỘNG CLB

**Phiên bản MVP v1.0** — quy trình bán tự động, duyệt 1 cấp trong hệ thống (Văn phòng Đoàn), có bước nộp đơn bản cứng.

Tài liệu gồm 2 phần:
- **Phần A** — viết cho người đọc thông thường (không cần biết kỹ thuật), dùng để trao đổi, xác nhận yêu cầu với các bên liên quan (VP Đoàn, CLB, nhà trường).
- **Phần B** — phụ lục kỹ thuật, dùng để đưa cho công cụ code (AI coding assistant / lập trình viên) build hệ thống.

---

# PHẦN A — ĐẶC TẢ CHỨC NĂNG (DÀNH CHO NGƯỜI ĐỌC)

## A.1. Bài toán cần giải quyết

Hiện tại, việc mượn phòng cho hoạt động CLB được xử lý thủ công: CLB nhắn tin/email hỏi lịch, Văn phòng Đoàn kiểm tra trùng lịch bằng tay, tổng hợp đơn rời rạc, theo dõi trạng thái bằng bảng tính. Cách làm này dễ nhầm lẫn, mất thời gian, và khó tra cứu lại lịch sử.

Hệ thống mới giúp:
- CLB tự xem được phòng nào còn trống, tự đăng ký online.
- Hệ thống tự động phát hiện trùng lịch, không cần kiểm tra tay.
- Văn phòng Đoàn có một nơi duy nhất để xem, duyệt, theo dõi toàn bộ yêu cầu.
- Vẫn giữ quy trình nộp đơn giấy như thực tế đang làm (vì hệ thống chỉ dừng ở bước Văn phòng Đoàn, không thay thế hoàn toàn giấy tờ).

## A.2. Ai sẽ dùng hệ thống

| Người dùng | Họ làm gì |
|---|---|
| **Đại diện CLB** | Xem lịch phòng trống, đăng ký mượn phòng online, in đơn ra ký tay, nộp lại bản đã ký (nộp giấy + nộp ảnh scan lên hệ thống), theo dõi đơn của mình. |
| **Văn phòng Đoàn** | Xem toàn bộ yêu cầu của các CLB, xác nhận đã nhận được đơn giấy, duyệt/từ chối/yêu cầu chỉnh sửa, quản lý danh sách CLB — phòng — tòa nhà, khóa phòng khi cần (bảo trì, thi cử...), in đơn tổng hợp để mang giao cho Phòng Hành chính. |
| **Quản trị hệ thống (Super Admin)** | Cấu hình các quy tắc chung của hệ thống (VD: đăng ký trước tối thiểu bao lâu, giới hạn số đơn/tuần), phân quyền người dùng. |
| *(Tùy chọn, có thể bật sau)* **Phòng Hành chính** | Chỉ xem lịch tổng thể để tham khảo, không thao tác duyệt trong hệ thống — vì thực tế họ nhận đơn giấy trực tiếp từ Văn phòng Đoàn, không qua hệ thống. |

## A.3. Câu chuyện người dùng (mô tả bằng tình huống thực tế)

**CLB:**
- "Là đại diện CLB, tôi muốn xem được phòng nào còn trống vào thứ Bảy tuần sau, để chọn giờ họp CLB mà không phải hỏi qua tin nhắn."
- "Là đại diện CLB, sau khi đăng ký online, tôi muốn hệ thống tự in sẵn đơn có đủ thông tin, để tôi chỉ cần ký và đóng dấu, không phải gõ lại từ đầu."
- "Là đại diện CLB, sau khi nộp đơn giấy cho Văn phòng Đoàn, tôi muốn upload ảnh chụp đơn đã ký lên hệ thống, để có bằng chứng và để Văn phòng Đoàn biết tôi đã nộp."
- "Là đại diện CLB, tôi muốn được thông báo ngay khi đơn của tôi được duyệt/bị từ chối/cần sửa, để không phải hỏi lại nhiều lần."

**Văn phòng Đoàn:**
- "Là VP Đoàn, tôi muốn thấy ngay đơn nào đã nộp giấy, đơn nào chưa, để nhắc CLB nộp kịp thời gian."
- "Là VP Đoàn, tôi muốn hệ thống tự chặn 2 CLB đăng ký trùng giờ trùng phòng, để tôi không phải tự dò lịch bằng tay."
- "Là VP Đoàn, cuối tuần tôi muốn xuất một file tổng hợp toàn bộ các đơn đã duyệt trong tuần, để mang đi giao cho Phòng Hành chính."
- "Là VP Đoàn, tôi muốn khóa một phòng trong khoảng thời gian thi cử, để CLB không đăng ký nhầm vào lúc đó."

## A.4. Luồng xử lý một yêu cầu mượn phòng (mô tả bằng lời)

1. **CLB đăng ký online**: chọn ngày/giờ → hệ thống hiện các phòng còn trống → CLB chọn phòng → điền thông tin hoạt động (tên hoạt động, số người tham dự, người phụ trách...) → gửi đơn.
2. Ngay khi gửi, hệ thống **tạm giữ chỗ** phòng đó (để CLB khác không đăng ký trùng), nhưng đơn **chưa được coi là chính thức**.
3. CLB **in đơn** (đã tự động điền sẵn thông tin) → ký tên, đóng dấu → **nộp bản giấy trực tiếp cho Văn phòng Đoàn** (như quy trình hiện tại).
4. CLB **upload ảnh/scan đơn đã ký** lên hệ thống, làm bằng chứng đã nộp.
5. Văn phòng Đoàn nhận được đơn giấy trong thực tế, vào hệ thống **xác nhận đã nhận bản cứng**.
6. Sau khi xác nhận, Văn phòng Đoàn **xét duyệt**: Duyệt / Từ chối / Yêu cầu chỉnh sửa.
7. Nếu **quá thời hạn quy định** (ví dụ 48 giờ) mà CLB chưa nộp bản giấy, hệ thống **tự động hủy giữ chỗ** để tránh giữ phòng vô ích.
8. Sau khi được duyệt, việc chuyển tiếp đơn cho **Phòng Hành chính vẫn diễn ra bằng giấy** (ngoài hệ thống) — Văn phòng Đoàn dùng chức năng **in đơn tổng hợp theo khoảng ngày** để hỗ trợ việc này, không cần gõ lại tay.

## A.5. Danh sách chức năng theo từng vai trò

### Đại diện CLB
- Xem lịch phòng (theo ngày/tuần), biết phòng nào trống — nhưng **không thấy tên CLB khác đang dùng phòng**, chỉ thấy "Không khả dụng" (để bảo mật thông tin nội bộ).
- Đăng ký mượn phòng (chọn thời gian → chọn phòng → điền nội dung hoạt động).
- Sửa đơn khi đơn chưa được duyệt.
- Hủy đơn.
- Theo dõi trạng thái đơn của mình, xem lịch sử các đơn đã gửi.
- In đơn (Mẫu A) có sẵn thông tin để ký tay.
- Upload ảnh/scan đơn đã ký.
- Nhận thông báo (trên hệ thống + email) khi: đơn được tiếp nhận, được duyệt, bị từ chối, cần chỉnh sửa, bị đổi phòng, bị hủy.

### Văn phòng Đoàn
- Xem toàn bộ yêu cầu của tất cả CLB, lọc theo trạng thái/CLB/phòng/ngày.
- Xem danh sách riêng các đơn **chưa nộp bản giấy** để nhắc CLB.
- Xác nhận đã nhận bản giấy (dựa trên ảnh scan CLB gửi + đơn giấy thực tế nhận được).
- Duyệt / Từ chối / Yêu cầu CLB chỉnh sửa đơn.
- Đổi phòng cho một đơn nếu cần.
- Quản lý danh sách CLB và tài khoản đại diện.
- Quản lý danh sách tòa nhà — phòng (thêm/sửa/ẩn, thiết lập sức chứa, thiết bị, có cho CLB đăng ký hay không).
- Khóa phòng (blackout) theo phòng/theo tòa/theo khoảng thời gian/lặp lại định kỳ, có ghi lý do.
- In đơn từng CLB (Mẫu A) và in **đơn tổng hợp** nhiều đơn theo khoảng ngày tùy chọn (Mẫu B) để mang đi giao Phòng Hành chính.
- Xem nhật ký hoạt động (ai làm gì, khi nào) để tra cứu khi có tranh chấp/thắc mắc.

### Quản trị hệ thống
- Cấu hình các quy tắc chung, ví dụ:
  - Không cho đăng ký trước quá bao nhiêu ngày.
  - Phải đăng ký trước ít nhất bao nhiêu giờ.
  - Thời lượng tối đa mỗi lần mượn phòng.
  - Số lượng đơn tối đa mỗi CLB được gửi trong 1 tuần.
  - Thời hạn nộp bản giấy trước khi tự hủy giữ chỗ.
  - Hội trường lớn cần đăng ký trước tối thiểu bao nhiêu ngày.
- Phân quyền người dùng, tạo thêm vai trò mới nếu cần sau này.

## A.6. Các màn hình chính (mô tả trải nghiệm)

1. **Trang đăng nhập.**
2. **Trang lịch phòng** — xem theo ngày/tuần, có màu phân biệt: đang chờ duyệt, đã duyệt, bị khóa (blackout). Đây là trang quan trọng nhất, ai cũng dùng.
3. **Trang tổng quan (Dashboard)** — khác nhau theo vai trò:
   - CLB: các đơn sắp tới, đang xử lý, lịch sử, nút "Đăng ký mượn phòng".
   - VP Đoàn: số liệu tổng quan (bao nhiêu đơn chờ xử lý, bao nhiêu đã duyệt hôm nay, bao nhiêu cần chỉnh sửa, hoạt động trong 7 ngày tới).
4. **Form đăng ký mượn phòng** — 3 bước: chọn thời gian → chọn phòng → nhập nội dung hoạt động.
5. **Trang chi tiết 1 yêu cầu** — xem đầy đủ thông tin, trạng thái, nút in đơn, khu vực upload ảnh scan, (với VP Đoàn thêm nút xác nhận nộp giấy, duyệt/từ chối/đổi phòng).
6. **Trang quản lý CLB / tòa nhà / phòng** (VP Đoàn).
7. **Trang quản lý khóa phòng (blackout).**
8. **Trang xuất đơn tổng hợp** — chọn khoảng ngày, chọn các đơn cần đưa vào, xuất file.
9. **Trang cấu hình quy tắc hệ thống** (Quản trị hệ thống).
10. **Trang nhật ký hoạt động (audit log)** (VP Đoàn).

## A.7. Các quy tắc quan trọng cần lưu ý (giải thích dễ hiểu)

- **Không cho 2 CLB mượn trùng giờ trùng phòng** — hệ thống tự kiểm tra, kể cả khi 2 người bấm gửi cùng lúc.
- **Có "thời gian đệm"** trước và sau mỗi lịch mượn (ví dụ 15 phút) để dọn phòng/chuẩn bị — nên nếu CLB A mượn 14h–16h, hệ thống sẽ tự giữ luôn từ 13h45 đến 16h15, CLB B không đăng ký được vào khung giờ đệm đó.
- **Gửi đơn online chưa phải là xong** — CLB vẫn phải nộp giấy như cũ, hệ thống chỉ hỗ trợ, không thay thế hoàn toàn.
- **Quá hạn không nộp giấy → mất chỗ** — để tránh tình trạng giữ chỗ ảo mà không hoàn tất thủ tục.
- **CLB không thấy được thông tin của CLB khác** trên lịch, chỉ thấy phòng nào trống/không trống.
- **Mọi thao tác quan trọng đều được ghi lại** (duyệt, từ chối, đổi phòng, khóa phòng...) để có thể tra lại khi cần.

## A.8. Phạm vi phiên bản đầu tiên (MVP)

**Sẽ có:**
Đăng nhập & phân quyền; quản lý CLB/tòa/phòng; xem lịch; đăng ký/sửa/hủy yêu cầu; chống trùng lịch tự động; upload & xác nhận nộp bản giấy; duyệt 1 cấp (VP Đoàn); tự hủy giữ chỗ nếu quá hạn; khóa phòng; xuất đơn Mẫu A/Mẫu B; nhật ký hoạt động; thông báo trong hệ thống + email; cấu hình được các quy tắc (không hard-code).

**Chưa làm ở bản đầu (để sau):**
Phòng Hành chính thao tác trực tiếp trong hệ thống; check-in bằng QR; biên bản bàn giao phòng; báo cáo sự cố thiết bị; thống kê nâng cao; đăng ký lịch lặp lại định kỳ; tích hợp Zalo/Teams/Telegram.

---

# PHẦN B — PHỤ LỤC KỸ THUẬT (DÀNH CHO VIBE CODE)

> Đưa nguyên phần này cho AI coding assistant (Claude Code, Cursor...) kèm theo Phần A ở trên để AI hiểu bối cảnh nghiệp vụ trước khi đọc chi tiết kỹ thuật.

## B.1. Tech stack (Python)

| Thành phần | Công nghệ |
|---|---|
| Backend | Django + Django REST Framework (DRF) |
| Database | PostgreSQL, dùng `django.contrib.postgres.constraints.ExclusionConstraint` để chặn trùng lịch ở tầng DB |
| ORM | Django ORM |
| Frontend | Phương án A: Next.js (React) + TypeScript, gọi API DRF. Phương án B (khuyến nghị cho team nhỏ): Django Templates + HTMX + Alpine.js, tận dụng Django Admin cho các màn hình quản trị (CLB, phòng, blackout, rule config) |
| Thư viện lịch | FullCalendar (nếu dùng React) |
| Auth | `djangorestframework-simplejwt` (nếu tách frontend) hoặc Django session auth (nếu dùng phương án B) |
| Background job | Celery + Celery Beat, hoặc APScheduler nếu muốn nhẹ, không cần Redis |
| Upload file | Django `FileField`, validate `.jpg/.png/.pdf`, tối đa 10MB |
| Export DOCX | `docxtpl` (dựa trên Jinja2, điền placeholder vào file `.docx` mẫu) |
| Export PDF | `WeasyPrint` (HTML→PDF) hoặc convert từ DOCX qua LibreOffice headless |
| Email | Django `django.core.mail` + SMTP |
| Deploy | Gunicorn + Nginx trên VPS, hoặc Railway/Render |

## B.2. Vai trò & phân quyền (RBAC — không hard-code)

Roles: `CLB_REP`, `YU_ADMIN` (VP Đoàn), `SUPER_ADMIN`, `FACILITY_VIEWER` (tùy chọn, view-only).

Thiết kế bảng `Role` — `Permission` — `RolePermission` riêng biệt, không gắn cứng quyền vào role trong code.

| Permission key | CLB_REP | YU_ADMIN | SUPER_ADMIN | FACILITY_VIEWER |
|---|---|---|---|---|
| `booking.view_own` | ✓ | ✓ | ✓ | |
| `booking.view_all` | | ✓ | ✓ | ✓ |
| `booking.create` | ✓ | ✓ | ✓ | |
| `booking.edit_own_before_approval` | ✓ | | | |
| `booking.cancel_own` | ✓ | | | |
| `booking.approve` / `booking.reject` / `booking.request_revision` | | ✓ | ✓ | |
| `booking.confirm_physical_submission` | | ✓ | ✓ | |
| `booking.change_room` | | ✓ | ✓ | |
| `room.manage` / `building.manage` / `blackout.manage` / `organization.manage` | | ✓ | ✓ | |
| `rule_config.manage` / `role.manage` | | | ✓ | |
| `export.mau_a` | ✓ | ✓ | ✓ | |
| `export.mau_b` | | ✓ | ✓ | |
| `audit_log.view` | | ✓ | ✓ | |

## B.3. Cấu trúc dữ liệu

**User**: id, name, email(unique), password_hash, phone?, role_id(FK), organization_id(FK, nullable), is_active, created_at

**Role / Permission / RolePermission**: Role(id, name, description); Permission(id, key unique, description); RolePermission(role_id, permission_id)

**Organization**: id, name, abbreviation, type, active, created_at

**Building**: id, name, active, operating_hours_start, operating_hours_end

**Room**: id, building_id(FK), name, capacity, type, has_projector, has_microphone, has_ac, has_whiteboard, has_sound_system, rentable, buffer_before_minutes, buffer_after_minutes, notes?, active, created_at

**Booking**: id, organization_id(FK), room_id(FK), secondary_room_id(FK nullable), activity_name, description, participant_count, contact_person, contact_phone, contact_email, start_time, end_time, setup_time_minutes, teardown_time_minutes, equipment_request?, notes?, status(enum, xem B.5), physical_status(enum: not_submitted|submitted|confirmed_received), scan_file_url?, physical_submitted_at?, physical_confirmed_at?, physical_confirmed_by(FK nullable), hold_expires_at?, created_by(FK), created_at, updated_at

Ràng buộc DB (Django):
```python
from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import RangeOperators
from django.db.models import Q

class Meta:
    constraints = [
        ExclusionConstraint(
            name="prevent_room_double_booking",
            expressions=[
                ("room", RangeOperators.EQUAL),
                ("during", RangeOperators.OVERLAPS),
            ],
            condition=Q(status__in=["pending_hold", "approved"]),
        )
    ]
```
(`during` là field `DateTimeRangeField` tính từ start/end đã cộng buffer. Cần bật extension `btree_gist` trên Postgres.)

**BookingApproval**: id, booking_id(FK), approver_id(FK), decision(approved|rejected|needs_revision), comment?, created_at

**RoomBlackout**: id, scope_type(room|building|floor), room_ids(array, nullable), building_id(FK nullable), floor?, start_time, end_time, is_recurring, recurrence_rule?, reason, created_by(FK), created_at

**BusinessRuleConfig**: key(PK), value, description, updated_by(FK), updated_at. Các key gợi ý: `max_advance_days`, `min_advance_hours`, `max_booking_duration_hours`, `max_bookings_per_week_per_org`, `physical_submission_deadline_hours`, `large_hall_min_advance_days`, `large_activity_participant_threshold`, `edit_lock_hours_before_start`.

**Notification**: id, user_id(FK), type(submitted|approved|rejected|needs_revision|room_changed|cancelled|physical_reminder), message, related_booking_id(FK nullable), is_read, created_at

**AuditLog**: id, user_id(FK), action, entity_type, entity_id, old_value(jsonb?), new_value(jsonb?), created_at

## B.4. Quy tắc nghiệp vụ chi tiết

- **Chống trùng lịch**: `startA < endB AND endA > startB`, kiểm tra ở server + DB constraint, chỉ tính booking có status `pending_hold` hoặc `approved`.
- **Buffer time**: khoảng giữ chỗ thực tế = `start_time - buffer_before_minutes` đến `end_time + buffer_after_minutes` (lấy từ `Room`).
- **Giữ chỗ & hết hạn**: khi Submit, `status = pending_hold`, `hold_expires_at = now + physical_submission_deadline_hours` (mặc định 48h). Cron job (chạy mỗi 15 phút) tự chuyển `status = expired` nếu quá hạn mà `physical_status` vẫn `not_submitted`.
- **Xác nhận nộp bản cứng**: CLB upload scan → `physical_status = submitted`. Chỉ `YU_ADMIN`/`SUPER_ADMIN` mới chuyển được sang `confirmed_received`. API `booking.approve` phải kiểm tra `physical_status == confirmed_received` trước khi cho duyệt.
- **Hủy booking**: CLB chỉ hủy được khi chưa `approved` (hoặc theo `edit_lock_hours_before_start`); VP Đoàn hủy được bất kỳ lúc nào, phải ghi lý do và tự động thông báo cho CLB.

## B.5. State machine của Booking

Enum `status`: `draft | pending_hold | needs_revision | rejected | approved | room_changed | completed | cancelled | expired`

```
draft ──submit──> pending_hold
pending_hold ──quá hạn không nộp giấy──> expired
pending_hold ──VP Đoàn: needs revision──> needs_revision ──CLB sửa & gửi lại──> pending_hold
pending_hold ──VP Đoàn: reject──> rejected
pending_hold ──(physical_status=confirmed_received + VP Đoàn approve)──> approved
approved ──VP Đoàn đổi phòng──> room_changed
approved / room_changed ──qua end_time──> completed
draft/pending_hold/needs_revision/approved ──hủy──> cancelled
```

## B.6. API endpoints chính

```
Auth
POST /auth/login | /auth/refresh | /auth/logout

Organizations & Users
GET/POST /organizations | PATCH /organizations/:id
GET/POST /users

Buildings & Rooms
GET/POST /buildings
GET /rooms?building_id=&date=&start_time=&end_time=   (phòng còn trống)
POST /rooms | PATCH /rooms/:id

Bookings
GET /bookings?status=&organization_id=&room_id=&from=&to=
POST /bookings | GET /bookings/:id | PATCH /bookings/:id
POST /bookings/:id/submit
POST /bookings/:id/upload-scan   (multipart)
POST /bookings/:id/confirm-physical   (YU_ADMIN only)
POST /bookings/:id/approve | /reject | /request-revision | /change-room | /cancel
GET  /bookings/:id/export/mau-a?format=docx|pdf

Blackouts
GET/POST /blackouts | DELETE /blackouts/:id

Export tổng hợp
POST /exports/mau-b   (body: { booking_ids: [] } hoặc { from, to, status })

Rule config
GET /rule-configs | PATCH /rule-configs/:key

Notifications
GET /notifications?unread=true | PATCH /notifications/:id/read

Audit log
GET /audit-logs?entity_type=&from=&to=
```

## B.7. Yêu cầu phi chức năng

- Mọi kiểm tra trùng lịch, blackout, quyền hạn xử lý ở **server**, không tin dữ liệu từ client.
- API không trả về dữ liệu booking của CLB khác cho user không có quyền `booking.view_all`, kể cả qua query trực tiếp.
- Upload file giới hạn `.jpg/.jpeg/.png/.pdf`, tối đa 10MB, validate tên file.
- Ghi `AuditLog` cho: approve, reject, request-revision, change-room, cancel, confirm-physical, blackout create/delete, rule-config update.
- Mật khẩu hash bằng Django mặc định (PBKDF2/Argon2); JWT access token ngắn hạn nếu tách frontend.
- Cron mỗi 15 phút: chuyển `pending_hold` quá hạn → `expired`; chuyển booking đã qua `end_time` → `completed`.

## B.8. Ghi chú khi vibe code

- Code `status` và `physical_status` dạng Django `TextChoices`/`IntegerChoices`, tránh string tự do.
- Chuyển trạng thái nên đi qua 1 service/method tập trung (state machine), không rải if-else nhiều nơi — dễ test và audit.
- Test bắt buộc: (1) 2 request tạo booking trùng giờ cùng lúc → chỉ 1 cái thành công; (2) không approve được khi `physical_status != confirmed_received`; (3) CLB không lấy được dữ liệu booking của CLB khác qua API dù biết ID.
- Template Mẫu A/B nên là file `.docx` thật có placeholder Jinja2 (`{{ ten_clb }}`...) để dùng với `docxtpl`, không tự dựng PDF từ đầu.
- Nếu chọn Phương án B (Django Templates + HTMX): đăng ký `Organization`, `Building`, `Room`, `RoomBlackout`, `BusinessRuleConfig` vào Django Admin trước, sẽ có ngay giao diện quản trị mà không cần code UI riêng.
