// Generates printable sheets (via the web port's PDF generator) plus the exact geometry the scanner should find.
import fs from "node:fs";
import { SheetTemplate, suggestColumnsAndRows } from "../src/core/template.js";
import { buildSheetPdf, bubbleCentersOnPage } from "../src/core/sheetPdf.js";

const cases = [
  { id: "q50x4", testName: "Quiz 50", questionCount: 50, choiceCount: 4 },
  { id: "q30x5", testName: "Quiz 30", questionCount: 30, choiceCount: 5 },
  { id: "q100x4", testName: "Final 100", questionCount: 100, choiceCount: 4 },
  { id: "q20x4id", testName: "Short ID", questionCount: 20, choiceCount: 4, idDigits: 6 },
  { id: "q10x4", testName: "Ten", questionCount: 10, choiceCount: 4 },
];
for (const c of cases) {
  const { columns, rows } = suggestColumnsAndRows(c.questionCount);
  const t = new SheetTemplate({ ...c, rowsPerBlock: rows, maxBlocksPerRowGroup: columns });
  fs.writeFileSync(`test/out/${c.id}.pdf`, await buildSheetPdf(t));
  fs.writeFileSync(`test/out/${c.id}.json`, JSON.stringify({ template: t.toJSON(), geometry: bubbleCentersOnPage(t) }));
  console.log(c.id, "columns", columns, "rows", rows, "contentScale", t.contentScale.toFixed(3));
}
