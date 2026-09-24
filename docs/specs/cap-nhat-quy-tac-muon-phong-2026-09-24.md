# Quy tắc mượn phòng cập nhật ngày 24/09/2026

Các quyết định dưới đây được người dùng xác nhận sau bản đặc tả MVP. Khi có khác biệt với tài liệu MVP, áp dụng các quyết định này cho luồng hiện hành.

- Tuần mượn được tính từ thứ Hai đến thứ Bảy. CLB chỉ đăng ký cho một trong hai tuần ngay sau tuần hiện tại. Admin có thể đăng ký hộ đơn vị khi cần xử lý đơn muộn.
- Một lần gửi có thể chọn nhiều phòng cùng khung giờ. Hệ thống giữ tất cả phòng trong một giao dịch; nếu một phòng trùng lịch thì không giữ phòng nào. Mỗi phòng là một dòng trong lịch và bảng đơn, liên kết bằng mã nhóm đơn. Một bản scan nộp cho nhóm đơn được áp dụng cho toàn nhóm.
- Giới hạn cũ `max_advance_days` được thay bằng cửa sổ hai tuần kế tiếp. Nếu có giới hạn số đơn mỗi tuần, một nhóm nhiều phòng được tính là một lần đăng ký.
- Admin cấu hình các thứ được mượn và khóa tuần theo cơ sở, tòa nhà/giảng đường hoặc phòng. Quy tắc ở các phạm vi này cùng có hiệu lực.
- Hạn nộp đơn giấy mặc định là 15:00 thứ Năm của tuần trước tuần mượn. Quá hạn thì cảnh báo cán bộ liên hệ; đơn và chỗ đã giữ không tự hủy vì lý do này.
- Bản scan phải được gửi trong 24 giờ kể từ lúc gửi đơn trực tuyến. Chưa gửi đúng hạn thì đơn hết hạn và giải phóng phòng. Sau khi gửi, cán bộ xác nhận tiếp nhận scan; cán bộ cũng xác nhận bản giấy trước khi duyệt.
- Khi cán bộ đã xác nhận nhận bản cứng, đơn có thể được duyệt dù chưa có scan. Bản scan chỉ dùng để xác nhận tiếp tục giữ phòng trước khi nhận bản cứng; tác vụ quá hạn scan không hủy đơn đã nhận bản cứng.
- Admin có thể chỉnh các mốc hạn chung cho đơn mới và gia hạn hạn riêng từng đơn. Bản nháp đã chọn phòng giữ tối đa một giờ; bản nháp chưa chọn phòng không có hạn.
- Lần đầu đăng nhập, đại diện CLB hoàn thiện họ, tên, email và số điện thoại/Zalo cá nhân trước khi đăng ký.
- Đơn A và B xuất từ hai tệp Word mẫu người dùng cung cấp. Bỏ trường yêu cầu cơ sở vật chất, giữ nguyên câu cam kết mượn và hoàn trả thiết bị trong mẫu.
