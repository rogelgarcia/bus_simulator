export default Object.freeze({
    materialId: 'pbr.leather_white',
    label: 'Leather White',
    classId: 'cloth',
    root: 'wall',
    buildingEligible: true,
    groundEligible: false,
    tileMeters: 1.0,
    mapFiles: Object.freeze({
        baseColor: 'basecolor.jpg',
        normal: 'normal_gl.png',
        orm: 'arm.png'
    }),
    allMapFiles: Object.freeze({
        baseColor: 'assets/public/pbr/leather_white/basecolor.jpg',
        normal: 'assets/public/pbr/leather_white/normal_gl.png',
        orm: 'assets/public/pbr/leather_white/arm.png'
    }),
    normalization: Object.freeze({
        notes: '',
        albedoNotes: '',
        roughnessIntent: ''
    })
});
