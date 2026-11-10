/* Port of SheetGenerator.kt (QUARTER layout: 4 identical sheets per page, each cut apart before use).
 * Geometry comes from template.js, so the scanner reads exactly what is printed. Cosmetic differences from the Android PDF: square table corners,
 * Helvetica instead of the app's bundled font, plain title (no custom "Q" glyph). */
import { PDFDocument, StandardFonts, rgb, grayscale } from "../../vendor/pdf-lib.esm.min.js";
import { C, idBoxRect, idSafeZone, idRowIsMerged } from "./template.js";

export const PAPER = { LETTER: { label: "Letter (8.5\" × 11\")", w: 612, h: 792 }, A4: { label: "A4 (210 × 297 mm)", w: 595, h: 842 }, FOLIO: { label: "Folio (8.5\" × 13\")", w: 612, h: 936 } };
const regions = () => { const w = C.PAGE_WIDTH, h = C.PAGE_HEIGHT; return [[0, 0], [w / 2, 0], [0, h / 2], [w / 2, h / 2]].map(([l, t]) => ({ left: l, top: t, width: w / 2, height: h / 2 })); };
const inset = (r, a) => ({ left: r.left + a, top: r.top + a, width: r.width - 2 * a, height: r.height - 2 * a });

/** @param opts {answerKey?: number[] (indices) to pre-fill bubbles, paper?: 'LETTER'|'A4'|'FOLIO'} */
export async function buildSheetPdf(template, { answerKey = null, paper = "LETTER" } = {}) {
  const P = PAPER[paper] || PAPER.LETTER, doc = await PDFDocument.create(), page = doc.addPage([P.w, P.h]);
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const scale = Math.min(P.w / C.PAGE_WIDTH, P.h / C.PAGE_HEIGHT), black = rgb(0, 0, 0), white = rgb(1, 1, 1);
  const tileW = C.PAGE_WIDTH / 2, tileH = C.PAGE_HEIGHT / 2, halfW = P.w / 2, halfH = P.h / 2;

  for (const region of regions()) {
    const col = region.left < tileW / 2 ? 0 : 1, row = region.top < tileH / 2 ? 0 : 1;
    const offX = col * halfW + (halfW - tileW * scale) / 2 - region.left * scale, offY = row * halfH + (halfH - tileH * scale) / 2 - region.top * scale;
    const cr = inset(region, C.QUARTER_TILE_INSET), rs = Math.min(cr.width / C.PAGE_WIDTH, cr.height / C.PAGE_HEIGHT);
    const X = (fx) => offX + (cr.left + fx * cr.width) * scale, Y = (fy) => P.h - (offY + (cr.top + fy * cr.height) * scale); // pdf coords (origin bottom-left)
    const S = (len) => len * scale; // reference-space length -> points
    const line = (x1, y1, x2, y2, t) => page.drawLine({ start: { x: X(x1), y: Y(y1) }, end: { x: X(x2), y: Y(y2) }, thickness: S(t), color: black });
    const rect = (fl, ft, fr, fb, o) => page.drawRectangle({ x: X(fl), y: Y(fb), width: X(fr) - X(fl), height: Y(ft) - Y(fb), ...o });
    const text = (s, fx, fy, size, f, anchor = "left", dy = 0) => { const sz = S(size), w = f.widthOfTextAtSize(s, sz); const x = anchor === "center" ? X(fx) - w / 2 : X(fx); page.drawText(s, { x, y: Y(fy) - S(dy), size: sz, font: f, color: black }); };
    const textAbs = (s, cxRef, baseRefPx, size, f, anchor) => { const sz = S(size), w = f.widthOfTextAtSize(s, sz); page.drawText(s, { x: anchor === "center" ? cxRef - w / 2 : cxRef, y: baseRefPx, size: sz, font: f, color: black }); };

    // --- header table ---
    const midX = C.GRID_LEFT + (C.GRID_RIGHT - C.GRID_LEFT) * C.TABLE_MID_X_FRACTION, ids = template.idDigits, merged = idRowIsMerged(ids), bw = 1.1 * rs;
    const bottomF = ids > 0 ? C.TABLE_ROW3_BOTTOM : C.TABLE_ROW2_BOTTOM;
    rect(C.GRID_LEFT, C.TABLE_TOP, C.GRID_RIGHT, bottomF, { borderColor: black, borderWidth: S(bw) });
    line(C.GRID_LEFT, C.TABLE_ROW1_BOTTOM, C.GRID_RIGHT, C.TABLE_ROW1_BOTTOM, bw);
    line(midX, C.TABLE_TOP, midX, C.TABLE_ROW1_BOTTOM, bw);
    if (ids > 0 && merged) { line(midX, C.TABLE_ROW1_BOTTOM, midX, bottomF, bw); line(C.GRID_LEFT, C.TABLE_ROW2_BOTTOM, midX, C.TABLE_ROW2_BOTTOM, bw); }
    else { line(midX, C.TABLE_ROW1_BOTTOM, midX, C.TABLE_ROW2_BOTTOM, bw); if (ids > 0) line(C.GRID_LEFT, C.TABLE_ROW2_BOTTOM, C.GRID_RIGHT, C.TABLE_ROW2_BOTTOM, bw); }
    const cell = (label, fl, ft, fr, fb) => { const mid = (Y(ft) + Y(fb)) / 2 - S(4 * rs) / 1; textAbs(label, X(fl) + S(6 * rs), mid + S(4 * rs) - S(4 * rs) * 1, 11 * rs, font, "left"); };
    const cellText = (label, fl, ft, fb) => page.drawText(label, { x: X(fl) + S(6 * rs), y: (Y(ft) + Y(fb)) / 2 - S(4 * rs), size: S(11 * rs), font, color: black });
    cellText("Name:", C.GRID_LEFT, C.TABLE_TOP, C.TABLE_ROW1_BOTTOM); cellText("Date:", midX, C.TABLE_TOP, C.TABLE_ROW1_BOTTOM);
    cellText("Section:", C.GRID_LEFT, C.TABLE_ROW1_BOTTOM, C.TABLE_ROW2_BOTTOM); cellText("Score:", midX, C.TABLE_ROW1_BOTTOM, C.TABLE_ROW2_BOTTOM);
    if (ids > 0) {
      cellText("ID:", C.GRID_LEFT, C.TABLE_ROW2_BOTTOM, C.TABLE_ROW3_BOTTOM);
      for (let i = 0; i < ids; i++) {
        const z = idSafeZone(i, ids), b = idBoxRect(i, ids), g = C.ID_SAFE_GRAY / 255;
        rect(z.left, z.top, z.right, z.bottom, { color: grayscale(g) });
        rect(b.left, b.top, b.right, b.bottom, { borderColor: black, borderWidth: S(0.9 * rs) });
      }
    }
    // title (centered on TITLE_Y)
    const tsz = S(18 * rs), tw = bold.widthOfTextAtSize(template.testName, tsz); page.drawText(template.testName, { x: X(0.5) - tw / 2, y: Y(C.TITLE_Y), size: tsz, font: bold, color: black });

    // --- corner markers ---
    const msz = C.MARKER_SIZE * cr.width, om = msz * 0.08, ring = msz * 0.30, im = om + ring;
    for (const [fx, fy] of template.markerCenters()) {
      const cx = cr.left + fx * cr.width, cy = cr.top + fy * cr.height, h = msz / 2, px = (v) => offX + v * scale, py = (v) => P.h - (offY + v * scale);
      page.drawRectangle({ x: px(cx - h + om), y: py(cy + h - om), width: S(msz - 2 * om), height: S(msz - 2 * om), color: black });
      if (msz - im * 2 >= 1) page.drawRectangle({ x: px(cx - h + im), y: py(cy + h - im), width: S(msz - 2 * im), height: S(msz - 2 * im), color: white });
    }

    // --- grid ---
    const gs = rs * template.contentScale, rowPx = template.rowHeightFraction * cr.height, spacingPx = template.minChoiceSpacingFraction() * cr.width;
    const bubbleR = Math.max(Math.min(rowPx, spacingPx) * C.BUBBLE_TO_CELL_RATIO, 3);
    for (let rg = 0; rg < template.rowGroupCount; rg++) {
      const [gt] = template.rowGroupBounds(rg), headerY = Y(gt) + S(7 * rs);
      for (let b = 0; b < template.blocksInRowGroup(rg); b++) template.choiceLetters.forEach((letter, i) => { const hx = X(template.choiceHeaderCenterX(rg, b, i)), sz = S(10 * rs), w = bold.widthOfTextAtSize(letter, sz); page.drawText(letter, { x: hx - w / 2, y: headerY, size: sz, font: bold, color: black }); });
    }
    for (let q = 1; q <= template.questionCount; q++) {
      const [lx, ly] = template.questionLabelCenter(q), sz = S(11 * rs), label = `${q}.`, w = bold.widthOfTextAtSize(label, sz);
      page.drawText(label, { x: X(lx) - w / 2, y: Y(ly) - S(4 * rs), size: sz, font: bold, color: black });
      const correct = answerKey ? answerKey[q - 1] : undefined;
      for (let ci = 0; ci < template.choiceCount; ci++) {
        const [bx, by] = template.bubbleCenter(q, ci);
        page.drawCircle({ x: X(bx), y: Y(by), size: S(bubbleR), borderColor: black, borderWidth: S(1.6 * gs) });
        if (correct === ci) page.drawCircle({ x: X(bx), y: Y(by), size: S(bubbleR * 0.95), color: black });
      }
    }
  }
  // cut lines (dashed, light) on the physical page halves
  const cut = { color: grayscale(0.6), thickness: 0.6, dashArray: [4, 3] };
  page.drawLine({ start: { x: halfW, y: 0 }, end: { x: halfW, y: P.h }, ...cut }); page.drawLine({ start: { x: 0, y: halfH }, end: { x: P.w, y: halfH }, ...cut });
  return doc.save();
}

