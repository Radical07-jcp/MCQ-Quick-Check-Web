/* Pure-JS replacements for the few OpenCV operations MCQ Quick Check uses (no OpenCV.js needed):
 * RGBA->gray, integral images, TM_CCOEFF_NORMED for the (3-level) marker template in O(1) per position, Otsu threshold + moments,
 * getPerspectiveTransform and warpPerspective (bicubic, a=-0.75, white border). Behaviour mirrors OpenCV closely but is not bit-identical. */

export function rgbaToGray(img) {
  const { data, width, height } = img, out = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) out[i] = Math.round(data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114);
  return { data: out, width, height };
}

/** Integral images (sum and squared sum) of a gray sub-rectangle; accessor rect(x,y,w,h) returns the sum. */
export function integral(gray, left, top, rw, rh) {
  const W = rw + 1, sum = new Float64Array(W * (rh + 1)), sq = new Float64Array(W * (rh + 1));
  for (let y = 0; y < rh; y++) {
    let rs = 0, rq = 0; const src = (top + y) * gray.width + left, o = (y + 1) * W, p = y * W;
    for (let x = 0; x < rw; x++) { const v = gray.data[src + x]; rs += v; rq += v * v; sum[o + x + 1] = sum[p + x + 1] + rs; sq[o + x + 1] = sq[p + x + 1] + rq; }
  }
  const rect = (a, x, y, w, h) => a[(y + h) * W + x + w] - a[y * W + x + w] - a[(y + h) * W + x] + a[y * W + x];
  return { W, sum, sq, sumRect: (x, y, w, h) => rect(sum, x, y, w, h), sqRect: (x, y, w, h) => rect(sq, x, y, w, h) };
}

/** Marker template (see MarkerTemplateFactory.kt): white square, black filled square [om..size-om] inclusive, white inner square [im..size-im] inclusive. */
export function markerTemplateParams(size, OUTER = 0.08, RING = 0.30) {
  const om = Math.max(Math.trunc(size * OUTER), 1), ring = Math.max(Math.trunc(size * RING), 1), im = om + ring;
  const lo = size - 2 * om + 1, hasInner = size - im * 2 >= 3, li = hasInner ? size - 2 * im + 1 : 0;
  return { size, om, im, lo, li, hasInner };
}

/** TM_CCOEFF_NORMED of the marker template over a region (sub-rectangle of gray). Returns best {score,x,y} (x,y = top-left of match inside the region). */
export function matchMarker(gray, left, top, rw, rh, size, ii) {
  const P = markerTemplateParams(size), N = size * size;
  const tSumT = 255 * (N - P.lo * P.lo + P.li * P.li); // sum of template values
  const tMean = tSumT / N, sumT2 = 255 * 255 * (N - P.lo * P.lo + P.li * P.li), varT = sumT2 - N * tMean * tMean;
  let best = { score: -Infinity, x: 0, y: 0 };
  if (varT <= 1e-9) return best;
  const maxX = rw - size, maxY = rh - size;
  for (let y = 0; y <= maxY; y++) for (let x = 0; x <= maxX; x++) {
    const sw = ii.sumRect(x, y, size, size), sq = ii.sqRect(x, y, size, size);
    const iT = 255 * (sw - ii.sumRect(x + P.om, y + P.om, P.lo, P.lo) + (P.hasInner ? ii.sumRect(x + P.im, y + P.im, P.li, P.li) : 0));
    const num = iT - tMean * sw, varI = sq - sw * sw / N, denom = Math.sqrt(Math.max(varI, 0) * varT);
    const score = denom < 1e-9 ? 0 : num / denom;
    if (score > best.score) best = { score, x, y };
  }
  return best;
}

/** OpenCV-style Otsu on 8-bit data: returns threshold t (pixels <= t are "dark"). */
export function otsu8(hist, total) {
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, maxVar = -1, thr = 0;
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (wB === 0) continue; const wF = total - wB; if (wF === 0) break;
    sumB += i * hist[i]; const mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
    if (v > maxVar) { maxVar = v; thr = i; }
  }
  return thr;
}

/** getPerspectiveTransform: 3x3 row-major H with dst ~ H * src (4 point pairs). */
export function perspectiveTransform(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]); b.push(v);
  }
  const n = 8; for (let i = 0; i < n; i++) A[i].push(b[i]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) throw new Error("Degenerate marker layout (cannot compute perspective transform).");
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; }
  }
  const h = A.map((row, i) => row[n] / row[i]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}
export function invert3(m) {
  const [a, b, c, d, e, f, g, h, i] = m, A = e * i - f * h, B = -(d * i - f * g), Cc = d * h - e * g, det = a * A + b * B + c * Cc;
  if (Math.abs(det) < 1e-18) throw new Error("Singular transform.");
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, Cc / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

/** warpPerspective(src RGBA, H(src->dst), outW x outH) with INTER_CUBIC (A=-0.75) and a white constant border. */
export function warpPerspectiveRGBA(src, H, outW, outH) {
  const inv = invert3(H), { data, width: sw, height: sh } = src, out = new Uint8ClampedArray(outW * outH * 4), A = -0.75;
  const wts = (t, w) => { const t1 = t + 1; w[0] = ((A * t1 - 5 * A) * t1 + 8 * A) * t1 - 4 * A; w[1] = ((A + 2) * t - (A + 3)) * t * t + 1; const s = 1 - t; w[2] = ((A + 2) * s - (A + 3)) * s * s + 1; w[3] = 1 - w[0] - w[1] - w[2]; };
  const wx = new Float64Array(4), wy = new Float64Array(4);
  for (let y = 0; y < outH; y++) for (let x = 0; x < outW; x++) {
    const d = inv[6] * x + inv[7] * y + inv[8], u = (inv[0] * x + inv[1] * y + inv[2]) / d, v = (inv[3] * x + inv[4] * y + inv[5]) / d, o = (y * outW + x) * 4;
    const x0 = Math.floor(u), y0 = Math.floor(v);
    if (!(x0 >= -1 && y0 >= -1 && x0 < sw && y0 < sh)) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 255; continue; }
    wts(u - x0, wx); wts(v - y0, wy);
    let r = 0, g = 0, b = 0;
    for (let j = 0; j < 4; j++) { const yy = y0 - 1 + j; for (let i = 0; i < 4; i++) {
      const xx = x0 - 1 + i, w = wx[i] * wy[j];
      if (xx < 0 || yy < 0 || xx >= sw || yy >= sh) { r += 255 * w; g += 255 * w; b += 255 * w; } else { const p = (yy * sw + xx) * 4; r += data[p] * w; g += data[p + 1] * w; b += data[p + 2] * w; }
    } }
    out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
  }
  return { data: out, width: outW, height: outH };
}
