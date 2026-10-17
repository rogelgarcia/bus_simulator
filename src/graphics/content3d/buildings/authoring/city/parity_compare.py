# parity_compare.py -- a [A | B | difference] composite and the channel differences of two renders (AI 651).
#
#   python parity_compare.py <a.png> <b.png> <out.png> [label_a] [label_b] [gain=8]
#
# Prints PARITY_DIFF <name> mean=<mean abs diff, 8-bit levels, over all channels> max=<max> p99=<99th percentile>
# share>8=<% of pixels any channel differs by more than 8 levels>. The difference panel is |a - b| x gain (default 8).
import sys

import numpy as np
from PIL import Image, ImageDraw


def main(argv):
    pos = [a for a in argv if "=" not in a]
    kw = dict(a.split("=", 1) for a in argv if "=" in a)
    a_p, b_p, out = pos[:3]
    la = pos[3] if len(pos) > 3 else "legacy"
    lb = pos[4] if len(pos) > 4 else "composition"
    gain = float(kw.get("gain", 8))
    a = np.asarray(Image.open(a_p).convert("RGB")).astype(np.int16)
    b = np.asarray(Image.open(b_p).convert("RGB")).astype(np.int16)
    assert a.shape == b.shape, f"sizes differ: {a.shape} {b.shape}"
    d = np.abs(a - b)
    mean, mx, p99 = float(d.mean()), int(d.max()), float(np.percentile(d, 99))
    share = 100.0 * float((d.max(axis=2) > 8).mean())
    h, w, _ = a.shape
    dv = np.clip(d * gain, 0, 255).astype(np.uint8)
    sheet = Image.new("RGB", (w * 3, h + 40), (20, 20, 20))
    for k, img in enumerate((a.astype(np.uint8), b.astype(np.uint8), dv)):
        sheet.paste(Image.fromarray(img), (w * k, 40))
    dr = ImageDraw.Draw(sheet)
    for k, t in enumerate((la, lb, f"|difference| x{gain:g}  mean {mean:.2f}  max {mx}  >8: {share:.2f}%")):
        dr.text((w * k + 10, 12), t, fill=(240, 240, 240))
    sheet.save(out)
    print(f"PARITY_DIFF {out} mean={mean:.3f} max={mx} p99={p99:.1f} share>8={share:.3f}%")


if __name__ == "__main__":
    main(sys.argv[1:])
