/* Port of SheetTemplate.kt (MCQ Quick Check v1.2.4). All geometry is fractions (0..1) of ONE sheet region so the printed
 * PDF and the scanner share exactly the same positions. Kotlin Float -> JS double (differences are ~1e-7, below pixel scale). */
export const NumberingOrder = { COLUMN_MAJOR: "COLUMN_MAJOR", ROW_MAJOR: "ROW_MAJOR" };

export const C = {
  PAGE_WIDTH: 612, PAGE_HEIGHT: 792,
  QUARTER_TILE_INSET: 0.28 * 72,
  MARKER_MARGIN_X: 0.03, MARKER_MARGIN_Y: 0.03, MARKER_SIZE: 0.028,
  TABLE_TOP: 0.045, TABLE_ROW1_BOTTOM: 0.085, TABLE_ROW2_BOTTOM: 0.125, TABLE_SCORE_BOTTOM: 0.160, TABLE_MID_X_FRACTION: 0.66,
  TABLE_ROW3_BOTTOM: 0.172, ID_MIN_DIGITS: 4, ID_MAX_DIGITS: 12, ID_DEFAULT_DIGITS: 6, ID_MERGED_MAX_DIGITS: 8,
  ID_LABEL_ZONE_FRACTION: 0.095, ID_RIGHT_PAD_FRACTION: 0.012, ID_BOX_WIDTH_RATIO: 0.84, ID_MAX_PITCH: 0.082, ID_MAX_BOX_WIDTH: 0.064,
  ID_BOX_VERTICAL_PAD: 0.0045, ID_SAFE_INSET_X: 0.14, ID_SAFE_INSET_Y: 0.12, ID_SAFE_GRAY: 0xE4,
  TITLE_Y: 0.205, GRID_TOP: 0.25, GRID_BOTTOM: 0.97, GRID_LEFT: 0.04, GRID_RIGHT: 0.96,
  BUBBLE_RADIUS_FRACTION: 0.016, BUBBLE_TO_CELL_RATIO: 0.40, MM_PER_POINT: 0.3528, IDEAL_ROW_HEIGHT_FRACTION: 0.050,
  ROW_GROUP_GAP: 0.045, MAX_ROWS_PER_BLOCK: 25,
  BUBBLE_MM_MIN: 1.72, BUBBLE_MM_MAX: 2.68, BUBBLE_MM_DEFAULT: 2.2,
};
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

export const clampIdDigits = (n) => clamp(n, C.ID_MIN_DIGITS, C.ID_MAX_DIGITS);
export const idRowIsMerged = (digits) => digits >= 1 && digits <= C.ID_MERGED_MAX_DIGITS;

export function idBoxRect(index, digits) {
  const tableWidth = C.GRID_RIGHT - C.GRID_LEFT;
  const zoneRightEdge = idRowIsMerged(digits) ? C.GRID_LEFT + tableWidth * C.TABLE_MID_X_FRACTION : C.GRID_RIGHT;
  const zoneWidth = zoneRightEdge - C.GRID_LEFT;
  const zoneLeft = C.GRID_LEFT + zoneWidth * C.ID_LABEL_ZONE_FRACTION;
  const zoneRight = zoneRightEdge - zoneWidth * C.ID_RIGHT_PAD_FRACTION;
  const pitch = Math.min((zoneRight - zoneLeft) / digits, C.ID_MAX_PITCH);
  const boxWidth = Math.min(pitch * C.ID_BOX_WIDTH_RATIO, C.ID_MAX_BOX_WIDTH);
  const left = zoneLeft + pitch * index + (pitch - boxWidth) / 2;
  return { left, top: C.TABLE_ROW2_BOTTOM + C.ID_BOX_VERTICAL_PAD, right: left + boxWidth, bottom: C.TABLE_ROW3_BOTTOM - C.ID_BOX_VERTICAL_PAD };
}
export function idSafeZone(index, digits) {
  const b = idBoxRect(index, digits);
  const dx = (b.right - b.left) * C.ID_SAFE_INSET_X, dy = (b.bottom - b.top) * C.ID_SAFE_INSET_Y;
  return { left: b.left + dx, top: b.top + dy, right: b.right - dx, bottom: b.bottom - dy };
}

