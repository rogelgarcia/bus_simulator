"""The Bradbury portal's inscription, "BRADBURY.", as a PBR decal: downloads/bradbury_lettering_PBR.zip installed into
assets/public/pbr/bradbury_lettering/ in the catalog's layout, its letters spaced a little further apart.

    python make_lettering_pbr.py            (from anywhere; reads downloads/, writes assets/public/pbr/bradbury_lettering/)

The pack (AI-generated, supplied by the project owner, 2026-09-18) is "BRADBURY." on a transparent 2172 x 724
canvas: a base colour with the alpha, and a normal map, height, roughness and AO baked from one shared coverage mask
and 16-bit height field, every map carrying the same alpha texel for texel. Installed as the catalog wants it: the
base colour keeps its alpha (PNG, since the decal is a cutout), the data maps drop it -- outside the letters they hold
flat values -- and AO and roughness are packed into arm.png with metalness 0.

The spacing (user 2026-09-22: "edit the image to increase the space between the letters a bit"). The nine glyphs are
found as separate 8-connected shapes in the alpha above CORE_ALPHA, and each faint antialiased rim texel joins the
glyph it touches: a split by empty columns will not do, since the letters overlap in their column projections (R,
A, D; R, Y and the stop), and at any alpha at all the R's and the A's rims, a texel apart, touch. The n-th glyph from the
left then moves LETTER_SPACING_PX * n to the right in every map alike, so every gap opens by the same amount and the
maps stay registered texel for texel; the canvas grows on the right by the total. The pack's own files are left
untouched in the archive.
"""
import io, json, os, zipfile
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", "..", "..", ".."))
ZIP = os.path.join(ROOT, "downloads", "bradbury_lettering_PBR.zip")
SLUG = "bradbury_lettering"
OUT = os.path.join(ROOT, "assets", "public", "pbr", SLUG)
LETTER_SPACING_PX = 20                 # added to every gap between two glyphs: 6.6% of the 305-texel cap height
CORE_ALPHA = 32                        # the glyphs are told apart above this alpha: at any alpha at all, the R's and the A's faint rims touch

def load(z, name):
    return np.asarray(Image.open(io.BytesIO(z.read(name))))

def glyphs(mask):
    # 8-connected components of the mask, as a label per texel (0 outside), by a flood fill over a flat list
    H, W = mask.shape; flat = mask.ravel().tolist(); lab = [0] * (H * W); k = 0
    for seed in np.flatnonzero(mask.ravel()).tolist():
        if lab[seed]: continue
        k += 1; lab[seed] = k; stack = [seed]
        while stack:
            p = stack.pop(); y, x = divmod(p, W)
            for yy in (y - 1, y, y + 1):
                if yy < 0 or yy >= H: continue
                row = yy * W
                for xx in (x - 1, x, x + 1):
                    if 0 <= xx < W:
                        q = row + xx
                        if flat[q] and not lab[q]: lab[q] = k; stack.append(q)
    return np.array(lab, dtype=np.int32).reshape(H, W), k

with zipfile.ZipFile(ZIP) as z:
    base = load(z, "bradbury_basecolor_rgba.png")
    maps = {k: load(z, f"bradbury_{k}.png") for k in ("normal_opengl", "roughness", "ao", "height")}
    docs = {n: z.read(n) for n in ("README.txt", "generation_prompts.json", "alignment_report.json")}
H, W = base.shape[:2]; alpha = base[..., 3]; mask = alpha > 0
for k, a_ in maps.items():                                  # the pack's promise, checked: one alpha on every map
    assert a_.shape == base.shape and np.array_equal(a_[..., 3], alpha), f"the {k} map's alpha differs from the base colour's"
nrm = maps["normal_opengl"][..., :3]; rough = maps["roughness"][..., 0]; ao = maps["ao"][..., 0]; hgt = maps["height"][..., 0]

lab, n = glyphs(alpha > CORE_ALPHA)
sizes = np.bincount(lab.ravel(), minlength=n + 1)
assert n == 9 and min(sizes[1:]) >= 500, f"{n} glyphs above alpha {CORE_ALPHA} (sizes {sizes[1:].tolist()}), not the nine of BRADBURY."
halo = mask & (lab == 0)                                    # the faint antialiased rim goes to the glyph it touches, a texel at a time
for _ in range(8):
    if not halo.any(): break
    grown = lab.copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            y0, y1, x0, x1 = max(0, -dy), H - max(0, dy), max(0, -dx), W - max(0, dx)
            src = lab[y0 + dy:y1 + dy, x0 + dx:x1 + dx]; dst = grown[y0:y1, x0:x1]
            take = halo[y0:y1, x0:x1] & (dst == 0) & (src > 0); dst[take] = src[take]
    lab = grown; halo = mask & (lab == 0)
assert not halo.any(), f"{int(halo.sum())} visible texels touch no glyph"
order = sorted(range(1, n + 1), key=lambda k: int(np.nonzero((lab == k).any(axis=0))[0].min()))
shift = {k: i * LETTER_SPACING_PX for i, k in enumerate(order)}

W2 = W + LETTER_SPACING_PX * (len(order) - 1)
flat_of = lambda a: np.median(a[~mask].reshape(-1, a.shape[-1]) if a.ndim == 3 else a[~mask], axis=0)
inside_rgb = base[..., :3][alpha == 255].mean(0)
nb = np.zeros((H, W2, 4), np.uint8); nb[..., :3] = np.round(inside_rgb).astype(np.uint8)   # the gaps: the letters' own mean colour at alpha 0, so no filtered edge darkens
nn = np.empty((H, W2, 3), np.uint8); nn[...] = np.round(flat_of(nrm)).astype(np.uint8)
nr = np.full((H, W2), np.uint8(round(float(flat_of(rough))))); na = np.full((H, W2), np.uint8(round(float(flat_of(ao)))))
nh = np.full((H, W2), np.uint8(round(float(flat_of(hgt)))))
for k in range(1, n + 1):
    ys, xs = np.nonzero(lab == k); xd = xs + shift[k]
    nb[ys, xd] = base[ys, xs]; nn[ys, xd] = nrm[ys, xs]; nr[ys, xd] = rough[ys, xs]; na[ys, xd] = ao[ys, xs]; nh[ys, xd] = hgt[ys, xs]

