export default Object.freeze({
    materialId: 'pbr.plaster_brick_pattern',
    label: 'Plaster Brick Pattern',
    classId: 'plaster_stucco',
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
        baseColor: 'assets/public/pbr/plaster_brick_pattern/basecolor.jpg',
        normal: 'assets/public/pbr/plaster_brick_pattern/normal_gl.png',
        orm: 'assets/public/pbr/plaster_brick_pattern/arm.png',
        variants: Object.freeze({
            'plaster_brick_pattern_ao_1k': 'assets/public/pbr/plaster_brick_pattern/plaster_brick_pattern_ao_1k.png',
            'plaster_brick_pattern_arm_1k': 'assets/public/pbr/plaster_brick_pattern/plaster_brick_pattern_arm_1k.png',
            'plaster_brick_pattern_diff_1k': 'assets/public/pbr/plaster_brick_pattern/plaster_brick_pattern_diff_1k.jpg',
            'plaster_brick_pattern_disp_1k': 'assets/public/pbr/plaster_brick_pattern/plaster_brick_pattern_disp_1k.png',
            'plaster_brick_pattern_nor_dx_1k': 'assets/public/pbr/plaster_brick_pattern/plaster_brick_pattern_nor_dx_1k.jpg',
            'plaster_brick_pattern_nor_gl_1k': 'assets/public/pbr/plaster_brick_pattern/plaster_brick_pattern_nor_gl_1k.png',
            'plaster_brick_pattern_rough_1k': 'assets/public/pbr/plaster_brick_pattern/plaster_brick_pattern_rough_1k.png',
        })
    }),
    normalization: Object.freeze({
        notes: '',
        albedoNotes: '',
        roughnessIntent: ''
    })
});

