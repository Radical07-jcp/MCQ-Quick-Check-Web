// End-to-end: synthetic photo -> scanSheet() -> compare to the known filled answers.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { SheetTemplate } from "../src/core/template.js";
import { scanSheet } from "../src/core/scan.js";

function readPPM(path) {
  const buf = fs.readFileSync(path); let p = 0; const tok = () => { while (buf[p] <= 32) p++; let s = ""; while (buf[p] > 32) s += String.fromCharCode(buf[p++]); return s; };
  tok(); const w = +tok(), h = +tok(); tok(); p++; const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0, q = p; i < w * h; i++, q += 3) { rgba[i * 4] = buf[q]; rgba[i * 4 + 1] = buf[q + 1]; rgba[i * 4 + 2] = buf[q + 2]; rgba[i * 4 + 3] = 255; }
  return { data: rgba, width: w, height: h };
}
const ids = (process.argv[2] || "q50x4,q30x5,q100x4,q20x4id,q10x4").split(","), seeds = [1, 2, 3], diffs = [0, 1, 2];
let total = 0, right = 0, files = 0, failed = 0, blankErr = 0, ambiguousCorrectish = 0; const rows = [];
for (const id of ids) for (const seed of seeds) {
  const diff = diffs[seed - 1]; execFileSync("python3", ["test/synth.py", id, String(seed), String(diff)], { stdio: ["ignore", "ignore", "inherit"] });
  const { template, truth } = JSON.parse(fs.readFileSync(`test/out/${id}_${seed}.truth.json`)), img = readPPM(`test/out/${id}_${seed}.ppm`);
  const t0 = performance.now(); let r; files++;
  try { r = scanSheet(img, new SheetTemplate(template), null, { requireConfidence: false }); } catch (e) { failed++; rows.push(`${id} seed${seed} diff${diff}: SCAN ERROR ${e.message}`); continue; }
  const ms = performance.now() - t0; let ok = 0;
  r.results.forEach((q, i) => { total++; const exp = truth[i]; const got = q.chosenIndex; if ((exp === null && got === null) || exp === got) { ok++; right++; } else if (exp === null) blankErr++; });
  const amb = r.results.filter((q) => q.isAmbiguous).length;
  rows.push(`${id.padEnd(8)} seed${seed} diff${diff}: ${ok}/${template.questionCount} correct, ${amb} flagged ambiguous, tier ${r.diagnostics.confidenceTier}, ink ${r.diagnostics.blendedInkThreshold.toFixed(0)}, ${ms.toFixed(0)} ms`);
}
console.log(rows.join("\n")); console.log(`\nfiles ${files}, scan failures ${failed}, answers matched ${right}/${total} (${(100 * right / Math.max(total, 1)).toFixed(2)}%), blank-misreads ${blankErr}`);
process.exit(failed === 0 && right / total > 0.97 ? 0 : 1);
