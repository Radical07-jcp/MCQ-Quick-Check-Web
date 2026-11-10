/* Port of MarkerDetector.kt + PaperSurroundCheck.kt + PerspectiveWarp.kt, on the pure-JS imaging ops. */
import { C, sheetAspectRatio } from "./template.js";
import { integral, matchMarker, otsu8, perspectiveTransform, warpPerspectiveRGBA } from "./imaging.js";

export const M = { MIN_MATCH_SCORE: 0.45, SEARCH_WINDOW: 0.32, SCALE_STEPS: [0.5, 0.65, 0.8, 1.0, 1.25, 1.5, 1.8, 2.2], MIN_ASPECT_RATIO_FACTOR: 0.30, MAX_ASPECT_RATIO_FACTOR: 3.2, WHITE_THRESHOLD: 90 };
export class MarkersNotFoundError extends Error { constructor(msg, diagnostics = []) { super(msg); this.diagnostics = diagnostics; } }

function isOnWhitePaper(gray, cx, cy, markerSizePx) {
  const outer = Math.max(Math.trunc(markerSizePx * 1.8), markerSizePx + 4), cl = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  const left = cl(cx - outer, 0, gray.width - 1), top = cl(cy - outer, 0, gray.height - 1), right = cl(cx + outer, left + 1, gray.width), bottom = cl(cy + outer, top + 1, gray.height);
  if (right - left <= 2 || bottom - top <= 2) return false;
  let s = 0; for (let y = top; y < bottom; y++) { const o = y * gray.width; for (let x = left; x < right; x++) s += gray.data[o + x]; }
  return s / ((right - left) * (bottom - top)) >= M.WHITE_THRESHOLD;
}

function refineCentroid(gray, cx, cy, size) {
  const r = Math.max(Math.trunc(size * 0.65), 3), cl = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  const left = cl(cx - r, 0, gray.width - 1), top = cl(cy - r, 0, gray.height - 1), right = cl(cx + r, left + 1, gray.width), bottom = cl(cy + r, top + 1, gray.height);
  const hist = new Int32Array(256); let total = 0;
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) { hist[gray.data[y * gray.width + x]]++; total++; }
  const thr = otsu8(hist, total); let m00 = 0, m10 = 0, m01 = 0;
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) if (gray.data[y * gray.width + x] <= thr) { m00++; m10 += x - left; m01 += y - top; }
  if (m00 > 1) return { point: { x: left + m10 / m00, y: top + m01 / m00 }, otsu: thr };
  return { point: { x: cx, y: cy }, otsu: thr };
}

function findMarker(gray, left, top, right, bottom, expectedMarkerPx, name) {
  const rw = right - left, rh = bottom - top;
  if (rw <= 8 || rh <= 8) return { point: null, diag: { corner: name, bestTemplateScore: 0, passed: false, failureReason: `search region too small (${rw}x${rh}px)` } };
  const ii = integral(gray, left, top, rw, rh);
  let best = -1, bx = 0, by = 0, bsize = 0, bestIgnoringGate = -1;
  for (const scale of M.SCALE_STEPS) {
    const size = Math.max(Math.trunc(expectedMarkerPx * scale), 8);
    if (size >= rw || size >= rh) continue;
    const m = matchMarker(gray, left, top, rw, rh, size, ii);
    if (m.score > bestIgnoringGate) bestIgnoringGate = m.score;
    if (m.score > best) {
      const mcx = left + m.x + Math.trunc(size / 2), mcy = top + m.y + Math.trunc(size / 2);
      if (isOnWhitePaper(gray, mcx, mcy, size)) { best = m.score; bx = m.x; by = m.y; bsize = size; }
    }
  }
  if (best < M.MIN_MATCH_SCORE) {
    const gated = bestIgnoringGate >= M.MIN_MATCH_SCORE;
    return { point: null, diag: { corner: name, bestTemplateScore: gated ? bestIgnoringGate : best, passed: false, rejectedByPaperGate: gated,
      failureReason: gated ? `shape matched (score ${bestIgnoringGate.toFixed(3)}) but rejected by paper-brightness gate` : `template match score ${best.toFixed(3)} below ${M.MIN_MATCH_SCORE.toFixed(3)}` } };
  }
  const { point, otsu } = refineCentroid(gray, Math.trunc(left + bx + bsize / 2), Math.trunc(top + by + bsize / 2), bsize);
  return { point, diag: { corner: name, bestTemplateScore: best, otsuThreshold: otsu, passed: true, failureReason: null } };
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function validateQuadShape(pts, expectedAspect) {
  const [tl, tr, bl, br] = pts, top = dist(tl, tr), bottom = dist(bl, br), left = dist(tl, bl), right = dist(tr, br);
  if (top <= 1 || bottom <= 1 || left <= 1 || right <= 1) throw new MarkersNotFoundError("Detected markers are too close together to form a sheet outline.");
  if (Math.max(top, bottom) / Math.min(top, bottom) > 3 || Math.max(left, right) / Math.min(left, right) > 3)
    throw new MarkersNotFoundError("Detected corner markers don't form a consistent rectangle. Retake the photo with the whole sheet visible and flat.");
  const ratio = ((top + bottom) / 2 / ((left + right) / 2)) / expectedAspect;
  if (ratio < M.MIN_ASPECT_RATIO_FACTOR || ratio > M.MAX_ASPECT_RATIO_FACTOR)
    throw new MarkersNotFoundError("The detected shape doesn't match this test's expected paper size. Make sure you're scanning the right sheet for this test.");
}

/** @param gray {data:Uint8Array,width,height}  @returns [TL,TR,BL,BR] points (+ .diagnostics) */
export function detectMarkers(gray, expectedAspect = C.PAGE_WIDTH / C.PAGE_HEIGHT) {
  const w = gray.width, h = gray.height, winX = Math.trunc(w * M.SEARCH_WINDOW), winY = Math.trunc(h * M.SEARCH_WINDOW), expectedMarkerPx = C.MARKER_SIZE * w;
  const quads = [["top-left", 0, 0, winX, winY], ["top-right", w - winX, 0, w, winY], ["bottom-left", 0, h - winY, winX, h], ["bottom-right", w - winX, h - winY, w, h]];
  const diags = [], pts = []; let firstFail = null;
  for (const [name, l, t, r, b] of quads) { const { point, diag } = findMarker(gray, l, t, r, b, expectedMarkerPx, name); diags.push(diag); if (point) pts.push(point); else if (!firstFail) firstFail = name; }
  if (firstFail) throw new MarkersNotFoundError(`Could not find a clear alignment marker in the ${firstFail} corner. Make sure this is a photo of the printed answer sheet with all 4 corner squares visible.`, diags);
  validateQuadShape(pts, expectedAspect); pts.diagnostics = diags; return pts;
}

/** PerspectiveWarp.warp: maps detected marker centres onto the template's expected marker positions in a 612x792 output. */
export function warpToTemplate(rgba, corners, template, outW = C.PAGE_WIDTH, outH = C.PAGE_HEIGHT) {
  if (corners.length !== 4) throw new Error("Expected exactly 4 detected corners");
  const dst = template.markerCenters().map(([fx, fy]) => [fx * outW, fy * outH]), src = corners.map((p) => [p.x, p.y]);
  return warpPerspectiveRGBA(rgba, perspectiveTransform(src, dst), outW, outH);
}
export { sheetAspectRatio };
