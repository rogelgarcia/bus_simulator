export default Object.freeze({
    materialId: 'pbr.brick_crosswalk',
    label: 'Brick Crosswalk',
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
        baseColor: 'assets/public/pbr/brick_crosswalk/basecolor.jpg',
        normal: 'assets/public/pbr/brick_crosswalk/normal_gl.png',
        orm: 'assets/public/pbr/brick_crosswalk/arm.png',
        variants: Object.freeze({
            'brick_crosswalk_ao_1k': 'assets/public/pbr/brick_crosswalk/brick_crosswalk_ao_1k.png',
            'brick_crosswalk_arm_1k': 'assets/public/pbr/brick_crosswalk/brick_crosswalk_arm_1k.png',
            'brick_crosswalk_diff_1k': 'assets/public/pbr/brick_crosswalk/brick_crosswalk_diff_1k.jpg',
            'brick_crosswalk_disp_1k': 'assets/public/pbr/brick_crosswalk/brick_crosswalk_disp_1k.png',
            'brick_crosswalk_nor_dx_1k': 'assets/public/pbr/brick_crosswalk/brick_crosswalk_nor_dx_1k.jpg',
            'brick_crosswalk_nor_gl_1k': 'assets/public/pbr/brick_crosswalk/brick_crosswalk_nor_gl_1k.png',
            'brick_crosswalk_rough_1k': 'assets/public/pbr/brick_crosswalk/brick_crosswalk_rough_1k.png',
        })
    }),
    normalization: Object.freeze({
        notes: '',
        albedoNotes: '',
        roughnessIntent: ''
    })
});

