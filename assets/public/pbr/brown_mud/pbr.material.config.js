// Poly Haven Brown Mud, fine bare earth for grass studies and ground pickers.
export default Object.freeze({
    materialId: 'pbr.brown_mud',
    label: 'Brown Earth',
    classId: 'ground',
    root: 'surface',
    buildingEligible: false,
    groundEligible: true,
    tileMeters: 1.3,
    preferredVariant: '4k',
    variants: Object.freeze(['4k']),
    mapFiles: Object.freeze({ baseColor: 'basecolor.jpg', normal: 'normal_gl.png', orm: 'arm.png' }),
    allMapFiles: Object.freeze({
        baseColor: 'assets/public/pbr/brown_mud/basecolor.jpg',
        normal: 'assets/public/pbr/brown_mud/normal_gl.png',
        orm: 'assets/public/pbr/brown_mud/arm.png',
        variants: Object.freeze({})
    }),
    normalization: Object.freeze({
        notes: 'Official 4K maps at the measured 1.3 m physical width; no rescaling or recoloring.',
        albedoNotes: 'Original Poly Haven diffuse, sRGB.',
        roughnessIntent: 'Original roughness in the green channel of the packed ARM map.'
    }),
    provenance: Object.freeze({
        source: 'Poly Haven', url: 'https://polyhaven.com/a/brown_mud',
        author: 'Rob Tuytel', license: 'CC0-1.0', licenseUrl: 'https://polyhaven.com/license',
        resolution: '4k'
    })
});