export const markerFractions = () => {
  const l = C.MARKER_MARGIN_X, r = 1 - C.MARKER_MARGIN_X, t = C.TITLE_Y, b = 1 - C.MARKER_MARGIN_Y;
  return [[l, t], [r, t], [l, b], [r, b]]; // TL, TR, BL, BR
};
export const sheetAspectRatio = () => (C.PAGE_WIDTH / 2) / (C.PAGE_HEIGHT / 2);
export const minQuestionCount = () => 10;
export const maxQuestionCount = () => 100;

/** [low, high] inclusive */
export function rowsPerBlockRange(questionCount, columnCount = 1) {
  const n = Math.max(questionCount, 1);
  if (n <= 10) return [n, n];
  const cols = Math.max(columnCount, 1);
  const perColumnRaw = n / cols;
  const suggestedMax = Math.ceil(perColumnRaw / 10) * 10;
  const smallestFittingMultipleOf5 = Math.ceil(perColumnRaw / 5) * 5;
  const low = Math.max(Math.min(smallestFittingMultipleOf5, suggestedMax), 5);
  return [low, Math.max(suggestedMax, low)];
}
export function maxBlocksPerRowGroupRange(questionCount) {
  const n = Math.max(questionCount, 1);
  if (n <= 25) return [1, 1];
  if (n <= 50) return [2, 2];
  if (n <= 75) return [3, 3];
  return [4, 4];
}
/** GenerateSheetActivity.suggestColumnsAndRows */
export function suggestColumnsAndRows(questionCount) {
  const n = Math.max(questionCount, 1);
  if (n <= 10) return { columns: 1, rows: n };
  const maxColumns = maxBlocksPerRowGroupRange(n)[1];
  let best = { columns: 1, rows: rowsPerBlockRange(n, 1)[0] }, bestScore = Infinity;
  for (let c = 1; c <= maxColumns; c++) {
    const rows = rowsPerBlockRange(n, c)[0], score = Math.abs(rows - c);
    if (score < bestScore) { bestScore = score; best = { columns: c, rows }; }
  }
  return best;
}

export class SheetTemplate {
  constructor({ testName = "Untitled Test", questionCount, choiceCount = 4, numbering = NumberingOrder.COLUMN_MAJOR,
                rowsPerBlock = 10, maxBlocksPerRowGroup = 3, bubbleSizeMm = C.BUBBLE_MM_DEFAULT, idDigits = 0 }) {
    Object.assign(this, { testName, questionCount, choiceCount, numbering, rowsPerBlock, maxBlocksPerRowGroup, bubbleSizeMm, idDigits });
    this._slots = null;
  }
  get choiceLetters() { return Array.from({ length: this.choiceCount }, (_, i) => String.fromCharCode(65 + i)); }
  get blockCount() { return Math.ceil(this.questionCount / this.rowsPerBlock); }
  get rowGroupCount() { return Math.ceil(this.blockCount / this.maxBlocksPerRowGroup); }
  blocksInRowGroup(rg) { return clamp(this.blockCount - rg * this.maxBlocksPerRowGroup, 0, this.maxBlocksPerRowGroup); }
  rowsInBlock(gb) { return clamp(this.questionCount - gb * this.rowsPerBlock, 0, this.rowsPerBlock); }

  get _availableHeight() { return C.GRID_BOTTOM - C.GRID_TOP; }
  get _idealRowHeightFraction() { return this._availableHeight / C.MAX_ROWS_PER_BLOCK; }
  get _idealGroupHeight() { return this.rowsPerBlock * this._idealRowHeightFraction; }
  get _idealTotalContentHeight() { return this.rowGroupCount * this._idealGroupHeight + Math.max(this.rowGroupCount - 1, 0) * C.ROW_GROUP_GAP; }
  get _idealBubbleDiameterFraction() { return 2 * (this.bubbleSizeMm / C.MM_PER_POINT) / C.PAGE_WIDTH; }
  get _idealMaxRowGroupWidth() {
    let widest = 1; for (let i = 0; i < this.rowGroupCount; i++) widest = Math.max(widest, this.blocksInRowGroup(i));
    const d = this._idealBubbleDiameterFraction, pitch = d * 2, blockW = d + this.choiceCount * pitch, gap = widest > 1 ? d : 0;
    return blockW * widest + gap * (widest - 1);
  }
  get contentScale() {
    const total = this._idealTotalContentHeight;
    const hs = (total <= this._availableHeight || total <= 0) ? 1 : this._availableHeight / total;
    const w = this._idealMaxRowGroupWidth, aw = C.GRID_RIGHT - C.GRID_LEFT;
    const ws = (w <= aw || w <= 0) ? 1 : aw / w;
    return Math.min(hs, ws);
  }
  get _actualGroupHeight() { return this._idealGroupHeight * this.contentScale; }
  get _actualGroupGap() { return C.ROW_GROUP_GAP * this.contentScale; }
  get bubbleDiameterFraction() { return this._idealBubbleDiameterFraction * this.contentScale; }
  get _choicePitch() { return this.bubbleDiameterFraction * 2; }
  get _blockContentWidth() { return this.bubbleDiameterFraction + this.choiceCount * this._choicePitch; }
  get _contentTopOffset() {
    const total = this.rowGroupCount * this._actualGroupHeight + Math.max(this.rowGroupCount - 1, 0) * this._actualGroupGap;
    return C.GRID_TOP + Math.max(this._availableHeight - total, 0) / 2;
  }
  get rowHeightFraction() { return this._actualGroupHeight / this.rowsPerBlock; }
  minChoiceSpacingFraction() { return this._choicePitch; }

