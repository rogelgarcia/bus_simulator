# weather_report.py -- weather_check.py's numbers and composites (AI 651): for every state, the pixels changed by more
# than THRESH levels against the base, split by what the pixel's camera ray hits (labels.json), and a
# [base | state | |difference| x8] composite (parity_compare.py).
#
#   python weather_report.py <dir> <hero>
import sys
from pathlib import Path
_SCRIPTS = next(p for p in Path(__file__).resolve().parents if (p / "common" / "paths.py").is_file())
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from common import paths as BP
BP.add_import_paths(__file__)
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import parity_compare  # noqa: E402

THRESH = 3
out, hero = sys.argv[1], sys.argv[2]
labels = np.array(json.load(open(os.path.join(out, "labels.json"))), dtype=np.int8)
base = np.asarray(Image.open(os.path.join(out, "base.png")).convert("RGB")).astype(np.int16)
H, W, _ = base.shape
lab = np.kron(labels, np.ones((H // labels.shape[0], W // labels.shape[1]), dtype=np.int8))
lab = np.pad(lab, ((0, H - lab.shape[0]), (0, W - lab.shape[1])), mode="edge")
names = {0: "city", 1: "hero", 2: "neighbour", 3: "sky"}
rows = []
for state in ("base_repeat", f"{hero}_off", f"{hero}_debug", "city_weather0", "other_off"):
    p = os.path.join(out, f"{state}.png")
    if not os.path.isfile(p):
        continue
    img = np.asarray(Image.open(p).convert("RGB")).astype(np.int16)
    ch = np.abs(img - base).max(axis=2) > THRESH
    n = int(ch.sum())
    by = {names[k]: int((ch & (lab == k)).sum()) for k in names}
    on = {names[k]: int((lab == k).sum()) for k in names}
    share = {k: (100.0 * v / n if n else 0.0) for k, v in by.items()}
    rows.append((state, n, by, share))
    parity_compare.main([os.path.join(out, "base.png"), p, os.path.join(out, f"compare_{state}.png"), "base", state])
    print(f"WEATHER {hero:8s} {state:14s} changed>{THRESH}: {n:7d} px ({100.0 * n / (H * W):5.2f}% of the frame) -> "
          + ", ".join(f"{k} {by[k]} ({share[k]:.1f}%; {100.0 * by[k] / max(1, on[k]):.2f}% of its pixels)" for k in ("hero", "neighbour", "city", "sky")))
with open(os.path.join(out, "report.json"), "w") as fh:
    json.dump(rows, fh, indent=1)
