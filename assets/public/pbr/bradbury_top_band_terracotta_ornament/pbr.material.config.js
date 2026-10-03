export default Object.freeze({
    materialId: 'pbr.bradbury_top_band_terracotta_ornament',
    label: 'Bradbury Terracotta Ornament',
    classId: 'stone',
    root: 'wall',
    buildingEligible: true,
    groundEligible: false,
    tileMeters: 1.6,
    mapFiles: Object.freeze({
        baseColor: 'basecolor.jpg',
        normal: 'normal_gl.png',
        orm: 'arm.png'
    }),
    allMapFiles: Object.freeze({
        baseColor: 'assets/public/pbr/bradbury_top_band_terracotta_ornament/basecolor.jpg',
        normal: 'assets/public/pbr/bradbury_top_band_terracotta_ornament/normal_gl.png',
        orm: 'assets/public/pbr/bradbury_top_band_terracotta_ornament/arm.png',
        height: 'assets/public/pbr/bradbury_top_band_terracotta_ornament/height.png',
        variants: Object.freeze({})
    }),
    provenance: Object.freeze({
        schema: 'bus-simulator.pbr-material-provenance',
        version: 1,
        source: Object.freeze({
            asset: 'Bradbury top band terracotta ornament, central relief field only',
            url: null,
            license: 'unspecified; AI-generated output supplied by the project owner',
            archive: 'downloads/bradbury_top_band_terracotta_ornament_PBR.zip'
        }),
        generation: Object.freeze({
            tool: 'ChatGPT (OpenAI)',
            lightingInBaseColor: true,
            prompts: null,
            readme: 'assets/public/pbr/bradbury_top_band_terracotta_ornament/README.txt'
        }),
        importedOn: '2026-09-17'
    }),
    normalization: Object.freeze({
        notes: 'Imported from downloads/bradbury_top_band_terracotta_ornament_PBR.zip (AI-generated image-estimated maps, see README.txt). NOT a seamless repeat: it is the central ornamental field only (moldings excluded), 4 medallion columns x 3 rows on a 4:3 patch, meant for clamped band placement. Installed untrimmed at the native 1448x1086; the strong border values are the field margin, not artifacts. Normal map verified OpenGL +Y against the height map. tileMeters is the HORIZONTAL repeat (1.6 m = 4 columns of 0.4 m); keep the mapped band 4:3, i.e. 1.2 m tall, or the circular medallions go oval.',
        albedoNotes: 'Source PNG re-encoded to JPEG q95 4:4:4 per the catalog format policy. Interior mean RGB (225, 134, 80). Retouched 2026-09-17 (authoring/BradburyBlock, scratchpad retouch_bradbury_pbr.py): per-channel gains move the mean from (224, 133, 80) onto the retouched brick mean times 0.88, about (162, 105, 77): the band in the brick\'s own terracotta tone, a little darker, as the reference photos have it; no clipping. Re-encoded q95 4:4:4. Original kept in downloads/bradbury_top_band_terracotta_ornament_PBR.zip.',
        roughnessIntent: 'Dry unglazed clay, high roughness with darker creases; source spans 23..247/255. Packed into arm.png G, metalness forced to 0.'
    })
});
