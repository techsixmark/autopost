# CLAUDE.md

Hướng dẫn cho Claude Code khi làm việc trong repo Autopost.

## Hệ thống

- Công cụ nội bộ lên lịch/tự động đăng bài Facebook, Telegram, Instagram/Threads cho team 6M.
- **Giao diện**: các trang `admin-*.html` tĩnh, không build, gọi thẳng Supabase JS SDK. Dùng chung `auth-guard.js` (Supabase client, đăng nhập Google, phân quyền `admin/editor/viewer` theo trang), `shared.js` (nhãn/màu trạng thái, `effectiveStatus()`, bảng giải thích trạng thái), `shared.css`.
- **Supabase**: bảng `pages`, `page_tokens`, `fb_autopost_jobs`, `tg_autopost_jobs`, `ig_thread_autopost_jobs`, `downloader_videos`… RLS qua `is_allowed_user()/is_editor()/is_admin()` theo bảng `allowed_emails`.
- **n8n**: đọc job `pending`, đăng bài, ghi `n8n_status`; trigger `sync_*_status_from_n8n` tự đổi `status` theo `n8n_status`.
- **Chạy ở đâu**: giao diện trên Vercel (push lên `main` là tự deploy), Supabase cloud (project `hpsoflovdjvgfrejovvu`), n8n Cloud. Việc chuyển lên VPS đã hủy (xem `docs/DECISIONS.md`).

- **Universal Video Downloader** (repo `techsixmark/6m-universal-downloader`, chạy local): đẩy video đã lên Google Drive vào `downloader_videos` qua RPC `ingest_downloader_video` (API key `/admin-keygen`). Trang `admin-downloader.html` + `downloader-picker.js` (nút "🎬 Chọn từ Downloader") không tự tạo job. Trang đó còn có "Tải video mới": ghi `downloader_requests`, máy Downloader tự nhận việc (`downloader_claim_requests` / `downloader_report_requests`).

## Quy ước

- Giao diện tiếng Việt; code, comment kỹ thuật, tên biến tiếng Anh.
- Đổi cột trả về của RPC (`get_fb_jobs`, `get_ig_thread_jobs`…) phải `DROP FUNCTION` rồi `CREATE` lại và `GRANT EXECUTE` (Postgres không cho `CREATE OR REPLACE` khi đổi kiểu trả về).
- SQL thay đổi Supabase: lưu thêm file trong `supabase/migrations/` (cùng nội dung migration đã áp).
- Không commit secret: `.env*` đã nằm trong `.gitignore` (repo public). Khóa `anon` của Supabase là công khai, được phép nằm trong code.
- Trạng thái job: một nguồn duy nhất ở `shared.js` (`STATUS_LABEL`, `effectiveStatus()`); sửa ở đó thay vì từng trang.
- Quyết định kiến trúc/hạ tầng ghi vào `docs/DECISIONS.md` (thêm dòng, không xóa dòng cũ). Thay đổi đáng chú ý ghi vào `CHANGELOG.md`.
- Test: `node tests/admin-bulk-import.test.js` (import CSV) và `node tests/csv-export-roundtrip.test.js` (xuất → Excel → nhập lại), chạy code thật của trang trên Supabase giả. Sửa `admin-bulk.html` hoặc phần xuất CSV của `admin-pages.html` thì chạy lại cả hai.
- Agent chuyên trách: `.claude/agents/` (supabase-schema, admin-ui-fix, bulk-import, deploy, qa).
