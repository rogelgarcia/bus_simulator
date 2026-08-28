# modernBankPbr

Generates the two procedural PBR sets the `modern_bank` catalog building is
made of, matching `downloads/buildings_references/10 front.png`:

- **`pbr.burnt_cement_panel`** — the monumental base. Burnt/scorched cement in
  large SQUARE cast panels (~1.4 m) whose joints live in the normal + AO maps
  rather than in geometry, over a warm grey body blotched with soot.
- **`pbr.bronze_anodized_panel`** — the curtain wall skin behind the glazing.
  Near-black warm bronze with a fine vertical brushed grain. Building wall
  materials render non-metallic and IBL-free, so the set carries its look in
  albedo and micro-normal rather than in reflectivity.

Both are deterministic and tileable at 1024x1024, and each emits
`basecolor.png`, `normal_gl.png`, `arm.png` (AO / roughness / metalness) plus a
`pbr.material.config.js` and a minimal `pbr.material.correction.config.js` so
the async calibration probe stays quiet.

Same encoder and noise kit as `tools/bradbury_generate_stone_pbr.mjs`.

## Run

```bash
node tools/modern_bank_pbr/run.mjs
```

Writes into `assets/public/pbr/<slug>/`. New sets must also be added to
`assets/public/pbr/_catalog_index.js` (already done for these two).
