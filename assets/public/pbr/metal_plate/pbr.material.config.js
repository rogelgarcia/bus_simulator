export default Object.freeze({
    materialId: 'pbr.metal_plate',
    label: 'Metal Plate',
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
        baseColor: 'assets/public/pbr/metal_plate/basecolor.jpg',
        normal: 'assets/public/pbr/metal_plate/normal_gl.png',
        orm: 'assets/public/pbr/metal_plate/arm.png',
        variants: Object.freeze({
            'metal_plate_ao_1k': 'assets/public/pbr/metal_plate/metal_plate_ao_1k.png',
            'metal_plate_arm_1k': 'assets/public/pbr/metal_plate/metal_plate_arm_1k.png',
            'metal_plate_bump_1k': 'assets/public/pbr/metal_plate/metal_plate_bump_1k.exr',
            'metal_plate_diff_1k': 'assets/public/pbr/metal_plate/metal_plate_diff_1k.jpg',
            'metal_plate_disp_1k': 'assets/public/pbr/metal_plate/metal_plate_disp_1k.png',
            'metal_plate_metal_1k': 'assets/public/pbr/metal_plate/metal_plate_metal_1k.exr',
            'metal_plate_nor_dx_1k': 'assets/public/pbr/metal_plate/metal_plate_nor_dx_1k.jpg',
            'metal_plate_nor_gl_1k': 'assets/public/pbr/metal_plate/metal_plate_nor_gl_1k.png',
            'metal_plate_rough_1k': 'assets/public/pbr/metal_plate/metal_plate_rough_1k.png',
        })
    }),
    normalization: Object.freeze({
        notes: '',
        albedoNotes: '',
        roughnessIntent: ''
    })
});

