export default Object.freeze({
    materialId: 'pbr.painted_brick',
    label: 'Painted Brick',
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
        baseColor: 'assets/public/pbr/painted_brick/basecolor.jpg',
        normal: 'assets/public/pbr/painted_brick/normal_gl.png',
        orm: 'assets/public/pbr/painted_brick/arm.png',
        variants: Object.freeze({
            'painted_brick_ao_1k': 'assets/public/pbr/painted_brick/painted_brick_ao_1k.png',
            'painted_brick_arm_1k': 'assets/public/pbr/painted_brick/painted_brick_arm_1k.png',
            'painted_brick_diff_1k': 'assets/public/pbr/painted_brick/painted_brick_diff_1k.jpg',
            'painted_brick_disp_1k': 'assets/public/pbr/painted_brick/painted_brick_disp_1k.png',
            'painted_brick_nor_dx_1k': 'assets/public/pbr/painted_brick/painted_brick_nor_dx_1k.jpg',
            'painted_brick_nor_gl_1k': 'assets/public/pbr/painted_brick/painted_brick_nor_gl_1k.png',
            'painted_brick_rough_1k': 'assets/public/pbr/painted_brick/painted_brick_rough_1k.png',
        })
    }),
    normalization: Object.freeze({
        notes: '',
        albedoNotes: '',
        roughnessIntent: ''
    })
});

