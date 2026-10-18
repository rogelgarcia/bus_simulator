"""Install the user's Terra & Mar PBR kit as three project PBR sets, with their provenance (AI 640). A Terra & Mar copy
of the Bradbury's make_flowers_pbr.py; nothing of the Bradbury's is touched.

    python -I make_terramar_kit_pbr.py [--zip <Terra_Mar_PBR_Kit.zip>]      (default: the user's Downloads folder)

The kit (supplied by the project owner, 2026-10-12; AI-generated appearance estimates matched to b8.png) holds three
metallic-roughness materials. Each is installed under assets/public/pbr/<slug>/ in the catalog's layout, as BYTE-EXACT
copies of the kit's own files (so every installed map keeps the kit's md5):
    basecolor.png   the kit's basecolor.png (sRGB; RGBA on the sign cards: the cutout mask is its alpha)
    normal_gl.png   the kit's normal_opengl.png (+Y, Blender / three.js)
    arm.png         the kit's orm.png (R ambient occlusion, G roughness, B metallic) -- the project's arm layout
    height.png      the kit's height_16bit.png (16-bit; the range in metres is in material.json)
beside the set's material.json and the kit's README.txt, validation.json and GENERATION_PROMPTS.json, a
pbr.material.config.js like the other sets', and a source.json (kit, zip name and md5, folder, date, md5 per file).
The DirectX normal, the separate AO / roughness / metallic / opacity maps and the preview sheets stay in the archive;
the script re-checks that they agree with what is installed (one canvas, the opacity equal to the base colour alpha,
the ORM equal to the separate maps, a 16-bit height).

Full resolution: the largest map is 4096 x 4096, the project's limit, and PBR packs are outside the asset suite's size
checks, so no reduced copies are made. The sets are NOT registered in assets/public/pbr/_catalog_index.js or
_manifest.json (both shared; another session has uncommitted edits in the index): registering them is a separate step
for when the game needs these materials. The texture images and source.json stay in the gitignored store; only the
pbr.material.config.js files are tracked (plain Git, see tests/node/unit/pbr_config_storage.test.js).
"""
import sys
from pathlib import Path
_SCRIPTS = next(p for p in Path(__file__).resolve().parents if (p / "common" / "paths.py").is_file())
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from common import paths as BP
BP.add_import_paths(__file__)
import argparse
import hashlib
import io
import json
import os
import zipfile

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = BP.ROOT
PBR = BP.assets('public/pbr')
DEFAULT_ZIP = os.path.join(os.path.expanduser("~"), "Downloads", "Terra_Mar_PBR_Kit.zip")
KIT_MD5 = "cc7c7315fd820fa6b1b5b43e602b9f91"
KIT = "Terra_Mar_PBR_Kit/"
IMPORTED_ON = "2026-10-13"
SETS = [
    {"folder": "03_CONTINUOUS_LIMESTONE", "slug": "terramar_continuous_limestone", "label": "Terra & Mar Continuous Limestone",
     "classId": "stone", "buildingEligible": True, "sign": False},
    {"folder": "01_TERRA_AND_MAR", "slug": "terramar_sign_terra_and_mar", "label": "Terra & Mar Sign: TERRA & MAR",
     "classId": "metal", "buildingEligible": False, "sign": True},
    {"folder": "02_COASTAL_KITCHEN", "slug": "terramar_sign_coastal_kitchen", "label": "Terra & Mar Sign: COASTAL KITCHEN",
     "classId": "metal", "buildingEligible": False, "sign": True},
]
INSTALL = {"basecolor.png": "basecolor.png", "normal_opengl.png": "normal_gl.png", "orm.png": "arm.png", "height_16bit.png": "height.png"}
KIT_DOCS = ["README.txt", "validation.json", "GENERATION_PROMPTS.json"]


def md5(data):
    return hashlib.md5(data).hexdigest()


def gray(a):
    return a if a.ndim == 2 else a[..., 0]


