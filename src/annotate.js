/* Draws the graded, perspective-corrected sheet with colour-coded marks (simplified ResultAnnotator). */
import { C } from "./core/template.js";
export function annotate(canvas, warped, template, results, key) {
  canvas.width = warped.width; canvas.height = warped.height;
  const ctx = canvas.getContext("2d"); ctx.putImageData(new ImageData(new Uint8ClampedArray(warped.data), warped.width, warped.height), 0, 0);
  const rowPx = template.rowHeightFraction * warped.height, spacingPx = template.minChoiceSpacingFraction() * warped.width, r = Math.max(Math.min(rowPx, spacingPx) * C.BUBBLE_TO_CELL_RATIO, 3);
  const ring = (q, ci, color, w, rad) => { const [fx, fy] = template.bubbleCenter(q, ci); ctx.beginPath(); ctx.arc(fx * warped.width, fy * warped.height, rad, 0, 7); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke(); };
  results.forEach((res, i) => {
    const q = i + 1, exp = key ? key[i] : undefined;
    if (res.chosenIndex === null) { if (exp !== undefined) ring(q, exp, "#2e7dff", 2, r + 2); return; }          // blank: show the correct choice in blue
    if (res.isAmbiguous) { ring(q, res.chosenIndex, "#ff9f0a", 3, r + 2); return; }                             // unclear mark
    if (exp === undefined) { ring(q, res.chosenIndex, "#2e7dff", 3, r + 2); return; }
    if (res.chosenIndex === exp) ring(q, res.chosenIndex, "#1db954", 3, r + 2);
    else { ring(q, res.chosenIndex, "#ff453a", 3, r + 2); ring(q, exp, "#1db954", 2, r + 5); }
  });
}
