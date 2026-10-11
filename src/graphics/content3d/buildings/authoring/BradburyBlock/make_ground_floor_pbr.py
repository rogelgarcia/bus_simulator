"""The Bradbury block's ground-floor PBR sets: downloads/Bradbury_Ground_Floor_PBR.zip installed into the game's catalog,
three materials in assets/public/pbr/<slug>/ in the catalog's layout, each with its config, its manifest entry and its
place in the catalog index.

    python make_ground_floor_pbr.py            (from anywhere; reads downloads/, writes assets/public/pbr/)
    python make_ground_floor_pbr.py --stage DIR   the same sets into DIR/<slug>/ only: no manifest, no catalog index
                                                  (to regenerate and compare before replacing anything in the store)

The pack (AI-generated albedo with synthesized, pixel-aligned response maps, supplied by the project owner 2026-10-07)
holds three coordinated materials, all repeating in U and V (its README):

    01_Storefront_Pillars_Taupe        -> bradbury_storefront_pillars_taupe      1024 x 1024, 1 m a tile: the storefront piers
    02_Entrance_Ornaments_Terracotta   -> bradbury_entrance_terracotta           1024 x 1024, 1 m a tile: the portal's stone
    03_Cornice_Weathered_Terracotta    -> bradbury_cornice_weathered_terracotta  2048 x 512, 2 x 0.5 m a tile: the ground
                                                                                 floor's moulding (cornice, its undersides)

The cornice set is taken from its second revision, downloads/Bradbury_Cornice_PBR_3xWidth.zip (supplied 2026-10-08):
the same material three times as wide, 6144 x 512 for 6 x 0.5 m a tile at the same 1024 px a metre, its soot drawn
over three unique 2 m sections, so along a cornice it repeats every 6 m instead of 2. That pack has the material folder
and its README at its root and no validation record.

Installed as the catalog wants it: the base colour re-encoded to JPEG q95 4:4:4 (no alpha; colour as delivered, since
the pack was coloured for this facade), the OpenGL normal map, the pack's ORM as arm.png (R AO, G roughness, B metalness
0), the 16-bit height, and for the cornice the soot mask (dirt_mask.png, informational: the soot is already in the
colour and roughness). The pack's README, material.json and validation record go beside them; its previews, sources,
the DirectX normal and the separate channel maps stay in the archive. Every promise the pack makes is checked first:
one size per material, the ORM equal to the separate maps, metalness zero, opposite borders matching, the height 16 bits.
"""
import io, json, os, re, zipfile
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", "..", "..", ".."))
ZIP_REL = "downloads/Bradbury_Ground_Floor_PBR.zip"
PACK = "Bradbury_Ground_Floor_PBR/"
CORNICE_ZIP_REL = "downloads/Bradbury_Cornice_PBR_3xWidth.zip"      # the cornice's revision 2, three times as wide
CORNICE_PACK = ""
PBR = os.path.join(ROOT, "assets", "public", "pbr")
IMPORTED_ON = "2026-10-08"

SETS = [
    dict(folder="01_Storefront_Pillars_Taupe", slug="bradbury_storefront_pillars_taupe", label="Bradbury Storefront Pillars (taupe)",
         tile=1.0, zip=ZIP_REL, pack=PACK,
         use="the plain storefront piers between the ground floor's doors and windows (fit_piers in assemble_building.py)"),
    dict(folder="02_Entrance_Ornaments_Terracotta", slug="bradbury_entrance_terracotta", label="Bradbury Entrance Terracotta",
         tile=1.0, zip=ZIP_REL, pack=PACK,
         use="the portal's stone and the ground floor's moulding: its pillars, arch, pilasters and frieze (PORTAL_sandstone, "
             "portal_lib.fill_sandstone), and the entablature, fascia, cornice and band tops (PBR_bradbury_ground_stone)"),
    dict(folder="03_Cornice_Weathered_Terracotta", slug="bradbury_cornice_weathered_terracotta", label="Bradbury Cornice (weathered terracotta)",
         tile=6.0, zip=CORNICE_ZIP_REL, pack=CORNICE_PACK,
         use="the undersides of the ground floor's moulding alone, where a surface faces down (PBR_bradbury_ground_stone in "
             "assemble_building.py), laid along each face's own run (its gf_under UV map)"),
]