def check(folder, read, sign):
    """The kit's promises, re-checked before anything is installed."""
    img = lambda name: np.asarray(Image.open(io.BytesIO(read(name))))  # noqa: E731
    base, orm = img("basecolor.png"), img("orm.png")
    H, W = base.shape[:2]
    for name in ("normal_opengl.png", "orm.png", "ambient_occlusion.png", "roughness.png", "metallic.png"):
        assert img(name).shape[:2] == (H, W), f"{folder}/{name} is not {W}x{H}"
    assert np.array_equal(orm[..., 0], gray(img("ambient_occlusion.png"))), f"{folder}: orm R is not the AO map"
    assert np.array_equal(orm[..., 1], gray(img("roughness.png"))), f"{folder}: orm G is not the roughness map"
    assert np.array_equal(orm[..., 2], gray(img("metallic.png"))), f"{folder}: orm B is not the metallic map"
    height = Image.open(io.BytesIO(read("height_16bit.png")))
    assert height.mode.startswith("I;16") and height.size == (W, H), f"{folder}: the height is {height.mode} {height.size}"
    stats = {"size": [W, H], "mean_roughness": round(float(orm[..., 1].mean()) / 255, 3),
             "mean_metallic": round(float(orm[..., 2].mean()) / 255, 3)}
    if sign:
        assert base.ndim == 3 and base.shape[2] == 4, f"{folder}: a sign card's base colour must carry its alpha"
        assert np.array_equal(gray(img("opacity.png")), base[..., 3]), f"{folder}: opacity.png differs from the base colour alpha"
        ys, xs = np.nonzero(base[..., 3] >= 128)
        stats["glyph_bounds_px"] = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
        stats["glyph_mean_rgb"] = [round(float(v)) for v in base[..., :3][base[..., 3] >= 128].mean(0)]
    else:
        stats["mean_rgb"] = [round(float(v)) for v in base[..., :3].reshape(-1, base.shape[2])[:, :3].mean(0)]
    return stats


