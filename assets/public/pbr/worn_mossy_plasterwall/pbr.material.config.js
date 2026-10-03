export default Object.freeze({
    materialId: 'pbr.worn_mossy_plasterwall',
    label: 'Worn Mossy Plasterwall',
    classId: 'plaster_stucco',
    root: 'wall',
    buildingEligible: true,
    groundEligible: false,
    tileMeters: 4.0,
    mapFiles: Object.freeze({
        baseColor: 'basecolor.jpg',
        normal: 'normal_gl.png',
        orm: 'arm.png'
    }),
    allMapFiles: Object.freeze({
        baseColor: 'assets/public/pbr/worn_mossy_plasterwall/basecolor.jpg',
        normal: 'assets/public/pbr/worn_mossy_plasterwall/normal_gl.png',
        orm: 'assets/public/pbr/worn_mossy_plasterwall/arm.png',
        variants: Object.freeze({
            'worn_mossy_plasterwall_ao_1k': 'assets/public/pbr/worn_mossy_plasterwall/worn_mossy_plasterwall_ao_1k.png',
            'worn_mossy_plasterwall_arm_1k': 'assets/public/pbr/worn_mossy_plasterwall/worn_mossy_plasterwall_arm_1k.png',
            'worn_mossy_plasterwall_diff_1k': 'assets/public/pbr/worn_mossy_plasterwall/worn_mossy_plasterwall_diff_1k.jpg',
            'worn_mossy_plasterwall_disp_1k': 'assets/public/pbr/worn_mossy_plasterwall/worn_mossy_plasterwall_disp_1k.png',
            'worn_mossy_plasterwall_nor_dx_1k': 'assets/public/pbr/worn_mossy_plasterwall/worn_mossy_plasterwall_nor_dx_1k.jpg',
            'worn_mossy_plasterwall_nor_gl_1k': 'assets/public/pbr/worn_mossy_plasterwall/worn_mossy_plasterwall_nor_gl_1k.png',
            'worn_mossy_plasterwall_rough_1k': 'assets/public/pbr/worn_mossy_plasterwall/worn_mossy_plasterwall_rough_1k.png',
        })
    }),
    normalization: Object.freeze({
        notes: '',
        albedoNotes: '',
        roughnessIntent: ''
    })
});

