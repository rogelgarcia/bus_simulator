"""The Bradbury portal frieze's flower panels as a PBR decal: downloads/flowers_pbr.zip installed into
assets/public/pbr/bradbury_frieze_flowers/ in the catalog's layout, with its config, its manifest entry and its place
in the catalog index.

    python make_flowers_pbr.py            (from anywhere; reads downloads/, writes assets/public/pbr/bradbury_frieze_flowers/)

The pack (AI-generated, supplied by the project owner, 2026-09-27) is one terracotta ornament -- two broad acanthus
scrolls, a small flower in the left spiral and a flower cluster in the right one -- on a transparent 2048 x 768 canvas,
every map computed from one relief master and sharing one opacity mask (its validation.json records the checks; they
are repeated here). Installed as the catalog wants it: the base colour keeps its alpha (PNG, since the decal is a
cutout), the OpenGL normal map, the packed ORM as arm.png (R AO, G roughness, B metalness 0, exactly the pack's
Flowers_ORM.png) and the 16-bit height. The pack's README, validation record and generation prompt go beside them; its
preview sheets, the DirectX normal, the separate channel maps and the relief master stay in the archive.

The decal replaces the procedural foliage panels over the portal's pilasters (pieces/08_frieze.py; user 2026-09-27:
"in the download folder there is flowers_pbr, we should use that PBR in place of the current 3d flowers. the opposite
side should be flipped horizontally"), so tileMeters is the whole canvas at the size the frieze uses: the ornament's
opaque width from the capitals' inner edge to 3 cm inside the band's end.
"""
import io, json, os, re, zipfile
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", "..", "..", ".."))
ZIP = os.path.join(ROOT, "downloads", "flowers_pbr.zip")
SLUG = "bradbury_frieze_flowers"
PBR = os.path.join(ROOT, "assets", "public", "pbr")
OUT = os.path.join(PBR, SLUG)
PACK = "flowers_pbr/"
FRIEZE_OPAQUE_W = 2.30 - 1.4842      # metres: the ornament's opaque width on the frieze (08_frieze.py), capital's inner edge to 3 cm inside the band's end

def load(z, name):
    return np.asarray(Image.open(io.BytesIO(z.read(PACK + name))))

with zipfile.ZipFile(ZIP) as z:
    base = load(z, "Flowers_BaseColor_RGBA.png")
    opac = load(z, "Flowers_Opacity.png")
    nrm = load(z, "Flowers_Normal_OpenGL.png")
    orm = load(z, "Flowers_ORM.png")
    ao, rough, metal = (load(z, f"Flowers_{k}.png") for k in ("AmbientOcclusion", "Roughness", "Metallic"))
    hgt16 = Image.open(io.BytesIO(z.read(PACK + "Flowers_Height_16bit.png")))
    docs = {"README.md": z.read(PACK + "README.md"), "validation.json": z.read(PACK + "validation.json"),
            "generation_prompt.txt": z.read(PACK + "source/generation_prompt.txt")}

H, W = base.shape[:2]
alpha = base[..., 3]
gray = lambda a: a if a.ndim == 2 else a[..., 0]
# the pack's promises, checked: one canvas, one mask, the ORM the separate maps, metalness zero, the height 16 bits
for name, a in (("opacity", opac), ("normal", nrm), ("orm", orm), ("ao", ao), ("roughness", rough), ("metallic", metal)):
    assert a.shape[:2] == (H, W), f"the {name} map is {a.shape[:2]}, not {(H, W)}"
assert np.array_equal(gray(opac), alpha), "the opacity map differs from the base colour's alpha"
assert np.array_equal(orm[..., 0], gray(ao)) and np.array_equal(orm[..., 1], gray(rough)) and np.array_equal(orm[..., 2], gray(metal)), \
    "Flowers_ORM.png is not AO / roughness / metalness"
