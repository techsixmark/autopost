# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), phiên bản theo [SemVer](https://semver.org/lang/vi/).

## [Unreleased]

### Sửa

- Link "TikTok URL" / "Link video nguồn" trong trang chi tiết job FB / IG-Threads được escape và chỉ nhận http(s).
- Trạng thái job đồng bộ theo kết quả cuối của n8n trên cả 3 nền tảng: `Error` → Lỗi, `Error Link` → Error Link (trước đây job vẫn hiện "Chờ xử lý"). Sửa dữ liệu: 1 job Facebook, 32 job Telegram.
- Nút "🔧 n8n → Đặt lại chờ đăng" đưa trạng thái về Chờ xử lý (trước chỉ đổi n8n_status nên job lỗi vẫn kẹt, không chạy lại).

### Thêm

- **Tải video mới** trên trang 🎬 Video Downloader (editor): dán link, xác nhận quyền, gửi. Máy chạy Universal Video Downloader tự nhận việc (~15 giây/lần) và báo tiến độ. Bảng "Yêu cầu tải gần đây" có Huỷ (chưa bắt đầu), Chạy lại (lỗi), cảnh báo khi máy không nhận việc quá 2 phút. Supabase: bảng `downloader_requests`, RPC `downloader_request_action`, `downloader_claim_requests`, `downloader_report_requests`.
- **🎬 Video Downloader** (`admin-downloader.html`): thư viện video đã xử lý xong ở Universal Video Downloader (máy local) và đã lên Google Drive với link công khai. Xem, tìm, sao chép link tải, ẩn/hiện (editor).
- Nút **🎬 Chọn từ Downloader** cạnh ô link video ở Tạo bài đăng (Facebook "TikTok URL", IG/Threads "Input link gốc") và ở form Sửa của FB / IG-Threads: điền link tải trực tiếp, điền tiêu đề vào nội dung nếu đang trống, IG/Threads tự chọn loại "video". Không tự tạo bài.
- Supabase: bảng `downloader_videos` + RPC `ingest_downloader_video` (Downloader gửi vào bằng API key tạo ở `/admin-keygen`; chỉ nhận link Google Drive). SQL lưu ở `supabase/migrations/`.

- Telegram: trường `banner_url` (Banner URL) ở form tạo bài, xem trước, form sửa bài và trang chi tiết.
- `CLAUDE.md` (hướng dẫn cho AI) và `docs/DECISIONS.md` (nhật ký quyết định).
