// Runs the real inline script of admin-bulk.html against a fake DOM + in-memory Supabase.
const fs = require("fs"), vm = require("vm"), assert = require("assert");
// Run: node tests/admin-bulk-import.test.js   (T1 needs a real export at $AUTOPOST_SAMPLE_CSV, skipped otherwise)
const html = fs.readFileSync(__dirname + "/../admin-bulk.html", "utf8");
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join("\n");

function makeEnv(db, opts = {}) {
  const els = {};
  const el = id => els[id] ??= { id, style: {}, textContent: "", innerHTML: "", disabled: false, value: "",
    classList: { add() {}, remove() {}, toggle() {} } };
  const calls = [];
  function query(table) {
    const st = { table, op: "select", filters: [], payload: null, range: null };
    const rows = () => db[table];
    const match = r => st.filters.every(([k, op, v]) => op === "eq" ? r[k] === v : v.includes(r[k]));
    const q = {
      select() { return q; }, order() { return q; },
      range(a, b) { st.range = [a, b]; return q; },
      eq(k, v) { st.filters.push([k, "eq", v]); return q; },
      in(k, v) { st.filters.push([k, "in", v]); return q; },
      insert(p) { st.op = "insert"; st.payload = p; return q; },
      update(p) { st.op = "update"; st.payload = p; return q; },
      then(res, rej) {
        try {
          calls.push({ ...st });
          if (st.op === "select") {
            if (opts.failPagesLoad && table === "pages") return res({ data: null, error: { message: "network down" } });
            if (opts.failTokenRead && table === "page_tokens") return res({ data: null, error: { message: "timeout" } });
            const all = rows().filter(match);
            return res({ data: st.range ? all.slice(st.range[0], st.range[1] + 1) : all, error: null });
          }
          if (st.op === "insert") {
            const arr = Array.isArray(st.payload) ? st.payload : [st.payload];
            for (const p of arr) {
              if (table === "pages" && p.page_uid && rows().some(r => r.platform === p.platform && r.page_uid === p.page_uid && r.user_id === p.user_id))
                return res({ data: null, error: { message: "duplicate key value violates unique constraint" } });
            }
            const out = arr.map(p => { const r = { id: "new-" + (db._seq = (db._seq || 0) + 1), ...p }; rows().push(r); return r; });
            return res({ data: out, error: null });
          }
          if (st.op === "update") {
            if (opts.rlsBlockUpdate) return res({ data: [], error: null });
            const hit = rows().filter(match); hit.forEach(r => Object.assign(r, st.payload));
            return res({ data: hit.map(r => ({ id: r.id })), error: null });
          }
        } catch (e) { rej(e); }
      },
    };
    return q;
  }
  const toasts = [];
  const ctx = {
    console, Promise, Map, Set, Math, JSON, Date, setTimeout, clearTimeout, String, Array, Object, RegExp,
    document: { getElementById: el, querySelectorAll: () => [], querySelector: () => null, addEventListener() {}, createElement: () => ({ click() {} }) }, window: { addEventListener() {} }, addEventListener() {},
    getSB: () => ({ from: query }),
    initAuthGuard: ({ onReady }) => {},
    URL: { createObjectURL: () => "" }, Blob: function () {},
  };
  vm.createContext(ctx);
  vm.runInContext(script + `\n;globalThis.__t = { parseCSV, importPages, loadExistingPages, groupRows, withExistingPages, get parsedRows(){return parsedRows}, get pageGroups(){return pageGroups}, setUser(u){ currentUser = u } };`, ctx);
  ctx.toast = (m, t) => toasts.push([t, m]);
  vm.runInContext("toast = (m,t) => globalThis.__toast(m,t)", Object.assign(ctx, { __toast: ctx.toast }));
  return { t: ctx.__t, els, calls, toasts, db };
}
const NFD = s => s.normalize("NFD");
let pass = 0;
async function test(name, fn) { try { await fn(); pass++; console.log("ok  ", name); } catch (e) { console.log("FAIL", name, "\n     ", e.message); process.exitCode = 1; } }

