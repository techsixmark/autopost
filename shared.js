/* Autopost — Shared: Theme Toggle */
(function () {
  const KEY = 'ap-theme';

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(KEY, theme); } catch(e) {}
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
  }

  window.toggleTheme = function () {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  };

  // Apply immediately to prevent flash
  const saved = (function(){ try { return localStorage.getItem(KEY); } catch(e){ return null; } })();
  applyTheme(saved === 'dark' ? 'dark' : 'light');

  document.addEventListener('DOMContentLoaded', function () {
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
  });
})();

/* ============================================================
   Shared status helpers — dùng chung cho mọi template autopost
   (FB / TG / IG&Thread / Jobs / Stats / Execution wizard).
   Một nguồn duy nhất cho label, màu badge, và cách suy ra
   "effective status" từ status (DB) + n8n_status (n8n trả về).
   ============================================================ */
const STATUS_LABEL = {
  pending:           "⏳ Chờ xử lý",
  processing:        "⚙️ Đang xử lý",
  success:           "✅ Thành công",
  error:             "❌ Lỗi",
  error_video_large: "📦 Video quá lớn",
  error_link:        "⚠️ Error Link",
  replaced_link:     "🔄 Đã thay link",
  ignored:           "🚫 Ignored",
  scheduled:         "🕐 Scheduled",
};

const STATUS_CLASS = {
  pending:           "st-pending",
  processing:        "st-processing",
  success:           "st-success",
  error:             "st-error",
  error_video_large: "st-error_video_large",
  error_link:        "st-error_link",
  replaced_link:     "st-replaced_link",
  ignored:           "st-ignored",
  scheduled:         "st-pending",
};

// Chuẩn hoá n8n_status (text tự do, casing không đồng nhất giữa các n8n workflow)
// về 1 trong 4 nhóm: success | error | error_link | running
function normalizeN8n(raw) {
  if (!raw) return null;
  const v = String(raw).trim().toLowerCase();
  if (["success","ok","done","thành công","thanh cong","hoàn thành","hoan thanh","hoàn tất","hoan tat"].includes(v)) return "success";
  if (["error link","errorlink","error_link","link error","lỗi link","loi link","link lỗi","link loi","link hỏng","link hong"].includes(v)) return "error_link";
  if (["error","failed","fail","lỗi","loi","thất bại","that bai"].includes(v)) return "error";
  return "running"; // bất kỳ giá trị khác không rỗng → coi như đang chạy
}

// Kết hợp status (DB) + n8n_status (n8n trả về) thành 1 effective status duy nhất
// để badge hiển thị giống nhau trên mọi trang, bất kể platform.
function effectiveStatus(job) {
  if (!job) return "pending";
  if (job.status === "ignored" || job.status === "replaced_link") return job.status;
  if (normalizeN8n(job.n8n_status) === "error_link") return "error_link";
  return job.status || "pending";
}

function escHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

function statusBadgeHTML(job) {
  const s = effectiveStatus(job);
  const label = STATUS_LABEL[s] || s;
  const cls   = STATUS_CLASS[s] || "st-pending";
  return `<span class="status-badge ${cls}">${label}</span>`;
}

function n8nBadgeHTML(job) {
  if (!job || !job.n8n_status) return `<span style="color:var(--muted2);font-size:11px">—</span>`;
  const n = normalizeN8n(job.n8n_status);
  const cls = n === "success" ? "n8n-success" : (n === "error" || n === "error_link") ? "n8n-error" : "n8n-running";
  return `<span class="n8n-badge ${cls}">${escHtml(job.n8n_status)}</span>`;
}

/* ============================================================
   Bảng lookup Trạng thái & n8n — modal dùng chung, build động
   bằng JS nên chỉ cần 1 nút trigger gọi openStatusLegend() ở
   mỗi trang, không cần lặp lại HTML.
   ============================================================ */
