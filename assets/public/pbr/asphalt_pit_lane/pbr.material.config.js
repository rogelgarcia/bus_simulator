export default Object.freeze({
    materialId: 'pbr.asphalt_pit_lane',
    label: 'Asphalt Pit Lane',
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
        baseColor: 'assets/public/pbr/asphalt_pit_lane/basecolor.jpg',
        normal: 'assets/public/pbr/asphalt_pit_lane/normal_gl.png',
        orm: 'assets/public/pbr/asphalt_pit_lane/arm.png',
        variants: Object.freeze({
            'asphalt_pit_lane_ao_1k': 'assets/public/pbr/asphalt_pit_lane/asphalt_pit_lane_ao_1k.png',
            'asphalt_pit_lane_arm_1k': 'assets/public/pbr/asphalt_pit_lane/asphalt_pit_lane_arm_1k.png',
            'asphalt_pit_lane_diff_1k': 'assets/public/pbr/asphalt_pit_lane/asphalt_pit_lane_diff_1k.jpg',
            'asphalt_pit_lane_disp_1k': 'assets/public/pbr/asphalt_pit_lane/asphalt_pit_lane_disp_1k.png',
            'asphalt_pit_lane_nor_dx_1k': 'assets/public/pbr/asphalt_pit_lane/asphalt_pit_lane_nor_dx_1k.jpg',
            'asphalt_pit_lane_nor_gl_1k': 'assets/public/pbr/asphalt_pit_lane/asphalt_pit_lane_nor_gl_1k.png',
            'asphalt_pit_lane_rough_1k': 'assets/public/pbr/asphalt_pit_lane/asphalt_pit_lane_rough_1k.png',
        })
    }),
    normalization: Object.freeze({
        notes: '',
        albedoNotes: '',
        roughnessIntent: ''
    })
});

