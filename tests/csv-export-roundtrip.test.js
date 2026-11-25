// Export CSV (admin-pages) → Excel open & save (simulated) → import (admin-bulk), on the pages' real
// inline scripts with a fake DOM and an in-memory Supabase.   Run: node tests/csv-export-roundtrip.test.js
const fs = require("fs"), vm = require("vm"), assert = require("assert");

function pageScript(file) {
  const html = fs.readFileSync(__dirname + "/../" + file, "utf8");
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join("\n");
}

function loadPage(file, db, expose) {
  const els = {}, downloads = [], toasts = [];
  const el = id => els[id] ??= { id, style: {}, textContent: "", innerHTML: "", disabled: false, value: "", checked: false,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, querySelectorAll: () => [], addEventListener() {} };
  const from = table => {
    const st = { op: "select", f: [], p: null, range: null };
    const q = {
      select() { return q; }, order() { return q; }, range(a, b) { st.range = [a, b]; return q; },
      eq(k, v) { st.f.push(r => r[k] === v); return q; }, in(k, v) { st.f.push(r => v.includes(r[k])); return q; },
      insert(p) { st.op = "insert"; st.p = p; return q; }, update(p) { st.op = "update"; st.p = p; return q; },
      then(res) {
        const rows = db[table] ?? [];
        const hit = rows.filter(r => st.f.every(f => f(r)));
        if (st.op === "select") return res({ data: st.range ? hit.slice(st.range[0], st.range[1] + 1) : hit, error: null });
        if (st.op === "update") { hit.forEach(r => Object.assign(r, st.p)); return res({ data: hit.map(r => ({ id: r.id })), error: null }); }
        const arr = [].concat(st.p).map(p => ({ id: "new" + rows.length, ...p })); rows.push(...arr);
        return res({ data: arr, error: null });
      },
    };
    return q;
  };
  const ctx = {
    console, Promise, Map, Set, Math, JSON, Date, setTimeout, clearTimeout, setInterval() {}, String, Array, Object, RegExp, Number,
    document: { getElementById: el, querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
      createElement: () => ({ click() {}, set href(v) {}, set download(n) { downloads.at(-1).name = n; } }), body: { appendChild() {} } },
    window: { addEventListener() {}, location: { search: "" } }, addEventListener() {}, localStorage: { getItem() {}, setItem() {} },
    location: { search: "", hostname: "x" }, navigator: {},
    Blob: function (parts) { downloads.push({ text: parts.join("") }); },
    URL: { createObjectURL: () => "blob:" },
    getSB: () => ({ from, auth: { getUser: async () => ({ data: {} }) }, rpc: async () => ({ data: [] }) }),
    initAuthGuard() {}, effectiveStatus: () => "pending", statusBadgeHTML: () => "",
  };
  vm.createContext(ctx);
  vm.runInContext(pageScript(file) + `\n;globalThis.__x = {${expose}};`, ctx);
  vm.runInContext("toast = (m, t) => __toasts.push([t, m])", Object.assign(ctx, { __toasts: toasts }));
  return { x: ctx.__x, els, downloads, toasts };
}

// What Excel does to a CSV it opens and saves again (General format, default column width).
function excelOpenSave(csv) {
  const bulk = loadPage("admin-bulk.html", { pages: [] }, "parseCSVRecords");
  const text = csv.replace(/^﻿/, "").replace(/\r/g, "");
  const { recs } = bulk.x.parseCSVRecords(text, ",");
  const cell = v => {
    const f = /^="([\s\S]*)"$/.exec(v);
    if (f) return f[1].replace(/""/g, '"');                                     // ="…" → shown as text
    if (/^-?\d{12,}$/.test(v)) return Number(v).toExponential(5).toUpperCase().replace("E+", "E+"); // 1.19834E+15
    if (/^0\d+$/.test(v)) return String(Number(v));                             // leading zero dropped
    if (/^[=+@]/.test(v) || (/^-/.test(v) && isNaN(Number(v)))) return "#NAME?"; // run as a formula
    return v;
  };
  const out = v => /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  return "﻿" + recs.map(r => r.cells.map(c => out(cell(c))).join(",")).join("\r\n");
}

