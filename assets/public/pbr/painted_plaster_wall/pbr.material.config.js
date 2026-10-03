export default Object.freeze({
    materialId: 'pbr.painted_plaster_wall',
    label: 'Painted Plaster Wall',
    classId: 'plaster_stucco',
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
        baseColor: 'assets/public/pbr/painted_plaster_wall/basecolor.jpg',
        normal: 'assets/public/pbr/painted_plaster_wall/normal_gl.png',
        orm: 'assets/public/pbr/painted_plaster_wall/arm.png',
        variants: Object.freeze({
            'painted_plaster_wall_ao_1k': 'assets/public/pbr/painted_plaster_wall/painted_plaster_wall_ao_1k.png',
            'painted_plaster_wall_arm_1k': 'assets/public/pbr/painted_plaster_wall/painted_plaster_wall_arm_1k.png',
            'painted_plaster_wall_diff_1k': 'assets/public/pbr/painted_plaster_wall/painted_plaster_wall_diff_1k.jpg',
            'painted_plaster_wall_disp_1k': 'assets/public/pbr/painted_plaster_wall/painted_plaster_wall_disp_1k.png',
            'painted_plaster_wall_nor_dx_1k': 'assets/public/pbr/painted_plaster_wall/painted_plaster_wall_nor_dx_1k.jpg',
            'painted_plaster_wall_nor_gl_1k': 'assets/public/pbr/painted_plaster_wall/painted_plaster_wall_nor_gl_1k.png',
            'painted_plaster_wall_rough_1k': 'assets/public/pbr/painted_plaster_wall/painted_plaster_wall_rough_1k.png',
        })
    }),
    normalization: Object.freeze({
        notes: '',
        albedoNotes: '',
        roughnessIntent: ''
    })
});