/** Where each bubble centre lands on the physical page, per tile (for tests / overlays). Points, origin top-left. */
export function bubbleCentersOnPage(template, paper = "LETTER") {
  const P = PAPER[paper] || PAPER.LETTER, scale = Math.min(P.w / C.PAGE_WIDTH, P.h / C.PAGE_HEIGHT), tileW = C.PAGE_WIDTH / 2, tileH = C.PAGE_HEIGHT / 2, out = [];
  for (const region of regions()) {
    const col = region.left < tileW / 2 ? 0 : 1, row = region.top < tileH / 2 ? 0 : 1;
    const offX = col * (P.w / 2) + (P.w / 2 - tileW * scale) / 2 - region.left * scale, offY = row * (P.h / 2) + (P.h / 2 - tileH * scale) / 2 - region.top * scale;
    const cr = inset(region, C.QUARTER_TILE_INSET), pt = (fx, fy) => [offX + (cr.left + fx * cr.width) * scale, offY + (cr.top + fy * cr.height) * scale];
    const bubbles = []; for (let q = 1; q <= template.questionCount; q++) for (let ci = 0; ci < template.choiceCount; ci++) bubbles.push({ q, ci, xy: pt(...template.bubbleCenter(q, ci)) });
    const rowPx = template.rowHeightFraction * cr.height, spacingPx = template.minChoiceSpacingFraction() * cr.width;
    out.push({ markers: template.markerCenters().map((m) => pt(...m)), bubbles, bubbleRadius: Math.max(Math.min(rowPx, spacingPx) * C.BUBBLE_TO_CELL_RATIO, 3) * scale, tile: { x: col * (P.w / 2), y: row * (P.h / 2), w: P.w / 2, h: P.h / 2 } });
  }
  return out;
}
