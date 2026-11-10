/* Port of AnswerParser.kt */
export function parseKeyTokens(tokens, choiceCount) {
  const answers = [], unresolved = [];
  tokens.forEach((tok, i) => {
    const t = tok.trim();
    if (t === "?") { unresolved.push(i + 1); return; }
    const idx = t.toUpperCase().charCodeAt(0) - 65;
    if (!(idx >= 0 && idx < choiceCount)) throw new Error(`Invalid answer letter: ${tok}`);
    answers.push(idx);
  });
  return { answers, unresolved };
}
export function parseKey(raw, choiceCount) {
  const tokens = raw.split(/[,\n\s]+/).filter((s) => s.trim() !== "");
  return parseKeyTokens(tokens, choiceCount).answers;
}
/** @returns {correct,total,perQuestion(true|false|null=blank),earnedPoints,totalPoints} */
export function gradeSheet(key, scanned, points = key.map(() => 1)) {
  const perQuestion = scanned.map((r, i) => {
    const expected = key[i]; if (expected === undefined) return null;
    if (r.chosenIndex === null) return null;
    if (r.isAmbiguous) return false;
    return r.chosenIndex === expected;
  });
  const blank = perQuestion.filter((v) => v === null).length, wrong = perQuestion.filter((v) => v === false).length;
  const correct = key.length - blank - wrong;
  const earnedPoints = perQuestion.reduce((s, v, i) => s + (v === true ? (points[i] ?? 1) : 0), 0);
  let totalPoints = points.slice(0, key.length).reduce((a, b) => a + b, 0); if (totalPoints === 0) totalPoints = key.length;
  return { correct, total: key.length, perQuestion, earnedPoints, totalPoints };
}
