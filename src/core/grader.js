/* Port of BubbleGrader.kt: ink-coverage grading of a perspective-corrected sheet.
 * `img` = { data: Uint8ClampedArray RGBA, width, height }. Tunables and the multi-tier adaptive threshold are copied 1:1. */
import { C } from "./template.js";
import { otsuCompute } from "./otsu.js";

export const G = {
  FILLED_THRESHOLD: 150, MIN_COVERAGE: 0.46, HARD_MIN_COVERAGE: 0.15, HARD_INK_THRESHOLD: 90,
  MIN_SECONDARY_COVERAGE: 0.38, MAX_WINNER_MARGIN: 0.30, MARGINAL_COVERAGE_BAND: 0.08, BLANK_FLOOR: 0.08,
  CENTER_RADIUS_FRACTION: 0.5, MIN_CENTER_COVERAGE: 0.35, SAMPLE_RADIUS_FRACTION: 0.016,
};
export class LowConfidenceError extends Error {}

export function requireConfident(results) {
  if (!results.length) return;
  const real = results.filter((r) => r.isAmbiguous && !r.isGenuineBlank).length, blank = results.filter((r) => r.isGenuineBlank).length;
  const ambRate = real / results.length, unclearRate = (real + blank) / results.length;
  if (ambRate > 0.25 || unclearRate > 0.45)
    throw new LowConfidenceError(`This doesn't look like a clearly filled answer sheet (${Math.trunc(ambRate * 100)}% ambiguous, ${Math.trunc(unclearRate * 100)}% unclear). Retake the photo with the sheet flat, well-lit, and fully in frame.`);
}

function darknessMap(img) { // 255 - luminance, as Float32
  const { data, width, height } = img, out = new Float32Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) out[i] = 255 - (data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114);
  return out;
}
function coverage(dark, w, h, cx, cy, radius, ink) {
  let darkCount = 0, total = 0;
  const left = Math.max(cx - radius, 0), right = Math.min(cx + radius, w - 1), top = Math.max(cy - radius, 0), bottom = Math.min(cy + radius, h - 1), r2 = radius * radius;
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    const dx = x - cx, dy = y - cy; if (dx * dx + dy * dy > r2) continue;
    total++; if (dark[y * w + x] >= ink) darkCount++;
  }
  return total === 0 ? 0 : darkCount / total;
}
function avgDarkness(dark, w, h, cx, cy, radius) {
  let sum = 0, n = 0;
  const left = Math.max(cx - radius, 0), right = Math.min(cx + radius, w - 1), top = Math.max(cy - radius, 0), bottom = Math.min(cy + radius, h - 1), r2 = radius * radius;
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    const dx = x - cx, dy = y - cy; if (dx * dx + dy * dy > r2) continue; sum += dark[y * w + x]; n++;
  }
  return n === 0 ? 0 : sum / n;
}

export function gradeSheetImage(img, template, bubbleToCellRatio = C.BUBBLE_TO_CELL_RATIO) {
  const { width: W, height: H } = img, dark = darknessMap(img);
  const sampleRadius = Math.max(Math.trunc(W * G.SAMPLE_RADIUS_FRACTION), 3);
  const rowHeightPx = template.rowHeightFraction * H, spacingPx = template.minChoiceSpacingFraction() * W;
  const bubbleRadius = Math.trunc(Math.max(Math.min(rowHeightPx, spacingPx) * bubbleToCellRatio, sampleRadius));
  const n = template.questionCount, k = template.choiceCount;
  const centers = Array.from({ length: n }, (_, qi) => Array.from({ length: k }, (_, ci) => { const [fx, fy] = template.bubbleCenter(qi + 1, ci); return [Math.trunc(fx * W), Math.trunc(fy * H)]; }));

  const pointScores = centers.map((row) => row.map(([cx, cy]) => avgDarkness(dark, W, H, cx, cy, sampleRadius)));
  const otsu = otsuCompute(pointScores.flat());
  const raw = otsu ? otsu.threshold : null;
  const tier = !otsu ? "N/A" : otsu.separability >= 0.5 ? "HIGH" : otsu.separability >= 0.25 ? "LOW" : "VERY_LOW";
  let adaptive = null;
  if (tier === "HIGH") { const t = Math.min(Math.max((otsu.separability - 0.5) / 0.5, 0), 1), wRaw = 0.55 + t * 0.35; adaptive = raw * wRaw + G.HARD_INK_THRESHOLD * (1 - wRaw); }
  else if (tier === "LOW") adaptive = raw * 0.30 + G.HARD_INK_THRESHOLD * 0.70;
  else if (tier === "VERY_LOW") adaptive = G.HARD_INK_THRESHOLD;
  const [lo, hi] = tier === "HIGH" ? [12, 220] : [40, 220];
  const plausible = adaptive !== null && adaptive >= lo && adaptive <= hi;
  const ink = plausible ? adaptive : G.FILLED_THRESHOLD;

  const centerRadius = Math.max(Math.trunc(bubbleRadius * G.CENTER_RADIUS_FRACTION), 2);
  const cov = centers.map((row) => row.map(([cx, cy]) => coverage(dark, W, H, cx, cy, bubbleRadius, ink)));
  const hard = centers.map((row) => row.map(([cx, cy]) => coverage(dark, W, H, cx, cy, bubbleRadius, G.HARD_INK_THRESHOLD)));
  const ctr = centers.map((row) => row.map(([cx, cy]) => coverage(dark, W, H, cx, cy, centerRadius, ink)));

  const results = cov.map((cs, i) => {
    const maxCov = Math.max(...cs), chosen = cs.indexOf(maxCov), sorted = [...cs].sort((a, b) => b - a);
    const secondHigh = sorted.length > 1 && sorted[1] >= G.MIN_SECONDARY_COVERAGE && (maxCov - sorted[1]) <= G.MAX_WINNER_MARGIN;
    const marginal = maxCov < G.MIN_COVERAGE + G.MARGINAL_COVERAGE_BAND, filled = maxCov >= G.MIN_COVERAGE;
    const hardCov = hard[i][chosen], failsHard = filled && hardCov < G.HARD_MIN_COVERAGE, centerCov = ctr[i][chosen];
    const thin = filled && !failsHard && centerCov < G.MIN_CENTER_COVERAGE, notConf = !filled || failsHard;
    const genuineBlank = !filled && maxCov < G.BLANK_FLOOR;
    const ambiguous = (filled && !failsHard && (secondHigh || marginal || thin)) || notConf;
    return { questionNumber: i + 1, chosenIndex: filled && !failsHard ? chosen : null, isAmbiguous: ambiguous, darknessScores: cs.map((c) => c * 255), isGenuineBlank: genuineBlank,
      maxCoverage: maxCov, hardCoverage: hardCov, centerCoverage: centerCov, secondCoverage: sorted[1] ?? 0, secondHighEnough: secondHigh, marginal, thinOrOffCenter: thin, failsHardFloor: failsHard };
  });
  results.diagnostics = { rawAdaptiveThreshold: raw, blendedInkThreshold: ink, usedFallbackThreshold: !plausible, bubbleRadiusPx: bubbleRadius, otsuSeparability: otsu ? otsu.separability : null, confidenceTier: tier };
  return results;
}