assert not orm[..., 2].any(), "metalness is not zero everywhere"
assert hgt16.mode.startswith("I;16") and hgt16.size == (W, H), f"the height is {hgt16.mode} {hgt16.size}, not 16-bit {W}x{H}"

ys, xs = np.nonzero(alpha > 127); box = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))
aspect = (box[2] - box[0] + 1) / (box[3] - box[1] + 1)
inside_rgb = base[..., :3][alpha == 255].mean(0)
rough_in = float(orm[..., 1][alpha == 255].mean())
tile_m = FRIEZE_OPAQUE_W * W / (box[2] - box[0] + 1)

os.makedirs(OUT, exist_ok=True)
Image.fromarray(base, "RGBA").save(os.path.join(OUT, "basecolor.png"), optimize=True)
Image.fromarray(nrm[..., :3], "RGB").save(os.path.join(OUT, "normal_gl.png"), optimize=True)
Image.fromarray(orm[..., :3], "RGB").save(os.path.join(OUT, "arm.png"), optimize=True)
hgt16.save(os.path.join(OUT, "height.png"))
for name, data in docs.items(): open(os.path.join(OUT, name), "wb").write(data)
assert Image.open(os.path.join(OUT, "height.png")).mode.startswith("I;16"), "the installed height lost its 16 bits"

cfg = f"""export default Object.freeze({{
    materialId: 'pbr.{SLUG}',
    label: 'Bradbury Frieze Flowers',
    classId: 'stone',
    root: 'wall',
    buildingEligible: false,
    groundEligible: false,
    tileMeters: {tile_m:.3f},
    mapFiles: Object.freeze({{
        baseColor: 'basecolor.png',
        normal: 'normal_gl.png',
        orm: 'arm.png'
    }}),
    allMapFiles: Object.freeze({{
        baseColor: 'assets/public/pbr/{SLUG}/basecolor.png',
        normal: 'assets/public/pbr/{SLUG}/normal_gl.png',
        orm: 'assets/public/pbr/{SLUG}/arm.png',
        height: 'assets/public/pbr/{SLUG}/height.png',
        variants: Object.freeze({{}})
    }}),
    provenance: Object.freeze({{
        schema: 'bus-simulator.pbr-material-provenance',
        version: 1,
        source: Object.freeze({{
            asset: 'Bradbury portal frieze panel: terracotta acanthus scrolls with flowers, a single decal',
            url: null,
            license: 'unspecified; AI-generated output supplied by the project owner',
            archive: 'downloads/flowers_pbr.zip'
        }}),
        generation: Object.freeze({{
            tool: 'AI image generation (the pack names no tool); all maps computed from one relief master',
            lightingInBaseColor: false,
            prompts: 'assets/public/pbr/{SLUG}/generation_prompt.txt',
            readme: 'assets/public/pbr/{SLUG}/README.md',
            validation: 'assets/public/pbr/{SLUG}/validation.json'
        }}),
        importedOn: '2026-09-27'
    }}),
    normalization: Object.freeze({{
        notes: 'Made by src/graphics/content3d/buildings/authoring/BradburyBlock/make_flowers_pbr.py from downloads/flowers_pbr.zip (every map computed from one grayscale relief master; the importer re-checks the pack\\'s validation: one {W}x{H} canvas, the opacity equal to the base colour\\'s alpha, the ORM equal to the separate AO / roughness / metallic maps). A SINGLE ORNAMENT DECAL, not a repeat: clamp the edges and cut out on the base colour alpha at 0.5. The ornament fills x {box[0]}..{box[2]}, y {box[1]}..{box[3]} (aspect {aspect:.2f}). Used on the portal frieze over each pilaster (pieces/08_frieze.py), as delivered on the left and mirrored horizontally on the right. tileMeters is the whole canvas at the size the frieze uses ({FRIEZE_OPAQUE_W:.4f} m of opaque width). Normal map OpenGL +Y at strength 1; the 16-bit height (white = proud, full range 0.08 x the canvas height) is kept for displacement or parallax.',
        albedoNotes: 'Colour as delivered, alpha kept (PNG: the cutout needs it); RGB continues under the transparent texels so a filtered edge does not darken. Ornament interior mean RGB ({inside_rgb[0]:.0f}, {inside_rgb[1]:.0f}, {inside_rgb[2]:.0f}), warm terracotta; the portal tints it onto the wall\\'s sandstone in its material, as it does the lettering.',
        roughnessIntent: 'Matte, slightly weathered terracotta: roughness about {rough_in:.0f}/255 on the ornament, arm.png G, with AO in R and metalness 0 in B (the pack\\'s own ORM, unchanged).'
    }})
}});
"""
open(os.path.join(OUT, "pbr.material.config.js"), "w", encoding="utf-8", newline="\n").write(cfg)