def config(s, mat, stats):
    slug = s["slug"]
    ext = mat["uv_extent_m"]
    if s["sign"]:
        notes = (f"A SINGLE SIGN LINE, not a repeat: clamp the edges and cut out on the base colour alpha at 0.5 (alphaTest 0.5, "
                 f"transparent false). Card {stats['size'][0]}x{stats['size'][1]} px, glyphs x {stats['glyph_bounds_px'][0]}.."
                 f"{stats['glyph_bounds_px'][2]}, y {stats['glyph_bounds_px'][1]}..{stats['glyph_bounds_px'][3]}. tileMeters is the kit's "
                 f"suggested card width ({ext['width']} x {ext['height']} m, inferred visually, not surveyed; the Terra & Mar rebuild sizes "
                 f"the letters from b8 instead, authoring/terramar_recessed/rebuild). The normal map holds a shallow face bevel "
                 f"(relief range {mat['textures']['height']['black_to_white_range_m'] * 1000:.1f} mm), not extruded edges: for close "
                 f"views use letter geometry (rebuild/trace_sign.py) with these maps sampled onto it.")
        albedo = (f"Dark patinated metal as delivered, alpha kept (PNG): glyph mean RGB ({stats['glyph_mean_rgb'][0]}, "
                  f"{stats['glyph_mean_rgb'][1]}, {stats['glyph_mean_rgb'][2]}).")
    else:
        notes = (f"Seamless in U and V, {ext['width']} x {ext['height']} m per repeat ({stats['size'][0]} px, 1024 px/m). NO joints, grout or "
                 f"block outlines on purpose: make stone gaps and edge bevels in geometry and give individual blocks different UV regions "
                 f"(or crop all maps by exactly the same rectangle) to hide the repeat. Displacement: start with 1.5 mm total "
                 f"black-to-white and midpoint 0.5 (-0.75 mm bias).")
        albedo = f"Ivory-beige honed limestone as delivered: mean RGB ({stats['mean_rgb'][0]}, {stats['mean_rgb'][1]}, {stats['mean_rgb'][2]})."
    rough = (f"arm.png is the kit's ORM unchanged: R AO (restrained micro-occlusion only), G roughness (mean {stats['mean_roughness']:.2f}), "
             f"B metallic (mean {stats['mean_metallic']:.2f}). Factors stay 1: they multiply the maps.")
    q = lambda t: t.replace("\\", "\\\\").replace("'", "\\'")  # noqa: E731
    return f"""export default Object.freeze({{
    materialId: 'pbr.{slug}',
    label: '{q(s["label"])}',
    classId: '{s["classId"]}',
    root: 'wall',
    buildingEligible: {str(s["buildingEligible"]).lower()},
    groundEligible: false,
    tileMeters: {ext['width']:g},
    mapFiles: Object.freeze({{
        baseColor: 'basecolor.png',
        normal: 'normal_gl.png',
        orm: 'arm.png'
    }}),
    allMapFiles: Object.freeze({{
        baseColor: 'assets/public/pbr/{slug}/basecolor.png',
        normal: 'assets/public/pbr/{slug}/normal_gl.png',
        orm: 'assets/public/pbr/{slug}/arm.png',
        height: 'assets/public/pbr/{slug}/height.png',
        variants: Object.freeze({{}})
    }}),
    provenance: Object.freeze({{
        schema: 'bus-simulator.pbr-material-provenance',
        version: 1,
        source: Object.freeze({{
            asset: '{q(mat["name"])}',
            url: null,
            license: 'unspecified; AI-generated output supplied by the project owner',
            archive: 'Terra_Mar_PBR_Kit.zip (md5 {KIT_MD5}), folder {s["folder"]}'
        }}),
        generation: Object.freeze({{
            tool: 'AI-generated base colour followed by numerically aligned map baking; an appearance estimate, not measured scan data',
            lightingInBaseColor: false,
            prompts: 'assets/public/pbr/{slug}/GENERATION_PROMPTS.json',
            readme: 'assets/public/pbr/{slug}/README.txt',
            validation: 'assets/public/pbr/{slug}/validation.json',
            material: 'assets/public/pbr/{slug}/material.json'
        }}),
        importedOn: '{IMPORTED_ON}'
    }}),
    normalization: Object.freeze({{
        notes: 'Installed by blender/scripts/terramar/building/make_terramar_kit_pbr.py as byte-exact copies of the kit (normal_opengl.png -> normal_gl.png, orm.png -> arm.png, height_16bit.png -> height.png). Normal map OpenGL +Y at strength 1. {q(notes)} Not registered in the game catalog (_catalog_index.js) yet.',
        albedoNotes: '{q(albedo)}',
        roughnessIntent: '{q(rough)}'
    }})
}});
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--zip", default=DEFAULT_ZIP)
    args = ap.parse_args()
    raw = open(args.zip, "rb").read()
    zip_md5 = md5(raw)
    assert zip_md5 == KIT_MD5, f"{args.zip}: md5 {zip_md5}, not the kit's {KIT_MD5}"
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        docs = {name: z.read(KIT + name) for name in KIT_DOCS}
        for s in SETS:
            read = lambda name, s=s: z.read(KIT + s["folder"] + "/" + name)  # noqa: E731
            mat_bytes = read("material.json")
            mat = json.loads(mat_bytes)
            stats = check(s["folder"], read, s["sign"])
            out = os.path.join(PBR, s["slug"])
            os.makedirs(out, exist_ok=True)
            files = []
            for src, dst in INSTALL.items():
                data = read(src)
                open(os.path.join(out, dst), "wb").write(data)
                files.append({"file": dst, "from": f"{s['folder']}/{src}", "bytes": len(data), "md5": md5(data)})
            for name, data in list(docs.items()) + [("material.json", mat_bytes)]:
                open(os.path.join(out, name), "wb").write(data)
                files.append({"file": name, "from": (s["folder"] + "/" if name == "material.json" else "") + name,
                              "bytes": len(data), "md5": md5(data)})
            for f in files:                                    # what landed on disk is what the kit holds
                assert md5(open(os.path.join(out, f["file"]), "rb").read()) == f["md5"], f"{s['slug']}/{f['file']} differs"
            source = {"asset": mat["name"], "kind": "pbr", "slug": s["slug"],
                      "source": "Terra & Mar PBR kit supplied by the project owner (delivered 2026-10-12)",
                      "archive": {"name": "Terra_Mar_PBR_Kit.zip", "md5": zip_md5, "bytes": len(raw), "folder": s["folder"]},
                      "license": "unspecified; AI-generated output supplied by the project owner",
                      "note": "AI-generated appearance estimate matched to b8.png, not measured scan data" +
                              ("; the lettering is an artistic reconstruction, not an identified font" if s["sign"] else ""),
                      "importedAt": IMPORTED_ON, "workingSize": stats["size"], "reducedCopies": None,
                      "conventions": {"normal": "OpenGL +Y", **({"alphaCutoff": 0.5, "wrap": "clamp"} if s["sign"] else
                                                                {"displacement_total_m": 0.0015, "displacement_midpoint": 0.5, "wrap": "repeat"})},
                      "registeredInCatalog": False, "files": files,
                      "madeBy": "blender/scripts/terramar/building/make_terramar_kit_pbr.py"}
            open(os.path.join(out, "source.json"), "w", encoding="utf-8", newline="\n").write(json.dumps(source, indent=2) + "\n")
            open(os.path.join(out, "pbr.material.config.js"), "w", encoding="utf-8", newline="\n").write(config(s, mat, stats))
            print("INSTALLED", s["slug"], stats["size"], {k: v for k, v in stats.items() if k != "size"})


if __name__ == "__main__":
    main()
