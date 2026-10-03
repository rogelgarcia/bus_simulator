export default Object.freeze({
    materialId: 'pbr.exterior_wall_cladding',
    label: 'Exterior Wall Cladding',
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
        baseColor: 'assets/public/pbr/exterior_wall_cladding/basecolor.jpg',
        normal: 'assets/public/pbr/exterior_wall_cladding/normal_gl.png',
        orm: 'assets/public/pbr/exterior_wall_cladding/arm.png',
        variants: Object.freeze({
            'exterior_wall_cladding_ao_1k': 'assets/public/pbr/exterior_wall_cladding/exterior_wall_cladding_ao_1k.png',
            'exterior_wall_cladding_arm_1k': 'assets/public/pbr/exterior_wall_cladding/exterior_wall_cladding_arm_1k.png',
            'exterior_wall_cladding_diff_1k': 'assets/public/pbr/exterior_wall_cladding/exterior_wall_cladding_diff_1k.jpg',
            'exterior_wall_cladding_disp_1k': 'assets/public/pbr/exterior_wall_cladding/exterior_wall_cladding_disp_1k.png',
            'exterior_wall_cladding_nor_dx_1k': 'assets/public/pbr/exterior_wall_cladding/exterior_wall_cladding_nor_dx_1k.jpg',
            'exterior_wall_cladding_nor_gl_1k': 'assets/public/pbr/exterior_wall_cladding/exterior_wall_cladding_nor_gl_1k.png',
            'exterior_wall_cladding_rough_1k': 'assets/public/pbr/exterior_wall_cladding/exterior_wall_cladding_rough_1k.png',
        })
    }),
    normalization: Object.freeze({
        notes: '',
        albedoNotes: '',
        roughnessIntent: ''
    })
});

