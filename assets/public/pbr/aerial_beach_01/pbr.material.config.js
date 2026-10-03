// Registers the retained CC0 beach-sand maps and their original physical scale.
export default Object.freeze({
    materialId: 'pbr.aerial_beach_01',
    label: 'Aerial Beach 01',
    classId: 'ground',
    root: 'surface',
    buildingEligible: false,
    groundEligible: true,
    tileMeters: 30,
    mapFiles: Object.freeze({ baseColor: 'basecolor.jpg', normal: 'normal_gl.png', orm: 'arm.png' }),
    allMapFiles: Object.freeze({
        baseColor: 'assets/public/pbr/aerial_beach_01/basecolor.jpg',
        normal: 'assets/public/pbr/aerial_beach_01/normal_gl.png',
        orm: 'assets/public/pbr/aerial_beach_01/arm.png',
        variants: Object.freeze({})
    }),
    source: Object.freeze({
        provider: 'Poly Haven', author: 'Rob Tuytel', assetId: 'aerial_beach_01',
        assetUrl: 'https://polyhaven.com/a/aerial_beach_01',
        license: 'CC0-1.0', licenseUrl: 'https://polyhaven.com/license',
        downloadedOn: '2026-10-03', resolution: 1024,
        files: Object.freeze([
            Object.freeze({ file: 'basecolor.jpg', byteLength: 115382, sha256: '5b849983d08fda1c6d28b95b55851c2227697598721b25ff2b85e57cf8b04fc4', url: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/aerial_beach_01/aerial_beach_01_diff_1k.jpg' }),
            Object.freeze({ file: 'normal_gl.png', byteLength: 2021795, sha256: '61d8b0051df9c8516555f9eddf1dfbaa57ffee734153da100606db818c82aaca', url: 'https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/aerial_beach_01/aerial_beach_01_nor_gl_1k.png' }),
            Object.freeze({ file: 'arm.png', byteLength: 1549349, sha256: '9f8c87aca06139b0da1cc7a41a7b3d2b03e0db3d6d5a745dc9c5581feccb561c', url: 'https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/aerial_beach_01/aerial_beach_01_arm_1k.png' })
        ])
    }),
    normalization: Object.freeze({
        notes: 'Original 1K maps retained without image edits; 30-meter source width. Runtime near/macro remapping is a visual scale treatment.',
        albedoNotes: 'Neutral fine-grained sand without added vegetation or pavement.',
        roughnessIntent: 'Matte nonmetal sand.'
    })
});
