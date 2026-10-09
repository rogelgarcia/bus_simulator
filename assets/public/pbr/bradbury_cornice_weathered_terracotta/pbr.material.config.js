export default Object.freeze({
    materialId: 'pbr.bradbury_cornice_weathered_terracotta',
    label: 'Bradbury Cornice (weathered terracotta)',
    classId: 'stone',
    root: 'wall',
    buildingEligible: true,
    groundEligible: false,
    tileMeters: 2,
    mapFiles: Object.freeze({
        baseColor: 'basecolor.jpg',
        normal: 'normal_gl.png',
        orm: 'arm.png'
    }),
    allMapFiles: Object.freeze({
        baseColor: 'assets/public/pbr/bradbury_cornice_weathered_terracotta/basecolor.jpg',
        normal: 'assets/public/pbr/bradbury_cornice_weathered_terracotta/normal_gl.png',
        orm: 'assets/public/pbr/bradbury_cornice_weathered_terracotta/arm.png',
        height: 'assets/public/pbr/bradbury_cornice_weathered_terracotta/height.png',
        dirtMask: 'assets/public/pbr/bradbury_cornice_weathered_terracotta/dirt_mask.png',
        variants: Object.freeze({})
    }),
    provenance: Object.freeze({
        schema: 'bus-simulator.pbr-material-provenance',
        version: 1,
        source: Object.freeze({
            asset: 'Bradbury ground floor: cornice underside, terracotta with charcoal-brown soot (one of three coordinated materials)',
            url: null,
            license: 'unspecified; AI-generated output supplied by the project owner',
            archive: 'downloads/Bradbury_Ground_Floor_PBR.zip'
        }),
        generation: Object.freeze({
            tool: 'AI image generation for the albedo (the pack names no tool); response maps synthesized from the same surface, pixel-aligned',
            lightingInBaseColor: false,
            prompts: 'downloads/Bradbury_Ground_Floor_PBR.zip (authoring/prompt_history.json)',
            readme: 'assets/public/pbr/bradbury_cornice_weathered_terracotta/README.txt',
            validation: 'assets/public/pbr/bradbury_cornice_weathered_terracotta/validation.json'
        }),
        importedOn: '2026-10-08'
    }),
    normalization: Object.freeze({
        notes: 'Made by src/graphics/content3d/buildings/authoring/BradburyBlock/make_ground_floor_pbr.py from downloads/Bradbury_Ground_Floor_PBR.zip (03_Cornice_Weathered_Terracotta). A 2048:512 STRIP (2048x512), repeating both ways: tileMeters is its HORIZONTAL repeat, 2 m, so a mapped surface must repeat it every 0.5 m vertically or the grain stretches; lay its long side along the moulding. Used on the ground floor\'s moulding over the storefronts -- entablature, strip, zone, crown, band tops -- and its undersides (PBR_bradbury_ground_stone in assemble_building.py). The importer re-checked the pack: one size for every map, ORM equal to the separate AO / roughness / metallic maps, metalness 0, every border wrapping (worst wrap step 0.00x the grain\'s own). Normal map OpenGL +Y at strength 1; the 16-bit height (midlevel 0.5, full range 0.0006 m) is kept for displacement, not to be added as bump over the normal. dirt_mask.png is the soot pattern already in the colour and roughness, white = soot: a control for reducing it, never to be multiplied in again.',
        albedoNotes: 'Colour as delivered (the pack was coloured for this facade), re-encoded from PNG to JPEG q95 4:4:4 per the catalog format policy. Mean sRGB (158, 120, 97).',
        roughnessIntent: 'Matte unglazed mineral surface: mean roughness 208/255 in arm.png G (the pack\'s own ORM, unchanged), AO in R, metalness 0 in B.'
    })
});
