export default Object.freeze({
    materialId: 'pbr.bradbury_storefront_pillars_taupe',
    label: 'Bradbury Storefront Pillars (taupe)',
    classId: 'stone',
    root: 'wall',
    buildingEligible: true,
    groundEligible: false,
    tileMeters: 1,
    mapFiles: Object.freeze({
        baseColor: 'basecolor.jpg',
        normal: 'normal_gl.png',
        orm: 'arm.png'
    }),
    allMapFiles: Object.freeze({
        baseColor: 'assets/public/pbr/bradbury_storefront_pillars_taupe/basecolor.jpg',
        normal: 'assets/public/pbr/bradbury_storefront_pillars_taupe/normal_gl.png',
        orm: 'assets/public/pbr/bradbury_storefront_pillars_taupe/arm.png',
        height: 'assets/public/pbr/bradbury_storefront_pillars_taupe/height.png',
        variants: Object.freeze({})
    }),
    provenance: Object.freeze({
        schema: 'bus-simulator.pbr-material-provenance',
        version: 1,
        source: Object.freeze({
            asset: 'Bradbury ground floor: storefront pillars, warm taupe mineral finish (one of three coordinated materials)',
            url: null,
            license: 'unspecified; AI-generated output supplied by the project owner',
            archive: 'downloads/Bradbury_Ground_Floor_PBR.zip'
        }),
        generation: Object.freeze({
            tool: 'AI image generation for the albedo (the pack names no tool); response maps synthesized from the same surface, pixel-aligned',
            lightingInBaseColor: false,
            prompts: 'downloads/Bradbury_Ground_Floor_PBR.zip (authoring/prompt_history.json)',
            readme: 'assets/public/pbr/bradbury_storefront_pillars_taupe/README.txt',
            validation: 'assets/public/pbr/bradbury_storefront_pillars_taupe/validation.json'
        }),
        importedOn: '2026-10-08'
    }),
    normalization: Object.freeze({
        notes: 'Made by src/graphics/content3d/buildings/authoring/BradburyBlock/make_ground_floor_pbr.py from downloads/Bradbury_Ground_Floor_PBR.zip (01_Storefront_Pillars_Taupe). Square 1024x1024, repeating both ways, 1 m a tile (the pack\'s suggested coverage). Used on the plain storefront piers between the ground floor\'s doors and windows (fit_piers in assemble_building.py). The importer re-checked the pack: one size for every map, ORM equal to the separate AO / roughness / metallic maps, metalness 0, every border wrapping (worst wrap step 0.00x the grain\'s own). Normal map OpenGL +Y at strength 1; the 16-bit height (midlevel 0.5, full range 0.0006 m) is kept for displacement, not to be added as bump over the normal.',
        albedoNotes: 'Colour as delivered (the pack was coloured for this facade), re-encoded from PNG to JPEG q95 4:4:4 per the catalog format policy. Mean sRGB (161, 140, 124).',
        roughnessIntent: 'Matte unglazed mineral surface: mean roughness 184/255 in arm.png G (the pack\'s own ORM, unchanged), AO in R, metalness 0 in B.'
    })
});
