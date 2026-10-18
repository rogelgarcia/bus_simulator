// Declares the landscape-local calibration of shared PBR materials: albedo gains against physical reference ranges and page mean normal slopes.
// @ts-check
// Design (landscape-material-calibration-v1). The shared material store (assets/public/pbr) is a junction used by the game and other worktrees,
// and its corrections were tuned under the pre-D5 ad-hoc landscape light; this table applies on top of them in the landscape appearance runtime
// only. Albedo: a material whose effective shaded albedo under the calibrated game light (pi·L/E of flat ground at the 45° sun / nadir view
// geometry of reflectance standards, with the D5c material response) lies outside the physical visible-luminance range of its ground type is
// scaled to the middle of that range; materials inside their range keep gain 1. Normal lean: the slope of a periodic height field averages to
// zero over its period, so a page's mean tangent slope is a capture artifact; with D3's per-patch rotations it turns each 1.33 m hexagonal
// patch toward another azimuth and exposes the lattice under a low sun. The mean slope measured on the published 1024 page (within 0.0025,
// 0.14°, on every tier) is subtracted in the page's texture frame before each sample's rotation. Effective albedos and the low-sun rotation
// spread are reproduced by tests/node/unit/landscape_material_calibration.test.js from the published pages.

const entry = (albedoGain, meanNormalSlope, normalSha256, reference) => Object.freeze({ albedoGain, meanNormalSlope: Object.freeze(meanNormalSlope), measuredFrom: Object.freeze({ resolution: 1024, normalSha256 }),
    reference: Object.freeze({ ...reference, range: Object.freeze(reference.range) }) });

