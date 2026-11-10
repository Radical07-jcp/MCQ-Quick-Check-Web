import { SheetTemplate, suggestColumnsAndRows, rowsPerBlockRange, maxBlocksPerRowGroupRange, C, clampIdDigits } from "./core/template.js";
import { parseKey, gradeSheet } from "./core/answers.js";
import { scanSheet } from "./core/scan.js";
import { MarkersNotFoundError } from "./core/markers.js";
import { LowConfidenceError } from "./core/grader.js";
import { buildSheetPdf, PAPER } from "./core/sheetPdf.js";
import { annotate } from "./annotate.js";
import { loadPhoto } from "./image.js";
import * as db from "./db.js";

const $ = (s, el = document) => el.querySelector(s), view = $("#view"), dlg = $("#dlg");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const letters = (n) => Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
let tab = "tests", cur = null; // cur = last scan session {test, scan, overrides}
const toTemplate = (t) => new SheetTemplate(t.template);
const keyOf = (t) => t.key.map((i) => i);

function setTab(t) { tab = t; document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === t)); render(); }
document.querySelectorAll("#tabs button").forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));

async function render() { try { await ({ tests: renderTests, scan: renderScan, saved: renderSaved })[tab](); } catch (e) { view.innerHTML = `<div class="card err">Something went wrong: ${esc(e.message)}</div>`; } }

/* ---------------- Tests ---------------- */
async function renderTests() {
  const tests = await db.allTests();
  view.innerHTML = `<div class="row" style="margin:0 0 12px"><button class="btn primary" id="new">+ New test</button></div>` +
    (tests.length ? tests.map((t) => `<div class="card" data-id="${t.id}"><h3>${esc(t.template.testName)}</h3><div class="muted">${t.template.questionCount} items · ${t.template.choiceCount} choices · key ${t.key.length === t.template.questionCount ? "set" : "incomplete"}${t.template.idDigits ? ` · ID ${t.template.idDigits} digits` : ""}</div>
      <div class="row"><button class="btn" data-a="sheet">Print sheet</button><button class="btn" data-a="scan">Scan</button><button class="btn" data-a="edit">Edit</button><button class="btn danger" data-a="del">Delete</button></div></div>`).join("")
      : `<div class="card"><h3>No tests yet</h3><div class="muted">Create a test, print its answer sheet, then scan filled sheets with your camera. Everything stays on this device.</div></div>`);
  $("#new").onclick = () => editTest(null);
  view.querySelectorAll("[data-a]").forEach((b) => (b.onclick = async () => {
    const t = await db.getTest(b.closest("[data-id]").dataset.id), a = b.dataset.a;
    if (a === "edit") editTest(t); else if (a === "sheet") sheetDialog(t); else if (a === "scan") { cur = { testId: t.id }; setTab("scan"); }
    else if (a === "del" && confirm(`Delete "${t.template.testName}"? Saved scans for it are kept.`)) { await db.delTest(t.id); render(); }
  }));
}

