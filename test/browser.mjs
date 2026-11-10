// Real-browser test (headless Chromium): create test -> make sheet PDF -> scan synthetic photo -> verify score -> save -> list.
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { createRequire } from "node:module"; const puppeteer = createRequire(import.meta.url)("/opt/npm-tools/node_modules/puppeteer-core");
const root = path.resolve("."), mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".jpg": "image/jpeg" };
const server = http.createServer((q, s) => { let p = path.join(root, decodeURIComponent(q.url.split("?")[0])); if (p.endsWith("/")) p += "index.html"; fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); } else { s.writeHead(200, { "content-type": mime[path.extname(p)] || "application/octet-stream" }); s.end(d); } }); }).listen(0);
const port = server.address().port, base = `http://localhost:${port}/`;
const exe = fs.readdirSync("/opt/pw-browsers").filter((d) => d.startsWith("chromium-")).map((d) => `/opt/pw-browsers/${d}/chrome-linux64/chrome`)[0];
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage(); await page.setViewport({ width: 820, height: 1180, deviceScaleFactor: 1 });
const errors = []; page.on("pageerror", (e) => errors.push("pageerror: " + e.message)); page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
const fail = (m) => { console.log("FAIL:", m); console.log(errors.join("\n")); process.exitCode = 1; };
const { template, truth } = JSON.parse(fs.readFileSync("test/out/q50x4_1.truth.json"));
await page.goto(base, { waitUntil: "networkidle0" });
// 1. create the test
await page.click("#new"); await page.waitForSelector("#f-name"); await page.type("#f-name", "Browser Quiz");
await page.$eval("#f-n", (el) => { el.value = "50"; el.dispatchEvent(new Event("input")); });
const key = truth.map((t) => String.fromCharCode(65 + (t === null ? 0 : t))).join(""); await page.type("#f-key", key);
console.log("key info:", await page.$eval("#f-keyinfo", (e) => e.textContent), "| cols", await page.$eval("#f-cols", (e) => e.value), "rows", await page.$eval("#f-rows", (e) => e.value));
await page.click("#f-save"); await page.waitForSelector('[data-a="sheet"]');
// 2. sheet PDF
await page.click('[data-a="sheet"]'); await page.waitForSelector("#p-blank"); await page.click("#p-blank"); await page.waitForSelector('#p-out a[href^="blob:"]');
const pdfHead = await page.evaluate(async () => { const r = await fetch(document.querySelector('#p-out a').href); const b = new Uint8Array(await r.arrayBuffer()); return [String.fromCharCode(...b.slice(0, 5)), b.length]; });
console.log("PDF:", pdfHead.join(" / ")); if (pdfHead[0] !== "%PDF-") fail("PDF header");
await page.click("#p-close");
// 3. scan
await page.click('[data-tab="scan"]'); await page.waitForSelector("#s-file"); const input = await page.$("#s-file"); const t0 = Date.now(); await input.uploadFile("test/out/q50x4_1.jpg");
await page.waitForSelector(".score, .err", { timeout: 60000 }); const scoreTxt = await page.$eval(".score", (e) => e.textContent).catch(() => null);
const expected = truth.filter((t) => t !== null).length;
console.log(`score shown: ${scoreTxt} (expected ${expected}/50 when every non-blank is correct) in ${Date.now() - t0} ms`);
const problems = await page.$$eval("[data-q]", (els) => els.length); console.log("items flagged for review:", problems);
await page.screenshot({ path: "test/out/ui-scan.png", fullPage: true });
if (!scoreTxt || !scoreTxt.startsWith(String(expected))) fail("score mismatch");
// 4. save + list
await page.evaluate(() => { window.addEventListener("unhandledrejection", (e) => console.error("UNHANDLED " + (e.reason && e.reason.stack || e.reason))); }); await page.$eval("#s-save", (b) => b.click()); await new Promise((r) => setTimeout(r, 800)); console.log("MAIN AFTER CLICK:", (await page.$eval("main", (m) => m.innerText)).slice(0, 300).replace(/\n/g, " | ")); await page.screenshot({ path: "test/out/ui-after-save.png" }); await page.click('[data-tab="saved"]'); await page.waitForSelector(".thumb", { timeout: 4000 }).catch(async () => { console.log("NO SAVED CARD. errors:", errors.join(" | ") || "none"); console.log(await page.$eval("main", (m) => m.innerText.slice(0, 200))); await page.screenshot({ path: "test/out/ui-fail.png" }); await browser.close(); server.close(); process.exit(1); });
console.log("saved cards:", await page.$$eval(".card.item", (e) => e.length)); await page.screenshot({ path: "test/out/ui-saved.png" });
// 5. persistence across reload
await page.reload({ waitUntil: "networkidle0" }); await page.click('[data-tab="tests"]'); console.log("tests after reload:", await page.$$eval(".card h3", (e) => e.length));
console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no console/page errors"); await browser.close(); server.close(); if (errors.length) process.exitCode = 1;
