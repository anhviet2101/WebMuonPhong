# Lịch tự xử lý đơn trên gói miễn phí

Worker này gọi backend mỗi 15 phút để chuyển đơn giữ chỗ quá hạn thành `expired`
và đơn đã kết thúc thành `completed`. Backend kiểm tra token trước khi chạy.

## Thiết lập

1. Tạo một token ngẫu nhiên dài ít nhất 32 ký tự bằng công cụ tạo mật khẩu đáng tin cậy.
   Không đưa token vào GitHub, ảnh chụp màn hình hay tin nhắn.
2. Render → dịch vụ `WebMuonPhong` → Environment: thêm `MAINTENANCE_TOKEN`
   với token vừa tạo, lưu và chờ deploy thành công.
3. Cloudflare → Workers & Pages → Create Worker. Đặt tên
   `muonphong-booking-maintenance` và thay mã Worker bằng nội dung
   `deploy/cloudflare-maintenance/src/index.js`, rồi Deploy.
4. Worker → Settings → Variables and Secrets → Add: chọn **Secret**, đặt tên
   `MAINTENANCE_TOKEN`, nhập **cùng token** đã đặt trên Render và Deploy.
5. Worker → Settings → Triggers → Cron Triggers: thêm `*/15 * * * *`.
   Cron dùng múi giờ UTC; biểu thức này chạy mỗi 15 phút ở mọi múi giờ.

Sau khi trigger hoạt động, kiểm tra Worker → Settings → Trigger Events hoặc Logs.
Một lượt thành công ghi `Booking maintenance: expired=..., completed=...`.
Nếu có HTTP 404, hai token không trùng nhau hoặc Render chưa nhận biến môi trường.

Có thể triển khai Worker bằng Wrangler thay cho bước 3 và 5, sử dụng
`deploy/cloudflare-maintenance/wrangler.toml`. Giữ token ở Cloudflare Secret,
không thêm token vào file cấu hình.
