"""Builds synthetic 'phone photos' of a filled-in, cut-out sheet tile from the PDFs the web port generated, with known answers.
Usage: python3 test/synth.py <id> <seed> <difficulty 0..2>  -> test/out/<id>_<seed>.ppm + .truth.json"""
import sys, json, subprocess, random, math, os
import numpy as np, cv2
cid, seed, diff = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
rng = random.Random(seed); np.random.seed(seed)
base = f"test/out/{cid}"
meta = json.load(open(base + ".json")); t = meta["template"]; geo = meta["geometry"][0]  # top-left tile
DPI = 220; S = DPI / 72
if not os.path.exists(base + "-1.png"):
    subprocess.run(["pdftoppm", "-r", str(DPI), "-png", base + ".pdf", base], check=True)
    for cand in (base + "-1.png", base + "-01.png"):
        if os.path.exists(cand) and cand != base + "-1.png": os.rename(cand, base + "-1.png")
page = cv2.imread(base + "-1.png", cv2.IMREAD_COLOR)
tile = geo["tile"]; x0, y0, tw, th = [int(round(v * S)) for v in (tile["x"], tile["y"], tile["w"], tile["h"])]
sheet = page[y0:y0 + th, x0:x0 + tw].copy()
# fill bubbles
n, k = t["questionCount"], t["choiceCount"]; truth = []; R = geo["bubbleRadius"] * S
centers = {(b["q"], b["ci"]): b["xy"] for b in geo["bubbles"]}
for q in range(1, n + 1):
    r = rng.random()
    if r < 0.08: truth.append(None); continue                      # left blank
    choice = rng.randrange(k); truth.append(choice)
    cx, cy = centers[(q, choice)]; cx = (cx - tile["x"]) * S; cy = (cy - tile["y"]) * S
    jit = (rng.uniform(-0.12, 0.12) * R, rng.uniform(-0.12, 0.12) * R)
    shade = rng.randint(30, 85)                                       # pencil/pen darkness
    cv2.circle(sheet, (int(cx + jit[0]), int(cy + jit[1])), int(R * rng.uniform(0.78, 1.0)), (shade,) * 3, -1, cv2.LINE_AA)
# photo: put the cut-out sheet on a table with perspective / rotation / lighting / noise
W, H = 1200, 1500
ang = math.radians(rng.uniform(-4, 4) * (1 + diff)); scale = 0.90 - 0.02 * diff
sh = np.float32([[0, 0], [tw, 0], [0, th], [tw, th]])
c = np.array([W / 2, H / 2]); fit = min(W * scale / tw, H * scale / th)
dst = []
for (px, py) in sh:
    v = np.array([px - tw / 2, py - th / 2]) * fit
    v = np.array([v[0] * math.cos(ang) - v[1] * math.sin(ang), v[0] * math.sin(ang) + v[1] * math.cos(ang)])
    v += c + np.array([rng.uniform(-1, 1), rng.uniform(-1, 1)]) * (6 + 14 * diff)   # perspective jitter
    dst.append(v)
M = cv2.getPerspectiveTransform(sh, np.float32(dst))
bg = np.full((H, W, 3), 95, np.uint8); bg = (bg + np.random.randn(H, W, 1) * 6).clip(0, 255).astype(np.uint8)
photo = cv2.warpPerspective(sheet, M, (W, H), bg, borderMode=cv2.BORDER_TRANSPARENT)
mask = cv2.warpPerspective(np.full(sheet.shape[:2], 255, np.uint8), M, (W, H))
photo = np.where(mask[..., None] > 0, cv2.warpPerspective(sheet, M, (W, H), flags=cv2.INTER_LINEAR), bg)
photo = cv2.GaussianBlur(photo, (0, 0), 0.7 + 0.5 * diff).astype(np.float32)
yy, xx = np.mgrid[0:H, 0:W]; grad = 1.0 - (0.10 + 0.08 * diff) * ((xx / W) * rng.uniform(-1, 1) + (yy / H) * rng.uniform(-1, 1))
photo = photo * grad[..., None] * rng.uniform(0.88, 1.05) + np.random.randn(H, W, 3) * (2 + 2 * diff)
photo = photo.clip(0, 255).astype(np.uint8)
out = f"test/out/{cid}_{seed}"
cv2.imwrite(out + ".jpg", photo, [cv2.IMWRITE_JPEG_QUALITY, 88])
rgb = cv2.cvtColor(photo, cv2.COLOR_BGR2RGB)
with open(out + ".ppm", "wb") as f: f.write(b"P6\n%d %d\n255\n" % (W, H)); f.write(rgb.tobytes())
json.dump({"template": t, "truth": truth}, open(out + ".truth.json", "w"))
print(out)
