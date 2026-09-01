// Defines the pure, inactive V2 block-affine world-Y depth representation.
// @ts-check

import {ILLUMINATION_MAX_PACKAGE_BYTES} from '../package/IlluminationPackageConstants.js';

export const STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_ENCODING_ID =
    'rg8-block-affine-world-y-v2';
export const STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_PARTITION_SCHEMA =
    'static-sun-depth-block-affine-world-y-partition-v2';
export const STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_RANGE_SCHEMA =
    'static-sun-depth-block-affine-world-y-range-v2';
export const STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_BLOCK_TEXELS = 32;
export const STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_DEPTH_BYTES_PER_TEXEL = 2;
export const STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_RANGE_BYTES_PER_BLOCK = 8;
export const STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_MAX_QUANTIZED = 65534;
export const STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_EMPTY_QUANTIZED = 65535;

const CREATED_PARTITIONS = new WeakSet();
const CREATED_RANGES = new WeakSet();
const CREATED_TRANSFORMS = new WeakSet();
const FLOAT32_BITS_BUFFER = new ArrayBuffer(4);
const FLOAT32_BITS_FLOAT = new Float32Array(FLOAT32_BITS_BUFFER);
const FLOAT32_BITS_UINT = new Uint32Array(FLOAT32_BITS_BUFFER);

/**
 * @typedef {{
 *   interiorTexels: readonly [number, number],
 *   tileCount: readonly [number, number],
 *   guardTexels: number,
 *   maximumPackageBytes?: number,
 *   packageOverheadBytes?: number
 * }} StaticSunDepthBlockAffineWorldYV2PartitionOptions
 */

/**
 * @typedef {Readonly<{
 *   schema: string,
 *   encodingId: string,
 *   blockTexels: readonly [number, number],
 *   interiorTexels: readonly [number, number],
 *   storedTexels: readonly [number, number],
 *   tileCount: readonly [number, number],
 *   blocksPerTile: readonly [number, number],
 *   guardTexels: number,
 *   layerCount: number,
 *   blockCountPerLayer: number,
 *   blockCount: number,
 *   depthLayerByteLength: number,
 *   depthPayloadByteLength: number,
 *   rangeLayerByteLength: number,
 *   rangePayloadByteLength: number,
 *   payloadByteLength: number,
 *   packageOverheadBytes: number,
 *   projectedPackageByteLength: number,
 *   maximumPackageBytes: number,
 *   packageHeadroomBytes: number,
 *   fitsMaximumPackageBytes: boolean
 * }>} StaticSunDepthBlockAffineWorldYV2Partition
 */

/**
 * @typedef {Readonly<{
 *   schema: string,
 *   minWorldY: number,
 *   maxWorldY: number
 * }>} StaticSunDepthBlockAffineWorldYV2Range
 */

/**
 * @typedef {Readonly<{
 *   originWorldY: number,
 *   rightAxisWorldY: number,
 *   upAxisWorldY: number,
 *   depthAxisWorldY: number
 * }>} StaticSunDepthBlockAffineWorldYV2Transform
 */

/**
 * Creates the deterministic row-major 32x32-per-tile partition and its exact
 * depth, metadata, and projected package byte counts.
 *
 * @param {StaticSunDepthBlockAffineWorldYV2PartitionOptions} options
 * @returns {StaticSunDepthBlockAffineWorldYV2Partition}
 */