  _buildSlots() {
    const out = []; let q = 1;
    if (this.numbering === NumberingOrder.COLUMN_MAJOR) {
      outer: for (let rg = 0; rg < this.rowGroupCount; rg++)
        for (let b = 0; b < this.blocksInRowGroup(rg); b++) {
          const gb = rg * this.maxBlocksPerRowGroup + b;
          for (let r = 0; r < this.rowsInBlock(gb); r++) { if (q > this.questionCount) break outer; out.push({ q, rg, b, r }); q++; }
        }
    } else {
      outer: for (let rg = 0; rg < this.rowGroupCount; rg++) {
        const here = this.blocksInRowGroup(rg); let maxRows = 0;
        for (let i = 0; i < here; i++) maxRows = Math.max(maxRows, this.rowsInBlock(rg * this.maxBlocksPerRowGroup + i));
        for (let r = 0; r < maxRows; r++) for (let b = 0; b < here; b++) {
          const gb = rg * this.maxBlocksPerRowGroup + b;
          if (r >= this.rowsInBlock(gb)) continue;
          if (q > this.questionCount) break outer;
          out.push({ q, rg, b, r }); q++;
        }
      }
    }
    return out;
  }
  _slotFor(q) { this._slots ||= this._buildSlots(); const s = this._slots[q - 1]; if (!s) throw new Error(`No layout slot for question ${q}`); return s; }

  markerCenters() { return markerFractions(); }
  rowGroupBounds(rg) { const top = this._contentTopOffset + rg * (this._actualGroupHeight + this._actualGroupGap); return [top, top + this._actualGroupHeight]; }
  blockBounds(rg, b) {
    const here = this.blocksInRowGroup(rg), gap = here > 1 ? this.bubbleDiameterFraction : 0, bw = this._blockContentWidth;
    const total = bw * here + gap * (here - 1), leftover = Math.max((C.GRID_RIGHT - C.GRID_LEFT) - total, 0);
    return [C.GRID_LEFT + leftover / 2 + b * (bw + gap), bw];
  }
  bubbleCenter(q, choiceIndex) {
    const s = this._slotFor(q), [gt] = this.rowGroupBounds(s.rg), [bl] = this.blockBounds(s.rg, s.b), rh = this.rowHeightFraction;
    return [bl + this.bubbleDiameterFraction + choiceIndex * this._choicePitch + this._choicePitch / 2, gt + s.r * rh + rh / 2];
  }
  questionLabelCenter(q) {
    const s = this._slotFor(q), [gt] = this.rowGroupBounds(s.rg), [bl] = this.blockBounds(s.rg, s.b), rh = this.rowHeightFraction;
    return [bl + this.bubbleDiameterFraction / 2, gt + s.r * rh + rh / 2];
  }
  choiceHeaderCenterX(rg, b, choiceIndex) {
    const [bl] = this.blockBounds(rg, b);
    return bl + this.bubbleDiameterFraction + choiceIndex * this._choicePitch + this._choicePitch / 2;
  }
  toJSON() { const { testName, questionCount, choiceCount, numbering, rowsPerBlock, maxBlocksPerRowGroup, bubbleSizeMm, idDigits } = this; return { testName, questionCount, choiceCount, numbering, rowsPerBlock, maxBlocksPerRowGroup, bubbleSizeMm, idDigits }; }
  static fromJSON(o) { return new SheetTemplate(o); }
}
