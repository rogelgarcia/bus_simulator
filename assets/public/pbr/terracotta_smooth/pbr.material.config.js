export default Object.freeze({
    materialId: 'pbr.terracotta_smooth',
    label: 'Terracotta Smooth',
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
        baseColor: 'assets/public/pbr/terracotta_smooth/basecolor.png',
        normal: 'assets/public/pbr/terracotta_smooth/normal_gl.png',
        orm: 'assets/public/pbr/terracotta_smooth/arm.png',
        variants: Object.freeze({})
    }),
    normalization: Object.freeze({
        notes: 'Procedurally generated (tools/bradbury_generate_stone_pbr.mjs); neutral calibration pending an AI 312 pass.',
        albedoNotes: '',
        roughnessIntent: ''
    })
});
