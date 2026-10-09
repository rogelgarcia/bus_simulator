export default Object.freeze({
    materialId: 'pbr.bradbury_lettering',
    label: 'Bradbury Lettering',
    classId: 'stone',
    root: 'wall',
    buildingEligible: false,
    groundEligible: false,
    tileMeters: 2.77,
    mapFiles: Object.freeze({
        baseColor: 'basecolor.png',
        normal: 'normal_gl.png',
        orm: 'arm.png'
    }),
    allMapFiles: Object.freeze({
        baseColor: 'assets/public/pbr/bradbury_lettering/basecolor.png',
        normal: 'assets/public/pbr/bradbury_lettering/normal_gl.png',
        orm: 'assets/public/pbr/bradbury_lettering/arm.png',
        height: 'assets/public/pbr/bradbury_lettering/height.png',
        variants: Object.freeze({})
    }),
    provenance: Object.freeze({
        schema: 'bus-simulator.pbr-material-provenance',
        version: 1,
        source: Object.freeze({
            asset: 'Bradbury portal inscription "BRADBURY." in terracotta capitals, a single decal',
            url: null,
            license: 'unspecified; AI-generated output supplied by the project owner',
            archive: 'downloads/bradbury_lettering_PBR.zip'
        }),
        generation: Object.freeze({
            tool: 'ChatGPT (OpenAI)',
            lightingInBaseColor: false,
            prompts: 'assets/public/pbr/bradbury_lettering/generation_prompts.json',
            readme: 'assets/public/pbr/bradbury_lettering/README.txt'
        }),
        importedOn: '2026-09-22'
    }),
    normalization: Object.freeze({
        notes: 'Made by src/graphics/content3d/buildings/authoring/BradburyBlock/make_lettering_pbr.py from downloads/bradbury_lettering_PBR.zip (an AI-generated albedo master, the other maps baked numerically from one shared coverage mask and 16-bit height field; see README.txt and alignment_report.json, which describe the pack as delivered). A SINGLE INSCRIPTION DECAL, not a repeat: clamp the edges and cut out on the base colour alpha at 0.5. RESPACED 2026-09-22 (user): each of the nine glyphs, found as its own 8-connected shape in the alpha, moved 20 texels further right than the one before it in every map alike, so each gap opened by 20 texels and the maps stay registered texel for texel; the canvas grew to 2332x724. The letters fill x 43..2260, y 190..498 (aspect 7.18). tileMeters is the whole canvas at the size the portal frieze uses. Normal map OpenGL +Y; the 16-bit height, the DirectX normal, the separate opacity and the preview sheet are left in the archive.',
        albedoNotes: 'Colour as delivered, alpha kept (PNG: the cutout needs it). Letter interior mean RGB (202, 121, 74), warm terracotta; not retinted. The opened gaps carry that mean colour at alpha 0, so a filtered edge does not darken.',
        roughnessIntent: 'Matte unglazed clay: roughness about 212/255 on the letters, packed into arm.png G with AO in R and metalness forced to 0. The data maps drop the shared alpha; outside the letters they hold flat values.'
    })
});
