export default Object.freeze({
    materialId: 'pbr.asphalt_track',
    label: 'Asphalt Track',
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
        baseColor: 'assets/public/pbr/asphalt_track/basecolor.jpg',
        normal: 'assets/public/pbr/asphalt_track/normal_gl.png',
        orm: 'assets/public/pbr/asphalt_track/arm.png',
        variants: Object.freeze({
            'asphalt_track_ao_1k': 'assets/public/pbr/asphalt_track/asphalt_track_ao_1k.png',
            'asphalt_track_arm_1k': 'assets/public/pbr/asphalt_track/asphalt_track_arm_1k.png',
            'asphalt_track_diff_1k': 'assets/public/pbr/asphalt_track/asphalt_track_diff_1k.jpg',
            'asphalt_track_disp_1k': 'assets/public/pbr/asphalt_track/asphalt_track_disp_1k.png',
            'asphalt_track_nor_dx_1k': 'assets/public/pbr/asphalt_track/asphalt_track_nor_dx_1k.jpg',
            'asphalt_track_nor_gl_1k': 'assets/public/pbr/asphalt_track/asphalt_track_nor_gl_1k.png',
            'asphalt_track_rough_1k': 'assets/public/pbr/asphalt_track/asphalt_track_rough_1k.png',
        })
    }),
    normalization: Object.freeze({
        notes: '',
        albedoNotes: '',
        roughnessIntent: ''
    })
});