function editTest(t) {
  const tpl = t ? t.template : { testName: "", questionCount: 20, choiceCount: 4, bubbleSizeMm: C.BUBBLE_MM_DEFAULT, idDigits: 0 };
  const keyText = t ? t.key.map((i) => String.fromCharCode(65 + i)).join(" ") : "";
  dlg.innerHTML = `<h3 style="margin-top:0">${t ? "Edit test" : "New test"}</h3>
    <label>Test name</label><input id="f-name" maxlength="40" value="${esc(tpl.testName)}" placeholder="e.g. Quiz 1">
    <div class="grid2"><div><label>Items (${10}–${100})</label><input id="f-n" type="number" min="10" max="100" value="${tpl.questionCount}"></div>
    <div><label>Choices</label><select id="f-k"><option value="4" ${tpl.choiceCount === 4 ? "selected" : ""}>A–D (4)</option><option value="5" ${tpl.choiceCount === 5 ? "selected" : ""}>A–E (5)</option></select></div></div>
    <div class="grid2"><div><label>Columns</label><select id="f-cols"></select></div><div><label>Rows per column</label><select id="f-rows"></select></div></div>
    <div class="grid2"><div><label>Bubble size: <span id="f-mm-v"></span> mm</label><input id="f-mm" type="range" min="${C.BUBBLE_MM_MIN}" max="${C.BUBBLE_MM_MAX}" step="0.02" value="${tpl.bubbleSizeMm}"></div>
    <div><label>Student ID boxes</label><select id="f-id"><option value="0">None</option>${Array.from({ length: C.ID_MAX_DIGITS - C.ID_MIN_DIGITS + 1 }, (_, i) => i + C.ID_MIN_DIGITS).map((d) => `<option value="${d}" ${tpl.idDigits === d ? "selected" : ""}>${d} digits</option>`).join("")}</select></div></div>
    <label>Answer key <span class="muted">(letters, e.g. ABCD… or A B C D …)</span></label><textarea id="f-key" spellcheck="false">${esc(keyText)}</textarea><div class="muted" id="f-keyinfo"></div>
    <div id="f-err" class="muted" style="color:var(--bad)"></div>
    <div class="row"><button class="btn primary" id="f-save">Save</button><button class="btn" id="f-cancel">Cancel</button></div>`;
  const q = (s) => $(s, dlg);
  const fillCols = (keepCols, keepRows) => {
    const n = Math.min(Math.max(+q("#f-n").value || 10, 10), 100), [cLo, cHi] = maxBlocksPerRowGroupRange(n), sug = suggestColumnsAndRows(n);
    const cols = keepCols && keepCols >= cLo && keepCols <= cHi ? keepCols : sug.columns;
    q("#f-cols").innerHTML = Array.from({ length: cHi - cLo + 1 }, (_, i) => cLo + i).map((c) => `<option ${c === cols ? "selected" : ""}>${c}</option>`).join("");
    const [rLo, rHi] = rowsPerBlockRange(n, cols); const opts = []; for (let r = rLo; r <= rHi; r += 5) opts.push(r); if (!opts.includes(rHi)) opts.push(rHi);
    const rows = keepRows && opts.includes(keepRows) ? keepRows : (cols === sug.columns ? sug.rows : opts[0]);
    q("#f-rows").innerHTML = opts.map((r) => `<option ${r === rows ? "selected" : ""}>${r}</option>`).join("");
  };
  fillCols(t && t.template.maxBlocksPerRowGroup, t && t.template.rowsPerBlock);
  q("#f-n").oninput = () => { fillCols(); keyInfo(); }; q("#f-cols").onchange = () => fillCols(+q("#f-cols").value); q("#f-k").onchange = keyInfo;
  const mmv = () => (q("#f-mm-v").textContent = (+q("#f-mm").value).toFixed(2)); q("#f-mm").oninput = mmv; mmv();
  const parse = () => { const raw = q("#f-key").value.trim(); if (!raw) return []; const toks = /[\s,]/.test(raw) ? raw.split(/[\s,]+/) : raw.split(""); return parseKey(toks.join(" "), +q("#f-k").value); };
  function keyInfo() { try { const k = parse(); q("#f-keyinfo").textContent = `${k.length} of ${q("#f-n").value} answers entered`; } catch (e) { q("#f-keyinfo").textContent = e.message; } }
  q("#f-key").oninput = keyInfo; keyInfo();
  q("#f-cancel").onclick = () => dlg.close();
  q("#f-save").onclick = async () => {
    try {
      const n = +q("#f-n").value; if (!(n >= 10 && n <= 100)) throw new Error("Items must be between 10 and 100.");
      const key = parse(); if (key.length && key.length !== n) throw new Error(`The key has ${key.length} answers but the test has ${n} items.`);
      const template = new SheetTemplate({ testName: q("#f-name").value.trim() || "Untitled Test", questionCount: n, choiceCount: +q("#f-k").value, rowsPerBlock: +q("#f-rows").value, maxBlocksPerRowGroup: +q("#f-cols").value, bubbleSizeMm: +q("#f-mm").value, idDigits: +q("#f-id").value ? clampIdDigits(+q("#f-id").value) : 0 }).toJSON();
      await db.putTest({ id: t ? t.id : db.uid(), template, key, createdAt: t ? t.createdAt : Date.now(), updatedAt: Date.now() }); db.persist(); dlg.close(); render();
    } catch (e) { q("#f-err").textContent = e.message; }
  };
  dlg.showModal();
}