export const LANDSCAPE_MATERIAL_CALIBRATION = Object.freeze({
    id: 'landscape-material-calibration-v1',
    effectiveAlbedo: 'pi * L / E of flat ground, sun at 45° zenith, nadir view, D5c response, Rec.709 luminance (the 45/0 geometry of reflectance standards)',
    materials: Object.freeze({
        'pbr.aerial_beach_01': entry(1, [.00191, .00056], '1dc73b5934dd69361333b660216e8c343cb5c046bc2d7f442393ee091d299dbb', {
            label: 'beach sand, dry (sand) and submerged (seabed)', range: [.2, .4],
            sources: 'Oke 1987, Boundary Layer Climates, Table 1.1: dry sand 0.35-0.45, wet sand 0.20-0.30 (broadband); tan quartz-feldspar beach sands are darker in the visible than in the near infrared' }),
        'pbr.landscape_grass_uniform_v1': entry(.71, [-.03159, .02161], '92e6ff51b1fede03a82d5c9fbfdcef5f5db1505f723a4d161533f4618c4b6925', {
            label: 'green short grass, visible luminance', range: [.08, .15],
            sources: 'ColorChecker foliage patch Y = 0.133 (McCamy, Marcus & Davidson 1976); lawn reflectance about 0.05 blue, 0.10-0.15 green, 0.05 red (USGS splib07, Kokaly et al. 2017); Oke 1987 grass 0.16-0.26 is broadband shortwave including the near-infrared plateau' }),
        'pbr.landscape_forest_soil_uniform_v1': entry(1, [-.00329, -.0011], 'd572f3712f14817c3c528b1267a397ca970e6696ce586cc0f39fa8e73ac0c18c', {
            label: 'forest topsoil and humus', range: [.05, .15],
            sources: 'forest A horizons are 10YR 2/1-4/3 (Soil Survey Manual, USDA 2017); Munsell renotation luminance factor Y = 3.1% at value 2, 6.6% at 3, 12.0% at 4, 19.8% at 5 (Newhall, Nickerson & Judd 1943)' }),
        'pbr.landscape_soil_uniform_v1': entry(1, [-.00329, -.0011], 'd572f3712f14817c3c528b1267a397ca970e6696ce586cc0f39fa8e73ac0c18c', {
            label: 'bare mineral soil', range: [.1, .25],
            sources: 'Munsell value 4-5.5 of dry mineral topsoils (Newhall et al. 1943 luminance factors); soil albedo rises about 0.07 per Munsell value step (Post et al. 2000, SSSAJ 64:1027)' }),
        'pbr.landscape_rock_uniform_v1': entry(.68, [-.00001, .00001], '43ab52364a6f7292eef2a627171cbc091b1607ce44c5de7b6138d5abba2c0c78', {
            label: 'weathered granite outcrop', range: [.15, .3],
            sources: 'granites about 0.2-0.35 in the visible (ASTER spectral library, Baldridge et al. 2009); weathering rinds, lichen and biofilm darken exposed coastal outcrops toward 0.15' }),
        // AI 598 D2: the surface model's class materials, measured from the published 1024 pages of the layers companion (coastal v3)
        'pbr.landscape_sandstone_v1': entry(1, [-0.01489, -0.01502], '8fcb33997fd33f3c4deff80bfeffbe59a093fe4b704747d5e0e06b176b06e40b', {
            label: 'pale layered coastal sandstone', range: [0.2, 0.35],
            sources: 'sandstones 0.25-0.4 in the visible (ASTER spectral library, Baldridge et al. 2009); weathered pale coastal beds 0.2-0.35' }),
        'pbr.landscape_caprock_v1': entry(1, [0.15687, 0.15526], '03d29190e686e631fa8d75efde8a38a5b2953b16867cb35acf903549e8859712', {
            label: 'hard iron-stained caprock beds', range: [0.15, 0.28],
            sources: 'ferruginous sandstone and ironstone 0.15-0.3 in the visible (ASTER library); the hard beds read darker than the pale strata they cap' }),
        'pbr.landscape_scree_v1': entry(1.67, [-0.00179, 0.01495], 'c191d67f2e7459f0ce21697bf0cac8eaf637d87d09c3e2608f4535c395296ea9', {
            label: 'talus, scree and gravel', range: [0.15, 0.3],
            sources: 'fresh rock fragments 0.15-0.35 in the visible (ASTER rock spectra); weathered talus toward 0.15' }),
        'pbr.landscape_mud_v1': entry(0.62, [0.0374, -0.00672], '3e09f8eceac7ccf8aa84f5399183537c9d455f30c9e83985ce91fd5d02d5da1b', {
            label: 'moist alluvial silt and mud', range: [0.04, 0.1],
            sources: 'moist 10YR 3/2-4/2 (Soil Survey Manual, USDA 2017); Munsell luminance factor Y 3.1-12% at values 2-4 (Newhall, Nickerson & Judd 1943)' }),
        'pbr.landscape_dune_sand_v1': entry(0.66, [0.0001, -0.00037], '021d0ac5fab17567ed04f036d74481bbcc9e7cfe7525700ec4433d712bc7374d', {
            label: 'dry quartz dune sand', range: [0.25, 0.4],
            sources: 'Oke 1987 dry sand 0.35-0.45 broadband; quartz dune sands 0.25-0.4 in the visible (USGS splib07, Kokaly et al. 2017)' }),
        'pbr.landscape_cobble_v1': entry(1, [0.02085, 0.01786], '5d7e429e13272054418858d56f8a9f6d9ad0927fe73947114e6594969553210f', {
            label: 'pebble and cobble beach', range: [0.12, 0.25],
            sources: 'water-worn mixed-lithology cobbles 0.12-0.25 in the visible (ASTER rock spectra); wet stones at the lower end' }),
        'pbr.landscape_shell_grit_v1': entry(1.52, [0.01445, -0.01013], '7074f1fd9721d3f9bfcf6359f161a0559fa0252c87ed705cb2fce7579f21908d', {
            label: 'shell grit of exposed berms', range: [0.3, 0.45],
            sources: 'calcite shell fragments 0.4-0.6 (USGS splib07 calcite); mixed with sand grains 0.3-0.45' }),
        'pbr.landscape_turf_v1': entry(1, [-0.01189, 0.00684], '8b0208536d9c5f20c7ee6675e76b2a6b9996bf5f5de5379894c5b91d3801dbe0', {
            label: 'turf sward, visible luminance', range: [0.08, 0.15],
            sources: 'ColorChecker foliage patch Y = 0.133 (McCamy, Marcus & Davidson 1976); lawn reflectance 0.10-0.15 green (USGS splib07); Oke 1987 grass 0.16-0.26 is broadband' }),
        'pbr.landscape_dry_grass_v1': entry(0.76, [0.00167, -0.00494], '2d0d3ff06f77bfaf3dfeb3b04855c645109b12bb1c543a81e66979287e80bee0', {
            label: 'senescent dry grass', range: [0.18, 0.3],
            sources: 'Oke 1987 dry grass 0.16-0.26 broadband; senescent canopies 0.2-0.3 in the visible (USGS splib07 dry grass)' }),
        'pbr.landscape_moss_v1': entry(1, [0.00776, -0.00798], '51bfeb4b92037128a0c082c3af71d6d640fd2fa6b3a0943ed71f1e1de6e5454f', {
            label: 'moss cushions', range: [0.06, 0.12],
            sources: 'ColorChecker foliage Y = 0.133 as the upper bound of green vegetation (McCamy et al. 1976); moss carpets 0.05-0.10 in the visible' }),
        'pbr.landscape_broadleaf_litter_v1': entry(1.53, [0.00554, 0.00572], '5a0f77ac06b3c55c1899d25bce58cfd9ee50d82d60c69416ea68006937cdcdf6', {
            label: 'dry deciduous leaf litter', range: [0.1, 0.2],
            sources: 'dry vegetation and leaf litter 0.10-0.20 in the visible (USGS splib07; Asner 1998)' }),
        'pbr.landscape_needle_litter_v1': entry(0.42, [0.10871, 0.11774], '76075cfa9400251ad228beb5b50acc3c14a94b2bd5fcbb661b5837b2b95379f1', {
            label: 'conifer needle litter', range: [0.06, 0.14],
            sources: 'conifer needle litter 0.06-0.14 in the visible (Asner 1998; USGS splib07 dry conifer litter)' }),
        'pbr.landscape_lichen_rock_v1': entry(0.51, [0.00066, -0.00087], 'cb9e1fcb08fb0fbd5b04483a80b5149051cfe4f4cd3842b25bb67462fab351ea', {
            label: 'lichen-crusted stable rock', range: [0.15, 0.3],
            sources: 'crustose lichen crusts 0.15-0.3 in the visible (Bechtel, Rivard & Sanchez-Azofeifa 2002; ASTER rock spectra)' }),
        'pbr.landscape_algae_rock_v1': entry(1, [0.00529, 0.00861], 'e3192bc8745c6dab53e9e3442d12e7b2e1c807397755aada1935ecf260e86006', {
            label: 'wet intertidal rock under a green biofilm', range: [0.03, 0.08],
            sources: 'wet dark rock with a biofilm 0.03-0.08 (Verrucaria black zone, Stephenson & Stephenson 1949/1972; wet-film darkening)' })
    })
});

