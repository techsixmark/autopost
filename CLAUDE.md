# CLAUDE.md

Hướng dẫn cho Claude Code khi làm việc trong repo Autopost.

## Hệ thống

- Công cụ nội bộ lên lịch/tự động đăng bài Facebook, Telegram, Instagram/Threads cho team 6M.
- **Giao diện**: các trang `admin-*.html` tĩnh, không build, gọi thẳng Supabase JS SDK. Dùng chung `auth-guard.js` (Supabase client, đăng nhập Google, phân quyền `admin/editor/viewer` theo trang), `shared.js` (nhãn/màu trạng thái, `effectiveStatus()`, bảng giải thích trạng thái), `shared.css`.
- **Supabase**: bảng `pages`, `page_tokens`, `fb_autopost_jobs`, `tg_autopost_jobs`, `ig_thread_autopost_jobs`… RLS qua `is_allowed_user()/is_editor()/is_admin()` theo bảng `allowed_emails`.
- **n8n**: đọc job `pending`, đăng bài, ghi `n8n_status`; trigger `sync_*_status_from_n8n` tự đổi `status` theo `n8n_status`.
- **Chạy ở đâu**: VPS `sixmark-vn-01`, xem `deploy/vps/README.md`. Push lên `main` là VPS tự cập nhật sau ≤ 2 phút. Vercel + Supabase cloud cũ chỉ giữ làm dự phòng trong lúc chuyển.

## Quy ước

- Giao diện tiếng Việt; code, comment kỹ thuật, tên biến tiếng Anh.
- Đổi cột trả về của RPC (`get_fb_jobs`, `get_ig_thread_jobs`…) phải `DROP FUNCTION` rồi `CREATE` lại và `GRANT EXECUTE` (Postgres không cho `CREATE OR REPLACE` khi đổi kiểu trả về).
- Không commit secret: `.env*` đã nằm trong `.gitignore` (repo public). Khóa `anon` của Supabase là công khai, được phép nằm trong code.
- Trạng thái job: một nguồn duy nhất ở `shared.js` (`STATUS_LABEL`, `effectiveStatus()`); sửa ở đó thay vì từng trang.
- Quyết định kiến trúc/hạ tầng ghi vào `docs/DECISIONS.md` (thêm dòng, không xóa dòng cũ). Thay đổi đáng chú ý ghi vào `CHANGELOG.md`.
- Agent chuyên trách: `.claude/agents/` (supabase-schema, admin-ui-fix, bulk-import, deploy, qa).
