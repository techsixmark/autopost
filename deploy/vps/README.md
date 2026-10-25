# Autopost trên VPS

Autopost chạy trên VPS `sixmark-vn-01` (14.225.255.55), **dùng chung máy với LMS** (`/opt/lms`, repo `techsixmark/lms-b2b`). Hai hệ thống tách riêng hoàn toàn (container, mạng, database, tài khoản); chỉ dùng chung Caddy của LMS làm cổng vào HTTPS.

| Phần                      | Thư mục trên VPS                    | Gồm                                                                 |
| ------------------------- | ----------------------------------- | ------------------------------------------------------------------- |
| Supabase tự chạy          | `/opt/autopost/supabase`            | Postgres, Auth (đăng nhập Google), REST, Studio, API gateway (Envoy) |
| Autopost                  | `/opt/autopost/app/deploy/vps`      | `autopost-gateway` (web tĩnh + định tuyến), n8n                     |
| File web đang phục vụ     | `/opt/autopost/web`                 | Bản sao các file `.html/.js/.css` ở gốc repo (do `deploy.sh` chép)  |
| Cổng vào HTTPS (của LMS)  | `/opt/caddy-sites/autopost.caddy`   | Site block cho 4 domain, do `deploy.sh` ghi từ `edge.caddy`         |

```
Internet ─443─▶ lms-caddy (HTTPS) ─▶ autopost-gateway ─┬▶ /opt/autopost/web        (autopost.)
                (mạng supabase_default)                ├▶ autopost-api-gw:8000      (api-autopost., studio-autopost.)
                                                       └▶ autopost-n8n:5678         (n8n.)
```

Container Autopost đều mang tên `autopost-*` và không mở cổng nào ra ngoài (cổng Docker mở ra ngoài sẽ vượt qua tường lửa ufw). Chỉ `autopost-gateway` tham gia mạng `supabase_default` của LMS.

## Địa chỉ

DNS ở Cloudflare (`sixmark.net`): 4 bản ghi A trỏ về 14.225.255.55, chế độ **DNS only** (mây xám).

| Địa chỉ                               | Dùng cho                                                           |
| ------------------------------------- | ------------------------------------------------------------------ |
| `https://autopost.sixmark.net`        | Giao diện quản trị Autopost                                        |
| `https://api-autopost.sixmark.net`    | Supabase API (chỉ `/auth/v1`, `/rest/v1`), dùng bởi giao diện và n8n |
| `https://studio-autopost.sixmark.net` | Supabase Studio (xem/sửa bảng). Đăng nhập: `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` trong `/opt/autopost/supabase/.env` |
| `https://n8n.sixmark.net`             | n8n (tài khoản owner tạo ở lần mở đầu tiên)                        |

Đăng nhập Google: OAuth client cần có redirect URI `https://api-autopost.sixmark.net/auth/v1/callback` (Google Cloud Console → Credentials).

## Cài lần đầu

```
git clone https://github.com/techsixmark/autopost.git /opt/autopost/app
cd /opt/autopost/app/deploy/vps
GOOGLE_CLIENT_ID=… GOOGLE_SECRET=… ./bootstrap.sh
```

`bootstrap.sh`: cài Supabase (cùng bản `self-hosted/v0.8.3` và image Postgres với LMS nên dùng lại image có sẵn), tự sinh mật khẩu/khóa, tạo database `n8n`, cài cron, rồi chạy `deploy.sh`. HTTPS chỉ được bật khi cả 4 domain đã trỏ về VPS; nếu DNS chưa xong, chạy lại `./deploy.sh` sau.

## Cập nhật bản mới

Tự động: cron chạy `update.sh` mỗi 2 phút, thấy `main` có commit mới thì kéo về và chạy `deploy.sh` (giống Vercel: push lên `main` là lên). Log: `/var/log/autopost-deploy.log`.

Chạy tay: `cd /opt/autopost/app && git pull && deploy/vps/deploy.sh`

## Sao lưu

`backup.sh` chạy 02:45 hằng ngày (cron `/etc/cron.d/autopost-backup`): dump schema `public` + `auth` (dữ liệu và tài khoản đăng nhập), database `n8n`, và 2 file `.env` vào `/opt/autopost/backups`, giữ 14 ngày. Log: `/var/log/autopost-backup.log`. Bản sao lưu nằm cùng ổ VPS: mất VPS là mất cả sao lưu; cần chép ra ngoài trước khi chỉ còn dựa vào VPS.

Khóa Google Translate (trigger dịch nội dung Telegram) nằm trong Vault, không có trong bản dump: khi khôi phục lên DB mới, tạo lại bằng `select vault.create_secret('<key>', 'google_translate_api_key');`.

## Lệnh hay dùng

```
cd /opt/autopost/app/deploy/vps
docker compose ps                         # gateway + n8n
docker compose logs -f n8n                # log n8n
(cd /opt/autopost/supabase && docker compose ps)
docker exec -it autopost-db psql -U postgres   # SQL trực tiếp
```
