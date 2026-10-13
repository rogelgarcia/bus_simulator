# compose_sheets.py -- reference copies and comparison sheets for the Terra & Mar baseline (AI 614).
#
#   python compose_sheets.py          (the system Python with Pillow; not Blender)
#
# 1. Copies every reference image used, unaltered (byte copy, SHA-256 checked), into
#    tests/artifacts/screens/buildings/terramar_recessed/references/.
# 2. Writes one sheet per reference view, [reference | game capture | Blender baseline], and one sheet of the other
#    rig views, [game | Blender] per row, into tests/artifacts/screens/buildings/terramar_recessed/blender_export/sheets/.
# The game frames come from tests/headless/visual/specs/terramar_recessed_blender_export_capture.pwtest.js and the
# Blender frames from render_inspection.py; both use the cameras of rig_cameras.json.
import hashlib
import os
import shutil
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import tm_common as C  # noqa: E402

REFERENCES = [
    # (copy name, source, sha256 or None)
    ("b8.png", os.path.join(C.ROOT, "downloads", "references_ideas", "b8.png"),
     "EA6A43791C68CA199D43869833B8A7BC16AF7927FEC7010AD5147A47095D160B"),
    ("aerial-unannotated.png", os.path.join(os.path.expanduser("~"), "Downloads", "ChatGPT Image Aug 30, 2026, 10_03_58 PM.png"),
     "B2BEF9D4BF9168FB2BA074541CD1CB92D35C411DA83B9943F9EE8CB7F3CD4989"),
    ("annotated-pillars-balconies.png", os.path.join(C.ROOT, "tests", "artifacts", "screens", "buildings", "terramar", "references", "annotated-pillars-balconies.png"),
     "E699F23CD3F21D518D29FC1372C8DD028BEADF34F12789B74E5A3484EFEBBD6D"),
    ("annotated-faces-penthouse.png", os.path.join(C.ROOT, "tests", "artifacts", "screens", "buildings", "terramar", "references", "annotated-faces-penthouse.png"),
     "FD4DC1B80F49B26F8351DDE022D860CFBD63AD87ED73EC43CF95098B1F8B848F"),
    ("annotated-curved-face-option.png", os.path.join(C.ROOT, "tests", "artifacts", "screens", "buildings", "terramar", "references", "annotated-curved-face-option.png"),
     "A9E7C221BF320A434F75C8BA1B16D841A2743954C7C21E564B1A59110D51688F"),
]
LABEL_H = 56
GAP = 12


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest().upper()


def copy_references():
    os.makedirs(C.REFERENCES, exist_ok=True)
    out = {}
    for name, src, expected in REFERENCES:
        if not os.path.exists(src):
            print(f"MISSING reference {src}")
            continue
        digest = sha256(src)
        if expected and digest != expected:
            raise SystemExit(f"reference changed: {src} sha256 {digest} != {expected}")
        dst = os.path.join(C.REFERENCES, name)
        shutil.copy2(src, dst)
        assert sha256(dst) == digest
        out[name] = dst
        print(f"reference {name} <- {src}")
    return out


def font(size):
    for f in ("C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/arial.ttf"):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def labelled(img, text, height):
    img = img.convert("RGB")
    w = round(img.width * height / img.height)
    img = img.resize((w, height), Image.LANCZOS)
    tile = Image.new("RGB", (w, height + LABEL_H), (24, 24, 24))
    tile.paste(img, (0, LABEL_H))
    ImageDraw.Draw(tile).text((16, 12), text, fill=(240, 240, 240), font=font(28))
    return tile


def row(tiles):
    w = sum(t.width for t in tiles) + GAP * (len(tiles) - 1)
    h = max(t.height for t in tiles)
    out = Image.new("RGB", (w, h), (255, 255, 255))
    x = 0
    for t in tiles:
        out.paste(t, (x, 0))
        x += t.width + GAP
    return out


def column(rows):
    w = max(r.width for r in rows)
    h = sum(r.height for r in rows) + GAP * (len(rows) - 1)
    out = Image.new("RGB", (w, h), (255, 255, 255))
    y = 0
    for r in rows:
        out.paste(r, (0, y))
        y += r.height + GAP
    return out


def main():
    refs = copy_references()
    rig = C.load_rig()
    os.makedirs(C.SCREENS_SHEETS, exist_ok=True)
    others = []
    for cam in rig["cameras"]:
        game = os.path.join(C.SCREENS_GAME, f"{cam['name']}.png")
        blend = os.path.join(C.SCREENS_BLENDER, f"{cam['name']}.png")
        if not (os.path.exists(game) and os.path.exists(blend)):
            print(f"skip {cam['name']}: missing {'game' if not os.path.exists(game) else 'blender'} frame")
            continue
        if cam.get("reference") and cam["reference"] in refs:
            h = cam["resolution"][1]
            sheet = row([labelled(Image.open(refs[cam["reference"]]), f"REFERENCE  {cam['reference']}", h),
                         labelled(Image.open(game), "GAME  terramar_recessed (current build)", h),
                         labelled(Image.open(blend), "BLENDER  terramar_recessed_before.blend", h)])
            path = os.path.join(C.SCREENS_SHEETS, f"sheet_{cam['name']}.png")
            sheet.save(path)
            print(f"sheet {path} {sheet.size}")
        else:
            others.append(row([labelled(Image.open(game), f"GAME  {cam['label']}", 720),
                               labelled(Image.open(blend), f"BLENDER  {cam['label']}", 720)]))
    if others:
        sheet = column(others)
        path = os.path.join(C.SCREENS_SHEETS, "sheet_views_game_vs_blender.png")
        sheet.save(path)
        print(f"sheet {path} {sheet.size}")


if __name__ == "__main__":
    main()
