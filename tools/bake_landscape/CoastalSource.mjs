// Validates the pinned native coastal source and measures its exact bounded overview error.
// @ts-check
import { COASTAL_SOURCE_SHA256, decodeGrayscaleIdsPng } from './CoastalArchive.mjs';

export const COASTAL_GRID = Object.freeze({ columns: 2049, rows: 2049, spacingX: 1.953125, spacingZ: 1.953125, chunkIntervals: 256, maxLevel: 3 });
export const COASTAL_BOUNDS = Object.freeze({ minX: 0, maxX: 4000, minZ: 0, maxZ: 4000 });
export const COASTAL_PREPARATION = Object.freeze({ algorithm: 'coastal-import-v1', overviewStride: 8, chunkIntervals: 256 });
export const COASTAL_CHECKPOINTS = Object.freeze([
    { id: 'northwest', row: 0, column: 0, height: -30 },
    { id: 'northeast', row: 0, column: 2048, height: 14.561012268066406 },
    { id: 'southwest', row: 2048, column: 0, height: -30 },
    { id: 'southeast', row: 2048, column: 2048, height: 16.979928970336914 },
    { id: 'central-low-city', row: 1024, column: 1024, height: 17.86199951171875 },
    { id: 'beach-arrival', row: 1818, column: 604, height: 2.5999999046325684 },
    { id: 'high-city', row: 450, column: 1800, height: 49.02638244628906 }
]);

/** @param {Map<string,Buffer>} files @param {string} name */
function required(files, name) {
    const bytes = files.get(name);
    if (!bytes) throw new Error(`Required coastal source is missing: ${name}`);
    return bytes;
}

/** @param {Map<string,Buffer>} files */
export function inspectCoastalSource(files) {
    const settings = JSON.parse(required(files, 'terrain_settings.json').toString('utf8'));
    const validation = JSON.parse(required(files, 'validation.json').toString('utf8'));
    required(files, 'README.txt');
    const expectedExtent = { x_min: 0, x_max: 4000, z_min: 0, z_max: 4000 };
    if (settings.version !== '2.0' || Object.entries(expectedExtent).some(([key, value]) => settings.extent_m?.[key] !== value)
        || settings.raster?.width !== 2049 || settings.raster?.height !== 2049 || settings.raster?.spacing_m !== 1.953125
        || settings.raster?.row_0 !== 'north / Z=4000' || settings.raster?.column_0 !== 'west / X=0'
        || settings.heightmap?.sea_level_m !== 0 || settings.heightmap?.float_file !== 'height_m_float32_le.raw'
        || settings.water?.surface_elevation_m !== 0 || settings.water?.seabed_in_heightmap !== true
        || validation.resolution?.[0] !== 2049 || validation.resolution?.[1] !== 2049
        || validation.extent_m !== 4000 || validation.spacing_m !== 1.953125) throw new Error('Coastal source metadata differs from the inspected v2 contract');
    const heightBytes = required(files, 'height_m_float32_le.raw');
    if (heightBytes.length !== 2049 * 2049 * 4) throw new Error('Coastal float32 height byte length mismatch');
    const landCover = decodeGrayscaleIdsPng(required(files, 'landcover_ids.png'), { width: 2049, height: 2049 });
    let minHeight = Infinity, maxHeight = -Infinity, negativeSamples = 0, zeroSamples = 0;
    const landCoverCounts = Array(8).fill(0);
    for (let index = 0; index < landCover.length; index++) {
        const height = heightBytes.readFloatLE(index * 4), cover = landCover[index];
        if (!Number.isFinite(height)) throw new Error(`Coastal no-data/non-finite elevation at native sample ${index}`);
        if (cover > 7) throw new Error(`Invalid coastal land-cover class ${cover} at sample ${index}`);
        minHeight = Math.min(minHeight, height); maxHeight = Math.max(maxHeight, height);
        if (height < 0) negativeSamples++;
        if (height === 0) zeroSamples++;
        landCoverCounts[cover]++;
    }
    if (minHeight !== settings.heightmap.actual_min_m || maxHeight !== settings.heightmap.actual_max_m
        || minHeight !== validation.height_min_max_m?.[0] || maxHeight !== validation.height_min_max_m?.[1]
        || minHeight !== -30 || maxHeight > 50 || landCoverCounts.some(count => !count)) throw new Error('Coastal source range or class inventory validation failed');
    const checkpoints = COASTAL_CHECKPOINTS.map(checkpoint => {
        const index = checkpoint.row * 2049 + checkpoint.column;
        const height = heightBytes.readFloatLE(index * 4);
        if (height !== checkpoint.height) throw new Error(`Coastal source checkpoint mismatch: ${checkpoint.id}`);
        return { ...checkpoint, x: checkpoint.column * 1.953125, z: 4000 - checkpoint.row * 1.953125, landCoverId: landCover[index] };
    });
    return { heightBytes, landCover, settings, validation, minHeight, maxHeight, negativeSamples, zeroSamples, landCoverCounts, checkpoints };
}

/** @param {Buffer} heightBytes @param {number} stride */
export function measureCoastalOverviewError(heightBytes, stride) {
    let maximum = 0, squaredSum = 0;
    for (let row = 0; row < 2049; row++) {
        const north = Math.min(Math.floor(row / stride) * stride, 2048 - stride), v = (row - north) / stride;
        for (let column = 0; column < 2049; column++) {
            const west = Math.min(Math.floor(column / stride) * stride, 2048 - stride), u = (column - west) / stride;
            const a = heightBytes.readFloatLE((north * 2049 + west) * 4);
            const b = heightBytes.readFloatLE((north * 2049 + west + stride) * 4);
            const c = heightBytes.readFloatLE(((north + stride) * 2049 + west) * 4);
            const d = heightBytes.readFloatLE(((north + stride) * 2049 + west + stride) * 4);
            const preview = u >= v ? a + (b - a) * u + (d - b) * v : a + (d - c) * u + (c - a) * v;
            const error = Math.abs(preview - heightBytes.readFloatLE((row * 2049 + column) * 4));
            maximum = Math.max(maximum, error); squaredSum += error * error;
        }
    }
    return { maximumMeters: maximum, rootMeanSquareMeters: Math.sqrt(squaredSum / (2049 * 2049)), samplesCompared: 2049 * 2049 };
}

export const COASTAL_PROVENANCE = Object.freeze({
    kind: 'designed-prototype', sourceName: 'coastal_city_terrain_v2.zip', sourceSha256: COASTAL_SOURCE_SHA256,
    nativeResolutionMeters: 1.953125, preparation: COASTAL_PREPARATION,
    rights: { origin: 'user-supplied', license: 'not specified in supplied package' },
    sourceAuthority: 'Designed prototype construction data; not measured survey data',
    coordinateConversion: 'x = column * 4000 / 2048; z = 4000 - row * 4000 / 2048; y = source float32 meters',
    heightEncoding: 'headerless little-endian float32 meters; row-major; no vertical exaggeration',
    categoricalSampling: 'Nearest native ID; no averaging, gamma correction, or color mipmaps',
    water: 'Y=0 is a separate sea-level reference; negative terrain samples remain submerged ground',
    generatorPolicy: 'build_terrain.py is retained verbatim as source reference and is never executed by this importer'
});
