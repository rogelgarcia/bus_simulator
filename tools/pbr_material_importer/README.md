# PBR Material Importer

Imports the PBR material packs from `downloads/` (`*_1k.zip`) into the application asset tree and normalizes filenames per material:

- `basecolor.jpg` by default (`basecolor.png` only when alpha/cutout is needed)
- `normal_gl.png`
- `arm.png`

Texture format policy (catalog-wide):
- Color maps (`basecolor`/`albedo`/`diffuse`/`emissive`) should default to `.jpg` unless alpha is needed.
- Data maps (`normal`, `arm`/`orm`, `ao`, `roughness`, `metalness`, `displacement`, `height`, masks) should use `.png`.

Target:

- Local-only PBR materials → `assets/public/pbr/<material_id>/` (gitignored)

Also writes `assets/public/pbr/_manifest.json` for runtime detection.

## Run

Dry run:

`python3 tools/pbr_material_importer/run.py --dry-run`

Import/update assets:

`python3 tools/pbr_material_importer/run.py`
