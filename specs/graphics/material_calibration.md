# Material calibration and export equivalence

AI 566 owns an offline material audit and versioned candidates for AI 567/562. It does not replace production assets, change the user's settings, or publish bakes. The shared daylight input is the authenticated AI 565 run; the measured transport prerequisites remain AI 564.

## Reference authority

| Reference | Use | Conditions and limitations |
| --- | --- | --- |
| [Cornell optical data](https://bowers.cornell.edu/computer-graphics/data) | Measured reflectance/BRDF methodology and AI 564 spectral fixture provenance | Angular BRDF measurements combine two polarizations; grazing and short-wavelength measurements can be noisy. Automotive paint data omit an ideal mirror coating. These samples do not identify our city assets. Keep downloaded bulk data ignored; no SPDX redistribution license established. |
| [Epic measured material examples](https://dev.epicgames.com/documentation/en-us/unreal-engine/physically-based-materials-in-unreal-engine) | Plausibility anchors: fresh/worn asphalt 0.02/0.08, grass 0.21, fresh concrete 0.51 | Linear diffuse intensities for particular samples. Acquisition uncertainty, moisture, wear and species are not fully specified. No universal texture normalization or asset-matching claim. Reference values only; no third-party textures redistributed. |
| [Filament material definitions](https://google.github.io/filament/main/materials.html) | Linear base color, perceptual roughness, dielectric/metal semantics and Fresnel contract | Model definitions, not measurements of our materials. Renderer BRDF implementations can differ even with equal inputs. Referenced documentation; no material assets copied. |

The analytical neutral card has diffuse reflectance 0.18 in linear Rec.709. Its sRGB code value is about 0.461; an encoded value of 0.18 decodes to about 0.027. Texture statistics must identify whether they describe encoded texels, decoded texels, or the final material response.

## Evidence layers

1. Inventory the actual runtime materials, map encodings, transforms, vertex/instance tints and procedural hooks. GPU-only textures without readable bytes remain explicitly unavailable.
2. Probe final base color, roughness and normals on original mesh geometry after its shader hooks. These are projected samples, not a UV atlas or an exhaustive validation of every texel.
3. Compare explicit neutral GGX swatches and spheres using the game renderer and Cycles, with separate diffuse/specular contributions and source-isolated sun/sky renders. Known BRDF/PMREM differences remain measured discrepancies.
4. Apply candidate export changes only to a copy of the authenticated city scene. Render all five poses in each selected AI 565 daylight condition. Retain original EXRs, installed-bake game screenshots and each candidate iteration.

## Export contract

Base-color and emissive image data are decoded once; normal, roughness, metallic, alpha and AO data remain linear. Roughness is perceptual GGX roughness, not glossiness or its square. Preserve tangent handedness, both signed normal-scale components, UV transforms, vertex/instance colors and material multipliers. A Phong specular color is not automatically equivalent to the tint multiplier of a dielectric GGX lobe.

The identified `AsphaltFineNormal_` generator is a verified exception to the tangent convention: it stores the surface-normal component in green. Candidate revision v2 exchanges green/blue for those source textures only, including road markings that share them. Other normal maps are unaffected. Both native GPU probes and the isolated Blender adapter exercise the correction; it remains an AI 562 production-integration requirement.

Untranslated world-space wear, grass macro variation, normal/bump operations, parallax interiors, shader AO and visibility must be identified per material. Copying texture files is insufficient to prove shader parity. Lighting/AO already represented in the reference transport must not be baked into base color again. Correlation between texture darkness and AO is a diagnostic flag, not proof that an artist baked illumination into a texture.

Opaque source glazing remains opaque unless there is an explicit transmission contract. Cutouts retain their alpha source, threshold and sidedness. Unknown ShaderMaterial surfaces require an adapter or an unsupported result. They must not silently become white or emissive reference surfaces.

The audit separately lists materials combining alpha blending with alpha testing: glTF's single alpha mode cannot preserve that combination automatically. Retaining the imported opacity is not full source-cutout parity. The report also records base-color/AO correlation only when matching readable UV samples exist, with explicit unavailable results for constant, mismatched or unreadable maps.

## Window interior contract

The shared `gray-beige-silhouette-v1` laboratory substitute uses deterministic UV cells, muted gray/beige diffuse colors and darker silhouette rectangles. It is opaque, has zero emission and zero transmission, and retains a modest dielectric specular response. It is a visual substitute for unsupported parallax rooms, not measured glazing or an illuminated interior. AI 562 owns integration with production exporter/window-role metadata; AI 566 exercises the contract on explicit laboratory inputs.

## Candidate and publication policy

Keep verified conversion corrections separate from optional plausible material selections. Preserve bus base colors and original material references, keep paint dielectric and test Glass reflections, Body reflections and Rim shine independently. City-local reflection probes remain AI 551. Direct-light visibility defects go to AI 559/562; roughness changes are not a shadow repair.

The candidate identity includes source material IDs/inputs, textures, profile, export contract, tool scripts, renderer/toolchain and lighting identity. A base-color or visibility change can change bounced light and therefore invalidates affected indirect bakes. Candidate reports are not publication authorization or physical certification.
