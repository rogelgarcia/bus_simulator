export default Object.freeze({
    materialId: 'pbr.rocky_terrain_02',
    label: 'Rocky Terrain 02',
    classId: 'ground',
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
        baseColor: 'assets/public/pbr/rocky_terrain_02/basecolor.jpg',
        normal: 'assets/public/pbr/rocky_terrain_02/normal_gl.png',
        orm: 'assets/public/pbr/rocky_terrain_02/arm.png',
        variants: Object.freeze({
            'rocky_terrain_02_ao_1k': 'assets/public/pbr/rocky_terrain_02/rocky_terrain_02_ao_1k.png',
            'rocky_terrain_02_arm_1k': 'assets/public/pbr/rocky_terrain_02/rocky_terrain_02_arm_1k.png',
            'rocky_terrain_02_diff_1k': 'assets/public/pbr/rocky_terrain_02/rocky_terrain_02_diff_1k.jpg',
            'rocky_terrain_02_disp_1k': 'assets/public/pbr/rocky_terrain_02/rocky_terrain_02_disp_1k.png',
            'rocky_terrain_02_mask_1k': 'assets/public/pbr/rocky_terrain_02/rocky_terrain_02_mask_1k.png',
            'rocky_terrain_02_nor_dx_1k': 'assets/public/pbr/rocky_terrain_02/rocky_terrain_02_nor_dx_1k.jpg',
            'rocky_terrain_02_nor_gl_1k': 'assets/public/pbr/rocky_terrain_02/rocky_terrain_02_nor_gl_1k.png',
            'rocky_terrain_02_rough_1k': 'assets/public/pbr/rocky_terrain_02/rocky_terrain_02_rough_1k.png',
        })
    }),
    normalization: Object.freeze({
        notes: '',
        albedoNotes: '',
        roughnessIntent: ''
    })
});