export function createStaticSunDepthBlockAffineWorldYV2Partition(options) {
    const source = requireRecord(options, 'partition options');
    requireExactKeys(
        source,
        [
            'guardTexels',
            'interiorTexels',
            'maximumPackageBytes',
            'packageOverheadBytes',
            'tileCount'
        ],
        ['maximumPackageBytes', 'packageOverheadBytes'],
        'partition options'
    );
    const interiorTexels = requirePositiveIntegerPair(source.interiorTexels, 'interiorTexels');
    const tileCount = requirePositiveIntegerPair(source.tileCount, 'tileCount');
    const guardTexels = requireNonNegativeSafeInteger(source.guardTexels, 'guardTexels');
    const maximumPackageBytes = source.maximumPackageBytes === undefined
        ? ILLUMINATION_MAX_PACKAGE_BYTES
        : requirePositiveSafeInteger(source.maximumPackageBytes, 'maximumPackageBytes');
    if (maximumPackageBytes > ILLUMINATION_MAX_PACKAGE_BYTES) {
        throw new RangeError(
            `maximumPackageBytes cannot exceed ${ILLUMINATION_MAX_PACKAGE_BYTES}`
        );
    }
    const packageOverheadBytes = source.packageOverheadBytes === undefined
        ? 0
        : requireNonNegativeSafeInteger(source.packageOverheadBytes, 'packageOverheadBytes');
    const storedTexels = /** @type {const} */ ([
        safeAdd(interiorTexels[0], safeMultiply(guardTexels, 2, 'stored width'), 'stored width'),
        safeAdd(interiorTexels[1], safeMultiply(guardTexels, 2, 'stored height'), 'stored height')
    ]);
    const blocksPerTile = /** @type {const} */ ([
        Math.ceil(interiorTexels[0] / STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_BLOCK_TEXELS),
        Math.ceil(interiorTexels[1] / STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_BLOCK_TEXELS)
    ]);
    const layerCount = safeMultiply(tileCount[0], tileCount[1], 'layer count');
    const blockCountPerLayer = safeMultiply(
        blocksPerTile[0],
        blocksPerTile[1],
        'block count per layer'
    );
    const blockCount = safeMultiply(blockCountPerLayer, layerCount, 'block count');
    const storedTexelCountPerLayer = safeMultiply(
        storedTexels[0],
        storedTexels[1],
        'stored texels per layer'
    );
    const depthLayerByteLength = safeMultiply(
        storedTexelCountPerLayer,
        STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_DEPTH_BYTES_PER_TEXEL,
        'depth bytes per layer'
    );
    const depthPayloadByteLength = safeMultiply(
        depthLayerByteLength,
        layerCount,
        'depth payload bytes'
    );
    const rangeLayerByteLength = safeMultiply(
        blockCountPerLayer,
        STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_RANGE_BYTES_PER_BLOCK,
        'range bytes per layer'
    );
    const rangePayloadByteLength = safeMultiply(
        rangeLayerByteLength,
        layerCount,
        'range payload bytes'
    );
    const payloadByteLength = safeAdd(
        depthPayloadByteLength,
        rangePayloadByteLength,
        'V2 payload bytes'
    );
    const projectedPackageByteLength = safeAdd(
        payloadByteLength,
        packageOverheadBytes,
        'projected package bytes'
    );
    const fitsMaximumPackageBytes = projectedPackageByteLength <= maximumPackageBytes;
    const partition = {
        schema: STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_PARTITION_SCHEMA,
        encodingId: STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_ENCODING_ID,
        blockTexels: Object.freeze(/** @type {const} */ ([32, 32])),
        interiorTexels: Object.freeze([...interiorTexels]),
        storedTexels: Object.freeze([...storedTexels]),
        tileCount: Object.freeze([...tileCount]),
        blocksPerTile: Object.freeze([...blocksPerTile]),
        guardTexels,
        layerCount,
        blockCountPerLayer,
        blockCount,
        depthLayerByteLength,
        depthPayloadByteLength,
        rangeLayerByteLength,
        rangePayloadByteLength,
        payloadByteLength,
        packageOverheadBytes,
        projectedPackageByteLength,
        maximumPackageBytes,
        packageHeadroomBytes: maximumPackageBytes - projectedPackageByteLength,
        fitsMaximumPackageBytes
    };
    CREATED_PARTITIONS.add(partition);
    return Object.freeze(partition);
}

