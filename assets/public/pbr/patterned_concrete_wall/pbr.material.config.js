export default Object.freeze({
    materialId: 'pbr.patterned_concrete_wall',
    label: 'Patterned Concrete Wall',
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
        baseColor: 'assets/public/pbr/patterned_concrete_wall/basecolor.jpg',
        normal: 'assets/public/pbr/patterned_concrete_wall/normal_gl.png',
        orm: 'assets/public/pbr/patterned_concrete_wall/arm.png',
        variants: Object.freeze({
            'patterned_concrete_wall_ao_1k': 'assets/public/pbr/patterned_concrete_wall/patterned_concrete_wall_ao_1k.png',
            'patterned_concrete_wall_arm_1k': 'assets/public/pbr/patterned_concrete_wall/patterned_concrete_wall_arm_1k.png',
            'patterned_concrete_wall_diff_1k': 'assets/public/pbr/patterned_concrete_wall/patterned_concrete_wall_diff_1k.jpg',
            'patterned_concrete_wall_disp_1k': 'assets/public/pbr/patterned_concrete_wall/patterned_concrete_wall_disp_1k.png',
            'patterned_concrete_wall_nor_dx_1k': 'assets/public/pbr/patterned_concrete_wall/patterned_concrete_wall_nor_dx_1k.jpg',
            'patterned_concrete_wall_nor_gl_1k': 'assets/public/pbr/patterned_concrete_wall/patterned_concrete_wall_nor_gl_1k.png',
            'patterned_concrete_wall_rough_1k': 'assets/public/pbr/patterned_concrete_wall/patterned_concrete_wall_rough_1k.png',
        })
    }),
    normalization: Object.freeze({
        notes: '',
        albedoNotes: '',
        roughnessIntent: ''
    })
});

