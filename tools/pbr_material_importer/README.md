# PBR Material Importer

Imports the PBR material packs from `downloads/` (`*_1k.zip`) into the application asset tree and normalizes filenames per material:

- `basecolor.(jpg|png)`
- `normal_gl.(jpg|png)`
- `arm.(jpg|png)`

Target:

- Local-only PBR materials → `assets/public/pbr/<material_id>/` (gitignored)

Also writes `assets/public/pbr/_manifest.json` for runtime detection.

## Run

Dry run:

`python3 tools/pbr_material_importer/run.py --dry-run`

Import/update assets:

`python3 tools/pbr_material_importer/run.py`