/**
 * @param {StaticSunDepthBlockAffineWorldYV2Partition} partition
 * @returns {StaticSunDepthBlockAffineWorldYV2Partition}
 */
export function assertStaticSunDepthBlockAffineWorldYV2PackageFits(partition) {
    requireCreatedPartition(partition);
    if (!partition.fitsMaximumPackageBytes) {
        throw new RangeError(
            `V2 projected package byte length ${partition.projectedPackageByteLength}`
            + ` exceeds ${partition.maximumPackageBytes}`
        );
    }
    return partition;
}

/**
 * @param {StaticSunDepthBlockAffineWorldYV2Partition} partition
 * @param {readonly [number, number]} tileCoordinates
 * @param {readonly [number, number]} localTexel
 */
export function locateStaticSunDepthBlockAffineWorldYV2(
    partition,
    tileCoordinates,
    localTexel
) {
    requireCreatedPartition(partition);
    const tile = requireIntegerCoordinatePair(
        tileCoordinates,
        partition.tileCount,
        'tileCoordinates'
    );
    const local = requireIntegerCoordinatePair(
        localTexel,
        partition.interiorTexels,
        'localTexel'
    );
    return locateBlockUnchecked(partition, tile, local);
}

/**
 * @param {StaticSunDepthBlockAffineWorldYV2Partition} partition
 * @param {readonly [number, number]} globalTexel
 */
export function locateGlobalStaticSunDepthBlockAffineWorldYV2(partition, globalTexel) {
    requireCreatedPartition(partition);
    const globalSize = /** @type {const} */ ([
        safeMultiply(partition.interiorTexels[0], partition.tileCount[0], 'global width'),
        safeMultiply(partition.interiorTexels[1], partition.tileCount[1], 'global height')
    ]);
    const global = requireIntegerCoordinatePair(globalTexel, globalSize, 'globalTexel');
    return locateGlobalBlockUnchecked(partition, global);
}

/**
 * Resolves a physical guard texel to the logical source interior texel and,
 * critically, the source block whose range owns the copied RG8 code.
 *
 * @param {StaticSunDepthBlockAffineWorldYV2Partition} partition
 * @param {readonly [number, number]} tileCoordinates
 * @param {readonly [number, number]} storedTexel
 */
export function resolveStaticSunDepthBlockAffineWorldYV2GuardProvenance(
    partition,
    tileCoordinates,
    storedTexel
) {
    requireCreatedPartition(partition);
    const tile = requireIntegerCoordinatePair(
        tileCoordinates,
        partition.tileCount,
        'tileCoordinates'
    );
    const stored = requireIntegerCoordinatePair(
        storedTexel,
        partition.storedTexels,
        'storedTexel'
    );
    const logicalGlobal = /** @type {const} */ ([
        tile[0] * partition.interiorTexels[0] + stored[0] - partition.guardTexels,
        tile[1] * partition.interiorTexels[1] + stored[1] - partition.guardTexels
    ]);
    const globalSize = /** @type {const} */ ([
        partition.interiorTexels[0] * partition.tileCount[0],
        partition.interiorTexels[1] * partition.tileCount[1]
    ]);
    const sourceGlobal = /** @type {const} */ ([
        clampInteger(logicalGlobal[0], 0, globalSize[0] - 1),
        clampInteger(logicalGlobal[1], 0, globalSize[1] - 1)
    ]);
    const isGuard = stored[0] < partition.guardTexels
        || stored[1] < partition.guardTexels
        || stored[0] >= partition.guardTexels + partition.interiorTexels[0]
        || stored[1] >= partition.guardTexels + partition.interiorTexels[1];
    const exteriorClamped = sourceGlobal[0] !== logicalGlobal[0]
        || sourceGlobal[1] !== logicalGlobal[1];
    const source = locateGlobalBlockUnchecked(partition, sourceGlobal);
    return Object.freeze({
        kind: isGuard
            ? (exteriorClamped ? 'exterior_clamp' : 'adjacent_copy')
            : 'interior',
        isGuard,
        exteriorClamped,
        tileCoordinates: Object.freeze([...tile]),
        storedTexel: Object.freeze([...stored]),
        logicalGlobalTexel: Object.freeze([...logicalGlobal]),
        sourceGlobalTexel: source.globalTexel,
        sourceTileCoordinates: source.tileCoordinates,
        sourceLocalTexel: source.localTexel,
        sourceLayer: source.layer,
        sourceBlockCoordinates: source.blockCoordinates,
        sourceBlockIndexInLayer: source.blockIndexInLayer,
        sourceMetadataIndex: source.metadataIndex,
        sourceMetadataByteOffset: source.metadataByteOffset
    });
}

