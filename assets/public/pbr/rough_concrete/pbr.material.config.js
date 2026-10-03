export default Object.freeze({
    materialId: 'pbr.rough_concrete',
    label: 'Rough Concrete',
    classId: 'concrete',
    root: 'wall',
    buildingEligible: true,
    groundEligible: false,
    tileMeters: 4.0,
    mapFiles: Object.freeze({
        baseColor: 'basecolor.jpg',
        normal: 'normal_gl.png',
        orm: 'arm.png'
    }),
    allMapFiles: Object.freeze({
        baseColor: 'assets/public/pbr/rough_concrete/basecolor.jpg',
        normal: 'assets/public/pbr/rough_concrete/normal_gl.png',
        orm: 'assets/public/pbr/rough_concrete/arm.png',
        variants: Object.freeze({
            'rough_concrete_ao_1k': 'assets/public/pbr/rough_concrete/rough_concrete_ao_1k.png',
            'rough_concrete_arm_1k': 'assets/public/pbr/rough_concrete/rough_concrete_arm_1k.png',
            'rough_concrete_diff_1k': 'assets/public/pbr/rough_concrete/rough_concrete_diff_1k.jpg',
            'rough_concrete_disp_1k': 'assets/public/pbr/rough_concrete/rough_concrete_disp_1k.png',
            'rough_concrete_nor_dx_1k': 'assets/public/pbr/rough_concrete/rough_concrete_nor_dx_1k.jpg',
            'rough_concrete_nor_gl_1k': 'assets/public/pbr/rough_concrete/rough_concrete_nor_gl_1k.png',
            'rough_concrete_rough_1k': 'assets/public/pbr/rough_concrete/rough_concrete_rough_1k.png',
        })
    }),
    normalization: Object.freeze({
        notes: '',
        albedoNotes: '',
        roughnessIntent: ''
    })
});

