// Poly Haven Forest Ground 06, shared by ground material pickers and Grass Debug v2.
export default Object.freeze({
    materialId: 'pbr.forest_ground_06',
    label: 'Forest Ground 06',
    classId: 'ground',
    root: 'surface',
    buildingEligible: false,
    groundEligible: true,
    tileMeters: 2.1,
    preferredVariant: '2k',
    variants: Object.freeze(['2k']),
    mapFiles: Object.freeze({
        baseColor: 'basecolor.jpg',
        normal: 'normal_gl.png',
        orm: 'arm.png'
    }),
    allMapFiles: Object.freeze({
        baseColor: 'assets/public/pbr/forest_ground_06/basecolor.jpg',
        normal: 'assets/public/pbr/forest_ground_06/normal_gl.png',
        orm: 'assets/public/pbr/forest_ground_06/arm.png',
        variants: Object.freeze({})
    }),
    normalization: Object.freeze({
        notes: 'Official 2K maps; physical width 2.1 m. Grass Debug v2 explicitly uses the Planter reference scale of 2.5 m.',
        albedoNotes: 'Unmodified Poly Haven diffuse, sRGB.',
        roughnessIntent: 'Original roughness in the green channel of the packed ARM map.'
    }),
    provenance: Object.freeze({
        source: 'Poly Haven',
        url: 'https://polyhaven.com/a/forest_ground_06',
        author: 'Charlotte Baglioni',
        license: 'CC0-1.0',
        licenseUrl: 'https://polyhaven.com/license',
        resolution: '2k'
    })
});