function sheetDialog(t) {
  dlg.innerHTML = `<h3 style="margin-top:0">Print sheet: ${esc(t.template.testName)}</h3><div class="muted">One page holds 4 identical sheets. Print at 100% / “Actual size” (not “fit to page”), then cut along the dashed lines. Scanning needs all 4 corner squares visible.</div>
    <label>Paper</label><select id="p-paper">${Object.entries(PAPER).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join("")}</select>
    <div class="row"><button class="btn primary" id="p-blank">Make blank sheet PDF</button><button class="btn" id="p-key" ${t.key.length === t.template.questionCount ? "" : "disabled"}>Answer-key preview PDF</button><button class="btn" id="p-close">Close</button></div><div id="p-out" class="row"></div>`;
  const make = async (withKey) => {
    $("#p-out", dlg).innerHTML = `<span class="muted">Building PDF…</span>`;
    try {
      const bytes = await buildSheetPdf(toTemplate(t), { answerKey: withKey ? t.key : null, paper: $("#p-paper", dlg).value }), url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })), name = `${t.template.testName.replace(/[^\w-]+/g, "_")}${withKey ? "_key" : ""}.pdf`;
      $("#p-out", dlg).innerHTML = `<a class="btn primary" href="${url}" target="_blank" rel="noopener">Open PDF</a><a class="btn" href="${url}" download="${esc(name)}">Download</a>`;
    } catch (e) { $("#p-out", dlg).innerHTML = `<span style="color:var(--bad)">${esc(e.message)}</span>`; }
  };
  $("#p-blank", dlg).onclick = () => make(false); $("#p-key", dlg).onclick = () => make(true); $("#p-close", dlg).onclick = () => dlg.close(); dlg.showModal();
}

/* ---------------- Scan ---------------- */
async function renderScan() {
  const tests = await db.allTests();
  if (!tests.length) { view.innerHTML = `<div class="card"><h3>Create a test first</h3><div class="muted">Scanning needs a test (sheet layout and answer key).</div></div>`; return; }
  const sel = cur && cur.testId && tests.some((t) => t.id === cur.testId) ? cur.testId : tests[0].id;
  view.innerHTML = `<div class="card"><label style="margin-top:0">Test</label><select id="s-test">${tests.map((t) => `<option value="${t.id}" ${t.id === sel ? "selected" : ""}>${esc(t.template.testName)} (${t.template.questionCount})</option>`).join("")}</select>
    <div class="row"><label class="btn primary" style="margin:0;display:inline-block;cursor:pointer">Take / choose photo<input id="s-file" type="file" accept="image/*" capture="environment" hidden></label></div>
    <div class="muted" style="margin-top:8px">Lay the cut-out sheet flat, good light, all 4 corner squares in view. Photos are processed on this device only.</div></div><div id="s-out"></div>`;
  $("#s-file").onchange = async (ev) => { const f = ev.target.files[0]; ev.target.value = ""; if (f) await doScan(await db.getTest($("#s-test").value), f); };
  if (cur && cur.scan && cur.testId === sel) showResult();
}

async function doScan(test, file) {
  const out = $("#s-out"); out.innerHTML = `<div class="card"><span class="muted">Scanning…</span></div>`; await new Promise((r) => setTimeout(r, 30));
  try {
    const img = await loadPhoto(file), tpl = toTemplate(test), t0 = performance.now();
    const r = scanSheet(img, tpl, test.key.length === test.template.questionCount ? test.key : null, { requireConfidence: true });
    cur = { testId: test.id, test, tpl, scan: r, overrides: {}, ms: performance.now() - t0 }; showResult();
  } catch (e) {
    const hint = e instanceof MarkersNotFoundError || e instanceof LowConfidenceError ? "" : " (unexpected error)";
    out.innerHTML = `<div class="card err"><h3>Couldn't read this sheet</h3><div>${esc(e.message)}${hint}</div></div>`;
  }
}

const effective = (i) => (cur.overrides[i] !== undefined ? { ...cur.scan.results[i], chosenIndex: cur.overrides[i] === -1 ? null : cur.overrides[i], isAmbiguous: false } : cur.scan.results[i]);
function summary() { const res = cur.scan.results.map((_, i) => effective(i)), has = cur.test.key.length === cur.test.template.questionCount; return { res, s: has ? gradeSheet(cur.test.key, res) : null }; }