const finite = value => typeof value === 'number' && Number.isFinite(value);
for (const [materialId, value] of Object.entries(LANDSCAPE_MATERIAL_CALIBRATION.materials)) {
    if (!(finite(value.albedoGain) && value.albedoGain > 0 && value.albedoGain <= 2) || value.meanNormalSlope.length !== 2 || !value.meanNormalSlope.every(slope => finite(slope) && Math.abs(slope) < .2)
        || !(value.reference.range[0] < value.reference.range[1])) throw new Error(`[LandscapeMaterialCalibration] Material ${materialId} needs a gain in (0, 2], two mean slopes below 0.2 and an increasing reference range`);
}

/**
 * Landscape-local calibration of a material; a material without an entry keeps the shared response (gain 1, no de-leaning) and reports it.
 * @param {string} materialId @param {{albedo?:boolean,normalLean?:boolean}} [enabled] per-part switches for A/B evidence
 * @returns {{status:'calibrated'|'uncalibrated',albedoGain:number,meanNormalSlope:number[],applied:{albedo:boolean,normalLean:boolean}}}
 */
export function landscapeMaterialCalibration(materialId, { albedo = true, normalLean = true } = {}) {
    if (typeof materialId !== 'string' || !materialId) throw new Error('[LandscapeMaterialCalibration] A material ID is required');
    if (typeof albedo !== 'boolean' || typeof normalLean !== 'boolean') throw new Error('[LandscapeMaterialCalibration] Calibration switches must be boolean');
    const value = Object.hasOwn(LANDSCAPE_MATERIAL_CALIBRATION.materials, materialId) ? LANDSCAPE_MATERIAL_CALIBRATION.materials[materialId] : null;
    if (!value) return { status: 'uncalibrated', albedoGain: 1, meanNormalSlope: [0, 0], applied: { albedo: false, normalLean: false } };
    return { status: 'calibrated', albedoGain: albedo ? value.albedoGain : 1, meanNormalSlope: normalLean ? [...value.meanNormalSlope] : [0, 0], applied: { albedo, normalLean } };
}
