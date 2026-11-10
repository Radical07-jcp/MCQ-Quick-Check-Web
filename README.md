# MCQ Quick Check — Web (iPad / any browser)

A port of the Android app **MCQ Quick Check v1.2.4** to a web app that runs entirely on the device (no server, no upload). Install it from Safari: Share → Add to Home Screen.

## Status (Phase 1)

| Feature | State |
|---|---|
| Create / edit / delete tests (items 10–100, 4 or 5 choices, columns, rows, bubble size, student-ID boxes, answer key) | Working |
| Printable answer-sheet PDF (4 sheets per page, cut lines, corner markers, optional answer-key preview; Letter / A4 / Folio) | Working (cosmetic differences from the app, see docs/PORT_NOTES.md) |
| Camera/photo scan: marker detection → perspective correction → bubble grading → score | Working; verified on synthetic photos, **not yet on real phone photos of real sheets** |
| Review of unclear/blank marks with manual correction | Working (basic) |
| Save scans locally (IndexedDB), list, delete, CSV export | Working (basic) |
| Student ID digit reading (IdReader + digit model) | Not ported yet |
| Classes / rosters / learner results, item analysis, Excel export, backup/restore, themes & accent colors | Not ported yet |
| Subscriptions / licensing | Not ported yet (needs a web way to link a device to a plan; see docs/PORT_NOTES.md) |

## Run locally
`python3 -m http.server 8080` then open http://localhost:8080 (any static host works; no special headers needed).

## Tests
`node test/fixtures.mjs && node test/e2e.mjs` (needs Python with OpenCV + numpy, and `pdftoppm`) builds sheets with this code, makes synthetic photos with known answers, and scans them.
`node test/browser.mjs` drives the real UI in headless Chromium.

## Deploy (Cloudflare Workers static assets)
Connect the repo; `wrangler.jsonc` and `.assetsignore` are included. Because every file is static, GitHub Pages also works.