(async () => {
  // ── T1: the real file the user sent, against existing pages with OLD tokens ──
  await test("T1 real CSV: 57 pages updated, 57 tokens, duplicates merged, no wipes, owner kept", async () => {
    if (!process.env.AUTOPOST_SAMPLE_CSV) return console.log("     (skipped: set AUTOPOST_SAMPLE_CSV)");
    const csv = fs.readFileSync(process.env.AUTOPOST_SAMPLE_CSV, "utf8");
    const lines = csv.split(/\r?\n/).filter(Boolean).slice(1).map(l => l.split(","));
    const pages = [], toks = []; const seen = new Set();
    for (const c of lines) {
      if (seen.has(c[2])) continue; seen.add(c[2]);
      const id = "p" + pages.length;
      const name = ["Sóc Mê Sao", "Báo Bắt Sao"].includes(c[1]) ? NFD(c[1]) : c[1];
      pages.push({ id, user_id: "owner", platform: "facebook", page_uid: c[2], page_name: name, page_group: c[4], logo_link: c[5], api_url: "OLDKEY", pic_email: "keep@x", is_active: true });
      toks.push({ id: "t" + id, user_id: "owner", page_id: id, token_type: "access_token", token_value: "OLD", token_name: "x" });
    }
    const env = makeEnv({ pages, page_tokens: toks });
    env.t.setUser({ id: "importer" });
    await env.t.loadExistingPages(); env.t.parseCSV(csv);
    assert.equal(env.t.parsedRows.length, 60);
    assert.equal(env.t.parsedRows.filter(r => r._errors.length).length, 0, "no errors");
    assert.equal(env.t.pageGroups.length, 57); assert.ok(env.t.pageGroups.every(g => g.page._existingId), "all updates");
    assert.equal(env.t.parsedRows.filter(r => r._mergedInto).length, 3, "3 merged duplicates");
    await env.t.importPages();
    assert.equal(env.els["res-dup"].textContent, 57); assert.equal(env.els["res-tok"].textContent, 57); assert.equal(env.els["res-err"].textContent, 0);
    assert.ok(env.db.page_tokens.every(t => t.token_value.startsWith("EAA") && t.user_id === "owner"), "tokens updated, owner kept");
    assert.ok(env.db.pages.every(p => p.user_id === "owner" && p.pic_email === "minhy@sixmark.net"), "owner kept");
    assert.ok(env.db.pages.every(p => p.page_name === p.page_name.normalize("NFC")), "names NFC");
    assert.equal(env.db.pages.length, 57, "no duplicate pages inserted");
    assert.equal(env.els.btnImport.disabled, true, "import disabled after run");
  });

  const base = () => ({ pages: [
    { id: "a", user_id: "owner", platform: "facebook", page_uid: "111", page_name: "Trang A", page_group: "G1", logo_link: "https://l/a", api_url: "KEYA", pic_email: "a@x", is_active: false },
    { id: "b1", user_id: "owner", platform: "facebook", page_uid: "221", page_name: "Trùng Tên", is_active: true },
    { id: "b2", user_id: "owner", platform: "facebook", page_uid: "222", page_name: "Trùng Tên", is_active: true },
    { id: "c", user_id: "owner", platform: "facebook", page_uid: "333", page_name: "Sóc Mê Sao", is_active: true },
    { id: "d1", user_id: "u1", platform: "facebook", page_uid: "888", page_name: "Shared", is_active: true },
    { id: "d2", user_id: "u2", platform: "facebook", page_uid: "888", page_name: "Shared", is_active: true },
  ], page_tokens: [
    { id: "tc", user_id: "owner", page_id: "c", token_type: "access_token", token_name: "page_access_token", token_value: "OLD", is_active: false },
  ] });
  async function run(csv, opts) { const env = makeEnv(base(), opts); env.t.setUser({ id: "importer" }); await env.t.loadExistingPages(); env.t.parseCSV(csv); return env; }
  const H = "page_id,page_name,page_uid,platform,page_group,logo_link,api_token,is_active,pic_email,token_type,token_name,token_value";

  await test("T2 blank cells / missing columns keep existing data (incl. is_active)", async () => {
    const env = await run("page_name,page_uid,platform\nTrang A mới,111,facebook");
    await env.t.importPages();
    const a = env.db.pages.find(p => p.id === "a");
    assert.equal(a.page_name, "Trang A mới"); assert.equal(a.page_group, "G1"); assert.equal(a.api_url, "KEYA");
    assert.equal(a.pic_email, "a@x"); assert.equal(a.is_active, false); assert.equal(a.user_id, "owner");
  });
  await test("T3 BOM + semicolons + quoted cells with ; and \"\"", async () => {
    const env = await run('\uFEFFpage_name;page_uid;platform;page_group\n"Trang ""A"" ; ok";111;facebook;"G; 2"');
    assert.equal(env.t.parsedRows[0].page_name, 'Trang "A" ; ok'); assert.equal(env.t.parsedRows[0].page_group, "G; 2");
    assert.equal(env.t.parsedRows[0]._action, "update");
  });
  await test("T4 Excel scientific-notation UID is rejected", async () => {
    const env = await run("page_name,page_uid,platform\nX,1.19834E+15,facebook");
    assert.match(env.t.parsedRows[0]._errors.join(), /Excel/);
  });
  await test("T5 is_active variants", async () => {
    const env = await run("page_name,page_uid,platform,is_active\nA,111,facebook,FALSE\nB,9,facebook,0\nC,8,facebook,không\nD,7,facebook,TRUE\nE,6,facebook,maybe");
    const r = env.t.parsedRows;
    assert.deepEqual(r.map(x => x.is_active), [false, false, false, true, undefined]);
    assert.match(r[4]._errors.join(), /is_active/);
  });
  await test("T6 sample format: 2 token rows for 1 new page → 1 insert + 2 tokens", async () => {
    const env = await run(H + "\n,Mới,999,facebook,Brand,,,true,,page_token,PT,EAA1\n,Mới,999,facebook,,,,true,,app_id,App,123");
    assert.equal(env.t.pageGroups.length, 1); assert.equal(env.t.pageGroups[0].tokens.length, 2);
    await env.t.importPages();
    assert.equal(env.db.pages.filter(p => p.page_uid === "999").length, 1);
    assert.equal(env.db.page_tokens.filter(t => t.page_id.startsWith("new")).length, 2); assert.equal(env.els["res-err"].textContent, 0);
    assert.equal(env.db.pages.find(p => p.page_uid === "999").page_group, "Brand", "blank 2nd row keeps 1st value");
  });
  await test("T7 NFD name in file matches NFC page (no UID)", async () => {
    const env = await run("page_name,platform\n" + NFD("Sóc Mê Sao") + ",facebook");
    assert.equal(env.t.parsedRows[0]._existingId, "c");
  });
  await test("T8 name shared by 2 pages without UID → error", async () => {
    const env = await run("page_name,platform\nTrùng Tên,facebook");
    assert.match(env.t.parsedRows[0]._errors.join(), /cùng tên/);
  });
  await test("T9 same name, different UID → new page, existing UID untouched", async () => {
    const env = await run("page_name,page_uid,platform\nTrang A,555,facebook");
    assert.equal(env.t.parsedRows[0]._action, "insert"); assert.match(env.t.parsedRows[0]._warns.join(), /khác UID/);
    await env.t.importPages();
    assert.equal(env.db.pages.find(p => p.id === "a").page_uid, "111");
  });
  await test("T10 duplicated new-page rows → 1 insert, conflict warned", async () => {
    const env = await run(H + "\n,N,77,facebook,,,K1,,,,,\n,N,77,facebook,,,K2,,,,,");
    await env.t.importPages();
    assert.equal(env.db.pages.filter(p => p.page_uid === "77").length, 1);
    assert.equal(env.db.pages.find(p => p.page_uid === "77").api_url, "K2");
    assert.match(env.t.parsedRows[1]._warns.join(), /api_token/);
  });
  await test("T11 RLS silently blocking an update is reported", async () => {
    const env = await run("page_name,page_uid,platform\nTrang A,111,facebook", { rlsBlockUpdate: true });
    await env.t.importPages();
    assert.equal(env.els["res-err"].textContent, 1); assert.match(env.els["res-errors"].innerHTML, /quyền/);
  });
  await test("T12 page_id with a different platform → error", async () => {
    const env = await run("page_id,page_name,platform\na,Trang A,telegram");
    assert.match(env.t.parsedRows[0]._errors.join(), /Platform/);
  });
  await test("T13 tg_* fields ignored for non-telegram pages", async () => {
    const env = await run("page_name,page_uid,platform,tg_link\nTrang A,111,facebook,https://t.me/x");
    await env.t.importPages();
    assert.equal(env.db.pages.find(p => p.id === "a").tg_link, undefined);
  });
  await test("T14 UID shared by 2 users' pages → error unless page_id given", async () => {
    let env = await run("page_name,page_uid,platform\nShared U1,888,facebook");
    assert.match(env.t.parsedRows[0]._errors.join(), /page_id/);
    env = await run("page_id,page_name,page_uid,platform\nd1,Shared U1,888,facebook");
    assert.equal(env.t.parsedRows[0]._errors.length, 0); await env.t.importPages();
    assert.equal(env.db.pages.find(p => p.id === "d2").page_name, "Shared");
    assert.equal(env.db.pages.find(p => p.id === "d1").page_name, "Shared U1");
  });
  await test("T15 new page: token row without UID merges into the UID row (1 insert)", async () => {
    const env = await run(H + "\n,Brand X,555,facebook,G,,,,,page_token,P,EAA1\n,Brand X,,facebook,,,,,,app_id,A,123");
    assert.equal(env.t.pageGroups.length, 1); await env.t.importPages();
    assert.equal(env.db.pages.filter(p => p.page_name === "Brand X").length, 1);
    assert.equal(env.db.page_tokens.filter(t => t.page_id.startsWith("new")).length, 2);
  });
  await test("T16 failed token read → no token inserted (no duplicates), error shown", async () => {
    const env = await run(H + "\n,Sóc Mê Sao,333,facebook,,,,,,access_token,,EAA9", { failTokenRead: true });
    await env.t.importPages();
    assert.equal(env.db.page_tokens.length, 1); assert.equal(env.db.page_tokens[0].token_value, "OLD");
    assert.match(env.els["res-errors"].innerHTML, /không đọc được token/);
  });
  await test("T17 failed page load blocks parsing (no silent inserts)", async () => {
    const env = makeEnv(base(), { failPagesLoad: true }); env.t.setUser({ id: "i" });
    let parsed = false; await env.t.withExistingPages(() => { parsed = true; });
    assert.equal(parsed, false); assert.equal(env.toasts.at(-1)[0], "error");
  });
  await test("T18 page_id + UID differing from the stored one (Excel rounding) → error", async () => {
    const env = await run("page_id,page_name,page_uid,platform\na,Trang A,110,facebook");
    assert.match(env.t.parsedRows[0]._errors.join(), /làm tròn/);
  });
  await test("T19 quoted cell with a line break + correct line numbers after blank lines", async () => {
    const env = await run('page_name,page_uid,platform,page_group\n\n"Trang\nA",111,facebook,G\nTrang B,9,facebook,H');
    assert.equal(env.t.parsedRows.length, 2); assert.equal(env.t.parsedRows[0].page_name, "Trang\nA");
    assert.deepEqual(env.t.parsedRows.map(r => r._line), [3, 5]);
  });
  await test("T20 token update keeps its name and its disabled state when cells are blank", async () => {
    const env = await run(H + "\n,Sóc Mê Sao,333,facebook,,,,,,access_token,,EAANEW");
    await env.t.importPages();
    const t = env.db.page_tokens[0];
    assert.equal(t.token_value, "EAANEW"); assert.equal(t.token_name, "page_access_token"); assert.equal(t.is_active, false);
  });
  await test("T21 NFD text in other columns is stored NFC; NFD 'có' accepted for is_active", async () => {
    const env = await run("page_name,page_uid,platform,page_group,is_active\nTrang A,111,facebook," + NFD("Nhóm Ảnh") + "," + NFD("có"));
    assert.equal(env.t.parsedRows[0].is_active, true); await env.t.importPages();
    assert.equal(env.db.pages.find(p => p.id === "a").page_group, "Nhóm Ảnh".normalize("NFC"));
  });
  await test("T22 stray quote inside a cell is literal; following rows kept", async () => {
    const env = await run('page_name,page_uid,platform,page_group\nTrang 5" inch,1,facebook,G\nB,2,facebook,H\nC,3,facebook,I');
    assert.equal(env.t.parsedRows.length, 3); assert.equal(env.t.parsedRows[0].page_name, 'Trang 5" inch');
  });
  await test("T23 unclosed quote at cell start → whole file rejected with its line", async () => {
    const env = await run('page_name,page_uid,platform\n"Trang A,1,facebook\nB,2,facebook');
    assert.equal(env.t.parsedRows.length, 0); assert.match(env.toasts.at(-1)[1], /Dòng 2/);
  });
  await test("T24 UID-less row matching 2 new same-name pages → error, no 3rd page", async () => {
    const env = await run(H + "\n,Brand Z,1,facebook,,,,,,,,\n,Brand Z,2,facebook,,,,,,,,\n,Brand Z,,facebook,,,,,,app_id,A,9");
    assert.match(env.t.parsedRows[2]._errors.join(), /UID khác nhau/);
    await env.t.importPages();
    assert.equal(env.db.pages.filter(p => p.page_name === "Brand Z").length, 2);
  });
  console.log(`\n${pass} passed`);
})();