const PAGES = [
  { id: "11111111-aaaa-4bbb-8ccc-000000000001", user_id: "u", platform: "facebook", page_uid: "1198343600040102", page_name: "Sóc Soi, \"Showbiz\"",
    page_group: "Review Phim", logo_link: "https://i.ibb.co/x.png", api_url: "fdfe9da591msh0648", is_active: true, pic_email: "a@x.net" },
  { id: "11111111-aaaa-4bbb-8ccc-000000000002", user_id: "u", platform: "telegram", page_uid: "-1001234567890", page_name: "Kênh TG",
    page_group: "=HYPERLINK(\"http://evil\")", tg_type: "channel", tg_link: "https://t.me/x", tg_default_link: "+84 link", is_active: false },
  { id: "11111111-aaaa-4bbb-8ccc-000000000003", user_id: "u", platform: "thread", page_uid: "0123456789012", page_name: "Dòng 1\nDòng 2", is_active: true },
];
const clone = () => JSON.parse(JSON.stringify(PAGES));

function exportCsv() {
  const ap = loadPage("admin-pages.html", {}, "exportPagesCSV, set: (p, s) => { allPages = p; selectedPageIds = s; }");
  ap.x.set(clone(), new Set(PAGES.map(p => p.id)));
  ap.x.exportPagesCSV();
  assert.equal(ap.downloads.length, 1, "one file downloaded");
  return ap.downloads[0];
}
async function importCsv(text) {
  const db = { pages: clone(), page_tokens: [] };
  const b = loadPage("admin-bulk.html", db, "parseCSV, importPages, loadExistingPages, get rows(){return parsedRows}, setUser(u){currentUser=u}");
  b.x.setUser({ id: "importer" }); await b.x.loadExistingPages(); b.x.parseCSV(text);
  return { b, db };
}

let pass = 0;
async function test(name, fn) { try { await fn(); pass++; console.log("ok  ", name); } catch (e) { console.log("FAIL", name, "\n     ", e.message); process.exitCode = 1; } }

(async () => {
  await test("E1 export → import directly: every page matched by page_id, nothing changes", async () => {
    const { b, db } = await importCsv(exportCsv().text);
    assert.deepEqual(b.x.rows.map(r => r._errors), [[], [], []]);
    assert.ok(b.x.rows.every(r => r._action === "update"));
    await b.x.importPages();
    assert.deepEqual(db.pages, PAGES);
  });
  await test("E2 export → Excel open/save → import: UIDs and text survive, nothing changes", async () => {
    const { b, db } = await importCsv(excelOpenSave(exportCsv().text));
    assert.deepEqual(b.x.rows.map(r => r._errors), [[], [], []]);
    await b.x.importPages();
    assert.deepEqual(db.pages, PAGES);
  });
  await test("E3 text that looks like a formula is not run by Excel", async () => {
    const csv = exportCsv().text;
    assert.ok(!excelOpenSave(csv).includes("#NAME?"), "no cell turned into a formula error");
  });
  await test("E4 file name uses the local date, UTF-8 BOM present", async () => {
    const d = exportCsv(); const now = new Date();
    const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    assert.equal(d.name, `pages_export_${local}.csv`); assert.ok(d.text.startsWith("﻿"));
  });
  await test("E5 sample CSV imports without errors", async () => {
    const bulk = loadPage("admin-bulk.html", { pages: [], page_tokens: [] }, "downloadSampleCSV, parseCSV, loadExistingPages, get rows(){return parsedRows}, get groups(){return pageGroups}");
    await bulk.x.loadExistingPages(); bulk.x.downloadSampleCSV();
    bulk.x.parseCSV(bulk.downloads[0].text);
    assert.deepEqual(bulk.x.rows.filter(r => r._errors.length).map(r => r._line + ": " + r._errors), []);
    assert.equal(bulk.x.groups.length, 7, "8 rows → 7 pages (Brand A has 2 token rows)");
  });
  console.log(`\n${pass} passed`);
})();
