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

Also writes `assets/public/pbr/_manifest.json` for legacy asset tooling. Runtime material discovery uses the tracked
`_catalog_index.js` and per-set `pbr.material.config.js`; register each installed set there before building use.

## Run

Dry run:

`python3 tools/pbr_material_importer/run.py --dry-run`

Import/update assets:

`python3 tools/pbr_material_importer/run.py`

## Preserved building sets (AI 652 Phase 3)

`building_sets.py` handles the already installed Terra & Mar limestone/two signs and Bradbury lettering. It
requires their tracked configs and index registration first. It validates Terra & Mar's archive checksum and
byte-exact installed maps, preserves Bradbury's respaced maps, and stages provenance plus the two sign opacity
maps. Each opacity image must equal the installed base-color alpha. Unknown licensing/source fields stay explicit.

Run with the `pythonExecutable` configured in `tools/baking/blender.local.json` (Pillow and NumPy required):

```powershell
$taskPython = (Get-Content tools/baking/blender.local.json -Raw | ConvertFrom-Json).pythonExecutable
& $taskPython tools/pbr_material_importer/building_sets.py --terramar-zip blender_inputs/terramar/kit_source/Terra_Mar_PBR_Kit.zip --bradbury-zip blender_inputs/bradbury/lettering_source/bradbury_lettering_PBR.zip --output blender_files/material-install-unique
```

The output directory must be new. Inspect its `receipt.json` and staged files before adding `--install` with a
fresh output directory. Installation writes only the four source records and two opacity maps; it never re-encodes
base/normal/ORM/height maps or edits the shared index. Existing conflicting opacity is rejected. Back up all affected
files in a new external dated folder with `MANIFEST.md` before installation; never modify an existing backup.
The retained archives and neighboring `source.json` belong in `blender_inputs/`; they are never runtime inputs.

Blender consumers use `blender/scripts/common/material_catalog.py`, requiring Node on PATH, and fail if a set/map
is not installed. Validate the Terra & Mar build with `node tools/bake.mjs --target buildings/terramar/catalog-check`,
then run the AI 651 view comparisons before replacing active scenes.