/**
 * @param {Iterable<number | null>} worldYValues
 * @returns {StaticSunDepthBlockAffineWorldYV2Range}
 */
export function createStaticSunDepthBlockAffineWorldYV2Range(worldYValues) {
    if (!worldYValues
        || typeof worldYValues === 'string'
        || typeof worldYValues[Symbol.iterator] !== 'function') {
        throw new TypeError('worldYValues must be an iterable of finite numbers or null');
    }
    let minimum = Infinity;
    let maximum = -Infinity;
    for (const value of worldYValues) {
        if (value === null) continue;
        const finite = requireFiniteNumber(value, 'occupied worldY value');
        minimum = Math.min(minimum, finite);
        maximum = Math.max(maximum, finite);
    }
    if (minimum === Infinity) return createRange(Infinity, -Infinity);
    return createRange(
        roundStaticSunDepthWorldYDownToFloat32V2(minimum),
        roundStaticSunDepthWorldYUpToFloat32V2(maximum)
    );
}

/** @param {number} value */
export function roundStaticSunDepthWorldYDownToFloat32V2(value) {
    const finite = requireFiniteNumber(value, 'value');
    const rounded = Math.fround(finite === 0 ? 0 : finite);
    if (!Number.isFinite(rounded)) throw new RangeError('value has no finite float32 lower bound');
    if (rounded <= finite) return rounded === 0 ? 0 : rounded;
    const lower = nextFloat32Down(rounded);
    if (!Number.isFinite(lower)) throw new RangeError('value has no finite float32 lower bound');
    return lower === 0 ? 0 : lower;
}

/** @param {number} value */
export function roundStaticSunDepthWorldYUpToFloat32V2(value) {
    const finite = requireFiniteNumber(value, 'value');
    const rounded = Math.fround(finite === 0 ? 0 : finite);
    if (!Number.isFinite(rounded)) throw new RangeError('value has no finite float32 upper bound');
    if (rounded >= finite) return rounded === 0 ? 0 : rounded;
    const upper = nextFloat32Up(rounded);
    if (!Number.isFinite(upper)) throw new RangeError('value has no finite float32 upper bound');
    return upper === 0 ? 0 : upper;
}

/**
 * @param {readonly StaticSunDepthBlockAffineWorldYV2Range[]} ranges
 */
export function packStaticSunDepthBlockAffineWorldYV2Ranges(ranges) {
    if (!Array.isArray(ranges)) throw new TypeError('ranges must be an array');
    const byteLength = safeMultiply(
        ranges.length,
        STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_RANGE_BYTES_PER_BLOCK,
        'range metadata bytes'
    );
    const bytes = new Uint8Array(byteLength);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    ranges.forEach((range, index) => {
        requireCreatedRange(range);
        const offset = index * STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_RANGE_BYTES_PER_BLOCK;
        view.setFloat32(offset, range.minWorldY, true);
        view.setFloat32(offset + 4, range.maxWorldY, true);
    });
    return bytes;
}

/**
 * @param {Uint8Array} source
 * @param {number} blockIndex
 * @returns {StaticSunDepthBlockAffineWorldYV2Range}
 */
