"""A tileable PBR set for the Bradbury block's dressed sandstone: the ground floor's moulding and piers and the portal.

    python make_sandstone_pbr.py            (from anywhere; writes assets/public/pbr/bradbury_sandstone_dressed/)

Procedural, from periodic noise (every layer is blurred through the FFT, so the maps wrap on both axes): a smooth,
sawn-and-rubbed sandstone with a soft cloudy mottle, a fine sand grain, a few dark iron specks, and a height field
of the same layers for the normal map. The albedo's colour is a neutral tan; the block's materials gain it per
channel onto the tone they want, so it is the variation that matters here, not the hue. 1024 px over 2 m.

Retuned 2026-09-18 (user: the first cut looked smashed and too coarse; the stone in the photos is rubbed nearly
smooth): the grain is finer (1.3 mm) and, with the sparkle, a fifth of what it was (user: the pillar better, but subtler still, with finer grain), the mottle a little softer, the height field flatter
and its slopes barely exaggerated, the specks fewer and fainter, so the surface reads as thin, almost unnoticeable
texture that still takes the light. Then (user: too thin now, cannot be seen) a middle setting: the grain at half the
first cut, the slopes 3x, and a broad soft cloud 0.3 m across added for the blotching the photos show.
"""
import os, json, numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", "..", "..", ".."))
OUT = os.path.join(ROOT, "assets", "public", "pbr", "bradbury_sandstone_dressed")
N, TILE_M = 1024, 2.0                                       # pixels a side, metres a side: about 2 mm a pixel (user: 1K is enough, there is little detail)
PX_MM = TILE_M * 1000.0 / N
rng = np.random.default_rng(20260918)

def periodic_blur(a, sigma):
    # a gaussian blur through the FFT: periodic, so the result tiles
    f = np.fft.rfft2(a); ky = np.fft.fftfreq(N)[:, None]; kx = np.fft.rfftfreq(N)[None, :]
    g = np.exp(-2.0 * (np.pi * sigma) ** 2 * (kx ** 2 + ky ** 2))
    return np.fft.irfft2(f * g, s=a.shape)
def unit_noise(sigma):
    # zero-mean, unit-variance periodic noise at one scale
    n = periodic_blur(rng.standard_normal((N, N)), sigma); return n / n.std()
def specks(density, radius, seed_shift=0):
    # sparse round spots, wrapped: a boolean-ish field 0..1
    k = int(N * N * density); ys = rng.integers(0, N, k); xs = rng.integers(0, N, k); r = rng.uniform(radius * 0.6, radius * 1.4, k)
    field = np.zeros((N, N)); yy, xx = np.mgrid[-4:5, -4:5]
    for y, x, rr in zip(ys, xs, r):
        blob = np.clip(1.0 - np.sqrt(yy ** 2 + xx ** 2) / rr, 0.0, 1.0)
        field[np.ix_((y + np.arange(-4, 5)) % N, (x + np.arange(-4, 5)) % N)] = np.maximum(field[np.ix_((y + np.arange(-4, 5)) % N, (x + np.arange(-4, 5)) % N)], blob)
    return field
def to_srgb(lin): lin = np.clip(lin, 0.0, 1.0); return np.where(lin <= 0.0031308, 12.92 * lin, 1.055 * lin ** (1 / 2.4) - 0.055)
def save8(path, arr): Image.fromarray(np.clip(np.round(arr * 255.0), 0, 255).astype(np.uint8)).save(path)

# ---- the layers
mottle = unit_noise(107.0 / PX_MM)                          # soft clouds a tenth of a metre across (the scales are millimetres, so any N reads the same)
mottle2 = unit_noise(44.0 / PX_MM); cloud = unit_noise(300.0 / PX_MM)   # and a broad soft cloud, the photo's blotching                                # a finer cloud for the warm/cool drift and the height
grain = unit_noise(1.3 / PX_MM)                                  # the sand grain
micro = unit_noise(max(0.9 / PX_MM, 0.45))                                # the finest sparkle
spots = specks(220.0 * (PX_MM / 1000.0) ** 2, max(1.6 / PX_MM, 0.8))     # dark iron specks, 150 to the square metre
pits = specks(50.0 * (PX_MM / 1000.0) ** 2, max(1.2 / PX_MM, 0.7), 1)   # a few small pits, 50 to the square metre

# ---- albedo: a neutral tan in linear light, times a lightness field, with a slight warm/cool drift on the clouds
base_srgb = np.array([178.0, 140.0, 118.0]) / 255.0
base_lin = np.where(base_srgb <= 0.04045, base_srgb / 12.92, ((base_srgb + 0.055) / 1.055) ** 2.4)
light = 1.0 + 0.04 * cloud + 0.035 * mottle + 0.014 * grain + 0.008 * micro - 0.12 * spots - 0.06 * pits
drift = 0.012 * mottle2
albedo = np.stack([base_lin[0] * light * (1.0 + drift), base_lin[1] * light, base_lin[2] * light * (1.0 - drift)], axis=-1)

# ---- height in millimetres, the same layers: a gentle undulation, the grain, the specks and pits sunk a little
height = 0.30 * mottle2 + 0.05 * grain + 0.015 * micro - 0.08 * spots - 0.12 * pits
gx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2.0 * PX_MM)
gy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / (2.0 * PX_MM)   # down the image
K = 3.0                                                     # the slopes exaggerated a little: rubbed stone whose grain shows in raking light
nx, ny, nz = -gx * K, gy * K, np.ones_like(height)           # OpenGL: +Y up the image, so the down-gradient flips sign twice
ln = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2); nx, ny, nz = nx / ln, ny / ln, nz / ln
normal = np.stack([nx * 0.5 + 0.5, ny * 0.5 + 0.5, nz * 0.5 + 0.5], axis=-1)

