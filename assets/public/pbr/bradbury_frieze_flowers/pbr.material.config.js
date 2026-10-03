export default Object.freeze({
    materialId: 'pbr.bradbury_frieze_flowers',
    label: 'Bradbury Frieze Flowers',
    classId: 'stone',
    root: 'wall',
    buildingEligible: false,
    groundEligible: false,
    tileMeters: 0.849,
    mapFiles: Object.freeze({
        baseColor: 'basecolor.png',
        normal: 'normal_gl.png',
        orm: 'arm.png'
    }),
    allMapFiles: Object.freeze({
        baseColor: 'assets/public/pbr/bradbury_frieze_flowers/basecolor.png',
        normal: 'assets/public/pbr/bradbury_frieze_flowers/normal_gl.png',
        orm: 'assets/public/pbr/bradbury_frieze_flowers/arm.png',
        height: 'assets/public/pbr/bradbury_frieze_flowers/height.png',
        variants: Object.freeze({})
    }),
    provenance: Object.freeze({
        schema: 'bus-simulator.pbr-material-provenance',
        version: 1,
        source: Object.freeze({
            asset: 'Bradbury portal frieze panel: terracotta acanthus scrolls with flowers, a single decal',
            url: null,
            license: 'unspecified; AI-generated output supplied by the project owner',
            archive: 'downloads/flowers_pbr.zip'
        }),
        generation: Object.freeze({
            tool: 'AI image generation (the pack names no tool); all maps computed from one relief master',
            lightingInBaseColor: false,
            prompts: 'assets/public/pbr/bradbury_frieze_flowers/generation_prompt.txt',
            readme: 'assets/public/pbr/bradbury_frieze_flowers/README.md',
            validation: 'assets/public/pbr/bradbury_frieze_flowers/validation.json'
        }),
        importedOn: '2026-09-27'
    }),
    normalization: Object.freeze({
        notes: 'Made by src/graphics/content3d/buildings/authoring/BradburyBlock/make_flowers_pbr.py from downloads/flowers_pbr.zip (every map computed from one grayscale relief master; the importer re-checks the pack\'s validation: one 2048x768 canvas, the opacity equal to the base colour\'s alpha, the ORM equal to the separate AO / roughness / metallic maps). A SINGLE ORNAMENT DECAL, not a repeat: clamp the edges and cut out on the base colour alpha at 0.5. The ornament fills x 39..2006, y 64..709 (aspect 3.05). Used on the portal frieze over each pilaster (pieces/08_frieze.py), as delivered on the left and mirrored horizontally on the right. tileMeters is the whole canvas at the size the frieze uses (0.8158 m of opaque width). Normal map OpenGL +Y at strength 1; the 16-bit height (white = proud, full range 0.08 x the canvas height) is kept for displacement or parallax.',
        albedoNotes: 'Colour as delivered, alpha kept (PNG: the cutout needs it); RGB continues under the transparent texels so a filtered edge does not darken. Ornament interior mean RGB (179, 120, 80), warm terracotta; the portal tints it onto the wall\'s sandstone in its material, as it does the lettering.',
        roughnessIntent: 'Matte, slightly weathered terracotta: roughness about 211/255 on the ornament, arm.png G, with AO in R and metalness 0 in B (the pack\'s own ORM, unchanged).'
    })
});
