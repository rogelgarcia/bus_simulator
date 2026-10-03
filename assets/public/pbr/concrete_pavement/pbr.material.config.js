export default Object.freeze({
    materialId: 'pbr.concrete_pavement',
    label: 'Concrete Pavement',
    classId: 'pavers',
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
        baseColor: 'assets/public/pbr/concrete_pavement/basecolor.jpg',
        normal: 'assets/public/pbr/concrete_pavement/normal_gl.png',
        orm: 'assets/public/pbr/concrete_pavement/arm.png'
    }),
    normalization: Object.freeze({
        notes: '',
        albedoNotes: '',
        roughnessIntent: ''
    })
});
