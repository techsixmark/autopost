# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), phiên bản theo [SemVer](https://semver.org/lang/vi/). Bản `1.0.0` sẽ là ngày chuyển hẳn sang VPS.

## [Unreleased]

### Thêm

- Triển khai trên VPS dùng chung với LMS (`deploy/vps/`): Supabase tự host riêng, n8n tự host, `autopost-gateway` phục vụ web tĩnh và định tuyến, cổng vào HTTPS qua Caddy của LMS.
- Tự cập nhật web trên VPS mỗi 2 phút khi `main` có commit mới; sao lưu DB + n8n hằng ngày.
- `CLAUDE.md`, `docs/DECISIONS.md`.
