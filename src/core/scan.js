import { rgbaToGray } from "./imaging.js";
import { detectMarkers, warpToTemplate } from "./markers.js";
import { gradeSheetImage, requireConfident } from "./grader.js";
import { gradeSheet } from "./answers.js";

/** Full pipeline: photo (RGBA) -> markers -> perspective warp -> bubble grading -> score. Throws MarkersNotFoundError / LowConfidenceError. */
export function scanSheet(rgba, template, key, { requireConfidence = true } = {}) {
  const corners = detectMarkers(rgbaToGray(rgba));
  const warped = warpToTemplate(rgba, corners, template);
  const results = gradeSheetImage(warped, template);
  if (requireConfidence) requireConfident(results);
  const summary = key && key.length ? gradeSheet(key, results) : null;
  return { corners, warped, results, summary, diagnostics: results.diagnostics };
}
