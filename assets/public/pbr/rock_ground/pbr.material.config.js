export default Object.freeze({
    materialId: 'pbr.rock_ground',
    label: 'Rock Ground',
    classId: 'ground',
    root: 'surface',
    buildingEligible: false,
    groundEligible: true,
    tileMeters: 4.0,
    mapFiles: Object.freeze({
        baseColor: 'basecolor.jpg',
        normal: 'normal_gl.png',
        orm: 'arm.png'
    }),
    allMapFiles: Object.freeze({
        baseColor: 'assets/public/pbr/rock_ground/basecolor.jpg',
        normal: 'assets/public/pbr/rock_ground/normal_gl.png',
        orm: 'assets/public/pbr/rock_ground/arm.png',
        variants: Object.freeze({
            'rock_ground_ao_1k': 'assets/public/pbr/rock_ground/rock_ground_ao_1k.png',
            'rock_ground_arm_1k': 'assets/public/pbr/rock_ground/rock_ground_arm_1k.png',
            'rock_ground_diff_1k': 'assets/public/pbr/rock_ground/rock_ground_diff_1k.jpg',
            'rock_ground_disp_1k': 'assets/public/pbr/rock_ground/rock_ground_disp_1k.png',
            'rock_ground_nor_dx_1k': 'assets/public/pbr/rock_ground/rock_ground_nor_dx_1k.jpg',
            'rock_ground_nor_gl_1k': 'assets/public/pbr/rock_ground/rock_ground_nor_gl_1k.png',
            'rock_ground_rough_1k': 'assets/public/pbr/rock_ground/rock_ground_rough_1k.png',
        })
    }),
    normalization: Object.freeze({
        notes: '',
        albedoNotes: '',
        roughnessIntent: ''
    })
});
