# Quy tắc mượn phòng cập nhật ngày 24/09/2026

Các quyết định dưới đây được người dùng xác nhận sau bản đặc tả MVP. Khi có khác biệt với tài liệu MVP, áp dụng các quyết định này cho luồng hiện hành.

- Tuần mượn được tính từ thứ Hai đến thứ Bảy. CLB chỉ đăng ký cho một trong hai tuần ngay sau tuần hiện tại. Admin có thể đăng ký hộ đơn vị khi cần xử lý đơn muộn.
- Mỗi đơn đăng ký chỉ chọn một phòng. Chức năng gửi một lượt nhiều phòng được bỏ; dữ liệu nhóm đơn đã có trước đây vẫn được giữ để đọc lịch sử.
- Giới hạn cũ `max_advance_days` được thay bằng cửa sổ hai tuần kế tiếp. Nếu có giới hạn số đơn mỗi tuần, một nhóm nhiều phòng được tính là một lần đăng ký.
- Admin cấu hình các thứ được mượn và khóa tuần theo cơ sở, tòa nhà/giảng đường hoặc phòng. Quy tắc ở các phạm vi này cùng có hiệu lực.
- Hạn nộp đơn giấy mặc định là 15:00 thứ Năm của tuần trước tuần mượn. Quá hạn thì cảnh báo cán bộ liên hệ; đơn và chỗ đã giữ không tự hủy vì lý do này.
- Bản scan phải được gửi trong 24 giờ kể từ lúc gửi đơn trực tuyến. Chưa gửi đúng hạn thì đơn hết hạn và giải phóng phòng. Sau khi gửi, cán bộ xác nhận tiếp nhận scan; cán bộ cũng xác nhận bản giấy trước khi duyệt.
- Khi cán bộ đã xác nhận nhận bản cứng, đơn có thể được duyệt dù chưa có scan. Bản scan chỉ dùng để xác nhận tiếp tục giữ phòng trước khi nhận bản cứng; tác vụ quá hạn scan không hủy đơn đã nhận bản cứng.
- Nếu CLB sửa thông tin quan trọng sau khi nộp scan, scan cũ mất hiệu lực và phải nộp lại. Cán bộ được xác nhận scan hoặc yêu cầu nộp lại; hạn nộp lại mặc định 24 giờ, có thể chỉnh chung hoặc từng đơn. Quá hạn scan đầu hoặc scan nộp lại mà chưa có bản cứng thì hủy giữ chỗ. Đơn cần sửa tiếp tục giữ phòng trong thời gian này.
- Khi đã nhận bản cứng, CLB và cán bộ không sửa nội dung đơn. CLB gửi yêu cầu hủy kèm lý do cho admin; admin quyết định hủy. Hạn bản cứng của tuần mượn là 15h thứ Năm tuần trước; sau mốc này CLB không tự đăng ký cho tuần tới, admin có thể đăng ký hộ và xử lý ngoại lệ.
- Admin cấu hình giờ bắt đầu và kết thúc mượn phòng (mặc định 07:00–21:00), có thể khóa phòng định kỳ hằng tuần đến ngày kết thúc và mở khóa một lịch đã tạo.
- Admin có thể chỉnh các mốc hạn chung cho đơn mới và gia hạn hạn riêng từng đơn. Bản nháp đã chọn phòng giữ tối đa một giờ; bản nháp chưa chọn phòng không có hạn.
- Lần đầu đăng nhập, đại diện CLB hoàn thiện họ, tên, email và số điện thoại/Zalo cá nhân trước khi đăng ký.
- Đơn A và B xuất từ hai tệp Word mẫu người dùng cung cấp. Bỏ trường yêu cầu cơ sở vật chất, giữ nguyên câu cam kết mượn và hoàn trả thiết bị trong mẫu.
