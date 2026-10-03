export default Object.freeze({
    materialId: 'pbr.rusty_metal_shutter',
    label: 'Rusty Metal Shutter',
    classId: 'metal',
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
        baseColor: 'assets/public/pbr/rusty_metal_shutter/basecolor.jpg',
        normal: 'assets/public/pbr/rusty_metal_shutter/normal_gl.png',
        orm: 'assets/public/pbr/rusty_metal_shutter/arm.png',
        variants: Object.freeze({
            'rusty_metal_shutter_ao_1k': 'assets/public/pbr/rusty_metal_shutter/rusty_metal_shutter_ao_1k.png',
            'rusty_metal_shutter_arm_1k': 'assets/public/pbr/rusty_metal_shutter/rusty_metal_shutter_arm_1k.png',
            'rusty_metal_shutter_diff_1k': 'assets/public/pbr/rusty_metal_shutter/rusty_metal_shutter_diff_1k.jpg',
            'rusty_metal_shutter_disp_1k': 'assets/public/pbr/rusty_metal_shutter/rusty_metal_shutter_disp_1k.png',
            'rusty_metal_shutter_nor_dx_1k': 'assets/public/pbr/rusty_metal_shutter/rusty_metal_shutter_nor_dx_1k.jpg',
            'rusty_metal_shutter_nor_gl_1k': 'assets/public/pbr/rusty_metal_shutter/rusty_metal_shutter_nor_gl_1k.png',
            'rusty_metal_shutter_rough_1k': 'assets/public/pbr/rusty_metal_shutter/rusty_metal_shutter_rough_1k.png',
        })
    }),
    normalization: Object.freeze({
        notes: '',
        albedoNotes: '',
        roughnessIntent: ''
    })
});

