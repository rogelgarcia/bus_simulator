export default Object.freeze({
    materialId: 'pbr.limestone_smooth',
    label: 'Limestone Smooth',
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
        baseColor: 'assets/public/pbr/limestone_smooth/basecolor.png',
        normal: 'assets/public/pbr/limestone_smooth/normal_gl.png',
        orm: 'assets/public/pbr/limestone_smooth/arm.png',
        variants: Object.freeze({})
    }),
    normalization: Object.freeze({
        notes: 'Procedurally generated (tools/ai491_generate_stone_pbr.mjs); neutral calibration pending an AI 312 pass.',
        albedoNotes: '',
        roughnessIntent: ''
    })
});
