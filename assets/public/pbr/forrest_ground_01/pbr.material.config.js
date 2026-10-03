export default Object.freeze({
    materialId: 'pbr.forrest_ground_01',
    label: 'Forest Ground 01',
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
        baseColor: 'assets/public/pbr/forrest_ground_01/basecolor.jpg',
        normal: 'assets/public/pbr/forrest_ground_01/normal_gl.png',
        orm: 'assets/public/pbr/forrest_ground_01/arm.png',
        variants: Object.freeze({
            'forrest_ground_01_ao_1k': 'assets/public/pbr/forrest_ground_01/forrest_ground_01_ao_1k.png',
            'forrest_ground_01_arm_1k': 'assets/public/pbr/forrest_ground_01/forrest_ground_01_arm_1k.png',
            'forrest_ground_01_diff_1k': 'assets/public/pbr/forrest_ground_01/forrest_ground_01_diff_1k.jpg',
            'forrest_ground_01_disp_1k': 'assets/public/pbr/forrest_ground_01/forrest_ground_01_disp_1k.png',
            'forrest_ground_01_nor_dx_1k': 'assets/public/pbr/forrest_ground_01/forrest_ground_01_nor_dx_1k.jpg',
            'forrest_ground_01_nor_gl_1k': 'assets/public/pbr/forrest_ground_01/forrest_ground_01_nor_gl_1k.png',
            'forrest_ground_01_rough_1k': 'assets/public/pbr/forrest_ground_01/forrest_ground_01_rough_1k.png',
        })
    }),
    normalization: Object.freeze({
        notes: '',
        albedoNotes: '',
        roughnessIntent: ''
    })
});

