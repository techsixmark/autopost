// ============================================================
// auth-guard.js — dùng chung cho tất cả admin pages
// Inject bằng <script src="/auth-guard.js"></script>
// ============================================================

const SUPABASE_URL  = "https://hpsoflovdjvgfrejovvu.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhwc29mbG92ZGp2Z2ZyZWpvdnZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5OTM5MDAsImV4cCI6MjEwMTU2OTkwMH0.QlK6_7fOC3hLbyOJcOmXh2M4L4mPlU4DiTZrlkZzTQ4";

// ── Role definitions ─────────────────────────────────────────
const ROLE_LEVEL = { admin: 3, editor: 2, viewer: 1 };
const ROLE_LABEL = { admin: "👑 Admin", editor: "✏️ Editor", viewer: "👁 Viewer" };
const ROLE_COLOR = { admin: "#a78bfa", editor: "#60a5fa", viewer: "#6b7280" };

// Nguồn chuẩn duy nhất cho quyền truy cập từng trang.
// Đồng bộ với app_role trong Supabase (admin / editor / viewer).
const PAGE_PERMISSIONS = {
  "pages":       "editor",
  "jobs":        "viewer",
  "stats":       "editor",
  "execution":   "editor",
  "fb-autopost": "viewer",
  "tg-autopost": "viewer",
  "ig-thread-autopost": "viewer",
  "bulk":        "editor",
  "tokens":      "admin",
  "keygen":      "admin",
  "users":       "admin",
};

// ── Singleton Supabase client ────────────────────────────────
let _sb = null;
function getSB() {
  if (!_sb) _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
  return _sb;
}

// ── Wire login button immediately on script load ─────────────
// Handler phải sẵn sàng ngay — không chờ onAuthStateChange
(function _wireLoginBtn() {
  const btn = document.getElementById("btnGoogleLogin");
  if (btn) {
    btn.onclick = () => getSB().auth.signInWithOAuth({
      provider: "google",
      options:  { redirectTo: window.location.href },
    });
  }
})();

// ── Main guard ───────────────────────────────────────────────
// minRole = null → dùng PAGE_PERMISSIONS[page]; chỉ truyền minRole khi cần override
async function initAuthGuard({ page = null, minRole = null, onReady = null } = {}) {
  const sb = getSB();

  // BƯỚC 1: getSession() — đọc từ localStorage, không cần network, trả về ngay
  const { data: { session: existingSession } } = await sb.auth.getSession();

  if (existingSession?.user) {
    // Đã có session → xử lý ngay, không cho login screen hiện
    const result = await _handleUser(existingSession.user, sb, page, minRole, onReady);
    if (result) {
      // Vẫn subscribe để handle token refresh / sign-out
      sb.auth.onAuthStateChange(async (event, session) => {
        if (event === "SIGNED_OUT") _showLogin(sb);
      });
      return result;
    }
    return; // denied/forbidden — đã xử lý trong _handleUser
  }

  // Không có session → hiện login
  _showLogin(sb);

  // BƯỚC 2: Subscribe để nhận SIGNED_IN sau khi user đăng nhập
  return new Promise((resolve) => {
    sb.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT" || !session?.user) {
        _showLogin(sb);
        return;
      }
      if (event === "SIGNED_IN") {
        const result = await _handleUser(session.user, sb, page, minRole, onReady);
        if (result) resolve(result);
      }
    });
  });
}

// ── Process user sau khi có session ─────────────────────────
async function _handleUser(user, sb, page, minRole, onReady) {
  // Kiểm tra allowed_emails
  const { data: access, error } = await sb
    .rpc("check_user_access", { p_email: user.email })
    .single();

  if (error || !access?.is_allowed) {
    await sb.auth.signOut();
    _showDenied(user.email);
    return null;
  }

  const role = access.role;

  // Kiểm tra role tối thiểu cho trang này
  const required = minRole || (page ? PAGE_PERMISSIONS[page] : "viewer") || "viewer";
  if (ROLE_LEVEL[role] < ROLE_LEVEL[required]) {
    _showForbidden(role, required);
    return null;
  }

  // Hiện app, ẩn login
  const loginEl  = document.getElementById("loginScreen");
  const appEl    = document.getElementById("appScreen");
  const deniedEl = document.getElementById("deniedScreen");
  if (loginEl)  loginEl.style.display  = "none";
  if (deniedEl) deniedEl.style.display = "none";
  if (appEl)    appEl.style.display    = "block";

  _populateTopbar(user, role, sb);
  _applyRoleUI(role);

  if (onReady) onReady({ user, role, sb });
  return { user, role, sb };
}

// ── Login screen ─────────────────────────────────────────────
function _showLogin(sb) {
  const appEl   = document.getElementById("appScreen");
  const deniedEl= document.getElementById("deniedScreen");
  const loginEl = document.getElementById("loginScreen");
  if (appEl)    appEl.style.display    = "none";
  if (deniedEl) deniedEl.style.display = "none";
  if (loginEl)  loginEl.style.display  = "flex";

  const btnGoogle = document.getElementById("btnGoogleLogin");
  if (btnGoogle) {
    btnGoogle.onclick = () => (sb || getSB()).auth.signInWithOAuth({
      provider: "google",
      options:  { redirectTo: window.location.href },
    });
  }
}

