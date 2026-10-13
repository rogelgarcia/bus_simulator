DONE

# Problem

The user supplied a material kit made for this building: `Terra_Mar_PBR_Kit.zip` in their Downloads folder (109.6 MB,
md5 `cc7c7315fd820fa6b1b5b43e602b9f91`, delivered 2026-10-12). An unmodified extracted copy for reading is under
`tests/artifacts/blender/terramar_recessed/pbr_kit_source/Terra_Mar_PBR_Kit/`. It holds three metallic-roughness
materials, each with basecolor, OpenGL and DirectX normals, roughness, metallic, AO, 16-bit height, a packed ORM and a
`material.json`:

- `01_TERRA_AND_MAR`: the sign's first line as an alpha-masked card (4096 × 512, suggested 3.20 × 0.40 m), bespoke
  upright lettering with subtle wedge serifs in dark patinated metal.
- `02_COASTAL_KITCHEN`: the second line in the same lettering (4096 × 512, suggested 2.10 × 0.2625 m).
- `03_CONTINUOUS_LIMESTONE`: a seamless ivory-beige honed limestone, 4096 × 4096 for a 4 × 4 m repeat, with no
  joints (its README: add stone gaps and edge bevels in geometry; vary the UV region per block).

The README notes that the maps are AI-generated appearance estimates (the lettering is an artistic reconstruction,
not an identified font) and that only one normal convention should be used (+Y for Blender and three.js).

Nothing installs the kit yet. The edit prompts that need it (AI 619 stone cladding, AI 625 sign lettering) have no
stable, provenance-recorded location to point the Terra & Mar edit copy at.

# Request

Install the kit's three materials as project PBR sets, with their provenance recorded, so the Terra & Mar edit copy
can use them through relative paths. Do not change any game behaviour.

Tasks:
- Add an install script to `src/graphics/content3d/buildings/authoring/terramar_recessed/`, following the Bradbury
  precedent (`make_flowers_pbr.py`, as a copy; nothing of the Bradbury's is edited). It installs the three materials
  as `assets/public/pbr/terramar_continuous_limestone/`, `assets/public/pbr/terramar_sign_terra_and_mar/` and
  `assets/public/pbr/terramar_sign_coastal_kitchen/`, in the project's map naming (basecolor, `normal_gl`, `arm`;
  keep the height map). Each set gets a `pbr.material.config.js` matching the existing sets' format and a
  `source.json`: the user-supplied kit, its zip name and md5, the material folder, `material.json`, the "AI-generated
  appearance estimate" note, the date, and an md5 per file.
- Keep the files at full resolution unless the project's texture limits (`npm run test:assets`) require smaller
  copies. If they do, keep the 4096 masters beside the copies and record both.
- **Do not register the sets in the game catalog** (`assets/public/pbr/_catalog_index.js`). That file lives in the
  shared `assets/` junction and another session currently has uncommitted edits in it. Record in the README that
  registering them is a separate step for when the game needs these materials.
- Commit the configs and `source.json` files according to the shared-assets rules in force (memory: PBR configs are
  plain Git on main). If those rules are unclear, ask before committing anything under `assets/`.
- Document the three sets, their working sizes and the conventions (+Y normal, honed-stone displacement of 1.5 mm
  total, sign cards clamped with an alpha cutoff of 0.5) in the authoring README, and point AI 619 and AI 625 at them.

## Context
- The kit is the user's own deliverable for this building. The images remain the target (`b8.png`); the kit's
  maps are appearance estimates matched to b8.
- Nothing of the Bradbury's is edited; no engine code changes.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_buildings_640_MATERIAL_terramar_install_pbr_kit_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Summary (2026-10-13)
- **Install script** `src/graphics/content3d/buildings/authoring/terramar_recessed/make_terramar_kit_pbr.py` (a Terra & Mar copy of the Bradbury's `make_flowers_pbr.py`; nothing of the Bradbury's touched):
  - reads `Terra_Mar_PBR_Kit.zip` from the user's Downloads and verifies its md5 (`cc7c7315fd820fa6b1b5b43e602b9f91`);
  - re-checks the kit: one canvas per set, sign opacity equal to the base colour alpha, ORM equal to the separate AO / roughness / metallic maps, 16-bit height;
  - installs byte-exact copies in the project's naming: `basecolor`, `normal_gl` (from `normal_opengl`), `arm` (from `orm`), `height` (from `height_16bit`), plus the set's `material.json` and the kit's `README.txt`, `validation.json` and `GENERATION_PROMPTS.json`;
  - writes a `pbr.material.config.js` in the existing sets' format (with a provenance block) and a `source.json` (archive name, md5 and bytes, folder, date, an md5 per installed file, the AI-generated appearance-estimate note, conventions).
- **Three sets** in the shared store:
  - `assets/public/pbr/terramar_continuous_limestone/` (4096², 4 × 4 m, stone, building-eligible);
  - `terramar_sign_terra_and_mar/` and `terramar_sign_coastal_kitchen/` (4096 × 512 cards, metal, clamp, cutout at 0.5).
  - Measured: limestone mean RGB (227, 215, 202), roughness 0.73; signs roughness 0.52 / 0.57 and metallic 0.82 / 0.78, matching their `material.json`.
- **Full resolution:** PBR packs are outside the asset suite's size checks and the largest map is 4096, so no reduced copies were made. The asset suite passes (24 pass, 0 fail, 32 skipped review assets).
- **Not registered** in `_catalog_index.js` or `_manifest.json`: both are shared and stayed untouched (md5-verified before and after). Registering is a separate step for when the game needs the materials, as the README records.
- **Committed:** only the three `pbr.material.config.js` files (plain Git, LF; `pbr_config_storage.test.js` passes). Images, docs and `source.json` stay in the gitignored store, the rules in force (no `source.json` is tracked under `assets/public/pbr`).
- **The rebuild uses the sets:**
  - the podium layer's sign materials now load the installed maps;
  - `build.py` saves every image path relative to the file and drops unused images;
  - a Cycles render of `entrance_sign` matches the kit-source render within noise (mean 0.006 levels).
- **Prompts:** the superseded AI 619 and AI 625 pass to AI 648 (pointed at the installed limestone and its conventions) and AI 646 (already using the sign sets).
- **Evidence:** `tests/artifacts/screens/buildings/terramar_recessed/pbr_kit_install/entrance_sign.png`.
