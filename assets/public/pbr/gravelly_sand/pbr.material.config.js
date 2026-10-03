export default Object.freeze({
    materialId: 'pbr.gravelly_sand',
    label: 'Gravelly Sand',
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
        baseColor: 'assets/public/pbr/gravelly_sand/basecolor.jpg',
        normal: 'assets/public/pbr/gravelly_sand/normal_gl.png',
        orm: 'assets/public/pbr/gravelly_sand/arm.png',
        variants: Object.freeze({
            'gravelly_sand_ao_1k': 'assets/public/pbr/gravelly_sand/gravelly_sand_ao_1k.png',
            'gravelly_sand_arm_1k': 'assets/public/pbr/gravelly_sand/gravelly_sand_arm_1k.png',
            'gravelly_sand_diff_1k': 'assets/public/pbr/gravelly_sand/gravelly_sand_diff_1k.jpg',
            'gravelly_sand_disp_1k': 'assets/public/pbr/gravelly_sand/gravelly_sand_disp_1k.png',
            'gravelly_sand_nor_dx_1k': 'assets/public/pbr/gravelly_sand/gravelly_sand_nor_dx_1k.jpg',
            'gravelly_sand_nor_gl_1k': 'assets/public/pbr/gravelly_sand/gravelly_sand_nor_gl_1k.png',
            'gravelly_sand_rough_1k': 'assets/public/pbr/gravelly_sand/gravelly_sand_rough_1k.png',
        })
    }),
    normalization: Object.freeze({
        notes: '',
        albedoNotes: '',
        roughnessIntent: ''
    })
});

