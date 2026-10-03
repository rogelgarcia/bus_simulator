export default Object.freeze({
    materialId: 'pbr.red_sandstone_noise',
    label: 'Red Sandstone Noise',
    classId: 'stone',
    root: 'wall',
    buildingEligible: true,
    groundEligible: false,
    tileMeters: 2,
    mapFiles: Object.freeze({
        baseColor: 'basecolor.png',
        normal: 'normal_gl.png',
        orm: 'arm.png'
    }),
    allMapFiles: Object.freeze({
        baseColor: 'assets/public/pbr/red_sandstone_noise/basecolor.png',
        normal: 'assets/public/pbr/red_sandstone_noise/normal_gl.png',
        orm: 'assets/public/pbr/red_sandstone_noise/arm.png',
        variants: Object.freeze({})
    }),
    normalization: Object.freeze({
        notes: 'Procedurally generated (tools/bradbury_generate_stone_pbr.mjs); neutral calibration pending an AI 312 pass.',
        albedoNotes: '',
        roughnessIntent: ''
    })
});