os.makedirs(OUT, exist_ok=True)
Image.fromarray(nb, "RGBA").save(os.path.join(OUT, "basecolor.png"), optimize=True)
Image.fromarray(nn, "RGB").save(os.path.join(OUT, "normal_gl.png"), optimize=True)
Image.fromarray(np.dstack([na, nr, np.zeros_like(na)]), "RGB").save(os.path.join(OUT, "arm.png"), optimize=True)
Image.fromarray(nh, "L").save(os.path.join(OUT, "height.png"), optimize=True)
for name, data in docs.items(): open(os.path.join(OUT, name), "wb").write(data)

ys, xs = np.nonzero(nb[..., 3] > 127); box = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))
aspect = (box[2] - box[0] + 1) / (box[3] - box[1] + 1)
cfg = f"""export default Object.freeze({{
    materialId: 'pbr.{SLUG}',
    label: 'Bradbury Lettering',
    classId: 'stone',
    root: 'wall',
    buildingEligible: false,
    groundEligible: false,
    tileMeters: 2.77,
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
            asset: 'Bradbury portal inscription "BRADBURY." in terracotta capitals, a single decal',
            url: null,
            license: 'unspecified; AI-generated output supplied by the project owner',
            archive: 'downloads/bradbury_lettering_PBR.zip'
        }}),
        generation: Object.freeze({{
            tool: 'ChatGPT (OpenAI)',
            lightingInBaseColor: false,
            prompts: 'assets/public/pbr/{SLUG}/generation_prompts.json',
            readme: 'assets/public/pbr/{SLUG}/README.txt'
        }}),
        importedOn: '2026-09-22'
    }}),
    normalization: Object.freeze({{
        notes: 'Made by src/graphics/content3d/buildings/authoring/BradburyBlock/make_lettering_pbr.py from downloads/bradbury_lettering_PBR.zip (an AI-generated albedo master, the other maps baked numerically from one shared coverage mask and 16-bit height field; see README.txt and alignment_report.json, which describe the pack as delivered). A SINGLE INSCRIPTION DECAL, not a repeat: clamp the edges and cut out on the base colour alpha at 0.5. RESPACED 2026-09-22 (user): each of the nine glyphs, found as its own 8-connected shape in the alpha, moved {LETTER_SPACING_PX} texels further right than the one before it in every map alike, so each gap opened by {LETTER_SPACING_PX} texels and the maps stay registered texel for texel; the canvas grew to {W2}x{H}. The letters fill x {box[0]}..{box[2]}, y {box[1]}..{box[3]} (aspect {aspect:.2f}). tileMeters is the whole canvas at the size the portal frieze uses. Normal map OpenGL +Y; the 16-bit height, the DirectX normal, the separate opacity and the preview sheet are left in the archive.',
        albedoNotes: 'Colour as delivered, alpha kept (PNG: the cutout needs it). Letter interior mean RGB ({inside_rgb[0]:.0f}, {inside_rgb[1]:.0f}, {inside_rgb[2]:.0f}), warm terracotta; not retinted. The opened gaps carry that mean colour at alpha 0, so a filtered edge does not darken.',
        roughnessIntent: 'Matte unglazed clay: roughness about 212/255 on the letters, packed into arm.png G with AO in R and metalness forced to 0. The data maps drop the shared alpha; outside the letters they hold flat values.'
    }})
}});
"""
open(os.path.join(OUT, "pbr.material.config.js"), "w", encoding="utf-8", newline="\n").write(cfg)

man_p = os.path.join(ROOT, "assets", "public", "pbr", "_manifest.json")
man = json.load(open(man_p, encoding="utf-8"))
man["materials"] = [m for m in man["materials"] if m.get("slug") != SLUG] + [{
    "slug": SLUG, "zip": "downloads/bradbury_lettering_PBR.zip", "is_wall": False,
    "basecolor": f"bradbury_basecolor_rgba.png (RGBA kept: decal cutout), respaced +{LETTER_SPACING_PX} px a gap",
    "normal_gl": "bradbury_normal_opengl.png", "arm": "packed from bradbury_ao.png + bradbury_roughness.png",
    "extra_files": ["height.png", "README.txt", "generation_prompts.json", "alignment_report.json"],
    "made_by": "src/graphics/content3d/buildings/authoring/BradburyBlock/make_lettering_pbr.py"}]
open(man_p, "w", encoding="utf-8", newline="\n").write(json.dumps(man, indent=2) + "\n")

gaps = []
for a, b in zip(order, order[1:]):
    ra, rb = (lab == a), (lab == b); best = 10 ** 9
    for y in np.nonzero(ra.any(axis=1) & rb.any(axis=1))[0]:
        best = min(best, int(np.nonzero(rb[y])[0].min() + shift[b]) - int(np.nonzero(ra[y])[0].max() + shift[a]) - 1)
    gaps.append(best)
print(f"{SLUG}: {len(order)} glyphs, each gap +{LETTER_SPACING_PX} texels; "
      f"canvas {W}x{H} -> {W2}x{H}; letters x {box[0]}..{box[2]}, y {box[1]}..{box[3]}, aspect {aspect:.3f}; "
      f"least gaps now {gaps}")
