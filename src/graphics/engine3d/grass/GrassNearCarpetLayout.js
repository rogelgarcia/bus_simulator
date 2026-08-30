// Deterministic camera-cell layout contract for bounded near grass carpet patches.
// @ts-check

export const GRASS_NEAR_CARPET_MODE = Object.freeze({
    AUTO: 'auto',
    FORCE: 'force',
    DISABLED: 'disabled'
});

export const GRASS_NEAR_CARPET_DEFAULTS = Object.freeze({
    enabled: false,
    mode: GRASS_NEAR_CARPET_MODE.AUTO,
    seed: 'near-carpet-v1',
    patchSizeMeters: 1.0,
    bladesPerSquareMeter: 48,
    radiusMeters: 12,
    chunkSizeMeters: 16,
    yOffsetMeters: 0.0275,
    patchScaleVariation: 0.04,
    colorBrightnessVariation: 0.08,
    baseColor: '#285F2E',
    tipColor: '#568C44',
    bladeHeightMeters: Object.freeze({ min: 0.025, max: 0.030 }),
    bladeWidthMeters: Object.freeze({ min: 0.0022, max: 0.0032 }),
    bendDegrees: Object.freeze({ min: 3, max: 17 }),
    inclinationDegrees: Object.freeze({ min: 0, max: 8 }),
    roughness: 0.9
});

function clamp(value, min, max, fallback) {
    const number = Number(value);
    return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
}

function sanitizeRange(value, defaults, min, max) {
    const source = value && typeof value === 'object' ? value : {};
    const low = clamp(source.min, min, max, defaults.min);
    return Object.freeze({ min: low, max: Math.max(low, clamp(source.max, min, max, defaults.max)) });
}