def read(z, pack, name):
    return Image.open(io.BytesIO(z.read(pack + name)))


def border_err(a):
    # the step across the wrap (last column/row to the first), against the image's own neighbour steps: 1.0 is a seam no
    # worse than the grain itself, 0 a pack whose opposite borders were made identical
    a = a.astype(np.float64)
    if a.ndim == 2: a = a[..., None]
    wrap_u = np.abs(a[:, 0] - a[:, -1]).mean(); step_u = np.abs(np.diff(a, axis=1)).mean()
    wrap_v = np.abs(a[0] - a[-1]).mean(); step_v = np.abs(np.diff(a, axis=0)).mean()
    return wrap_u / max(step_u, 1e-9), wrap_v / max(step_v, 1e-9)


def srgb_mean(rgb):
    return tuple(float(v) for v in rgb.reshape(-1, 3).astype(np.float64).mean(0))


def install(z, s):
    f = s["folder"] + "/"; P = s["pack"]
    base = np.asarray(read(z, P, f + "BaseColor_sRGB.png").convert("RGB"))
    nrm = np.asarray(read(z, P, f + "Normal_OpenGL.png").convert("RGB"))
    orm = np.asarray(read(z, P, f + "ORM.png").convert("RGB"))
    ao, rough, metal = (np.asarray(read(z, P, f + k + ".png").convert("L")) for k in ("AmbientOcclusion", "Roughness", "Metallic"))
    hgt = read(z, P, f + "Height_16bit.png")
    mat = json.loads(z.read(P + f + "material.json"))
    H, W = base.shape[:2]
    assert [W, H] == mat["resolution"], f"{s['folder']}: base colour {W}x{H}, material.json says {mat['resolution']}"
    for name, a in (("normal", nrm), ("orm", orm), ("ao", ao), ("roughness", rough), ("metallic", metal)):
        assert a.shape[:2] == (H, W), f"{s['folder']}: the {name} map is {a.shape[:2]}, not {(H, W)}"
    assert np.array_equal(orm[..., 0], ao) and np.array_equal(orm[..., 1], rough) and np.array_equal(orm[..., 2], metal), \
        f"{s['folder']}: ORM.png is not AO / roughness / metalness"
    assert not orm[..., 2].any(), f"{s['folder']}: metalness is not zero everywhere"
    assert hgt.mode.startswith("I;16") and hgt.size == (W, H), f"{s['folder']}: height {hgt.mode} {hgt.size}, not 16-bit {W}x{H}"
    seams = {k: border_err(a) for k, a in (("basecolor", base), ("normal", nrm), ("arm", orm))}
    worst = max(max(v) for v in seams.values())
    assert worst < 3.0, f"{s['folder']}: a border does not wrap ({seams})"
    tile_v = s["tile"] * H / W

    out = os.path.join(PBR, s["slug"]); os.makedirs(out, exist_ok=True)
    Image.fromarray(base, "RGB").save(os.path.join(out, "basecolor.jpg"), quality=95, subsampling=0)
    Image.fromarray(nrm, "RGB").save(os.path.join(out, "normal_gl.png"), optimize=True)
    Image.fromarray(orm, "RGB").save(os.path.join(out, "arm.png"), optimize=True)
    hgt.save(os.path.join(out, "height.png"))
    assert Image.open(os.path.join(out, "height.png")).mode.startswith("I;16"), "the installed height lost its 16 bits"
    extra = ["height.png", "README.txt", "material.json"]
    open(os.path.join(out, "README.txt"), "wb").write(z.read(P + "README.txt"))
    open(os.path.join(out, "material.json"), "wb").write(z.read(P + f + "material.json"))
    has_validation = (P + "authoring/validation.json") in z.namelist()
    vpath = os.path.join(out, "validation.json")
    if has_validation:
        open(vpath, "wb").write(z.read(P + "authoring/validation.json")); extra.append("validation.json")
    elif os.path.exists(vpath):
        os.remove(vpath)                                      # a previous revision's record, not this one's
    has_dirt = (P + f + "DirtMask.png") in z.namelist()
    if has_dirt:
        Image.fromarray(np.asarray(read(z, P, f + "DirtMask.png").convert("L")), "L").save(os.path.join(out, "dirt_mask.png"), optimize=True)
        extra.insert(1, "dirt_mask.png")

    mean = srgb_mean(base); r_mean = float(orm[..., 1].mean())
    js = lambda t: t.replace("\\", "\\\\").replace("'", "\\'")      # text dropped into a single-quoted JS string
    strip = W != H
    shape_note = (f"A {W}:{H} STRIP ({W}x{H}), repeating both ways: tileMeters is its HORIZONTAL repeat, {s['tile']:g} m, so a mapped "
                  f"surface must repeat it every {tile_v:g} m vertically or the grain stretches; lay its long side along the moulding."
                  if strip else f"Square {W}x{H}, repeating both ways, {s['tile']:g} m a tile (the pack's suggested coverage).")
    dirt_files = f"\n        dirtMask: 'assets/public/pbr/{s['slug']}/dirt_mask.png'," if has_dirt else ""
    cfg = f"""export default Object.freeze({{
    materialId: 'pbr.{s['slug']}',
    label: '{js(s['label'])}',
    classId: 'stone',
    root: 'wall',
    buildingEligible: true,
    groundEligible: false,
    tileMeters: {s['tile']:g},
    mapFiles: Object.freeze({{
        baseColor: 'basecolor.jpg',
        normal: 'normal_gl.png',
        orm: 'arm.png'
    }}),
    allMapFiles: Object.freeze({{
        baseColor: 'assets/public/pbr/{s['slug']}/basecolor.jpg',
        normal: 'assets/public/pbr/{s['slug']}/normal_gl.png',
        orm: 'assets/public/pbr/{s['slug']}/arm.png',
        height: 'assets/public/pbr/{s['slug']}/height.png',{dirt_files}
        variants: Object.freeze({{}})
    }}),
    provenance: Object.freeze({{
        schema: 'bus-simulator.pbr-material-provenance',
        version: 1,
        source: Object.freeze({{
            asset: '{js('Bradbury ground floor: ' + mat['name'].lower() + ', ' + mat['description'].lower())} (one of three coordinated materials)',
            url: null,
            license: 'unspecified; AI-generated output supplied by the project owner',
            archive: '{s["zip"]}'
        }}),
        generation: Object.freeze({{
            tool: 'AI image generation for the albedo (the pack names no tool); response maps synthesized from the same surface, pixel-aligned',
            lightingInBaseColor: false,
            prompts: {("'" + s["zip"] + " (authoring/prompt_history.json)'") if has_validation else "null"},
            readme: 'assets/public/pbr/{s['slug']}/README.txt',
            validation: {("'assets/public/pbr/" + s['slug'] + "/validation.json'") if has_validation else "null"}
        }}),
        importedOn: '{IMPORTED_ON}'
    }}),
    normalization: Object.freeze({{
        notes: 'Made by src/graphics/content3d/buildings/authoring/BradburyBlock/make_ground_floor_pbr.py from {s["zip"]} ({s['folder']}{(', revision ' + str(mat['revision'])) if 'revision' in mat else ''}). {js(shape_note)} Used on {js(s['use'])}. The importer re-checked the pack: one size for every map, ORM equal to the separate AO / roughness / metallic maps, metalness 0, every border wrapping (worst wrap step {worst:.2f}x the grain\\'s own). Normal map OpenGL +Y at strength 1; the 16-bit height (midlevel 0.5, full range {mat['displacement_scale_m']:g} m) is kept for displacement, not to be added as bump over the normal.{" dirt_mask.png is the soot pattern already in the colour and roughness, white = soot: a control for reducing it, never to be multiplied in again." if has_dirt else ""}',
        albedoNotes: 'Colour as delivered (the pack was coloured for this facade), re-encoded from PNG to JPEG q95 4:4:4 per the catalog format policy. Mean sRGB ({mean[0]:.0f}, {mean[1]:.0f}, {mean[2]:.0f}).',
        roughnessIntent: 'Matte unglazed mineral surface: mean roughness {r_mean:.0f}/255 in arm.png G (the pack\\'s own ORM, unchanged), AO in R, metalness 0 in B.'
    }})
}});
"""
    open(os.path.join(out, "pbr.material.config.js"), "w", encoding="utf-8", newline="\n").write(cfg)
    print(f"{s['slug']}: {W}x{H}, {s['tile']:g} x {tile_v:g} m a tile, mean sRGB ({mean[0]:.0f}, {mean[1]:.0f}, {mean[2]:.0f}), "
          f"roughness {r_mean:.0f}/255, worst border wrap {worst:.2f}x the grain{', dirt mask kept' if has_dirt else ''}")
    return dict(slug=s["slug"], zip=s["zip"], is_wall=True,
                basecolor=f"{s['folder']}/BaseColor_sRGB.png (JPEG q95 4:4:4, colour as delivered)",
                normal_gl=f"{s['folder']}/Normal_OpenGL.png",
                arm=f"{s['folder']}/ORM.png (R AO, G roughness, B metallic 0), unchanged",
                extra_files=extra, made_by="src/graphics/content3d/buildings/authoring/BradburyBlock/make_ground_floor_pbr.py")


