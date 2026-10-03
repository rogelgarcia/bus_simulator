export default Object.freeze({
    materialId: 'pbr.clean_asphalt',
    label: 'Clean Asphalt',
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
        baseColor: 'assets/public/pbr/clean_asphalt/basecolor.jpg',
        normal: 'assets/public/pbr/clean_asphalt/normal_gl.png',
        orm: 'assets/public/pbr/clean_asphalt/arm.png',
        variants: Object.freeze({
            'clean_asphalt_ao_1k': 'assets/public/pbr/clean_asphalt/clean_asphalt_ao_1k.png',
            'clean_asphalt_arm_1k': 'assets/public/pbr/clean_asphalt/clean_asphalt_arm_1k.png',
            'clean_asphalt_diff_1k': 'assets/public/pbr/clean_asphalt/clean_asphalt_diff_1k.jpg',
            'clean_asphalt_disp_1k': 'assets/public/pbr/clean_asphalt/clean_asphalt_disp_1k.png',
            'clean_asphalt_nor_dx_1k': 'assets/public/pbr/clean_asphalt/clean_asphalt_nor_dx_1k.jpg',
            'clean_asphalt_nor_gl_1k': 'assets/public/pbr/clean_asphalt/clean_asphalt_nor_gl_1k.png',
            'clean_asphalt_rough_1k': 'assets/public/pbr/clean_asphalt/clean_asphalt_rough_1k.png',
        })
    }),
    normalization: Object.freeze({
        notes: '',
        albedoNotes: '',
        roughnessIntent: ''
    })
});

