// User-supplied dry grass litter, with contour alpha and a repaired truncated ORM.
export default Object.freeze({
    materialId: 'pbr.dry_litter', label: 'Dry Grass Litter', classId: 'ground', root: 'surface',
    buildingEligible: false, groundEligible: true, tileMeters: 0.4,
    preferredVariant: '1k', variants: Object.freeze(['1k']),
    mapFiles: Object.freeze({ baseColor: 'basecolor.png', normal: 'normal_gl.png', orm: 'arm.png' }),
    auxiliaryMapFiles: Object.freeze({ coverage: 'alpha.png', height: 'height.png' }),
    allMapFiles: Object.freeze({
        baseColor: 'assets/public/pbr/dry_litter/basecolor.png',
        normal: 'assets/public/pbr/dry_litter/normal_gl.png',
        orm: 'assets/public/pbr/dry_litter/arm.png', variants: Object.freeze({})
    }),
    normalization: Object.freeze({
        notes: '1K user-supplied maps; ORM truncation repaired (see repair.json). 0.4 m tile size from source metadata.',
        albedoNotes: 'Original sRGB RGBA with strand contours and padded transparent colors.',
        roughnessIntent: '939 original roughness rows in ORM green, 85 reconstructed missing rows; nonmetallic organic litter.'
    }),
    provenance: Object.freeze({
        source: 'User-supplied dry_litter_PBR_1K.zip', resolution: '1k',
        notes: 'Synthetic reference-based material. See SOURCE_README.txt and material_info.json; no measured scan claim.'
    })
});