def register(slug):
    # the catalog index: PbrMaterialCatalog.js loads only what _catalog_index.js imports; inserted after the last import
    # whose slug sorts before it, and in the catalog list in the same place (as make_flowers_pbr.py does)
    idx_p = os.path.join(PBR, "_catalog_index.js")
    idx = open(idx_p, encoding="utf-8").read()
    var = slug.split("_")[0] + "".join(p[:1].upper() + p[1:] for p in slug.split("_")[1:])
    imp = f"import {var} from './{slug}/pbr.material.config.js';"
    if imp in idx:
        print(f"  {var} already in _catalog_index.js"); return
    rx = r"^import (\w+) from '\./([\w-]+)/pbr\.material\.config\.js';$"
    imports = re.findall(rx, idx, re.M)
    after = [v for v, s in imports if s.startswith("bradbury_") and s < slug] or [v for v, s in imports if s < slug]
    anchor = re.search(rf"^import {after[-1]} from .*$", idx, re.M) if after else None
    idx = (idx[:anchor.end()] + "\n" + imp + idx[anchor.end():]) if anchor else (imp + "\n" + idx)
    body = re.search(r"PBR_MATERIAL_CATALOG = Object\.freeze\(\[\n(.*?)\n\]\);", idx, re.S)
    names = [n.strip().rstrip(",") for n in body.group(1).split("\n") if n.strip()]
    slug_of = dict(re.findall(rx, idx, re.M))
    pos = next((i + 1 for i in range(len(names) - 1, -1, -1) if slug_of.get(names[i], "").startswith("bradbury_") and slug_of[names[i]] < slug), None)
    if pos is None: pos = next((i for i, n in enumerate(names) if slug_of.get(n, "").startswith("bradbury_")), None)
    if pos is None: pos = next((i for i, n in enumerate(names) if slug_of.get(n, "") > slug), len(names))
    names.insert(pos, var)
    idx = idx[:body.start(1)] + "\n".join(f"    {n}," for n in names).rstrip(",") + idx[body.end(1):]
    open(idx_p, "w", encoding="utf-8", newline="\n").write(idx)
    print(f"  registered {var} in _catalog_index.js")


