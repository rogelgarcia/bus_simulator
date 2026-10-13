# compose_joint_layout.py -- AI 648: the stone joint layout of the rebuild, one elevation per run.
#
#   python -I compose_joint_layout.py [out_dir]          (system Python with Pillow; after build.py's materials pass)
#
# Reads tests/artifacts/blender/terramar_recessed/rebuild/joint_layout.json (layer_materials.py: every original stone
# face with the joint centre lines on it) and the plan's podium runs. Each face goes to the run it faces most (its
# normal against the runs' outward normals) when it lies near that run's outline; it is drawn in the run's elevation
# (s along the run, z up), far faces first, tinted by its face set, with its joints as dark lines. The arcs of the
# rounded corners are unrolled onto the neighbouring run's plane, so they read a little short. Writes
# <out_dir>/joint_layout.png and joint_layout_summary.json (panel and joint counts per run and face set).
import json
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import tm_common as C  # noqa: E402

SCALE = 40                    # px per metre
PAD, LABEL = 40, 70
NEAR = (-2.6, 1.3)            # a face belongs to a run's elevation when its centre lies this far behind / proud of the run line (the entrance stands 1.15 m proud of A)
TINT = {"TM_RB_slab_fascia": (236, 226, 208), "TM_RB_pilaster": (244, 236, 222), "TM_RB_column": (230, 222, 210),
        "TM_RB_podium_stone": (240, 230, 214), "TM_RB_penthouse_stone": (226, 226, 220)}
JOINT = (95, 70, 50)
ROWS = [["A", "B", "C", "D"], ["E", "F", "G", "H"]]


def font(size, bold=False):
    names = ("segoeuib.ttf", "arialbd.ttf") if bold else ("segoeui.ttf", "arial.ttf")
    for n in names:
        p = os.path.join("C:/Windows/Fonts", n)
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(C.REBUILD_SCREENS, "648_materials")
    layout = C.load_json(os.path.join(C.REBUILD_DIR, "joint_layout.json"))
    plan = C.load_json(C.REBUILD_PLAN)
    runs = {r["run"]: r for r in plan["podium"]["runs"]}
    z_top = max(z for z in plan["materials"]["joints"]["datums"]) + 0.6
    per_run = {k: [] for k in runs}
    for ob in layout["objects"]:
        for f in ob["faces"]:
            n = f["n"]
            h = math.hypot(n[0], n[1])
            if h < 0.5:
                continue                                              # soffits and tops: not in an elevation
            best = max(runs.values(), key=lambda r: (n[0] * r["outward"][0] + n[1] * r["outward"][1]) / h)
            if (n[0] * best["outward"][0] + n[1] * best["outward"][1]) / h < 0.38:
                continue
            cx = sum(p[0] for p in f["pts"]) / len(f["pts"])
            cy = sum(p[1] for p in f["pts"]) / len(f["pts"])
            v = (cx - best["p"][0]) * best["outward"][0] + (cy - best["p"][1]) * best["outward"][1]
            if NEAR[0] < v < NEAR[1]:
                per_run[best["run"]].append((v, ob["object"], f))
    panels = []
    summary = {}
    for row in ROWS:
        tiles = []
        for key in row:
            r = runs[key]
            s_lo, s_hi = -2.0, r["length"] + 2.0
            w, h = int((s_hi - s_lo) * SCALE) + 2 * PAD, int((z_top + 0.4) * SCALE) + PAD + LABEL
            im = Image.new("RGB", (w, h), (252, 251, 248))
            d = ImageDraw.Draw(im)
            to = lambda p, r=r, s_lo=s_lo, h=h: (PAD + ((p[0] - r["p"][0]) * r["along"][0] + (p[1] - r["p"][1]) * r["along"][1] - s_lo) * SCALE,  # noqa: E731
                                                 h - PAD - (p[2] + 0.2) * SCALE)
            d.line([to((r["p"][0], r["p"][1], 0.0)), to((r["p"][0] + r["along"][0] * r["length"], r["p"][1] + r["along"][1] * r["length"], 0.0))],
                   fill=(120, 120, 120), width=2)
            counts = {}
            for v, name, f in sorted(per_run[key], key=lambda t: t[0]):
                d.polygon([to(p) for p in f["pts"]], fill=TINT.get(f["slot"], (235, 235, 235)), outline=(150, 140, 125))
                for a, b in f["joints"]:
                    d.line([to(a), to(b)], fill=JOINT, width=2)
                c = counts.setdefault(f["slot"].replace("TM_RB_", ""), {"faces": 0, "joints": 0})
                c["faces"] += 1
                c["joints"] += len(f["joints"])
            d.text((PAD, 12), f"Run {key}  ({r['length']:.2f} m)", fill=(30, 30, 30), font=font(26, True))
            d.text((PAD, 44), "  ".join(f"{k} {v['joints']}" for k, v in sorted(counts.items())) + "  (joint segments)",
                   fill=(90, 90, 90), font=font(15))
            summary[key] = counts
            tiles.append(im)
        width = sum(t.width for t in tiles) + 10 * (len(tiles) - 1)
        strip = Image.new("RGB", (width, max(t.height for t in tiles)), (255, 255, 255))
        x = 0
        for t in tiles:
            strip.paste(t, (x, 0))
            x += t.width + 10
        panels.append(strip)
    jt = plan["materials"]["joints"]
    head = 120
    sheet = Image.new("RGB", (max(p.width for p in panels), sum(p.height for p in panels) + head + 10), (255, 255, 255))
    d = ImageDraw.Draw(sheet)
    d.text((PAD, 14), "Terra & Mar rebuild -- stone joint layout per run (AI 648)", fill=(20, 20, 20), font=font(30, True))
    bands = ", ".join(f"{b['z'][0]:g}-{b['z'][1]:g}: {b['courses']}x{b['course_m']:.3f}" for b in jt["bands"])
    d.text((PAD, 56), f"joint {jt['width'] * 1000:g} mm wide, {jt['depth'] * 1000:g} mm deep, {jt['bevel'] * 1000:g} mm bevels; "
                      f"vertical joints: equal panels <= {jt['panel_max']} m per flat face; courses (z band: n x m):", fill=(60, 60, 60), font=font(17))
    d.text((PAD, 82), bands, fill=(60, 60, 60), font=font(14))
    y = head
    for p in panels:
        sheet.paste(p, (0, y))
        y += p.height + 10
    os.makedirs(out, exist_ok=True)
    sheet.save(os.path.join(out, "joint_layout.png"))
    with open(os.path.join(out, "joint_layout_summary.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump({"joints": layout["joints"], "runs": summary}, fh, indent=2)
    print("JOINT LAYOUT", os.path.join(out, "joint_layout.png"), sheet.size)


if __name__ == "__main__":
    main()