function showResult() {
  const out = $("#s-out"); if (!out || !cur.scan) return; const { res, s } = summary(), L = letters(cur.test.template.choiceCount);
  const problems = res.map((r, i) => ({ r, i })).filter(({ r, i }) => r.isAmbiguous || r.chosenIndex === null);
  out.innerHTML = `<div class="card"><div class="muted">${esc(cur.test.template.testName)} · scanned in ${cur.ms.toFixed(0)} ms</div>
    <div class="score">${s ? `${s.correct}<span class="muted" style="font-size:22px"> / ${s.total}</span>` : "No key set"}</div>
    <div><span class="chip ok">${s ? s.perQuestion.filter((v) => v === true).length : "–"} correct</span><span class="chip bad">${s ? s.perQuestion.filter((v) => v === false).length : "–"} wrong/unclear</span><span class="chip blue">${res.filter((r) => r.chosenIndex === null).length} blank</span></div>
    <canvas class="sheet" id="s-canvas"></canvas>
    <div class="muted">Green = correct · red = wrong (correct choice ringed) · amber = unclear mark · blue = blank/no key</div>
    <div class="row"><button class="btn primary" id="s-save">Save scan</button></div></div>
    ${problems.length ? `<div class="card"><h3>Review ${problems.length} item${problems.length > 1 ? "s" : ""}</h3><div class="muted">Marks the scanner couldn't call confidently. Tap the answer the student meant.</div>${problems.map(({ r, i }) => `<div class="row" data-q="${i}"><b style="min-width:2.5em">${i + 1}.</b>${L.map((l, ci) => `<button class="btn ${r.chosenIndex === ci ? "primary" : ""}" data-c="${ci}">${l}</button>`).join("")}<button class="btn ${r.chosenIndex === null && cur.overrides[i] === -1 ? "primary" : ""}" data-c="-1">Blank</button>${r.isGenuineBlank ? `<span class="chip blue">blank</span>` : r.isAmbiguous ? `<span class="chip warn">unclear</span>` : ""}</div>`).join("")}</div>` : ""}`;
  annotate($("#s-canvas"), cur.scan.warped, cur.tpl, res, cur.test.key.length === cur.test.template.questionCount ? cur.test.key : null);
  out.querySelectorAll("[data-q] [data-c]").forEach((b) => (b.onclick = () => { cur.overrides[+b.closest("[data-q]").dataset.q] = +b.dataset.c; showResult(); }));
  $("#s-save").onclick = saveScan;
}

async function saveScan() {
  const { res, s } = summary(), c = document.createElement("canvas"), src = $("#s-canvas"); c.width = 120; c.height = 155; c.getContext("2d").drawImage(src, 0, 0, 120, 155);
  await db.putScan({ id: db.uid(), ts: Date.now(), testId: cur.test.id, testName: cur.test.template.testName, total: cur.test.template.questionCount, correct: s ? s.correct : null, answers: res.map((r) => r.chosenIndex), thumb: c.toDataURL("image/jpeg", 0.7) });
  $("#s-save").textContent = "Saved ✓"; $("#s-save").disabled = true;
}

/* ---------------- Saved ---------------- */
async function renderSaved() {
  const scans = await db.allScans();
  view.innerHTML = scans.length ? `<div class="row" style="margin:0 0 12px"><button class="btn" id="csv">Export CSV</button></div>` + scans.map((x) => `<div class="card item" data-id="${x.id}"><img class="thumb" src="${x.thumb}" alt=""><div><b>${esc(x.testName)}</b><div class="muted">${new Date(x.ts).toLocaleString()}</div></div><div class="score" style="font-size:26px">${x.correct ?? "–"}/${x.total}</div><button class="btn danger" data-del>✕</button></div>`).join("")
    : `<div class="card"><h3>No saved scans</h3><div class="muted">Scan a sheet and tap “Save scan”.</div></div>`;
  view.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => { if (confirm("Delete this saved scan?")) { await db.delScan(b.closest("[data-id]").dataset.id); render(); } }));
  const csv = $("#csv"); if (csv) csv.onclick = () => {
    const maxQ = Math.max(...scans.map((x) => x.total)), head = ["Date", "Test", "Score", "Total", ...Array.from({ length: maxQ }, (_, i) => `Q${i + 1}`)];
    const rows = scans.map((x) => [new Date(x.ts).toISOString(), x.testName, x.correct ?? "", x.total, ...x.answers.map((a) => (a === null ? "" : String.fromCharCode(65 + a)))]);
    const text = [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n"), a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" })); a.download = "mcq-results.csv"; a.click();
  };
}

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./sw.js").catch(() => {});
window.__mcq = { setTab }; setTab("tests");
