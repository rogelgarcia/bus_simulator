export default Object.freeze({
    materialId: 'pbr.red_sandstone_block',
    label: 'Red Sandstone Block',
    classId: 'stone',
    root: 'wall',
    buildingEligible: true,
    groundEligible: false,
    tileMeters: 3,
    mapFiles: Object.freeze({
        baseColor: 'basecolor.png',
        normal: 'normal_gl.png',
        orm: 'arm.png'
    }),
    allMapFiles: Object.freeze({
        baseColor: 'assets/public/pbr/red_sandstone_block/basecolor.png',
        normal: 'assets/public/pbr/red_sandstone_block/normal_gl.png',
        orm: 'assets/public/pbr/red_sandstone_block/arm.png',
        variants: Object.freeze({})
    }),
    normalization: Object.freeze({
        notes: 'Procedurally generated (tools/bradbury_generate_stone_pbr.mjs); neutral calibration pending an AI 312 pass.',
        albedoNotes: '',
        roughnessIntent: ''
    })
});
