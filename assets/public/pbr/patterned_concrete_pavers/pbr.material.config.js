export default Object.freeze({
    materialId: 'pbr.patterned_concrete_pavers',
    label: 'Patterned Concrete Pavers',
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
        baseColor: 'assets/public/pbr/patterned_concrete_pavers/basecolor.jpg',
        normal: 'assets/public/pbr/patterned_concrete_pavers/normal_gl.png',
        orm: 'assets/public/pbr/patterned_concrete_pavers/arm.png',
        variants: Object.freeze({
            'patterned_concrete_pavers_ao_1k': 'assets/public/pbr/patterned_concrete_pavers/patterned_concrete_pavers_ao_1k.png',
            'patterned_concrete_pavers_arm_1k': 'assets/public/pbr/patterned_concrete_pavers/patterned_concrete_pavers_arm_1k.png',
            'patterned_concrete_pavers_diff_1k': 'assets/public/pbr/patterned_concrete_pavers/patterned_concrete_pavers_diff_1k.jpg',
            'patterned_concrete_pavers_disp_1k': 'assets/public/pbr/patterned_concrete_pavers/patterned_concrete_pavers_disp_1k.png',
            'patterned_concrete_pavers_nor_dx_1k': 'assets/public/pbr/patterned_concrete_pavers/patterned_concrete_pavers_nor_dx_1k.jpg',
            'patterned_concrete_pavers_nor_gl_1k': 'assets/public/pbr/patterned_concrete_pavers/patterned_concrete_pavers_nor_gl_1k.png',
            'patterned_concrete_pavers_rough_1k': 'assets/public/pbr/patterned_concrete_pavers/patterned_concrete_pavers_rough_1k.png',
        })
    }),
    normalization: Object.freeze({
        notes: '',
        albedoNotes: '',
        roughnessIntent: ''
    })
});

