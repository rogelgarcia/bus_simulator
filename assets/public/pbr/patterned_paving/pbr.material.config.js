export default Object.freeze({
    materialId: 'pbr.patterned_paving',
    label: 'Patterned Paving',
    classId: 'pavers',
    root: 'surface',
    buildingEligible: false,
    groundEligible: false,
    tileMeters: 4.0,
    mapFiles: Object.freeze({
        baseColor: 'basecolor.jpg',
        normal: 'normal_gl.png',
        orm: 'arm.png'
    }),
    allMapFiles: Object.freeze({
        baseColor: 'assets/public/pbr/patterned_paving/basecolor.jpg',
        normal: 'assets/public/pbr/patterned_paving/normal_gl.png',
        orm: 'assets/public/pbr/patterned_paving/arm.png',
        variants: Object.freeze({
            'patterned_paving_ao_1k': 'assets/public/pbr/patterned_paving/patterned_paving_ao_1k.png',
            'patterned_paving_arm_1k': 'assets/public/pbr/patterned_paving/patterned_paving_arm_1k.png',
            'patterned_paving_diff_1k': 'assets/public/pbr/patterned_paving/patterned_paving_diff_1k.jpg',
            'patterned_paving_disp_1k': 'assets/public/pbr/patterned_paving/patterned_paving_disp_1k.png',
            'patterned_paving_nor_dx_1k': 'assets/public/pbr/patterned_paving/patterned_paving_nor_dx_1k.jpg',
            'patterned_paving_nor_gl_1k': 'assets/public/pbr/patterned_paving/patterned_paving_nor_gl_1k.png',
            'patterned_paving_rough_1k': 'assets/public/pbr/patterned_paving/patterned_paving_rough_1k.png',
        })
    }),
    normalization: Object.freeze({
        notes: '',
        albedoNotes: '',
        roughnessIntent: ''
    })
});

