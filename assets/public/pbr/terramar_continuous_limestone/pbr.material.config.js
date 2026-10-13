export default Object.freeze({
    materialId: 'pbr.terramar_continuous_limestone',
    label: 'Terra & Mar Continuous Limestone',
    classId: 'stone',
    root: 'wall',
    buildingEligible: true,
    groundEligible: false,
    tileMeters: 4,
    mapFiles: Object.freeze({
        baseColor: 'basecolor.png',
        normal: 'normal_gl.png',
        orm: 'arm.png'
    }),
    allMapFiles: Object.freeze({
        baseColor: 'assets/public/pbr/terramar_continuous_limestone/basecolor.png',
        normal: 'assets/public/pbr/terramar_continuous_limestone/normal_gl.png',
        orm: 'assets/public/pbr/terramar_continuous_limestone/arm.png',
        height: 'assets/public/pbr/terramar_continuous_limestone/height.png',
        variants: Object.freeze({})
    }),
    provenance: Object.freeze({
        schema: 'bus-simulator.pbr-material-provenance',
        version: 1,
        source: Object.freeze({
            asset: 'Continuous ivory-beige honed limestone',
            url: null,
            license: 'unspecified; AI-generated output supplied by the project owner',
            archive: 'Terra_Mar_PBR_Kit.zip (md5 cc7c7315fd820fa6b1b5b43e602b9f91), folder 03_CONTINUOUS_LIMESTONE'
        }),
        generation: Object.freeze({
            tool: 'AI-generated base colour followed by numerically aligned map baking; an appearance estimate, not measured scan data',
            lightingInBaseColor: false,
            prompts: 'assets/public/pbr/terramar_continuous_limestone/GENERATION_PROMPTS.json',
            readme: 'assets/public/pbr/terramar_continuous_limestone/README.txt',
            validation: 'assets/public/pbr/terramar_continuous_limestone/validation.json',
            material: 'assets/public/pbr/terramar_continuous_limestone/material.json'
        }),
        importedOn: '2026-10-13'
    }),
    normalization: Object.freeze({
        notes: 'Installed by src/graphics/content3d/buildings/authoring/terramar_recessed/make_terramar_kit_pbr.py as byte-exact copies of the kit (normal_opengl.png -> normal_gl.png, orm.png -> arm.png, height_16bit.png -> height.png). Normal map OpenGL +Y at strength 1. Seamless in U and V, 4.0 x 4.0 m per repeat (4096 px, 1024 px/m). NO joints, grout or block outlines on purpose: make stone gaps and edge bevels in geometry and give individual blocks different UV regions (or crop all maps by exactly the same rectangle) to hide the repeat. Displacement: start with 1.5 mm total black-to-white and midpoint 0.5 (-0.75 mm bias). Not registered in the game catalog (_catalog_index.js) yet.',
        albedoNotes: 'Ivory-beige honed limestone as delivered: mean RGB (227, 215, 202).',
        roughnessIntent: 'arm.png is the kit\'s ORM unchanged: R AO (restrained micro-occlusion only), G roughness (mean 0.73), B metallic (mean 0.00). Factors stay 1: they multiply the maps.'
    })
});
