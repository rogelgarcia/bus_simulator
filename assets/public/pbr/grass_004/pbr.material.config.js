export default Object.freeze({
    materialId: 'pbr.grass_004',
    label: 'Grass 004',
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
        baseColor: 'assets/public/pbr/grass_004/basecolor.png',
        normal: 'assets/public/pbr/grass_004/normal_gl.png',
        ao: 'assets/public/pbr/grass_004/ao.png',
        roughness: 'assets/public/pbr/grass_004/roughness.png',
        displacement: 'assets/public/pbr/grass_004/displacement.png',
        variants: Object.freeze({
            'grass004': 'assets/public/pbr/grass_004/Grass004.png',
            'grass004_1k_png_ambientocclusion': 'assets/public/pbr/grass_004/Grass004_1K-PNG_AmbientOcclusion.png',
            'grass004_1k_png_color': 'assets/public/pbr/grass_004/Grass004_1K-PNG_Color.png',
            'grass004_1k_png_displacement': 'assets/public/pbr/grass_004/Grass004_1K-PNG_Displacement.png',
            'grass004_1k_png_normaldx': 'assets/public/pbr/grass_004/Grass004_1K-PNG_NormalDX.png',
            'grass004_1k_png_normalgl': 'assets/public/pbr/grass_004/Grass004_1K-PNG_NormalGL.png',
            'grass004_1k_png_roughness': 'assets/public/pbr/grass_004/Grass004_1K-PNG_Roughness.png',
        })
    }),
    normalization: Object.freeze({
        notes: '',
        albedoNotes: '',
        roughnessIntent: ''
    })
});

