# QA — Thư viện "Video từ Downloader" (2026-11-21)

Phạm vi: `admin-downloader.html`, `downloader-picker.js`, nút chọn trong `admin-execution.html`,
`admin-fb-autopost.html`, `admin-ig-thread-autopost.html`, bảng `downloader_videos` + RPC
`ingest_downloader_video`. QA agent đọc mã + truy vấn chỉ đọc trên Supabase.

| # | Mức | Vấn đề | Xử lý |
|---|---|---|---|
| 1 | Cao (chưa kiểm được) | Workflow n8n Cloud có tải được link Drive trực tiếp trong `tiktok_url` / `input_link_video` không | **Còn mở.** Link có `&confirm=t`. Cần thử 1 bài thật; nếu n8n chỉ hiểu link TikTok/YouTube thì thêm nhánh "link trực tiếp → HTTP Request" trong n8n |
| 2 | Trung bình | Chọn video cho IG/Threads nhưng loại nội dung vẫn "image" | Đã sửa: tự chọn "video" |
| 3 | Trung bình | Key khác ghi đè được video của key đã tạo | Đã sửa: dòng thuộc key tạo ra nó |
| 4 | Trung bình | Mỗi lần gọi chạy bcrypt trên mọi key | Đã sửa: tìm theo `key_prefix` trước; key phải đúng dạng `ap_` + 64 hex |
| 5 | Trung bình | Mọi key `/admin-keygen` đều có scope `write` mặc định | Chấp nhận, ghi trong `docs/DECISIONS.md` |
| 6 | Thấp | Editor sửa được mọi cột (kể cả link) qua API | Đã sửa: chỉ `is_hidden`, `updated_at`; thu hồi insert/truncate |
| 7 | Thấp | Ký tự đặc biệt trong ô tìm kiếm làm lỗi bộ lọc | Đã sửa |
| 8 | Thấp (có từ trước) | Link TikTok / video nguồn trong chi tiết job không escape | Đã sửa: escape + chỉ http(s) |
| 9 | Thấp | Toast tiêu đề dài tràn ở 375px | Đã sửa: cắt 40 ký tự |
| 10 | Thấp | Ô link + nút bị bóp ở màn hẹp | Đã sửa: tự xuống dòng |
| 11 | Thấp | Không đóng modal bằng Esc; ghi đè link đang có không hỏi | Đã sửa |
| 12 | Thấp | Chưa ghi CHANGELOG / DECISIONS | Đã sửa |

Đã kiểm lại sau khi sửa: RPC (thêm/cập nhật, key sai, key chỉ đọc, key khác ghi đè, link không phải
Drive, id sai) trong giao dịch huỷ ngay; quyền cột/bảng của `authenticated`/`anon`; trang thư viện và
modal chọn (dữ liệu giả, desktop + 375px); Downloader gọi RPC thật qua mạng với key sai → báo lỗi đúng.

Chưa kiểm được: đăng nhập Google thật vào Autopost; một bài đăng thật qua n8n Cloud với link Drive.