export function unpackStaticSunDepthBlockAffineWorldYV2Range(source, blockIndex) {
    if (!(source instanceof Uint8Array)) throw new TypeError('source must be a Uint8Array');
    const index = requireNonNegativeSafeInteger(blockIndex, 'blockIndex');
    const offset = safeMultiply(
        index,
        STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_RANGE_BYTES_PER_BLOCK,
        'range metadata offset'
    );
    if (offset + STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_RANGE_BYTES_PER_BLOCK
        > source.byteLength) {
        throw new RangeError('blockIndex is outside source metadata');
    }
    const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
    const minimum = view.getFloat32(offset, true);
    const maximum = view.getFloat32(offset + 4, true);
    if (minimum === Infinity && maximum === -Infinity) {
        return createRange(Infinity, -Infinity);
    }
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum < minimum) {
        throw new Error('range metadata must contain increasing finite endpoints or the empty sentinel');
    }
    return createRange(minimum === 0 ? 0 : minimum, maximum === 0 ? 0 : maximum);
}

/**
 * @param {number | null} worldY
 * @param {StaticSunDepthBlockAffineWorldYV2Range} range
 */
export function encodeStaticSunDepthBlockAffineWorldYV2(worldY, range) {
    requireCreatedRange(range);
    if (worldY === null) return STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_EMPTY_QUANTIZED;
    const occupiedWorldY = requireFiniteNumber(worldY, 'worldY');
    if (isEmptyRange(range)) throw new Error('an all-empty block cannot encode an occupied texel');
    if (occupiedWorldY < range.minWorldY || occupiedWorldY > range.maxWorldY) {
        throw new RangeError('worldY is outside its outward-rounded block range');
    }
    const span = range.maxWorldY - range.minWorldY;
    if (span === 0) {
        if (occupiedWorldY !== range.minWorldY) {
            throw new RangeError('zero-span block can encode only its exact endpoint');
        }
        return 0;
    }
    const unit = (occupiedWorldY - range.minWorldY) / span;
    return Math.min(
        STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_MAX_QUANTIZED,
        Math.max(
            0,
            Math.round(unit * STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_MAX_QUANTIZED)
        )
    );
}

/**
 * @param {number} quantized
 * @param {StaticSunDepthBlockAffineWorldYV2Range} range
 * @returns {number | null}
 */
export function decodeStaticSunDepthBlockAffineWorldYV2(quantized, range) {
    requireCreatedRange(range);
    requireQuantized(quantized);
    if (quantized === STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_EMPTY_QUANTIZED) return null;
    if (isEmptyRange(range)) throw new Error('occupied code references an all-empty block range');
    const span = range.maxWorldY - range.minWorldY;
    if (span === 0) {
        if (quantized !== 0) throw new Error('zero-span block permits only occupied code 0');
        return range.minWorldY;
    }
    return range.minWorldY
        + quantized / STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_MAX_QUANTIZED * span;
}

/**
 * @param {{
 *   originWorld: readonly number[],
 *   rightAxisWorld: readonly number[],
 *   upAxisWorld: readonly number[],
 *   depthAxisWorld: readonly number[]
 * }} basis
 * @returns {StaticSunDepthBlockAffineWorldYV2Transform}
 */
export function createStaticSunDepthBlockAffineWorldYV2Transform(basis) {
    const source = requireRecord(basis, 'basis');
    const origin = requireFiniteVector3(source.originWorld, 'basis.originWorld');
    const right = requireFiniteVector3(source.rightAxisWorld, 'basis.rightAxisWorld');
    const up = requireFiniteVector3(source.upAxisWorld, 'basis.upAxisWorld');
    const depth = requireFiniteVector3(source.depthAxisWorld, 'basis.depthAxisWorld');
    const transform = {
        originWorldY: requireFiniteFloat32(origin[1], 'basis.originWorld[1]'),
        rightAxisWorldY: requireFiniteFloat32(right[1], 'basis.rightAxisWorld[1]'),
        upAxisWorldY: requireFiniteFloat32(up[1], 'basis.upAxisWorld[1]'),
        depthAxisWorldY: requireFiniteFloat32(depth[1], 'basis.depthAxisWorld[1]')
    };
    if (transform.depthAxisWorldY >= 0 || !Number.isFinite(1 / transform.depthAxisWorldY)) {
        throw new RangeError('basis.depthAxisWorld[1] must remain finite and strictly negative in float32');
    }
    CREATED_TRANSFORMS.add(transform);
    return Object.freeze(transform);
}

