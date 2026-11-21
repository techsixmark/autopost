# QA — Tải video từ Autopost (v0.10.0, 2026-11-22)

Một QA agent đọc mã cả hai repo và kiểm quyền/hàm trên Supabase thật (chỉ đọc). Sau khi sửa:
- `api-tests`: 125 passed.
- Frontend: `tools` + `pnpm build` xanh.
- Các RPC thật chạy trong giao dịch huỷ ngay: người dùng gửi yêu cầu → máy nhận → báo tiến độ →
  chạy lại → huỷ; thử thêm lô báo cáo có mục hỏng.
- **Pipeline thật** (worker + Redis riêng, không dùng chế độ đồng bộ của test, Supabase giả lập):
  link mẫu công khai đi qua đang tải → đang dò → hoàn tất, báo đúng từng bước.

| Mức | Vấn đề | Xử lý |
|---|---|---|
| Cao | Liên kết yêu cầu ↔ video lưu trong `Video.source`, mà worker ghi đè JSON này khi chạy, nên yêu cầu có thể kẹt "Đang tải" | Đã sửa: bảng riêng `autopost_request_links`; test mô phỏng worker ghi đè; pipeline thật đạt |
| Trung bình | Tắt "Nhận yêu cầu" giữa chừng thì ngừng báo tiến độ | Đã sửa: vẫn báo cho video đã nhận |
| Trung bình | Một mục báo cáo hỏng làm hỏng cả lô | Đã sửa (migration `downloader_report_skip_bad_items`); Python bỏ mục không có id |
| Trung bình | Autopost tự làm mới vô hạn, kể cả khi tab ẩn; lỗi một lần là ngừng | Đã sửa: dừng khi tab ẩn, giãn dần, lỗi thì thử lại sau 60 giây; cảnh báo cả yêu cầu đang chạy mà 30 phút không cập nhật |
| Trung bình | Đổi API key thì yêu cầu cũ không cập nhật được | Ghi trong `docs/AUTOPOST.md` |
| Thấp | Mỗi lượt nạp mọi video từng liên kết | Đã sửa: bỏ qua link đã báo xong mà video không đổi |
| Thấp | Lỗi Python nội bộ gửi nguyên văn sang Autopost | Đã sửa: thông báo tiếng Việt chung, chi tiết vào log |
| Thấp | Docs nói chạy lại chỉ cho video lỗi | Đã sửa docs (cả "Cần xem lại", có thể tốn GPU) |
| Thấp | Video tạo từ Autopost không có `created_by` | Giữ nguyên; email người gửi nằm trong audit `autopost.request_accepted` |
| Thấp | Thư viện so theo `source_video_id`: nhiều máy Downloader có thể trùng id | Chấp nhận (hiện chỉ 1 máy) |

**Lỗi tìm được khi kiểm RPC thật:** máy nhận "chạy lại" nhưng giá trị thao tác trả về rỗng. Đã sửa
(migration `fix_downloader_claim_actions`) và kiểm lại.

**Chưa kiểm được:**
- Chạy với key Autopost thật, vì không được tạo key trên production.
- Đăng nhập Google thật vào Autopost để gửi yêu cầu.
