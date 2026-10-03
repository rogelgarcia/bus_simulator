export default Object.freeze({
    materialId: 'pbr.seaworn_sandstone_brick',
    label: 'Seaworn Sandstone Brick',
    classId: 'stone',
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
        baseColor: 'assets/public/pbr/seaworn_sandstone_brick/basecolor.jpg',
        normal: 'assets/public/pbr/seaworn_sandstone_brick/normal_gl.png',
        orm: 'assets/public/pbr/seaworn_sandstone_brick/arm.png',
        variants: Object.freeze({
            'seaworn_sandstone_brick_ao_1k': 'assets/public/pbr/seaworn_sandstone_brick/seaworn_sandstone_brick_ao_1k.png',
            'seaworn_sandstone_brick_arm_1k': 'assets/public/pbr/seaworn_sandstone_brick/seaworn_sandstone_brick_arm_1k.png',
            'seaworn_sandstone_brick_diff_1k': 'assets/public/pbr/seaworn_sandstone_brick/seaworn_sandstone_brick_diff_1k.jpg',
            'seaworn_sandstone_brick_disp_1k': 'assets/public/pbr/seaworn_sandstone_brick/seaworn_sandstone_brick_disp_1k.png',
            'seaworn_sandstone_brick_nor_dx_1k': 'assets/public/pbr/seaworn_sandstone_brick/seaworn_sandstone_brick_nor_dx_1k.jpg',
            'seaworn_sandstone_brick_nor_gl_1k': 'assets/public/pbr/seaworn_sandstone_brick/seaworn_sandstone_brick_nor_gl_1k.png',
            'seaworn_sandstone_brick_rough_1k': 'assets/public/pbr/seaworn_sandstone_brick/seaworn_sandstone_brick_rough_1k.png',
        })
    }),
    normalization: Object.freeze({
        notes: '',
        albedoNotes: '',
        roughnessIntent: ''
    })
});