/**
 * @param {StaticSunDepthBlockAffineWorldYV2Transform} transform
 * @param {readonly [number, number]} lightCoordinates
 * @param {number} lightDepthMeters
 */
export function staticSunDepthWorldYFromLightDepthV2(
    transform,
    lightCoordinates,
    lightDepthMeters
) {
    requireCreatedTransform(transform);
    const light = requireFinitePair(lightCoordinates, 'lightCoordinates');
    const depth = requireFiniteNumber(lightDepthMeters, 'lightDepthMeters');
    const worldY = affineWorldY(transform, light, depth);
    if (!Number.isFinite(worldY)) throw new RangeError('world-Y transform overflowed');
    return worldY;
}

/**
 * @param {StaticSunDepthBlockAffineWorldYV2Transform} transform
 * @param {readonly [number, number]} lightCoordinates
 * @param {number} worldY
 */
export function staticSunDepthLightDepthFromWorldYV2(
    transform,
    lightCoordinates,
    worldY
) {
    requireCreatedTransform(transform);
    const light = requireFinitePair(lightCoordinates, 'lightCoordinates');
    const height = requireFiniteNumber(worldY, 'worldY');
    const base = affineWorldYBase(transform, light);
    const depth = (height - base) / transform.depthAxisWorldY;
    if (!Number.isFinite(depth)) throw new RangeError('light-depth inverse transform overflowed');
    return depth;
}

/**
 * @param {StaticSunDepthBlockAffineWorldYV2Transform} transform
 * @param {readonly [number, number]} lightCoordinates
 * @param {number} receiverDepthMeters
 * @param {number} biasMeters
 */
export function staticSunDepthComparisonWorldYV2(
    transform,
    lightCoordinates,
    receiverDepthMeters,
    biasMeters
) {
    const receiverDepth = requireFiniteNumber(receiverDepthMeters, 'receiverDepthMeters');
    const bias = requireNonNegativeFiniteNumber(biasMeters, 'biasMeters');
    return staticSunDepthWorldYFromLightDepthV2(
        transform,
        lightCoordinates,
        receiverDepth - bias
    );
}

/**
 * @param {StaticSunDepthBlockAffineWorldYV2Transform} transform
 * @param {readonly [number, number]} lightCoordinates
 * @param {number} receiverDepthMeters
 * @param {number} biasMeters
 * @param {number | null} casterWorldY
 */
export function compareStaticSunDepthBlockAffineWorldYV2(
    transform,
    lightCoordinates,
    receiverDepthMeters,
    biasMeters,
    casterWorldY
) {
    if (casterWorldY === null) return true;
    const caster = requireFiniteNumber(casterWorldY, 'casterWorldY');
    return staticSunDepthComparisonWorldYV2(
        transform,
        lightCoordinates,
        receiverDepthMeters,
        biasMeters
    ) >= caster;
}

/**
 * @param {StaticSunDepthBlockAffineWorldYV2Range} range
 * @param {StaticSunDepthBlockAffineWorldYV2Transform} transform
 * @returns {number | null}
 */
export function staticSunDepthBlockAffineWorldYV2MaximumDepthErrorMeters(
    range,
    transform
) {
    requireCreatedRange(range);
    requireCreatedTransform(transform);
    if (isEmptyRange(range)) return null;
    return (range.maxWorldY - range.minWorldY)
        / STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_MAX_QUANTIZED
        / Math.abs(transform.depthAxisWorldY)
        * 0.5;
}

