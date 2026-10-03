export default Object.freeze({
    materialId: 'pbr.bradbury_flower_tiles',
    label: 'Bradbury Flower Tiles',
    classId: 'stone',
    root: 'wall',
    buildingEligible: true,
    groundEligible: false,
    tileMeters: 1.1,
    mapFiles: Object.freeze({
        baseColor: 'basecolor.jpg',
        normal: 'normal_gl.png',
        orm: 'arm.png'
    }),
    allMapFiles: Object.freeze({
        baseColor: 'assets/public/pbr/bradbury_flower_tiles/basecolor.jpg',
        normal: 'assets/public/pbr/bradbury_flower_tiles/normal_gl.png',
        orm: 'assets/public/pbr/bradbury_flower_tiles/arm.png',
        height: 'assets/public/pbr/bradbury_flower_tiles/height.png',
        variants: Object.freeze({})
    }),
    provenance: Object.freeze({
        schema: 'bus-simulator.pbr-material-provenance',
        version: 1,
        source: Object.freeze({
            asset: 'Bradbury cornice flower frieze: a pair of square floral relief tiles',
            url: null,
            license: 'unspecified; AI-generated output supplied by the project owner',
            archive: 'downloads/flower_tiles_PBR.zip'
        }),
        generation: Object.freeze({
            tool: 'ChatGPT (OpenAI)',
            lightingInBaseColor: false,
            prompts: null,
            readme: 'assets/public/pbr/bradbury_flower_tiles/README.txt'
        }),
        importedOn: '2026-09-19'
    }),
    normalization: Object.freeze({
        notes: 'Imported from downloads/flower_tiles_PBR.zip (AI-generated image-estimated maps, see README.txt). A SEAMLESS 2:1 repeat of two square 1024 px tiles side by side, tiling both ways; opposite edges match exactly on every map. tileMeters is the HORIZONTAL repeat of the whole two-tile image, so a mapped course must be tileMeters / 2 tall or the square tiles go oblong: at the catalog default 1.1 m the tiles are 0.55 m. Installed untrimmed at the native 2048x1024. Normal map verified OpenGL +Y against the delivered 16-bit height by the supplier (zero channel error); the 16-bit height and the previews are left in the archive.',
        albedoNotes: 'Source PNG retinted and re-encoded to JPEG q95 4:4:4 per the catalog format policy. Per-channel gains move the mean from (193, 119, 77) onto the brick mean times 0.88, about (156, 101, 73) -- the tone the band between floors 4 and 5 was put on in 2026-09-17, so the two terracotta friezes of the same building match; no clipping. Original kept in downloads/flower_tiles_PBR.zip.',
        roughnessIntent: 'Dry unglazed clay: the source roughness spans 187..231/255, packed into arm.png G with AO in R and metalness forced to 0.'
    })
});
