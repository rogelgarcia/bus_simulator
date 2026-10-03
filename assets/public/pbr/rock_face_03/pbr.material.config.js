export default Object.freeze({
    materialId: 'pbr.rock_face_03',
    label: 'Rock Face 03',
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
        baseColor: 'assets/public/pbr/rock_face_03/basecolor.jpg',
        normal: 'assets/public/pbr/rock_face_03/normal_gl.png',
        orm: 'assets/public/pbr/rock_face_03/arm.png',
        variants: Object.freeze({
            'rock_face_03_ao_1k': 'assets/public/pbr/rock_face_03/rock_face_03_ao_1k.png',
            'rock_face_03_arm_1k': 'assets/public/pbr/rock_face_03/rock_face_03_arm_1k.png',
            'rock_face_03_diff_1k': 'assets/public/pbr/rock_face_03/rock_face_03_diff_1k.jpg',
            'rock_face_03_disp_1k': 'assets/public/pbr/rock_face_03/rock_face_03_disp_1k.png',
            'rock_face_03_nor_dx_1k': 'assets/public/pbr/rock_face_03/rock_face_03_nor_dx_1k.jpg',
            'rock_face_03_nor_gl_1k': 'assets/public/pbr/rock_face_03/rock_face_03_nor_gl_1k.png',
            'rock_face_03_rough_1k': 'assets/public/pbr/rock_face_03/rock_face_03_rough_1k.png',
        })
    }),
    normalization: Object.freeze({
        notes: '',
        albedoNotes: '',
        roughnessIntent: ''
    })
});
