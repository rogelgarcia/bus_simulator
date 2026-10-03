export default Object.freeze({
    materialId: 'pbr.asphalt_02',
    label: 'Asphalt 02',
    classId: 'asphalt',
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
        baseColor: 'assets/public/pbr/asphalt_02/basecolor.jpg',
        normal: 'assets/public/pbr/asphalt_02/normal_gl.png',
        orm: 'assets/public/pbr/asphalt_02/arm.png',
        variants: Object.freeze({
            'asphalt_02_ao_1k': 'assets/public/pbr/asphalt_02/asphalt_02_ao_1k.png',
            'asphalt_02_arm_1k': 'assets/public/pbr/asphalt_02/asphalt_02_arm_1k.png',
            'asphalt_02_diff_1k': 'assets/public/pbr/asphalt_02/asphalt_02_diff_1k.jpg',
            'asphalt_02_disp_1k': 'assets/public/pbr/asphalt_02/asphalt_02_disp_1k.png',
            'asphalt_02_nor_dx_1k': 'assets/public/pbr/asphalt_02/asphalt_02_nor_dx_1k.jpg',
            'asphalt_02_nor_gl_1k': 'assets/public/pbr/asphalt_02/asphalt_02_nor_gl_1k.png',
            'asphalt_02_rough_1k': 'assets/public/pbr/asphalt_02/asphalt_02_rough_1k.png',
        })
    }),
    normalization: Object.freeze({
        notes: '',
        albedoNotes: '',
        roughnessIntent: ''
    })
});

