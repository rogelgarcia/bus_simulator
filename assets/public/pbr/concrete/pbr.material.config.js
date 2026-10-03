export default Object.freeze({
    materialId: 'pbr.concrete',
    label: 'Concrete',
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
        baseColor: 'assets/public/pbr/concrete/basecolor.jpg',
        normal: 'assets/public/pbr/concrete/normal_gl.png',
        orm: 'assets/public/pbr/concrete/arm.png',
        variants: Object.freeze({
            'concrete_ao_1k': 'assets/public/pbr/concrete/concrete_ao_1k.png',
            'concrete_arm_1k': 'assets/public/pbr/concrete/concrete_arm_1k.png',
            'concrete_bump_1k': 'assets/public/pbr/concrete/concrete_bump_1k.exr',
            'concrete_diff_1k': 'assets/public/pbr/concrete/concrete_diff_1k.jpg',
            'concrete_disp_1k': 'assets/public/pbr/concrete/concrete_disp_1k.png',
            'concrete_nor_dx_1k': 'assets/public/pbr/concrete/concrete_nor_dx_1k.jpg',
            'concrete_nor_gl_1k': 'assets/public/pbr/concrete/concrete_nor_gl_1k.png',
            'concrete_rough_1k': 'assets/public/pbr/concrete/concrete_rough_1k.png',
        })
    }),
    normalization: Object.freeze({
        notes: '',
        albedoNotes: '',
        roughnessIntent: ''
    })
});

