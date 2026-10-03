export default Object.freeze({
    materialId: 'pbr.bronze_anodized_panel',
    label: 'Bronze Anodized Panel',
    classId: 'metal',
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
        baseColor: 'assets/public/pbr/bronze_anodized_panel/basecolor.png',
        normal: 'assets/public/pbr/bronze_anodized_panel/normal_gl.png',
        orm: 'assets/public/pbr/bronze_anodized_panel/arm.png',
        variants: Object.freeze({})
    }),
    normalization: Object.freeze({
        notes: 'Procedurally generated (tools/modern_bank_pbr/run.mjs); neutral calibration pending an AI 312 pass.',
        albedoNotes: '',
        roughnessIntent: ''
    })
});
