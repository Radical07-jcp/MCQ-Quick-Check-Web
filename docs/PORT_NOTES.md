# Port notes

## Source → web mapping
| Android (Kotlin) | Web (src/) | Fidelity |
|---|---|---|
| SheetTemplate.kt | core/template.js | 1:1 geometry |
| BubbleGrader.kt, OtsuThreshold.kt | core/grader.js, core/otsu.js | 1:1 logic and thresholds |
| AnswerParser.kt | core/answers.js | 1:1 |
| MarkerDetector.kt, MarkerTemplateFactory, PaperSurroundCheck | core/markers.js, core/imaging.js | Same algorithm; template matching reimplemented (see below) |
| PerspectiveWarp.kt | core/markers.js (warpToTemplate), imaging.js | Same transform; bicubic (A = −0.75) like OpenCV, not bit-identical |
| SheetGenerator.kt | core/sheetPdf.js | Same geometry; square table corners, Helvetica font, plain title |
| ResultAnnotator.kt | annotate.js | Simplified colouring |

## Evidence so far
- Marker template matching (the numerically delicate part) was compared with real OpenCV `matchTemplate(TM_CCOEFF_NORMED)` on 12 corner searches: scores agree to 3 decimals (e.g. 0.394, 0.703, 0.678, 0.662 in both).
- 15 synthetic photos (5 sheet layouts × 3 difficulty levels: rotation, perspective, blur, lighting, noise, blank/filled answers): 12 scanned, all 450 answers read correctly; the other 3 (hardest level, ±12° rotation) were rejected by the marker detector with scores ~0.39–0.41 against the app's 0.45 threshold — the same limit the Android app has.
- UI flow verified in headless Chromium (Chromium, not Safari).

## Not verified
- Real photos of real printed sheets, on a real iPad/iPhone camera (focus, glare, paper curl, printer scaling).
- Safari-specific behaviour (PDF opening, camera capture, storage eviction). Install to Home Screen to improve storage durability.

## Subscriptions (not ported)
The Android app talks to its own license API (`license-api.sirjpagdi.workers.dev`: /plans, /sync, /device/link, /device/restore, /payment/submit, /transfer/submit) and identifies a device by a hash of Android ID. A browser has no Android ID, so a web client needs a different device-linking step and the Worker must accept it. Plans/payments (pm.link) are plain web links and can be reused.