function statusLegendTableHTML() {
  const statusRows = [
    ["pending",            "Job mới tạo, chưa có n8n xử lý"],
    ["processing",         "n8n đang chạy"],
    ["success",            "Đăng thành công"],
    ["error",              "Lỗi chung"],
    ["error_video_large",  "Riêng FB — video vượt giới hạn dung lượng"],
    ["error_link",         "Link nguồn lỗi — áp dụng mọi platform, override status thật"],
    ["replaced_link",      "TG — job cũ bị thay bằng job mới sau khi bấm Retry"],
    ["ignored",            "Job cũ bị thay thế khi bấm Sửa"],
  ];
  const n8nRows = [
    ["success, ok, done,<br>thành công, hoàn thành, hoàn tất",       "✅ success",            "status = success"],
    ["error, failed, fail,<br>lỗi, thất bại",                         "❌ error",              "status = error"],
    ["error link, errorlink, link error,<br>lỗi link, link lỗi, link hỏng", "⚠️ error_link",   "status = error_link"],
    ["video too large,<br>video quá lớn",                             "📦 error_video_large", "status = error_video_large"],
    ["pending, queued, waiting,<br>chờ, đang chờ",                    "⏳ pending",            "status = pending"],
    ["bất kỳ giá trị khác<br>(running, processing, đang xử lý…)",     "⚙️ running",            "status = processing"],
  ];
  const td  = "padding:7px 10px;border-top:1px solid var(--border);vertical-align:top";
  const thS = "text-align:left;padding:7px 10px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);background:var(--surface2)";
  return `
    <div style="margin-bottom:20px">
      <div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">📍 Cột Trạng thái (status)</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr><th style="${thS}">Giá trị</th><th style="${thS}">Badge</th><th style="${thS}">Ý nghĩa</th></tr></thead>
        <tbody>
          ${statusRows.map(([val,desc]) => `<tr>
            <td style="${td};font-family:monospace;color:var(--muted)">${val}</td>
            <td style="${td}">${statusBadgeHTML({status:val})}</td>
            <td style="${td};color:var(--muted)">${desc}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <div>
      <div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">📡 Cột n8n (n8n_status) → quy đổi sang status</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr><th style="${thS}">Giá trị n8n_status (ví dụ)</th><th style="${thS}">Nhóm</th><th style="${thS}">Kết quả</th></tr></thead>
        <tbody>
          ${n8nRows.map(([val,grp,res]) => `<tr>
            <td style="${td};color:var(--muted)">${val}</td>
            <td style="${td}">${grp}</td>
            <td style="${td};font-family:monospace">${res}</td>
          </tr>`).join("")}
        </tbody>
      </table>
      <div style="font-size:11px;color:var(--muted2);margin-top:10px;line-height:1.5">⚠️ <strong>ignored</strong> / <strong>replaced_link</strong> không bao giờ bị <code>n8n_status</code> ghi đè, vì đó là hành động chủ động của người dùng (bấm "Sửa"/"Retry"), không phải kết quả từ n8n.</div>
    </div>
  `;
}

function openStatusLegend() {
  let modal = document.getElementById("statusLegendModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "statusLegendModal";
    modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:2000;padding:16px;";
    modal.addEventListener("click", function(e) { if (e.target === modal) closeStatusLegend(); });
    modal.innerHTML = `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;width:100%;max-width:680px;max-height:85vh;overflow-y:auto;">
        <div style="padding:18px 22px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:var(--surface);z-index:1">
          <div style="font-size:16px;font-weight:600;color:var(--text)">📖 Giải thích Trạng thái &amp; n8n</div>
          <button onclick="closeStatusLegend()" style="background:transparent;border:none;color:var(--muted);font-size:20px;cursor:pointer;line-height:1">✕</button>
        </div>
        <div style="padding:20px 22px">${statusLegendTableHTML()}</div>
      </div>`;
    document.body.appendChild(modal);
  }
  modal.style.display = "flex";
}

function closeStatusLegend() {
  const modal = document.getElementById("statusLegendModal");
  if (modal) modal.style.display = "none";
}
