# Quyết định dự án Autopost

Mỗi quyết định một dòng. Đổi ý thì thêm dòng mới, không xóa dòng cũ.

| Ngày       | Quyết định | Lý do / đánh đổi | Trạng thái |
| ---------- | ---------- | ---------------- | ---------- |
| 2026-10-25 | Chuyển toàn bộ Autopost (giao diện, Supabase, n8n) từ Vercel + Supabase cloud + n8n Cloud sang VPS `sixmark-vn-01` (14.225.255.55) | Tự chủ dữ liệu và chi phí; VPS 4 CPU / 7.8GB RAM còn dư sau LMS | Đang triển khai |
| 2026-10-25 | Dùng chung VPS với LMS (`/opt/lms`), Autopost tách riêng hoàn toàn: Supabase riêng, container `autopost-*`, mạng `autopost-supabase_default` | Không lẫn dữ liệu và tài khoản với LMS; không cần thêm máy | Đã áp dụng |
| 2026-10-25 | Không dùng Coolify | LMS đã giữ cổng 80/443 bằng Caddy; Coolify cần chiếm 80/443 nên sẽ xung đột và có thể làm sập LMS | Đã áp dụng |
| 2026-10-25 | Cổng vào HTTPS: Caddy của LMS `import /opt/caddy-sites/*.caddy`; Autopost ghi `autopost.caddy` trỏ về `autopost-gateway` (Caddy nội bộ) | Chỉ một tiến trình giữ được 80/443; thay đổi bên LMS nhỏ nhất (lms-b2b `d09abfb`); chỉ gateway tham gia mạng LMS nên không trùng tên dịch vụ | Đã áp dụng |
| 2026-10-25 | Supabase tự host bản `self-hosted/v0.8.3`, Postgres `17.11.0.006` (giống LMS); chỉ chạy db, auth, rest, meta, studio, api-gw | Tái dùng image có sẵn trên VPS; Autopost không dùng storage/realtime/functions nên bỏ cho nhẹ RAM | Đã áp dụng |
| 2026-10-25 | Domain: `autopost`, `api-autopost`, `studio-autopost`, `n8n` `.sixmark.net` (Cloudflare, DNS only) | Studio có domain riêng (có mật khẩu) để người không biết dòng lệnh vẫn xem được bảng | Chờ DNS |
| 2026-10-25 | n8n tự host `2.44.6`, database riêng `n8n` trong `autopost-db`; workflow nhập vào ở trạng thái tắt tới ngày chuyển | Chạy song song với n8n Cloud mà bật cả hai sẽ đăng bài 2 lần | Đang triển khai |
| 2026-10-25 | Web trên VPS tự cập nhật: cron 2 phút `update.sh` kéo `main` rồi `deploy.sh` | Giữ trải nghiệm "push là lên" như Vercel mà không cần CI | Đã áp dụng |
| 2026-10-25 | Giữ Vercel + Supabase cloud 1–2 tuần sau khi chuyển làm dự phòng rồi mới tắt | Có đường lùi nếu bản VPS gặp lỗi | Kế hoạch |
