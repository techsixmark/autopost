# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), phiên bản theo [SemVer](https://semver.org/lang/vi/).

## [Unreleased]

### Sửa

- Trạng thái job đồng bộ theo kết quả cuối của n8n trên cả 3 nền tảng: `Error` → Lỗi, `Error Link` → Error Link (trước đây job vẫn hiện "Chờ xử lý"). Sửa dữ liệu: 1 job Facebook, 32 job Telegram.
- Nút "🔧 n8n → Đặt lại chờ đăng" đưa trạng thái về Chờ xử lý (trước chỉ đổi n8n_status nên job lỗi vẫn kẹt, không chạy lại).

### Thêm

- `CLAUDE.md` (hướng dẫn cho AI) và `docs/DECISIONS.md` (nhật ký quyết định).