function locateGlobalBlockUnchecked(partition, globalTexel) {
    const tile = /** @type {const} */ ([
        Math.floor(globalTexel[0] / partition.interiorTexels[0]),
        Math.floor(globalTexel[1] / partition.interiorTexels[1])
    ]);
    const local = /** @type {const} */ ([
        globalTexel[0] - tile[0] * partition.interiorTexels[0],
        globalTexel[1] - tile[1] * partition.interiorTexels[1]
    ]);
    const located = locateBlockUnchecked(partition, tile, local);
    return Object.freeze({...located, globalTexel: Object.freeze([...globalTexel])});
}

function locateBlockUnchecked(partition, tileCoordinates, localTexel) {
    const layer = tileCoordinates[1] * partition.tileCount[0] + tileCoordinates[0];
    const blockCoordinates = /** @type {const} */ ([
        Math.floor(localTexel[0] / STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_BLOCK_TEXELS),
        Math.floor(localTexel[1] / STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_BLOCK_TEXELS)
    ]);
    const blockIndexInLayer = blockCoordinates[1] * partition.blocksPerTile[0]
        + blockCoordinates[0];
    const metadataIndex = layer * partition.blockCountPerLayer + blockIndexInLayer;
    return Object.freeze({
        tileCoordinates: Object.freeze([...tileCoordinates]),
        localTexel: Object.freeze([...localTexel]),
        layer,
        blockCoordinates: Object.freeze([...blockCoordinates]),
        blockIndexInLayer,
        metadataIndex,
        metadataByteOffset: metadataIndex
            * STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_RANGE_BYTES_PER_BLOCK
    });
}

function createRange(minWorldY, maxWorldY) {
    const range = {
        schema: STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_RANGE_SCHEMA,
        minWorldY,
        maxWorldY
    };
    CREATED_RANGES.add(range);
    return Object.freeze(range);
}

function isEmptyRange(range) {
    return range.minWorldY === Infinity && range.maxWorldY === -Infinity;
}

function affineWorldY(transform, lightCoordinates, lightDepthMeters) {
    return affineWorldYBase(transform, lightCoordinates)
        + transform.depthAxisWorldY * lightDepthMeters;
}

function affineWorldYBase(transform, lightCoordinates) {
    return transform.originWorldY
        + transform.rightAxisWorldY * lightCoordinates[0]
        + transform.upAxisWorldY * lightCoordinates[1];
}

function nextFloat32Up(value) {
    if (value === Infinity) return Infinity;
    if (value === -Infinity) return -Number.MAX_VALUE;
    if (value === 0) {
        FLOAT32_BITS_UINT[0] = 1;
        return FLOAT32_BITS_FLOAT[0];
    }
    FLOAT32_BITS_FLOAT[0] = value;
    FLOAT32_BITS_UINT[0] += value > 0 ? 1 : -1;
    return FLOAT32_BITS_FLOAT[0];
}

function nextFloat32Down(value) {
    if (value === -Infinity) return -Infinity;
    if (value === Infinity) return Number.MAX_VALUE;
    if (value === 0) {
        FLOAT32_BITS_UINT[0] = 0x80000001;
        return FLOAT32_BITS_FLOAT[0];
    }
    FLOAT32_BITS_FLOAT[0] = value;
    FLOAT32_BITS_UINT[0] += value > 0 ? -1 : 1;
    return FLOAT32_BITS_FLOAT[0];
}

function requireCreatedPartition(value) {
    if (!value || typeof value !== 'object' || !CREATED_PARTITIONS.has(value)) {
        throw new TypeError('partition must come from createStaticSunDepthBlockAffineWorldYV2Partition');
    }
}

function requireCreatedRange(value) {
    if (!value || typeof value !== 'object' || !CREATED_RANGES.has(value)) {
        throw new TypeError('range must come from a V2 range creator or metadata decoder');
    }
}

