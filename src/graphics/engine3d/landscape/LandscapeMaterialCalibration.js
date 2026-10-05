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
            sources: 'granites about 0.2-0.35 in the visible (ASTER spectral library, Baldridge et al. 2009); weathering rinds, lichen and biofilm darken exposed coastal outcrops toward 0.15' })
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
