export default Object.freeze({
    materialId: 'pbr.terlenka',
    label: 'Terlenka',
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
        baseColor: 'assets/public/pbr/terlenka/basecolor.jpg',
        normal: 'assets/public/pbr/terlenka/normal_gl.png',
        orm: 'assets/public/pbr/terlenka/arm.png'
    }),
    normalization: Object.freeze({
        notes: '',
        albedoNotes: '',
        roughnessIntent: ''
    })
});