if __name__ == "__main__":
    import sys
    if "--stage" in sys.argv:
        PBR = os.path.abspath(sys.argv[sys.argv.index("--stage") + 1])
        os.makedirs(PBR, exist_ok=True)
        for s in SETS:
            zp = os.path.join(ROOT, *s["zip"].split("/")); assert os.path.isfile(zp), f"missing: {zp}"
            with zipfile.ZipFile(zp) as z: install(z, s)
        print(f"staged {len(SETS)} sets in {PBR}; the store, its manifest and catalog index untouched")
        sys.exit(0)
    entries = []
    for s in SETS:
        zp = os.path.join(ROOT, *s["zip"].split("/")); assert os.path.isfile(zp), f"missing: {zp}"
        with zipfile.ZipFile(zp) as z: entries.append(install(z, s))
    man_p = os.path.join(PBR, "_manifest.json")
    man = json.load(open(man_p, encoding="utf-8"))
    slugs = {e["slug"] for e in entries}
    man["materials"] = [m for m in man["materials"] if m.get("slug") not in slugs] + entries
    open(man_p, "w", encoding="utf-8", newline="\n").write(json.dumps(man, indent=2) + "\n")
    print(f"_manifest.json: {len(entries)} entries")
    for e in entries: register(e["slug"])
