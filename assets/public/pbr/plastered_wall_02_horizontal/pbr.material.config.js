export default Object.freeze({
    materialId: 'pbr.plastered_wall_02_horizontal',
    label: 'Plastered wall 2 horizontal',
    classId: 'plaster_stucco',
    root: 'wall',
    buildingEligible: false,
    groundEligible: false,
    tileMeters: 4.0,
    mapFiles: Object.freeze({
        baseColor: '../plastered_wall_02/basecolor.jpg',
        normal: '../plastered_wall_02/normal_gl.png',
        orm: '../plastered_wall_02/arm.png'
    }),
    calibration: Object.freeze({
        uvRotationDegrees: 90
    }),
    normalization: Object.freeze({
        notes: '',
        albedoNotes: '',
        roughnessIntent: ''
    })
});
