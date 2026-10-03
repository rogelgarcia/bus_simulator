export default Object.freeze({
    materialId: 'pbr.bradbury_wall_terracotta_brick_tileable',
    label: 'Bradbury Terracotta Brick',
    classId: 'brick',
    root: 'wall',
    buildingEligible: true,
    groundEligible: false,
    tileMeters: 1.26,
    mapFiles: Object.freeze({
        baseColor: 'basecolor.jpg',
        normal: 'normal_gl.png',
        orm: 'arm.png'
    }),
    allMapFiles: Object.freeze({
        baseColor: 'assets/public/pbr/bradbury_wall_terracotta_brick_tileable/basecolor.jpg',
        normal: 'assets/public/pbr/bradbury_wall_terracotta_brick_tileable/normal_gl.png',
        orm: 'assets/public/pbr/bradbury_wall_terracotta_brick_tileable/arm.png',
        height: 'assets/public/pbr/bradbury_wall_terracotta_brick_tileable/height.png',
        variants: Object.freeze({})
    }),
    provenance: Object.freeze({
        schema: 'bus-simulator.pbr-material-provenance',
        version: 1,
        source: Object.freeze({
            asset: 'Bradbury facade terracotta brick, tileable PBR set',
            url: null,
            license: 'unspecified; AI-generated output supplied by the project owner',
            archive: 'downloads/bradbury_wall_terracotta_brick_tileable_PBR.zip'
        }),
        generation: Object.freeze({
            tool: 'ChatGPT (OpenAI)',
            lightingInBaseColor: true,
            prompts: 'assets/public/pbr/bradbury_wall_terracotta_brick_tileable/generation_prompts.json',
            readme: 'assets/public/pbr/bradbury_wall_terracotta_brick_tileable/README.txt'
        }),
        importedOn: '2026-09-17'
    }),
    normalization: Object.freeze({
        notes: 'Imported from downloads/bradbury_wall_terracotta_brick_tileable_PBR.zip (AI-generated image-estimated maps, see README.txt). Tileable H+V, installed verbatim at the native 1254x1254. Do NOT trim the border: the mortar groove straddles the wrap on both axes, so the outer 1-2 lines are the groove, not an edge artifact. Cross-sections match an interior groove (base dips to ~112 at the seam vs ~105 inside; normal R runs 175/185 -> 87/94 across the seam vs 185/184 -> 99/78 inside). Cropping it deletes the brick separator where the tiles meet. Normal map verified OpenGL +Y against the height map. tileMeters set to 1.26 on 2026-09-17 (user: the bricks are 10% smaller than the 1.4 m tile made them). Joints accented 2026-09-17 in all four maps: in a zone 2 px each side of every course groove and joint (plus a half-strength px), height cut to the groove floor minus 10, ORM red (AO) times 0.85 and green (roughness) plus 0.10, and the normal recomputed from the new height there with its strength fitted to the original normal (OpenGL +Y), blended one px wider; all edits periodic, the wrap unchanged. Originals in the source zip.',
        albedoNotes: 'Source PNG re-encoded to JPEG q95 4:4:4 per the catalog format policy. Interior mean RGB (182, 120, 87). Retouched 2026-09-17 (authoring/BradburyBlock, scratchpad retouch_bradbury_pbr.py): every one of the 72 strips tinted by its own random lightness (uniform 0.93..1.07, no tails), warm/cool drift (up to 2% red up / blue down) and saturation (1.0..1.05), so the wall reads as bricks instead of a pattern and no strip stands out; the joints widened 2 px a side (a third at half strength) and painted with the groove colour times 0.82. Height, normal and ORM edited in the same joint zone (see notes). Re-encoded q95 4:4:4. Original kept in downloads/bradbury_wall_terracotta_brick_tileable_PBR.zip.',
        roughnessIntent: 'Matte unglazed strips; source roughness spans 129..192/255. Packed into arm.png G, metalness forced to 0 (terracotta is nonmetallic).'
    })
});
