/* ============================================================
   downloader-picker.js — video library pushed by the local
   Universal Video Downloader (table downloader_videos).
   Needs auth-guard.js (getSB) and shared.js (escHtml) first.

   Usage on a form:
     <button type="button" onclick="openDownloaderPicker({
        targetInput: 'fb-tiktok', captionInput: 'fb-content' })">🎬 Chọn từ Downloader</button>
   - targetInput: input that receives the direct download link
   - captionInput (optional): filled with the video title only when empty
   - selectValues (optional): {selectId: value} set after picking (e.g. content type = video)
   - onPick (optional): callback(video) instead of / in addition to the inputs
   ============================================================ */

const DL_VIDEO_COLUMNS =
  "id,source_video_id,title,source_url,source_platform,duration_s,width,height,size_bytes," +
  "is_processed,drive_file_id,drive_view_link,download_url,finished_at,is_hidden";

function dlFmtBytes(n) {
  if (n == null || isNaN(n)) return "—";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0, v = Number(n);
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i >= 2 ? 1 : 0)} ${u[i]}`;
}

function dlFmtDuration(s) {
  if (s == null || isNaN(s)) return "—";
  s = Math.round(Number(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const pad = (x) => String(x).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`;
}

function dlFmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
  } catch (e) { return iso; }
}

function dlSafeUrl(u) {
  // Links come from the DB (validated by the ingest RPC); still only allow http(s) in href.
  return /^https?:\/\//i.test(String(u || "")) ? u : "#";
}

async function fetchDownloaderVideos({ includeHidden = false, search = "", limit = 200 } = {}) {
  let q = getSB().from("downloader_videos").select(DL_VIDEO_COLUMNS)
    .order("finished_at", { ascending: false, nullsFirst: false }).limit(limit);
  if (!includeHidden) q = q.eq("is_hidden", false);
  const term = search.trim().replace(/[%,()"\*:]/g, " ").trim();
  if (term) q = q.or(`title.ilike.%${term}%,source_url.ilike.%${term}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function dlCopy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (_) {}
    ta.remove();
    return ok;
  }
}

let _dlPickerOpts = null;
let _dlPickerRows = [];
let _dlPickerTimer = null;

function openDownloaderPicker(opts = {}) {
  _dlPickerOpts = opts;
  let modal = document.getElementById("dlPickerModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "dlPickerModal";
    modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:2100;padding:16px;";
    modal.addEventListener("click", (e) => { if (e.target === modal) closeDownloaderPicker(); });
    modal.innerHTML = `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;width:100%;max-width:720px;max-height:85vh;display:flex;flex-direction:column;">
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px">
          <div style="font-size:16px;font-weight:600;color:var(--text)">🎬 Chọn video từ Downloader</div>
          <button type="button" onclick="closeDownloaderPicker()" style="margin-left:auto;background:transparent;border:none;color:var(--muted);font-size:20px;cursor:pointer;line-height:1">✕</button>
        </div>
        <div style="padding:12px 20px;border-bottom:1px solid var(--border)">
          <input id="dlPickerSearch" type="text" placeholder="Tìm theo tiêu đề hoặc link gốc…" autocomplete="off"
            style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);font-size:13px" />
        </div>
        <div id="dlPickerList" style="overflow-y:auto;padding:8px 12px 14px;flex:1"></div>
      </div>`;
    document.body.appendChild(modal);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.style.display !== "none") closeDownloaderPicker();
    });
    modal.querySelector("#dlPickerSearch").addEventListener("input", (e) => {
      clearTimeout(_dlPickerTimer);
      _dlPickerTimer = setTimeout(() => _dlPickerLoad(e.target.value), 250);
    });
  }
  modal.style.display = "flex";
  modal.querySelector("#dlPickerSearch").value = "";
  _dlPickerLoad("");
  setTimeout(() => modal.querySelector("#dlPickerSearch").focus(), 50);
}

function closeDownloaderPicker() {
  const modal = document.getElementById("dlPickerModal");
  if (modal) modal.style.display = "none";
}

async function _dlPickerLoad(search) {
  const list = document.getElementById("dlPickerList");
  list.innerHTML = `<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">Đang tải…</div>`;
  try {
    _dlPickerRows = await fetchDownloaderVideos({ search, limit: 100 });
  } catch (e) {
    list.innerHTML = `<div style="padding:24px;text-align:center;color:var(--danger);font-size:13px">Không tải được danh sách: ${escHtml(e.message)}</div>`;
    return;
  }
  if (!_dlPickerRows.length) {
    list.innerHTML = `<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px;line-height:1.6">
      Chưa có video nào${search ? " khớp tìm kiếm" : ""}.<br>
      Video xuất hiện ở đây sau khi Downloader xử lý xong và đẩy lên Google Drive.</div>`;
    return;
  }
  list.innerHTML = _dlPickerRows.map((v, i) => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px;border:1px solid var(--border);border-radius:10px;margin-top:8px;background:var(--surface2)">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(v.title || "")}">${escHtml(v.title || `Video #${v.source_video_id}`)}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:3px">
          #${escHtml(v.source_video_id)} · ${escHtml(v.source_platform || "—")} · ${dlFmtDuration(v.duration_s)} · ${v.width && v.height ? `${v.width}×${v.height} · ` : ""}${dlFmtBytes(v.size_bytes)} · ${dlFmtDate(v.finished_at)}${v.is_processed ? " · đã xử lý watermark" : ""}
        </div>
      </div>
      ${v.drive_view_link ? `<a href="${escHtml(dlSafeUrl(v.drive_view_link))}" target="_blank" rel="noopener" style="font-size:12px;color:var(--accent);text-decoration:none;white-space:nowrap">Xem ↗</a>` : ""}
      <button type="button" onclick="_dlPick(${i})" style="background:var(--accent);color:#fff;border:none;border-radius:8px;padding:7px 12px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap">Chọn</button>
    </div>`).join("");
}

function _dlPick(i) {
  const v = _dlPickerRows[i];
  if (!v) return;
  const o = _dlPickerOpts || {};
  const target = o.targetInput && document.getElementById(o.targetInput);
  if (target && target.value.trim() && target.value.trim() !== v.download_url &&
      !confirm("Ô link video đang có giá trị. Thay bằng link của video đã chọn?")) return;
  if (target) {
    target.value = v.download_url;
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
  }
  const cap = o.captionInput && document.getElementById(o.captionInput);
  if (cap && !cap.value.trim() && v.title) {
    cap.value = v.title;
    cap.dispatchEvent(new Event("input", { bubbles: true }));
  }
  for (const [id, val] of Object.entries(o.selectValues || {})) {
    const el = document.getElementById(id);
    if (el && [...(el.options || [])].some((op) => op.value === val)) {
      el.value = val;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
  if (typeof o.onPick === "function") o.onPick(v);
  closeDownloaderPicker();
  if (typeof toast === "function") {
    const name = v.title || "video #" + v.source_video_id;
    toast(`Đã chọn: ${name.length > 40 ? name.slice(0, 40) + "…" : name}`, "success");
  }
}