// ── Access denied ────────────────────────────────────────────
function _showDenied(email) {
  const appEl   = document.getElementById("appScreen");
  const loginEl = document.getElementById("loginScreen");
  if (appEl)   appEl.style.display   = "none";
  if (loginEl) loginEl.style.display = "none";

  let el = document.getElementById("deniedScreen");
  if (!el) {
    el = document.createElement("div");
    el.id = "deniedScreen";
    el.style.cssText = "min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;font-family:system-ui,sans-serif;";
    document.body.appendChild(el);
  }
  el.style.display = "flex";
  el.innerHTML = `
    <div style="background:#141414;border:1px solid #2a0f0f;border-radius:16px;padding:40px;max-width:420px;width:100%;text-align:center;">
      <div style="font-size:48px;margin-bottom:16px">🚫</div>
      <div style="font-size:20px;font-weight:700;color:#f87171;margin-bottom:8px">Truy cập bị từ chối</div>
      <div style="font-size:14px;color:#666;margin-bottom:4px">Email <strong style="color:#e5e5e5">${email}</strong></div>
      <div style="font-size:13px;color:#555;margin-bottom:28px">không có trong danh sách được phép truy cập hệ thống.</div>
      <div style="font-size:12px;color:#444;margin-bottom:20px">Liên hệ admin để được cấp quyền truy cập.</div>
      <button onclick="getSB().auth.signOut()" style="background:#222;border:1px solid #333;border-radius:8px;padding:9px 20px;color:#aaa;font-size:13px;cursor:pointer;">Đăng xuất</button>
    </div>`;
}

// ── Forbidden (wrong role) ────────────────────────────────────
function _showForbidden(userRole, requiredRole) {
  const appEl   = document.getElementById("appScreen");
  const loginEl = document.getElementById("loginScreen");
  if (appEl)   appEl.style.display   = "none";
  if (loginEl) loginEl.style.display = "none";

  let el = document.getElementById("deniedScreen");
  if (!el) {
    el = document.createElement("div");
    el.id = "deniedScreen";
    el.style.cssText = "min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;font-family:system-ui,sans-serif;";
    document.body.appendChild(el);
  }
  el.style.display = "flex";
  el.innerHTML = `
    <div style="background:#141414;border:1px solid #1a1a00;border-radius:16px;padding:40px;max-width:420px;width:100%;text-align:center;">
      <div style="font-size:48px;margin-bottom:16px">🔒</div>
      <div style="font-size:20px;font-weight:700;color:#fbbf24;margin-bottom:8px">Không đủ quyền</div>
      <div style="font-size:14px;color:#666;margin-bottom:4px">Trang này yêu cầu quyền <strong style="color:#a78bfa">${requiredRole}</strong></div>
      <div style="font-size:13px;color:#555;margin-bottom:28px">Quyền hiện tại của bạn: <strong style="color:${ROLE_COLOR[userRole]}">${ROLE_LABEL[userRole]}</strong></div>
      <div style="display:flex;gap:10px;justify-content:center">
        <a href="/" style="background:#222;border:1px solid #333;border-radius:8px;padding:9px 20px;color:#aaa;font-size:13px;cursor:pointer;text-decoration:none;">← Về trang chủ</a>
        <button onclick="getSB().auth.signOut()" style="background:#222;border:1px solid #333;border-radius:8px;padding:9px 20px;color:#aaa;font-size:13px;cursor:pointer;">Đăng xuất</button>
      </div>
    </div>`;
}

// ── Topbar ────────────────────────────────────────────────────
function _populateTopbar(user, role, sb) {
  const emailEl   = document.getElementById("topbarEmail");
  const avatarEl  = document.getElementById("avatarWrap");
  const roleBadge = document.getElementById("topbarRole");

  if (emailEl)  emailEl.textContent = user.email;
  if (avatarEl) {
    const pic = user.user_metadata?.avatar_url;
    avatarEl.innerHTML = pic
      ? `<img src="${pic}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
      : "👤";
  }
  if (roleBadge) {
    roleBadge.textContent = ROLE_LABEL[role];
    roleBadge.style.color = ROLE_COLOR[role];
  }

  document.querySelectorAll("[data-action='logout']").forEach(btn => {
    btn.onclick = () => sb.auth.signOut();
  });
}

// ── Role-based UI ─────────────────────────────────────────────
function _applyRoleUI(role) {
  document.querySelectorAll("[data-min-role]").forEach(el => {
    const required = el.getAttribute("data-min-role");
    if (ROLE_LEVEL[role] < ROLE_LEVEL[required]) el.style.display = "none";
  });
  document.querySelectorAll("[data-max-role]").forEach(el => {
    const max = el.getAttribute("data-max-role");
    if (ROLE_LEVEL[role] > ROLE_LEVEL[max]) el.style.display = "none";
  });
  document.body.setAttribute("data-role", role);
}

// ── Helper ────────────────────────────────────────────────────
function canDo(userRole, requiredRole) {
  return ROLE_LEVEL[userRole] >= ROLE_LEVEL[requiredRole];
}