function requireCreatedTransform(value) {
    if (!value || typeof value !== 'object' || !CREATED_TRANSFORMS.has(value)) {
        throw new TypeError('transform must come from createStaticSunDepthBlockAffineWorldYV2Transform');
    }
}

function requireRecord(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(`${label} must be an object`);
    }
    return /** @type {Record<string, any>} */ (value);
}

function requireExactKeys(value, required, optional, label) {
    const allowed = new Set([...required, ...optional]);
    for (const key of required) {
        if (optional.includes(key)) continue;
        if (!Object.hasOwn(value, key)) throw new TypeError(`${label}.${key} is required`);
    }
    for (const key of Object.keys(value)) {
        if (!allowed.has(key)) throw new TypeError(`${label}.${key} is unsupported`);
    }
}

function requirePositiveIntegerPair(value, label) {
    if (!Array.isArray(value) || value.length !== 2) {
        throw new TypeError(`${label} must contain exactly two integers`);
    }
    return /** @type {const} */ ([
        requirePositiveSafeInteger(value[0], `${label}[0]`),
        requirePositiveSafeInteger(value[1], `${label}[1]`)
    ]);
}

function requireIntegerCoordinatePair(value, limit, label) {
    if (!Array.isArray(value) || value.length !== 2) {
        throw new TypeError(`${label} must contain exactly two integers`);
    }
    const result = /** @type {const} */ ([
        requireNonNegativeSafeInteger(value[0], `${label}[0]`),
        requireNonNegativeSafeInteger(value[1], `${label}[1]`)
    ]);
    if (result[0] >= limit[0] || result[1] >= limit[1]) {
        throw new RangeError(`${label} is outside its half-open domain`);
    }
    return result;
}

function requireFinitePair(value, label) {
    if (!Array.isArray(value) || value.length !== 2) {
        throw new TypeError(`${label} must contain exactly two finite numbers`);
    }
    return /** @type {const} */ ([
        requireFiniteNumber(value[0], `${label}[0]`),
        requireFiniteNumber(value[1], `${label}[1]`)
    ]);
}

function requireFiniteVector3(value, label) {
    if (!Array.isArray(value) || value.length !== 3) {
        throw new TypeError(`${label} must contain exactly three finite numbers`);
    }
    return /** @type {const} */ ([
        requireFiniteNumber(value[0], `${label}[0]`),
        requireFiniteNumber(value[1], `${label}[1]`),
        requireFiniteNumber(value[2], `${label}[2]`)
    ]);
}

function requireFiniteFloat32(value, label) {
    const finite = requireFiniteNumber(value, label);
    const rounded = Math.fround(finite === 0 ? 0 : finite);
    if (!Number.isFinite(rounded)) throw new RangeError(`${label} must remain finite in float32`);
    return rounded === 0 ? 0 : rounded;
}

function requireFiniteNumber(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(`${label} must be finite`);
    }
    return value === 0 ? 0 : value;
}

function requireNonNegativeFiniteNumber(value, label) {
    const finite = requireFiniteNumber(value, label);
    if (finite < 0) throw new RangeError(`${label} must be nonnegative`);
    return finite;
}

function requirePositiveSafeInteger(value, label) {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new TypeError(`${label} must be a positive safe integer`);
    }
    return value;
}

function requireNonNegativeSafeInteger(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new TypeError(`${label} must be a nonnegative safe integer`);
    }
    return value;
}

function requireQuantized(value) {
    if (!Number.isInteger(value)
        || value < 0
        || value > STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_EMPTY_QUANTIZED) {
        throw new RangeError('quantized must be an integer from 0 through 65535');
    }
}

function safeMultiply(left, right, label) {
    const value = left * right;
    if (!Number.isSafeInteger(value)) throw new RangeError(`${label} exceeds safe integer range`);
    return value;
}

function safeAdd(left, right, label) {
    const value = left + right;
    if (!Number.isSafeInteger(value)) throw new RangeError(`${label} exceeds safe integer range`);
    return value;
}

function clampInteger(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}
