export default Object.freeze({
    materialId: 'pbr.grass_005',
    label: 'Grass 005',
    classId: 'grass',
    root: 'surface',
    buildingEligible: false,
    groundEligible: true,
    tileMeters: 4.0,
    mapFiles: Object.freeze({
        baseColor: 'basecolor.png',
        normal: 'normal_gl.png',
        ao: 'ao.png',
        roughness: 'roughness.png',
        displacement: 'displacement.png'
    }),
    allMapFiles: Object.freeze({
        baseColor: 'assets/public/pbr/grass_005/basecolor.png',
        normal: 'assets/public/pbr/grass_005/normal_gl.png',
        ao: 'assets/public/pbr/grass_005/ao.png',
        roughness: 'assets/public/pbr/grass_005/roughness.png',
        displacement: 'assets/public/pbr/grass_005/displacement.png',
        variants: Object.freeze({
            'grass005': 'assets/public/pbr/grass_005/Grass005.png',
            'grass005_1k_png_ambientocclusion': 'assets/public/pbr/grass_005/Grass005_1K-PNG_AmbientOcclusion.png',
            'grass005_1k_png_color': 'assets/public/pbr/grass_005/Grass005_1K-PNG_Color.png',
            'grass005_1k_png_displacement': 'assets/public/pbr/grass_005/Grass005_1K-PNG_Displacement.png',
            'grass005_1k_png_normaldx': 'assets/public/pbr/grass_005/Grass005_1K-PNG_NormalDX.png',
            'grass005_1k_png_normalgl': 'assets/public/pbr/grass_005/Grass005_1K-PNG_NormalGL.png',
            'grass005_1k_png_roughness': 'assets/public/pbr/grass_005/Grass005_1K-PNG_Roughness.png',
        })
    }),
    normalization: Object.freeze({
        notes: '',
        albedoNotes: '',
        roughnessIntent: ''
    })
});