# the import record, as every pack's
man_p = os.path.join(PBR, "_manifest.json")
man = json.load(open(man_p, encoding="utf-8"))
man["materials"] = [m for m in man["materials"] if m.get("slug") != SLUG] + [{
    "slug": SLUG, "zip": "downloads/flowers_pbr.zip", "is_wall": False,
    "basecolor": "Flowers_BaseColor_RGBA.png (RGBA kept: decal cutout)",
    "normal_gl": "Flowers_Normal_OpenGL.png", "arm": "Flowers_ORM.png (R AO, G roughness, B metallic 0), unchanged",
    "extra_files": ["height.png (Flowers_Height_16bit.png)", "README.md", "validation.json", "generation_prompt.txt"],
    "made_by": "src/graphics/content3d/buildings/authoring/BradburyBlock/make_flowers_pbr.py"}]
open(man_p, "w", encoding="utf-8", newline="\n").write(json.dumps(man, indent=2) + "\n")

# the catalog index: PbrMaterialCatalog.js loads only what _catalog_index.js imports; both lists stay in slug order
idx_p = os.path.join(PBR, "_catalog_index.js")
idx = open(idx_p, encoding="utf-8").read()
var = SLUG.split("_")[0] + "".join(p[:1].upper() + p[1:] for p in SLUG.split("_")[1:])
imp = f"import {var} from './{SLUG}/pbr.material.config.js';"
if imp not in idx:
    imports = re.findall(r"^import (\w+) from '\./([\w-]+)/pbr\.material\.config\.js';$", idx, re.M)
    after = [v for v, s in imports if s < SLUG]
    anchor_imp = re.search(rf"^import {after[-1]} from .*$", idx, re.M) if after else None
    idx = (idx[:anchor_imp.end()] + "\n" + imp + idx[anchor_imp.end():]) if anchor_imp else (imp + "\n" + idx)
    body = re.search(r"PBR_MATERIAL_CATALOG = Object\.freeze\(\[\n(.*?)\n\]\);", idx, re.S)
    names = [n.strip().rstrip(",") for n in body.group(1).split("\n") if n.strip()]
    slug_of = dict((v, s) for v, s in re.findall(r"^import (\w+) from '\./([\w-]+)/pbr\.material\.config\.js';$", idx, re.M))
    pos = next((i for i, n in enumerate(names) if slug_of.get(n, "") > SLUG), len(names))
    names.insert(pos, var)
    idx = idx[:body.start(1)] + "\n".join(f"    {n}," for n in names).rstrip(",") + idx[body.end(1):]
    open(idx_p, "w", encoding="utf-8", newline="\n").write(idx)
    print(f"registered {var} in _catalog_index.js")
else:
    print(f"{var} already in _catalog_index.js")

print(f"{SLUG}: {W}x{H}, ornament x {box[0]}..{box[2]}, y {box[1]}..{box[3]}, aspect {aspect:.3f}; interior mean RGB "
      f"({inside_rgb[0]:.0f}, {inside_rgb[1]:.0f}, {inside_rgb[2]:.0f}), roughness {rough_in:.0f}/255; tileMeters {tile_m:.3f}")
