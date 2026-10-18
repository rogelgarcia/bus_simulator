export default Object.freeze({
    materialId: 'pbr.terramar_sign_terra_and_mar',
    label: 'Terra & Mar Sign: TERRA & MAR',
    classId: 'metal',
    root: 'wall',
    buildingEligible: false,
    groundEligible: false,
    tileMeters: 3.2,
    mapFiles: Object.freeze({
        baseColor: 'basecolor.png',
        normal: 'normal_gl.png',
        orm: 'arm.png'
    }),
    allMapFiles: Object.freeze({
        baseColor: 'assets/public/pbr/terramar_sign_terra_and_mar/basecolor.png',
        normal: 'assets/public/pbr/terramar_sign_terra_and_mar/normal_gl.png',
        orm: 'assets/public/pbr/terramar_sign_terra_and_mar/arm.png',
        height: 'assets/public/pbr/terramar_sign_terra_and_mar/height.png',
        opacity: 'assets/public/pbr/terramar_sign_terra_and_mar/opacity.png',
        variants: Object.freeze({})
    }),
    provenance: Object.freeze({
        schema: 'bus-simulator.pbr-material-provenance',
        version: 1,
        source: Object.freeze({
            asset: 'TERRA & MAR — bespoke subtle serif, dark patinated metal',
            url: null,
            license: 'unspecified; AI-generated output supplied by the project owner',
            archive: 'Terra_Mar_PBR_Kit.zip (md5 cc7c7315fd820fa6b1b5b43e602b9f91), folder 01_TERRA_AND_MAR'
        }),
        generation: Object.freeze({
            tool: 'AI-generated base colour followed by numerically aligned map baking; an appearance estimate, not measured scan data',
            lightingInBaseColor: false,
            prompts: 'assets/public/pbr/terramar_sign_terra_and_mar/GENERATION_PROMPTS.json',
            readme: 'assets/public/pbr/terramar_sign_terra_and_mar/README.txt',
            validation: 'assets/public/pbr/terramar_sign_terra_and_mar/validation.json',
            material: 'assets/public/pbr/terramar_sign_terra_and_mar/material.json'
        }),
        importedOn: '2026-10-13'
    }),
    normalization: Object.freeze({
        notes: 'Installed by blender/scripts/terramar/building/make_terramar_kit_pbr.py as byte-exact copies of the kit (normal_opengl.png -> normal_gl.png, orm.png -> arm.png, height_16bit.png -> height.png). Normal map OpenGL +Y at strength 1. A SINGLE SIGN LINE, not a repeat: clamp the edges and cut out on the base colour alpha at 0.5 (alphaTest 0.5, transparent false). Card 4096x512 px, glyphs x 135..3959, y 43..468. tileMeters is the kit\'s suggested card width (3.2 x 0.4 m, inferred visually, not surveyed; the Terra & Mar rebuild sizes the letters from b8 instead, authoring/terramar_recessed/rebuild). The normal map holds a shallow face bevel (relief range 2.0 mm), not extruded edges: for close views use letter geometry (rebuild/trace_sign.py) with these maps sampled onto it. Registered in the game catalog by AI 652 Phase 3; original map bytes preserved.',
        albedoNotes: 'Dark patinated metal as delivered, alpha kept (PNG): glyph mean RGB (69, 57, 44).',
        roughnessIntent: 'arm.png is the kit\'s ORM unchanged: R AO (restrained micro-occlusion only), G roughness (mean 0.52), B metallic (mean 0.82). Factors stay 1: they multiply the maps.'
    })
});