function sanitizeColor(value, fallback) {
    const match = String(value ?? '').trim().match(/^#?([0-9a-f]{6})$/i);
    return match ? `#${match[1].toUpperCase()}` : fallback;
}

function sanitizeMode(value) {
    const mode = String(value ?? GRASS_NEAR_CARPET_DEFAULTS.mode);
    return Object.values(GRASS_NEAR_CARPET_MODE).includes(mode) ? mode : GRASS_NEAR_CARPET_DEFAULTS.mode;
}

/** @param {unknown} value @returns {Readonly<object>} */
export function sanitizeGrassNearCarpetConfig(value) {
    const source = value && typeof value === 'object' ? value : {};
    const config = {
        enabled: source.enabled === true,
        mode: sanitizeMode(source.mode),
        seed: String(source.seed ?? GRASS_NEAR_CARPET_DEFAULTS.seed).trim().slice(0, 160) || GRASS_NEAR_CARPET_DEFAULTS.seed,
        patchSizeMeters: clamp(source.patchSizeMeters, 0.5, 2.0, GRASS_NEAR_CARPET_DEFAULTS.patchSizeMeters),
        bladesPerSquareMeter: Math.round(clamp(source.bladesPerSquareMeter, 1, 96, GRASS_NEAR_CARPET_DEFAULTS.bladesPerSquareMeter)),
        radiusMeters: clamp(source.radiusMeters, 2, 64, GRASS_NEAR_CARPET_DEFAULTS.radiusMeters),
        chunkSizeMeters: clamp(source.chunkSizeMeters, 4, 32, GRASS_NEAR_CARPET_DEFAULTS.chunkSizeMeters),
        yOffsetMeters: clamp(source.yOffsetMeters, 0, 0.08, GRASS_NEAR_CARPET_DEFAULTS.yOffsetMeters),
        patchScaleVariation: clamp(source.patchScaleVariation, 0, 0.12, GRASS_NEAR_CARPET_DEFAULTS.patchScaleVariation),
        colorBrightnessVariation: clamp(source.colorBrightnessVariation, 0, 0.25, GRASS_NEAR_CARPET_DEFAULTS.colorBrightnessVariation),
        baseColor: sanitizeColor(source.baseColor, GRASS_NEAR_CARPET_DEFAULTS.baseColor),
        tipColor: sanitizeColor(source.tipColor, GRASS_NEAR_CARPET_DEFAULTS.tipColor),
        bladeHeightMeters: sanitizeRange(source.bladeHeightMeters, GRASS_NEAR_CARPET_DEFAULTS.bladeHeightMeters, 0.015, 0.08),
        bladeWidthMeters: sanitizeRange(source.bladeWidthMeters, GRASS_NEAR_CARPET_DEFAULTS.bladeWidthMeters, 0.0008, 0.01),
        bendDegrees: sanitizeRange(source.bendDegrees, GRASS_NEAR_CARPET_DEFAULTS.bendDegrees, -60, 60),
        inclinationDegrees: sanitizeRange(source.inclinationDegrees, GRASS_NEAR_CARPET_DEFAULTS.inclinationDegrees, -45, 45),
        roughness: clamp(source.roughness, 0.45, 1, GRASS_NEAR_CARPET_DEFAULTS.roughness)
    };
    return Object.freeze(config);
}

/** @param {number} cellX @param {number} cellZ @returns {string} */
export function getGrassNearCarpetCellKey(cellX, cellZ) {
    return `${Math.trunc(cellX)},${Math.trunc(cellZ)}`;
}

/** @param {string} key @returns {{cellX:number, cellZ:number}} */
export function parseGrassNearCarpetCellKey(key) {
    const [rawX, rawZ] = String(key ?? '').split(',');
    const cellX = Number(rawX);
    const cellZ = Number(rawZ);
    if (!Number.isInteger(cellX) || !Number.isInteger(cellZ)) throw new Error(`[GrassNearCarpetLayout] Invalid cell key: ${String(key)}`);
    return { cellX, cellZ };
}

/** @param {Readonly<object>} config @returns {number} */
export function getGrassNearCarpetBladesPerPatch(config) {
    const source = sanitizeGrassNearCarpetConfig(config);
    return Math.max(1, Math.round(source.bladesPerSquareMeter * source.patchSizeMeters * source.patchSizeMeters));
}

/** @param {{cameraX:number,cameraZ:number,config:unknown,terrainBounds:{minX:number,maxX:number,minZ:number,maxZ:number},exclusionRects?:Array<object>}} options @returns {{centerCellX:number,centerCellZ:number,cells:Map<string,Readonly<object>>}} */
export function createGrassNearCarpetCellSet(options) {
    const config = sanitizeGrassNearCarpetConfig(options?.config);
    const cameraX = Number(options?.cameraX);
    const cameraZ = Number(options?.cameraZ);
    if (!Number.isFinite(cameraX) || !Number.isFinite(cameraZ)) throw new Error('[GrassNearCarpetLayout] cameraX/cameraZ must be finite.');
    const bounds = options?.terrainBounds;
    const minX = Number(bounds?.minX);
    const maxX = Number(bounds?.maxX);
    const minZ = Number(bounds?.minZ);
    const maxZ = Number(bounds?.maxZ);
    if (![minX, maxX, minZ, maxZ].every(Number.isFinite) || maxX <= minX || maxZ <= minZ) {
        throw new Error('[GrassNearCarpetLayout] terrainBounds must be finite and ordered.');
    }

    const patchSize = config.patchSizeMeters;
    const centerCellX = Math.floor(cameraX / patchSize);
    const centerCellZ = Math.floor(cameraZ / patchSize);
    const centerX = (centerCellX + 0.5) * patchSize;
    const centerZ = (centerCellZ + 0.5) * patchSize;
    const radius = config.radiusMeters + patchSize * 0.5;
    const cellRadius = Math.ceil(radius / patchSize);
    const radiusSq = radius * radius;
    const exclusionRects = Array.isArray(options?.exclusionRects) ? options.exclusionRects : [];
    const cells = new Map();

    for (let cellZ = centerCellZ - cellRadius; cellZ <= centerCellZ + cellRadius; cellZ++) {
        for (let cellX = centerCellX - cellRadius; cellX <= centerCellX + cellRadius; cellX++) {
            const x = (cellX + 0.5) * patchSize;
            const z = (cellZ + 0.5) * patchSize;
            const dx = x - centerX;
            const dz = z - centerZ;
            if (dx * dx + dz * dz > radiusSq) continue;
            if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
            if (exclusionRects.some((rect) => x >= Number(rect?.x0) && x <= Number(rect?.x1) && z >= Number(rect?.z0) && z <= Number(rect?.z1))) continue;
            const key = getGrassNearCarpetCellKey(cellX, cellZ);
            cells.set(key, Object.freeze({ key, cellX, cellZ, x, z }));
        }
    }
    return { centerCellX, centerCellZ, cells };
}

/** @param {Map<string,Readonly<object>>|null} previous @param {Map<string,Readonly<object>>} next @returns {{entering:Array<Readonly<object>>,leaving:Array<Readonly<object>>,retained:number}} */
export function diffGrassNearCarpetCellSets(previous, next) {
    const before = previous instanceof Map ? previous : new Map();
    if (!(next instanceof Map)) throw new Error('[GrassNearCarpetLayout] next must be a Map.');
    const entering = [];
    const leaving = [];
    let retained = 0;
    for (const [key, cell] of next) {
        if (before.has(key)) retained++;
        else entering.push(cell);
    }
    for (const [key, cell] of before) if (!next.has(key)) leaving.push(cell);
    return { entering, leaving, retained };
}

/** @param {Readonly<object>} cell @param {Readonly<object>} config @returns {string} */
export function getGrassNearCarpetChunkKey(cell, config) {
    const source = sanitizeGrassNearCarpetConfig(config);
    const chunkCells = Math.max(1, Math.round(source.chunkSizeMeters / source.patchSizeMeters));
    return `${Math.floor(Number(cell?.cellX) / chunkCells)},${Math.floor(Number(cell?.cellZ) / chunkCells)}`;
}