# ---- ARM: occlusion nearly full, roughness of rubbed sandstone with the grain, no metal
ao = np.clip(1.0 - 0.35 * spots - 0.45 * pits, 0.0, 1.0)
rough = np.clip(0.62 + 0.04 * grain + 0.04 * mottle + 0.03 * cloud + 0.01 * micro, 0.5, 0.8)
arm = np.stack([ao, rough, np.zeros_like(ao)], axis=-1)

os.makedirs(OUT, exist_ok=True)
Image.fromarray(np.clip(np.round(to_srgb(albedo) * 255.0), 0, 255).astype(np.uint8)).save(os.path.join(OUT, "basecolor.jpg"), quality=95, subsampling=0)
save8(os.path.join(OUT, "normal_gl.png"), normal)
save8(os.path.join(OUT, "arm.png"), arm)
h01 = (height - height.min()) / (height.max() - height.min()); save8(os.path.join(OUT, "height.png"), np.repeat(h01[:, :, None], 3, axis=-1))
mean_srgb = tuple(int(round(v)) for v in (to_srgb(albedo.reshape(-1, 3).mean(0)) * 255.0))
lin_mean = albedo.reshape(-1, 3).mean(0)
open(os.path.join(OUT, "README.txt"), "w", encoding="utf-8").write(
    "Bradbury dressed sandstone, a procedural tileable PBR set made by authoring/BradburyBlock/make_sandstone_pbr.py "
    "(numpy, periodic FFT noise; seed 20260918). " + f"{N} px over {TILE_M} m. basecolor.jpg: a neutral tan (linear mean "
    f"{lin_mean[0]:.4f}, {lin_mean[1]:.4f}, {lin_mean[2]:.4f}; sRGB about {mean_srgb}) under a broad cloud (+-4%, 0.3 m) and a cloudy mottle (+-3.5%), sand grain (+-1.4%, 1.3 mm), "
    "a fine sparkle (+-0.8%), dark iron specks and a few pits, with a warm/cool drift of 1.2% on the clouds. normal_gl.png: OpenGL "
    "(+Y up) from a height field of the same layers (undulation 0.3 mm, grain 0.05 mm), slopes exaggerated 3x. arm.png: R occlusion "
    "(full but for the specks and pits), G roughness 0.62 with the grain (0.5..0.8), B metalness 0. height.png: the height field "
    "normalised 0..1, for reference. No lighting is baked into the base colour.\n")
cfg = f"""export default Object.freeze({{
    materialId: 'pbr.bradbury_sandstone_dressed',
    label: 'Bradbury Dressed Sandstone',
    classId: 'stone',
    root: 'wall',
    buildingEligible: true,
    groundEligible: false,
    tileMeters: {TILE_M},
    mapFiles: Object.freeze({{
        baseColor: 'basecolor.jpg',
        normal: 'normal_gl.png',
        orm: 'arm.png'
    }}),
    allMapFiles: Object.freeze({{
        baseColor: 'assets/public/pbr/bradbury_sandstone_dressed/basecolor.jpg',
        normal: 'assets/public/pbr/bradbury_sandstone_dressed/normal_gl.png',
        orm: 'assets/public/pbr/bradbury_sandstone_dressed/arm.png',
        height: 'assets/public/pbr/bradbury_sandstone_dressed/height.png',
        variants: Object.freeze({{}})
    }}),
    provenance: Object.freeze({{
        schema: 'bus-simulator.pbr-material-provenance',
        version: 1,
        source: Object.freeze({{
            asset: 'Bradbury dressed sandstone, procedural tileable PBR set',
            url: null,
            license: 'project-generated (procedural, no third-party source)',
            archive: null
        }}),
        generation: Object.freeze({{
            tool: 'numpy, src/graphics/content3d/buildings/authoring/BradburyBlock/make_sandstone_pbr.py',
            lightingInBaseColor: false,
            prompts: null,
            readme: 'assets/public/pbr/bradbury_sandstone_dressed/README.txt'
        }}),
        importedOn: '2026-09-18'
    }}),
    normalization: Object.freeze({{
        notes: 'Generated 2026-09-18 at {N}x{N} over {TILE_M} m from periodic FFT noise, so every map wraps on both axes by construction. The height field behind the normal map is undulation 0.3 mm plus grain 0.05 mm with the slopes exaggerated 3x; the specks and pits are sunk in height, occlusion and colour together.',
        albedoNotes: 'A neutral tan, sRGB about {mean_srgb}, meant to be tinted per channel by the consumer onto the stone it stands for (the block\\'s ground-floor moulding gains it onto the brick\\'s tone); the variation is a +-4% broad cloud, +-3.5% mottle, +-1.4% grain of 1.3 mm, +-0.8% sparkle, iron specks at -12% and a 1.2% warm/cool drift on the clouds. JPEG q95 4:4:4.',
        roughnessIntent: 'Sawn-and-rubbed sandstone: roughness 0.62 with the grain, 0.5..0.8, packed into arm.png G; metalness forced to 0.'
    }})
}});
"""
open(os.path.join(OUT, "pbr.material.config.js"), "w", encoding="utf-8").write(cfg)
print("WROTE", OUT, "albedo linear mean", [round(float(v), 4) for v in lin_mean], "sRGB", mean_srgb, "roughness mean", round(float(rough.mean()), 3))
