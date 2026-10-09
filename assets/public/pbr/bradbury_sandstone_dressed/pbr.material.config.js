export default Object.freeze({
    materialId: 'pbr.bradbury_sandstone_dressed',
    label: 'Bradbury Dressed Sandstone',
    classId: 'stone',
    root: 'wall',
    buildingEligible: true,
    groundEligible: false,
    tileMeters: 2.0,
    mapFiles: Object.freeze({
        baseColor: 'basecolor.jpg',
        normal: 'normal_gl.png',
        orm: 'arm.png'
    }),
    allMapFiles: Object.freeze({
        baseColor: 'assets/public/pbr/bradbury_sandstone_dressed/basecolor.jpg',
        normal: 'assets/public/pbr/bradbury_sandstone_dressed/normal_gl.png',
        orm: 'assets/public/pbr/bradbury_sandstone_dressed/arm.png',
        height: 'assets/public/pbr/bradbury_sandstone_dressed/height.png',
        variants: Object.freeze({})
    }),
    provenance: Object.freeze({
        schema: 'bus-simulator.pbr-material-provenance',
        version: 1,
        source: Object.freeze({
            asset: 'Bradbury dressed sandstone, procedural tileable PBR set',
            url: null,
            license: 'project-generated (procedural, no third-party source)',
            archive: null
        }),
        generation: Object.freeze({
            tool: 'numpy, src/graphics/content3d/buildings/authoring/BradburyBlock/make_sandstone_pbr.py',
            lightingInBaseColor: false,
            prompts: null,
            readme: 'assets/public/pbr/bradbury_sandstone_dressed/README.txt'
        }),
        importedOn: '2026-09-18'
    }),
    normalization: Object.freeze({
        notes: 'Generated 2026-09-18 at 1024x1024 over 2.0 m from periodic FFT noise, so every map wraps on both axes by construction. The height field behind the normal map is undulation 0.3 mm plus grain 0.05 mm with the slopes exaggerated 3x; the specks and pits are sunk in height, occlusion and colour together.',
        albedoNotes: 'A neutral tan, sRGB about (180, 142, 119), meant to be tinted per channel by the consumer onto the stone it stands for (the block\'s ground-floor moulding gains it onto the brick\'s tone); the variation is a +-4% broad cloud, +-3.5% mottle, +-1.4% grain of 1.3 mm, +-0.8% sparkle, iron specks at -12% and a 1.2% warm/cool drift on the clouds. JPEG q95 4:4:4.',
        roughnessIntent: 'Sawn-and-rubbed sandstone: roughness 0.62 with the grain, 0.5..0.8, packed into arm.png G; metalness forced to 0.'
    })
});
