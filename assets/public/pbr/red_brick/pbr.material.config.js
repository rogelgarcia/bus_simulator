export default Object.freeze({
    materialId: 'pbr.red_brick',
    label: 'Red Brick',
    classId: 'brick',
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
        baseColor: 'assets/public/pbr/red_brick/basecolor.jpg',
        normal: 'assets/public/pbr/red_brick/normal_gl.png',
        orm: 'assets/public/pbr/red_brick/arm.png',
        variants: Object.freeze({
            'red_brick_ao_1k': 'assets/public/pbr/red_brick/red_brick_ao_1k.png',
            'red_brick_arm_1k': 'assets/public/pbr/red_brick/red_brick_arm_1k.png',
            'red_brick_diff_1k': 'assets/public/pbr/red_brick/red_brick_diff_1k.jpg',
            'red_brick_disp_1k': 'assets/public/pbr/red_brick/red_brick_disp_1k.png',
            'red_brick_nor_dx_1k': 'assets/public/pbr/red_brick/red_brick_nor_dx_1k.jpg',
            'red_brick_nor_gl_1k': 'assets/public/pbr/red_brick/red_brick_nor_gl_1k.png',
            'red_brick_rough_1k': 'assets/public/pbr/red_brick/red_brick_rough_1k.png',
        })
    }),
    normalization: Object.freeze({
        notes: '',
        albedoNotes: '',
        roughnessIntent: ''
    })
});

