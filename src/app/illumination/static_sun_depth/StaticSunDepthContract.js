// Defines and validates the immutable AI 531 static-sun depth channel contract.
// @ts-check

import {
    canonicalJsonStringify,
    cloneCanonicalJson,
    assertStableId
} from '../bake_source/CanonicalJson.js';
import {
    ILLUMINATION_MAX_CHUNKS,
    ILLUMINATION_MAX_CHUNK_BYTES,
    ILLUMINATION_MAX_PACKAGE_BYTES
} from '../package/IlluminationPackageConstants.js';
import {
    assertStaticSunDepthEncoding,
    getStaticSunDepthBytesPerTexel,
    STATIC_SUN_DEPTH_DIAGNOSTIC_EMPTY_ALPHA,
    STATIC_SUN_DEPTH_DIAGNOSTIC_ENCODING_ID,
    STATIC_SUN_DEPTH_DIAGNOSTIC_MAX_QUANTIZED,
    STATIC_SUN_DEPTH_DIAGNOSTIC_OCCUPIED_ALPHA,
    STATIC_SUN_DEPTH_ENCODING_ID,
    STATIC_SUN_DEPTH_EMPTY_QUANTIZED,
    STATIC_SUN_DEPTH_MAX_QUANTIZED
} from './StaticSunDepthEncoding.js';

export const STATIC_SUN_DEPTH_TILE_SET_SCHEMA = 'static-sun-depth-tile-set-v1';
export const STATIC_SUN_DEPTH_CHANNEL_ID = 'static_sun_depth';
export const STATIC_SUN_DEPTH_CHANNEL_VERSION = 1;

const ORTHONORMAL_TOLERANCE = 1e-9;
const BOUNDS_TOLERANCE = 1e-9;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MAX_INTERIOR_TEXELS = 16384;
const MAX_GUARD_TEXELS = 64;
const MAX_SQUARE_PCF_RADIUS_TEXELS = 1;
const THREE_R183_VOGEL_SAMPLE_COUNT = 5;
const THREE_R183_FILTER_MODEL = 'three-r183-vogel-5-linear-compare-v1';

/**
 * @typedef {{
 *   policy: string,
 *   originWorld: readonly [number, number, number],
 *   rightAxisWorld: readonly [number, number, number],
 *   upAxisWorld: readonly [number, number, number],
 *   depthAxisWorld: readonly [number, number, number]
 * }} StaticSunDepthBasis
 */

/**
 * @typedef {{
 *   order: string,
 *   lookup: string,
 *   rowOrigin: string,
 *   tileCount: readonly [number, number],
 *   interiorTexels: readonly [number, number],
 *   guardTexels: number,
 *   guardPolicy: string,
 *   texelSizeMeters: number,
 *   boundsLightMeters: {min: readonly [number, number], max: readonly [number, number]}
 * }} StaticSunDepthLayout
 */

/**
 * @typedef {{
 *   id: string,
 *   coordinates: readonly [number, number],
 *   interiorBoundsLightMeters: {min: readonly [number, number], max: readonly [number, number]},
 *   storedTexels: readonly [number, number],
 *   contentSha256: string
 * }} StaticSunDepthTileDescriptor
 */

/**
 * @typedef {{
 *   channelId: string,
 *   channelVersion: number,
 *   cityId: string,
 *   casterInventorySha256: string,
 *   channelSourceSha256: string,
 *   compilerSignatureSha256: string,
 *   sunPointDirectionWorld: readonly [number, number, number],
 *   basis: StaticSunDepthBasis,
 *   layout: StaticSunDepthLayout,
 *   alpha: Record<string, any>,
 *   encoding: import('./StaticSunDepthEncoding.js').StaticSunDepthEncoding,
 *   sampling: Record<string, any>
 * }} StaticSunDepthIdentity
 */

/**
 * @typedef {{
 *   schema: string,
 *   identity: StaticSunDepthIdentity,
 *   tiles: readonly StaticSunDepthTileDescriptor[]
 * }} StaticSunDepthTileSetDescriptor
 */

/**
 * Produces the one supported V1 roll around the sun ray. The least-aligned
 * world axis avoids an unstable near-parallel cross product; X wins ties.
 * depthAxisWorld points from the sun toward the city, opposite the supplied
 * point direction (which points from a world point toward the sun).
 *
 * @param {readonly number[]} sunPointDirectionWorld
 * @param {readonly number[]} [originWorld]
 * @returns {Readonly<StaticSunDepthBasis>}
 */
export function createStableStaticSunDepthBasis(
    sunPointDirectionWorld,
    originWorld = [0, 0, 0]
) {
    const pointDirection = normalizeVector3(sunPointDirectionWorld, 'sunPointDirectionWorld');
    const origin = requireVector3(originWorld, 'originWorld');
    const depth = /** @type {[number, number, number]} */ ([
        cleanZero(-pointDirection[0]),
        cleanZero(-pointDirection[1]),
        cleanZero(-pointDirection[2])
    ]);
    const candidates = /** @type {const} */ ([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
    let reference = candidates[0];
    let smallestAlignment = Math.abs(dot3(reference, depth));
    for (let index = 1; index < candidates.length; index += 1) {
        const alignment = Math.abs(dot3(candidates[index], depth));
        if (alignment < smallestAlignment) {
            reference = candidates[index];
            smallestAlignment = alignment;
        }
    }
    const right = normalizeVector3(cross3(reference, depth), 'derived right axis');
    const up = normalizeVector3(cross3(depth, right), 'derived up axis');
    return /** @type {Readonly<StaticSunDepthBasis>} */ (cloneCanonicalJson({
        policy: 'least-aligned-world-axis-v1',
        originWorld: origin,
        rightAxisWorld: right,
        upAxisWorld: up,
        depthAxisWorld: depth
    }));
}

/**
 * Reproduces the directional-shadow camera roll used by Three r183. The
 * camera looks from the light toward its target with Object3D's default
 * world-up vector. Keeping these axes canonical makes the finite five-sample
 * Vogel pattern derivable by offline producers instead of reading a live
 * camera matrix or assuming that the cache basis has the same roll.
 *
 * @param {readonly number[]} sunPointDirectionWorld
 * @returns {Readonly<{
 *   policy: string,
 *   rightAxisWorld: readonly [number, number, number],
 *   upAxisWorld: readonly [number, number, number]
 * }>}
 */
export function createThreeR183DirectionalShadowFilterAxes(sunPointDirectionWorld) {
    const backward = normalizeVector3(
        sunPointDirectionWorld,
        'sunPointDirectionWorld'
    );
    let right = cross3([0, 1, 0], backward);
    if (Math.hypot(...right) <= Number.EPSILON) {
        // Matrix4.lookAt perturbs its backward axis when up and view are
        // parallel. The normalized equivalent is stable and deterministic.
        const perturbed = normalizeVector3(
            [backward[0] + 0.0001, backward[1], backward[2]],
            'Three r183 parallel-up fallback'
        );
        right = cross3([0, 1, 0], perturbed);
    }
    right = normalizeVector3(right, 'Three r183 shadow-map right axis');
    const up = normalizeVector3(
        cross3(backward, right),
        'Three r183 shadow-map up axis'
    );
    return /** @type {any} */ (cloneCanonicalJson({
        policy: 'three-r183-directional-shadow-camera-world-up-v1',
        rightAxisWorld: right,
        upAxisWorld: up
    }));
}

/**
 * Rejects unknown fields and returns an owned, deeply frozen canonical copy.
 * All grid, tile, basis, encoding, alpha and sampler invariants are checked
 * before the returned value can be used.
 *
 * @param {unknown} value
 * @returns {Readonly<StaticSunDepthTileSetDescriptor>}
 */
export function validateStaticSunDepthTileSetDescriptor(value) {
    const source = /** @type {Record<string, any>} */ (cloneCanonicalJson(value));
    requirePlainObject(source, 'descriptor');
    requireExactKeys(source, ['identity', 'schema', 'tiles'], 'descriptor');
    if (source.schema !== STATIC_SUN_DEPTH_TILE_SET_SCHEMA) {
        throw new Error('descriptor.schema must be "' + STATIC_SUN_DEPTH_TILE_SET_SCHEMA + '"');
    }
    const identity = normalizeIdentity(source.identity);
    const tiles = normalizeTiles(source.tiles, identity.layout);
    return /** @type {Readonly<StaticSunDepthTileSetDescriptor>} */ (cloneCanonicalJson({
        schema: STATIC_SUN_DEPTH_TILE_SET_SCHEMA,
        identity,
        tiles
    }));
}

/**
 * Validates an identity independently for exact activation comparisons.
 *
 * @param {unknown} value
 * @returns {Readonly<StaticSunDepthIdentity>}
 */
export function validateStaticSunDepthIdentity(value) {
    const source = cloneCanonicalJson(value);
    return /** @type {Readonly<StaticSunDepthIdentity>} */ (cloneCanonicalJson(normalizeIdentity(source)));
}

/**
 * @param {unknown} left
 * @param {unknown} right
 * @returns {boolean}
 */
export function staticSunDepthIdentityEquals(left, right) {
    const normalizedLeft = validateStaticSunDepthIdentity(left);
    const normalizedRight = validateStaticSunDepthIdentity(right);
    return canonicalJsonStringify(normalizedLeft) === canonicalJsonStringify(normalizedRight);
}

/**
 * Finds the owning half-open interior tile. Global and tile maxima are never
 * folded into the preceding tile.
 *
 * @param {unknown} descriptorValue
 * @param {number} lightX
 * @param {number} lightY
 * @returns {Readonly<{
 *   tile: StaticSunDepthTileDescriptor,
 *   tileIndex: number,
 *   tileCoordinates: readonly [number, number],
 *   interiorTexel: readonly [number, number],
 *   storedTexel: readonly [number, number]
 * }> | null}
 */
export function lookupStaticSunDepthTile(descriptorValue, lightX, lightY) {
    const descriptor = validateStaticSunDepthTileSetDescriptor(descriptorValue);
    return lookupValidatedStaticSunDepthTile(descriptor, lightX, lightY);
}

/**
 * Internal hot-path lookup for a descriptor already validated and owned by a
 * residency object.
 *
 * @param {Readonly<StaticSunDepthTileSetDescriptor>} descriptor
 * @param {number} lightX
 * @param {number} lightY
 * @returns {ReturnType<typeof lookupStaticSunDepthTile>}
 */
export function lookupValidatedStaticSunDepthTile(descriptor, lightX, lightY) {
    if (!Number.isFinite(lightX) || !Number.isFinite(lightY)) {
        throw new TypeError('light-space lookup coordinates must be finite');
    }
    const layout = descriptor.identity.layout;
    const minX = layout.boundsLightMeters.min[0];
    const minY = layout.boundsLightMeters.min[1];
    const maxX = layout.boundsLightMeters.max[0];
    const maxY = layout.boundsLightMeters.max[1];
    if (lightX < minX || lightX >= maxX || lightY < minY || lightY >= maxY) return null;

    const tileWidthMeters = layout.interiorTexels[0] * layout.texelSizeMeters;
    const tileHeightMeters = layout.interiorTexels[1] * layout.texelSizeMeters;
    const tileX = Math.floor((lightX - minX) / tileWidthMeters);
    const tileY = Math.floor((lightY - minY) / tileHeightMeters);
    const tileIndex = tileY * layout.tileCount[0] + tileX;
    const tile = descriptor.tiles[tileIndex];
    const localX = lightX - tile.interiorBoundsLightMeters.min[0];
    const localY = lightY - tile.interiorBoundsLightMeters.min[1];
    const interiorX = Math.min(
        layout.interiorTexels[0] - 1,
        Math.floor(localX / layout.texelSizeMeters)
    );
    const interiorY = Math.min(
        layout.interiorTexels[1] - 1,
        Math.floor(localY / layout.texelSizeMeters)
    );
    return Object.freeze({
        tile,
        tileIndex,
        tileCoordinates: Object.freeze(/** @type {[number, number]} */ ([tileX, tileY])),
        interiorTexel: Object.freeze(/** @type {[number, number]} */ ([interiorX, interiorY])),
        storedTexel: Object.freeze(/** @type {[number, number]} */ ([
            interiorX + layout.guardTexels,
            interiorY + layout.guardTexels
        ]))
    });
}

/**
 * @param {unknown} value
 * @returns {StaticSunDepthIdentity}
 */
function normalizeIdentity(value) {
    const source = /** @type {Record<string, any>} */ (value);
    requirePlainObject(source, 'identity');
    requireExactKeys(source, [
        'alpha',
        'basis',
        'casterInventorySha256',
        'channelId',
        'channelSourceSha256',
        'channelVersion',
        'cityId',
        'compilerSignatureSha256',
        'encoding',
        'layout',
        'sampling',
        'sunPointDirectionWorld'
    ], 'identity');
    if (source.channelId !== STATIC_SUN_DEPTH_CHANNEL_ID) {
        throw new Error('identity.channelId must be "' + STATIC_SUN_DEPTH_CHANNEL_ID + '"');
    }
    if (source.channelVersion !== STATIC_SUN_DEPTH_CHANNEL_VERSION) {
        throw new Error('identity.channelVersion must be ' + STATIC_SUN_DEPTH_CHANNEL_VERSION);
    }
    assertStableId(source.cityId, 'identity.cityId');
    requireSha256(source.casterInventorySha256, 'identity.casterInventorySha256');
    requireSha256(source.channelSourceSha256, 'identity.channelSourceSha256');
    requireSha256(source.compilerSignatureSha256, 'identity.compilerSignatureSha256');
    const sunPointDirectionWorld = requireUnitVector3(
        source.sunPointDirectionWorld,
        'identity.sunPointDirectionWorld'
    );
    const basis = normalizeBasis(source.basis, sunPointDirectionWorld);
    const alpha = normalizeAlpha(source.alpha);
    const encoding = normalizeEncoding(source.encoding);
    const sampling = normalizeSampling(source.sampling, encoding, sunPointDirectionWorld);
    const requiredGuardTexels = sampling.pcf.model === 'square-nearest-box-v1'
        ? sampling.pcf.radiusTexels
        : 0;
    const layout = normalizeLayout(source.layout, requiredGuardTexels, encoding);
    return {
        channelId: STATIC_SUN_DEPTH_CHANNEL_ID,
        channelVersion: STATIC_SUN_DEPTH_CHANNEL_VERSION,
        cityId: source.cityId,
        casterInventorySha256: source.casterInventorySha256,
        channelSourceSha256: source.channelSourceSha256,
        compilerSignatureSha256: source.compilerSignatureSha256,
        sunPointDirectionWorld,
        basis,
        layout,
        alpha,
        encoding,
        sampling
    };
}

/**
 * @param {unknown} value
 * @param {readonly [number, number, number]} sunPointDirectionWorld
 * @returns {StaticSunDepthBasis}
 */
function normalizeBasis(value, sunPointDirectionWorld) {
    const source = /** @type {Record<string, any>} */ (value);
    requirePlainObject(source, 'identity.basis');
    requireExactKeys(source, [
        'depthAxisWorld',
        'originWorld',
        'policy',
        'rightAxisWorld',
        'upAxisWorld'
    ], 'identity.basis');
    if (source.policy !== 'least-aligned-world-axis-v1') {
        throw new Error('identity.basis.policy is unsupported');
    }
    const originWorld = requireVector3(source.originWorld, 'identity.basis.originWorld');
    const rightAxisWorld = requireUnitVector3(source.rightAxisWorld, 'identity.basis.rightAxisWorld');
    const upAxisWorld = requireUnitVector3(source.upAxisWorld, 'identity.basis.upAxisWorld');
    const depthAxisWorld = requireUnitVector3(source.depthAxisWorld, 'identity.basis.depthAxisWorld');
    if (Math.abs(dot3(rightAxisWorld, upAxisWorld)) > ORTHONORMAL_TOLERANCE
        || Math.abs(dot3(rightAxisWorld, depthAxisWorld)) > ORTHONORMAL_TOLERANCE
        || Math.abs(dot3(upAxisWorld, depthAxisWorld)) > ORTHONORMAL_TOLERANCE) {
        throw new Error('identity.basis axes must be orthogonal');
    }
    const handedDepth = normalizeVector3(cross3(rightAxisWorld, upAxisWorld), 'identity.basis handedness');
    if (!vectorsNearlyEqual(handedDepth, depthAxisWorld, ORTHONORMAL_TOLERANCE)) {
        throw new Error('identity.basis must be right handed');
    }
    const stable = createStableStaticSunDepthBasis(sunPointDirectionWorld, originWorld);
    if (!vectorsNearlyEqual(stable.rightAxisWorld, rightAxisWorld, ORTHONORMAL_TOLERANCE)
        || !vectorsNearlyEqual(stable.upAxisWorld, upAxisWorld, ORTHONORMAL_TOLERANCE)
        || !vectorsNearlyEqual(stable.depthAxisWorld, depthAxisWorld, ORTHONORMAL_TOLERANCE)) {
        throw new Error('identity.basis does not match the stable V1 sun basis');
    }
    requireWorldToLightTranslationFloat32(
        rightAxisWorld,
        originWorld,
        'identity.basis right-axis world-to-light translation'
    );
    requireWorldToLightTranslationFloat32(
        upAxisWorld,
        originWorld,
        'identity.basis up-axis world-to-light translation'
    );
    requireWorldToLightTranslationFloat32(
        depthAxisWorld,
        originWorld,
        'identity.basis depth-axis world-to-light translation'
    );
    return {
        policy: 'least-aligned-world-axis-v1',
        originWorld,
        rightAxisWorld,
        upAxisWorld,
        depthAxisWorld
    };
}

/**
 * @param {unknown} value
 * @returns {Record<string, any>}
 */
function normalizeAlpha(value) {
    const source = /** @type {Record<string, any>} */ (value);
    requirePlainObject(source, 'identity.alpha');
    requireExactKeys(source, [
        'coverage',
        'forcedOpaque',
        'model',
        'semanticsSha256',
        'sidedness',
        'threshold'
    ], 'identity.alpha');
    const expected = {
        model: 'evaluated-runtime-coverage-v1',
        coverage: 'opacity-times-vertex-alpha-times-map-a-times-alpha-map-g-v1',
        threshold: 'discard-when-coverage-lt-alpha-test-v1',
        sidedness: 'material-side-and-shadow-side-v1',
        forcedOpaque: 'shadow-as-opaque-v1'
    };
    for (const [key, expectedValue] of Object.entries(expected)) {
        if (source[key] !== expectedValue) throw new Error('identity.alpha.' + key + ' is unsupported');
    }
    requireSha256(source.semanticsSha256, 'identity.alpha.semanticsSha256');
    return {...expected, semanticsSha256: source.semanticsSha256};
}

/**
 * @param {unknown} value
 * @returns {import('./StaticSunDepthEncoding.js').StaticSunDepthEncoding}
 */
function normalizeEncoding(value) {
    const source = /** @type {Record<string, any>} */ (value);
    requirePlainObject(source, 'identity.encoding');
    const diagnostic = source.id === STATIC_SUN_DEPTH_DIAGNOSTIC_ENCODING_ID;
    requireExactKeys(source, diagnostic ? [
        'alphaChannel',
        'blueChannel',
        'emptyAlpha',
        'greenChannel',
        'id',
        'maxDepthMeters',
        'maxQuantized',
        'minDepthMeters',
        'occupiedAlpha',
        'quantization',
        'redChannel'
    ] : [
        'emptyQuantized',
        'greenChannel',
        'id',
        'maxDepthMeters',
        'maxQuantized',
        'minDepthMeters',
        'quantization',
        'redChannel'
    ], 'identity.encoding');
    assertStaticSunDepthEncoding(source);
    if (diagnostic) {
        return {
            id: STATIC_SUN_DEPTH_DIAGNOSTIC_ENCODING_ID,
            quantization: 'linear-endpoints-inclusive-v1',
            redChannel: 'quantized-high-byte-v1',
            greenChannel: 'quantized-middle-byte-v1',
            blueChannel: 'quantized-low-byte-v1',
            alphaChannel: 'occupied-255-empty-0-v1',
            minDepthMeters: source.minDepthMeters,
            maxDepthMeters: source.maxDepthMeters,
            maxQuantized: STATIC_SUN_DEPTH_DIAGNOSTIC_MAX_QUANTIZED,
            emptyAlpha: STATIC_SUN_DEPTH_DIAGNOSTIC_EMPTY_ALPHA,
            occupiedAlpha: STATIC_SUN_DEPTH_DIAGNOSTIC_OCCUPIED_ALPHA
        };
    }
    return {
        id: STATIC_SUN_DEPTH_ENCODING_ID,
        quantization: 'linear-endpoints-inclusive-v1',
        redChannel: 'quantized-high-byte-v1',
        greenChannel: 'quantized-low-byte-v1',
        minDepthMeters: source.minDepthMeters,
        maxDepthMeters: source.maxDepthMeters,
        maxQuantized: STATIC_SUN_DEPTH_MAX_QUANTIZED,
        emptyQuantized: STATIC_SUN_DEPTH_EMPTY_QUANTIZED
    };
}

/**
 * @param {unknown} value
 * @param {import('./StaticSunDepthEncoding.js').StaticSunDepthEncoding} encoding
 * @param {readonly [number, number, number]} sunPointDirectionWorld
 * @returns {Record<string, any>}
 */
function normalizeSampling(value, encoding, sunPointDirectionWorld) {
    const source = /** @type {Record<string, any>} */ (value);
    requirePlainObject(source, 'identity.sampling');
    requireExactKeys(source, [
        'bias',
        'comparison',
        'emptyPolicy',
        'outOfBoundsPolicy',
        'pcf'
    ], 'identity.sampling');
    if (source.comparison !== 'receiver-depth-minus-bias-lte-caster-depth-v1') {
        throw new Error('identity.sampling.comparison is unsupported');
    }
    if (source.emptyPolicy !== 'visible-v1') {
        throw new Error('identity.sampling.emptyPolicy is unsupported');
    }
    if (source.outOfBoundsPolicy !== 'fail-closed-zero-visibility-v1') {
        throw new Error('identity.sampling.outOfBoundsPolicy is unsupported');
    }
    requirePlainObject(source.bias, 'identity.sampling.bias');
    const legacyBias = source.bias.model === 'constant-plus-normal-offset-v1';
    const geometricBias = source.bias.model
        === 'geometric-normal-offset-plus-constant-depth-relief-v1';
    if (!legacyBias && !geometricBias) {
        throw new Error('identity.sampling.bias.model is unsupported');
    }
    const expectedBiasKeys = legacyBias
        ? ['constantMeters', 'model', 'normalOffsetScaleMeters']
        : ['constantDepthReliefMeters', 'geometricNormalOffsetMeters', 'model'];
    requireExactKeys(source.bias, expectedBiasKeys, 'identity.sampling.bias');
    const constantBiasName = legacyBias ? 'constantMeters' : 'constantDepthReliefMeters';
    const normalBiasName = legacyBias
        ? 'normalOffsetScaleMeters' : 'geometricNormalOffsetMeters';
    const constantBiasFloat32 = requireNonNegativeFloat32(
        source.bias[constantBiasName],
        `identity.sampling.bias.${constantBiasName}`
    );
    const normalBiasFloat32 = requireNonNegativeFloat32(
        source.bias[normalBiasName],
        `identity.sampling.bias.${normalBiasName}`
    );
    const maximumBias = legacyBias
        ? source.bias.constantMeters + source.bias.normalOffsetScaleMeters * 2
        : source.bias.constantDepthReliefMeters + source.bias.geometricNormalOffsetMeters;
    if (maximumBias > encoding.maxDepthMeters - encoding.minDepthMeters) {
        throw new RangeError('identity.sampling.bias maximum exceeds the encoding range');
    }
    const maximumBiasFloat32 = Math.fround(
        constantBiasFloat32 + Math.fround(
            normalBiasFloat32 * (legacyBias ? 2 : 1)
        )
    );
    const encodingRangeFloat32 = Math.fround(
        Math.fround(encoding.maxDepthMeters) - Math.fround(encoding.minDepthMeters)
    );
    if (!Number.isFinite(maximumBiasFloat32)
        || maximumBiasFloat32 < 0
        || maximumBiasFloat32 > encodingRangeFloat32) {
        throw new RangeError('identity.sampling.bias maximum is invalid for the float32 encoding range');
    }
    requirePlainObject(source.pcf, 'identity.sampling.pcf');
    const squarePcf = source.pcf.model === 'square-nearest-box-v1';
    const threeR183Pcf = source.pcf.model === THREE_R183_FILTER_MODEL;
    if (!squarePcf && !threeR183Pcf) {
        throw new Error('identity.sampling.pcf.model is unsupported');
    }
    let pcf;
    if (squarePcf) {
        requireExactKeys(source.pcf, ['model', 'radiusTexels'], 'identity.sampling.pcf');
        requireIntegerInRange(
            source.pcf.radiusTexels,
            0,
            MAX_SQUARE_PCF_RADIUS_TEXELS,
            'identity.sampling.pcf.radiusTexels'
        );
        pcf = {model: source.pcf.model, radiusTexels: source.pcf.radiusTexels};
    } else {
        requireExactKeys(source.pcf, [
            'hardwareComparison',
            'model',
            'radiusTexels',
            'sampleCount',
            'screenRotation',
            'shadowMapSizeTexels',
            'shadowMapWorldExtentMeters',
            'sourceMapRightAxisWorld',
            'sourceMapUpAxisWorld'
        ], 'identity.sampling.pcf');
        if (source.pcf.hardwareComparison !== 'linear-four-compare-taps-v1') {
            throw new Error('identity.sampling.pcf.hardwareComparison is unsupported');
        }
        if (source.pcf.screenRotation
            !== 'interleaved-gradient-noise-gl-fragcoord-v1') {
            throw new Error('identity.sampling.pcf.screenRotation is unsupported');
        }
        if (source.pcf.sampleCount !== THREE_R183_VOGEL_SAMPLE_COUNT) {
            throw new Error('identity.sampling.pcf.sampleCount must be 5');
        }
        const radiusTexels = requirePositiveFloat32(
            source.pcf.radiusTexels,
            'identity.sampling.pcf.radiusTexels'
        );
        const shadowMapSizeTexels = requireIntegerVector2(
            source.pcf.shadowMapSizeTexels,
            1,
            MAX_INTERIOR_TEXELS,
            'identity.sampling.pcf.shadowMapSizeTexels'
        );
        const shadowMapWorldExtentMeters = requirePositiveFloat32Vector2(
            source.pcf.shadowMapWorldExtentMeters,
            'identity.sampling.pcf.shadowMapWorldExtentMeters'
        );
        if (shadowMapSizeTexels[0] !== shadowMapSizeTexels[1]
            || shadowMapWorldExtentMeters[0] !== shadowMapWorldExtentMeters[1]) {
            throw new Error('identity.sampling.pcf Three r183 source shadow map must be square');
        }
        const sourceMapRightAxisWorld = requireUnitVector3(
            source.pcf.sourceMapRightAxisWorld,
            'identity.sampling.pcf.sourceMapRightAxisWorld'
        );
        const sourceMapUpAxisWorld = requireUnitVector3(
            source.pcf.sourceMapUpAxisWorld,
            'identity.sampling.pcf.sourceMapUpAxisWorld'
        );
        const expectedAxes = createThreeR183DirectionalShadowFilterAxes(
            sunPointDirectionWorld
        );
        if (!vectorsNearlyEqual(
            sourceMapRightAxisWorld,
            expectedAxes.rightAxisWorld,
            ORTHONORMAL_TOLERANCE
        ) || !vectorsNearlyEqual(
            sourceMapUpAxisWorld,
            expectedAxes.upAxisWorld,
            ORTHONORMAL_TOLERANCE
        )) {
            throw new Error('identity.sampling.pcf source-map axes do not match Three r183');
        }
        const worldRadiusFloat32 = Math.fround(
            Math.fround(radiusTexels)
                * Math.fround(
                    Math.fround(shadowMapWorldExtentMeters[0])
                        / Math.fround(shadowMapSizeTexels[0])
                )
        );
        if (!Number.isFinite(worldRadiusFloat32) || worldRadiusFloat32 <= 0) {
            throw new RangeError('identity.sampling.pcf world radius must remain positive in float32');
        }
        pcf = {
            model: source.pcf.model,
            radiusTexels: source.pcf.radiusTexels,
            sampleCount: source.pcf.sampleCount,
            screenRotation: source.pcf.screenRotation,
            hardwareComparison: source.pcf.hardwareComparison,
            shadowMapSizeTexels,
            shadowMapWorldExtentMeters,
            sourceMapRightAxisWorld,
            sourceMapUpAxisWorld
        };
    }
    const bias = legacyBias ? {
        model: source.bias.model,
        constantMeters: source.bias.constantMeters,
        normalOffsetScaleMeters: source.bias.normalOffsetScaleMeters
    } : {
        model: source.bias.model,
        constantDepthReliefMeters: source.bias.constantDepthReliefMeters,
        geometricNormalOffsetMeters: source.bias.geometricNormalOffsetMeters
    };
    return {
        comparison: source.comparison,
        emptyPolicy: source.emptyPolicy,
        outOfBoundsPolicy: source.outOfBoundsPolicy,
        bias,
        pcf
    };
}

/**
 * @param {unknown} value
 * @param {number} pcfRadiusTexels
 * @returns {StaticSunDepthLayout}
 */
function normalizeLayout(value, pcfRadiusTexels, encoding) {
    const source = /** @type {Record<string, any>} */ (value);
    requirePlainObject(source, 'identity.layout');
    requireExactKeys(source, [
        'boundsLightMeters',
        'guardPolicy',
        'guardTexels',
        'interiorTexels',
        'lookup',
        'order',
        'rowOrigin',
        'texelSizeMeters',
        'tileCount'
    ], 'identity.layout');
    if (source.order !== 'row-major-y-then-x-v1') throw new Error('identity.layout.order is unsupported');
    if (source.lookup !== 'half-open-min-inclusive-max-exclusive-v1') {
        throw new Error('identity.layout.lookup is unsupported');
    }
    if (source.rowOrigin !== 'min-light-y-v1') throw new Error('identity.layout.rowOrigin is unsupported');
    if (source.guardPolicy !== 'copy-adjacent-clamp-exterior-v1') {
        throw new Error('identity.layout.guardPolicy is unsupported');
    }
    const tileCount = requireIntegerVector2(source.tileCount, 1, ILLUMINATION_MAX_CHUNKS, 'identity.layout.tileCount');
    const interiorTexels = requireIntegerVector2(
        source.interiorTexels,
        1,
        MAX_INTERIOR_TEXELS,
        'identity.layout.interiorTexels'
    );
    requireIntegerInRange(source.guardTexels, 0, MAX_GUARD_TEXELS, 'identity.layout.guardTexels');
    if (source.guardTexels < pcfRadiusTexels) {
        throw new Error('identity.layout.guardTexels must cover the complete PCF radius');
    }
    if (source.guardTexels > Math.min(interiorTexels[0], interiorTexels[1])) {
        throw new Error('identity.layout.guardTexels cannot exceed the smaller interior dimension');
    }
    const texelSizeFloat32 = requirePositiveFloat32(
        source.texelSizeMeters,
        'identity.layout.texelSizeMeters'
    );
    for (let axis = 0; axis < 2; axis += 1) {
        requirePositiveFloat32(
            interiorTexels[axis] * source.texelSizeMeters,
            'identity.layout tile world size axis ' + axis
        );
        const tileWorldSizeFloat32 = Math.fround(
            interiorTexels[axis] * texelSizeFloat32
        );
        if (!Number.isFinite(tileWorldSizeFloat32)
            || tileWorldSizeFloat32 <= 0) {
            throw new RangeError(
                'identity.layout tile world size must remain finite and positive in float32'
            );
        }
    }
    const tileTotal = tileCount[0] * tileCount[1];
    if (!Number.isSafeInteger(tileTotal) || tileTotal > ILLUMINATION_MAX_CHUNKS) {
        throw new RangeError('identity.layout tile count exceeds the package chunk limit');
    }
    const storedWidth = interiorTexels[0] + source.guardTexels * 2;
    const storedHeight = interiorTexels[1] + source.guardTexels * 2;
    const tileBytes = storedWidth * storedHeight
        * getStaticSunDepthBytesPerTexel(encoding);
    const totalBytes = tileBytes * tileTotal;
    if (!Number.isSafeInteger(tileBytes) || tileBytes > ILLUMINATION_MAX_CHUNK_BYTES) {
        throw new RangeError('identity.layout stored tile exceeds the package chunk byte limit');
    }
    if (!Number.isSafeInteger(totalBytes) || totalBytes > ILLUMINATION_MAX_PACKAGE_BYTES) {
        throw new RangeError('identity.layout stored tile set exceeds the package byte limit');
    }
    requirePlainObject(source.boundsLightMeters, 'identity.layout.boundsLightMeters');
    requireExactKeys(source.boundsLightMeters, ['max', 'min'], 'identity.layout.boundsLightMeters');
    const boundsMin = requireVector2(source.boundsLightMeters.min, 'identity.layout.boundsLightMeters.min');
    const boundsMax = requireVector2(source.boundsLightMeters.max, 'identity.layout.boundsLightMeters.max');
    const expectedMaxX = boundsMin[0] + tileCount[0] * interiorTexels[0] * source.texelSizeMeters;
    const expectedMaxY = boundsMin[1] + tileCount[1] * interiorTexels[1] * source.texelSizeMeters;
    if (!Number.isFinite(expectedMaxX) || !Number.isFinite(expectedMaxY)) {
        throw new RangeError('identity.layout derived bounds must be finite');
    }
    if (!nearlyEqual(boundsMax[0], expectedMaxX, BOUNDS_TOLERANCE)
        || !nearlyEqual(boundsMax[1], expectedMaxY, BOUNDS_TOLERANCE)) {
        throw new Error('identity.layout.boundsLightMeters.max does not match the tile grid');
    }
    requireIncreasingFloat32(boundsMin[0], expectedMaxX, 'identity.layout horizontal bounds');
    requireIncreasingFloat32(boundsMin[1], expectedMaxY, 'identity.layout vertical bounds');
    return {
        order: source.order,
        lookup: source.lookup,
        rowOrigin: source.rowOrigin,
        guardPolicy: source.guardPolicy,
        tileCount,
        interiorTexels,
        guardTexels: source.guardTexels,
        texelSizeMeters: source.texelSizeMeters,
        boundsLightMeters: {min: boundsMin, max: [expectedMaxX, expectedMaxY]}
    };
}

/**
 * @param {unknown} value
 * @param {StaticSunDepthLayout} layout
 * @returns {StaticSunDepthTileDescriptor[]}
 */
function normalizeTiles(value, layout) {
    if (!Array.isArray(value)) throw new TypeError('tiles must be an array');
    const expectedCount = layout.tileCount[0] * layout.tileCount[1];
    if (value.length !== expectedCount) throw new Error('tiles must contain the complete declared grid');
    const tileWidthMeters = layout.interiorTexels[0] * layout.texelSizeMeters;
    const tileHeightMeters = layout.interiorTexels[1] * layout.texelSizeMeters;
    const expectedStored = /** @type {[number, number]} */ ([
        layout.interiorTexels[0] + layout.guardTexels * 2,
        layout.interiorTexels[1] + layout.guardTexels * 2
    ]);
    const ids = new Set();
    return value.map((entry, index) => {
        const source = /** @type {Record<string, any>} */ (entry);
        const label = 'tiles[' + index + ']';
        requirePlainObject(source, label);
        requireExactKeys(source, [
            'contentSha256',
            'coordinates',
            'id',
            'interiorBoundsLightMeters',
            'storedTexels'
        ], label);
        assertStableId(source.id, label + '.id');
        if (ids.has(source.id)) throw new Error('tiles contains duplicate id "' + source.id + '"');
        ids.add(source.id);
        const expectedX = index % layout.tileCount[0];
        const expectedY = Math.floor(index / layout.tileCount[0]);
        const coordinates = requireIntegerVector2(source.coordinates, 0, ILLUMINATION_MAX_CHUNKS, label + '.coordinates');
        if (coordinates[0] !== expectedX || coordinates[1] !== expectedY) {
            throw new Error(label + '.coordinates violates row-major complete-grid order');
        }
        const storedTexels = requireIntegerVector2(
            source.storedTexels,
            1,
            MAX_INTERIOR_TEXELS + MAX_GUARD_TEXELS * 2,
            label + '.storedTexels'
        );
        if (storedTexels[0] !== expectedStored[0] || storedTexels[1] !== expectedStored[1]) {
            throw new Error(label + '.storedTexels does not match layout interior plus guards');
        }
        requirePlainObject(source.interiorBoundsLightMeters, label + '.interiorBoundsLightMeters');
        requireExactKeys(source.interiorBoundsLightMeters, ['max', 'min'], label + '.interiorBoundsLightMeters');
        const boundsMin = requireVector2(
            source.interiorBoundsLightMeters.min,
            label + '.interiorBoundsLightMeters.min'
        );
        const boundsMax = requireVector2(
            source.interiorBoundsLightMeters.max,
            label + '.interiorBoundsLightMeters.max'
        );
        const expectedMinX = layout.boundsLightMeters.min[0] + expectedX * tileWidthMeters;
        const expectedMinY = layout.boundsLightMeters.min[1] + expectedY * tileHeightMeters;
        requireIncreasingFloat32(
            expectedMinX,
            expectedMinX + tileWidthMeters,
            label + ' horizontal bounds'
        );
        requireIncreasingFloat32(
            expectedMinY,
            expectedMinY + tileHeightMeters,
            label + ' vertical bounds'
        );
        if (!nearlyEqual(boundsMin[0], expectedMinX, BOUNDS_TOLERANCE)
            || !nearlyEqual(boundsMin[1], expectedMinY, BOUNDS_TOLERANCE)
            || !nearlyEqual(boundsMax[0], expectedMinX + tileWidthMeters, BOUNDS_TOLERANCE)
            || !nearlyEqual(boundsMax[1], expectedMinY + tileHeightMeters, BOUNDS_TOLERANCE)) {
            throw new Error(label + '.interiorBoundsLightMeters does not match its grid coordinates');
        }
        requireSha256(source.contentSha256, label + '.contentSha256');
        return {
            id: source.id,
            coordinates,
            interiorBoundsLightMeters: {
                min: [expectedMinX, expectedMinY],
                max: [expectedMinX + tileWidthMeters, expectedMinY + tileHeightMeters]
            },
            storedTexels,
            contentSha256: source.contentSha256
        };
    });
}

/** @param {unknown} value @param {string} label */
function requirePlainObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(label + ' must be a plain object');
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(label + ' must be a plain object');
    }
}

/** @param {Record<string, any>} value @param {readonly string[]} expected @param {string} label */
function requireExactKeys(value, expected, label) {
    const actual = Object.keys(value).sort();
    const sortedExpected = [...expected].sort();
    if (actual.length !== sortedExpected.length
        || actual.some((key, index) => key !== sortedExpected[index])) {
        throw new Error(label + ' must contain exactly: ' + sortedExpected.join(', '));
    }
}

/** @param {unknown} value @param {string} label */
function requireSha256(value, label) {
    if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
        throw new TypeError(label + ' must be a lowercase SHA-256 hex digest');
    }
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {[number, number, number]}
 */
function requireVector3(value, label) {
    if (!Array.isArray(value) || value.length !== 3) {
        throw new TypeError(label + ' must contain exactly three finite numbers');
    }
    value.forEach((entry, index) => requireFiniteFloat32(entry, label + '[' + index + ']'));
    return /** @type {[number, number, number]} */ (value.map((entry) => cleanZero(entry)));
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {[number, number]}
 */
function requireVector2(value, label) {
    if (!Array.isArray(value) || value.length !== 2) {
        throw new TypeError(label + ' must contain exactly two finite numbers');
    }
    value.forEach((entry, index) => requireFiniteFloat32(entry, label + '[' + index + ']'));
    return /** @type {[number, number]} */ (value.map((entry) => cleanZero(entry)));
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {[number, number]}
 */
function requirePositiveFloat32Vector2(value, label) {
    if (!Array.isArray(value) || value.length !== 2) {
        throw new TypeError(label + ' must contain exactly two positive numbers');
    }
    requirePositiveFloat32(value[0], label + '[0]');
    requirePositiveFloat32(value[1], label + '[1]');
    return /** @type {[number, number]} */ ([value[0], value[1]]);
}

/**
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @param {string} label
 * @returns {[number, number]}
 */
function requireIntegerVector2(value, min, max, label) {
    if (!Array.isArray(value) || value.length !== 2) {
        throw new TypeError(label + ' must contain exactly two integers');
    }
    requireIntegerInRange(value[0], min, max, label + '[0]');
    requireIntegerInRange(value[1], min, max, label + '[1]');
    return /** @type {[number, number]} */ ([value[0], value[1]]);
}

/** @param {unknown} value @param {number} min @param {number} max @param {string} label */
function requireIntegerInRange(value, min, max, label) {
    if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) {
        throw new RangeError(label + ' must be a safe integer from ' + min + ' through ' + max);
    }
}

/**
 * @param {readonly number[]} value
 * @param {string} label
 * @returns {[number, number, number]}
 */
function requireUnitVector3(value, label) {
    const vector = requireVector3(value, label);
    const magnitude = Math.hypot(vector[0], vector[1], vector[2]);
    if (!nearlyEqual(magnitude, 1, ORTHONORMAL_TOLERANCE)) {
        throw new RangeError(label + ' must be normalized');
    }
    return /** @type {[number, number, number]} */ (vector.map((entry) => cleanZero(entry / magnitude)));
}

/**
 * @param {readonly number[]} value
 * @param {string} label
 * @returns {[number, number, number]}
 */
function normalizeVector3(value, label) {
    const vector = requireVector3(value, label);
    const magnitude = Math.hypot(vector[0], vector[1], vector[2]);
    if (!Number.isFinite(magnitude) || magnitude <= Number.EPSILON) {
        throw new RangeError(label + ' must be non-zero');
    }
    return /** @type {[number, number, number]} */ (vector.map((entry) => cleanZero(entry / magnitude)));
}

/** @param {unknown} value @param {string} label */
function requireFiniteFloat32(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(label + ' must be finite');
    }
    const rounded = Math.fround(value);
    if (!Number.isFinite(rounded)) {
        throw new RangeError(label + ' must round to a finite float32 value');
    }
    return rounded;
}

/** @param {unknown} value @param {string} label */
function requirePositiveFloat32(value, label) {
    const rounded = requireFiniteFloat32(value, label);
    if (typeof value !== 'number' || value <= 0 || rounded <= 0) {
        throw new RangeError(label + ' must remain positive in float32');
    }
    return rounded;
}

/** @param {unknown} value @param {string} label */
function requireNonNegativeFloat32(value, label) {
    const rounded = requireFiniteFloat32(value, label);
    if (typeof value !== 'number' || value < 0 || rounded < 0) {
        throw new RangeError(label + ' must be non-negative');
    }
    if (value > 0 && rounded === 0) {
        throw new RangeError(label + ' must not underflow to zero in float32');
    }
    return rounded;
}

/** @param {number} min @param {number} max @param {string} label */
function requireIncreasingFloat32(min, max, label) {
    const minFloat32 = requireFiniteFloat32(min, label + ' minimum');
    const maxFloat32 = requireFiniteFloat32(max, label + ' maximum');
    const rangeFloat32 = Math.fround(maxFloat32 - minFloat32);
    if (!Number.isFinite(rangeFloat32) || rangeFloat32 <= 0) {
        throw new RangeError(label + ' must remain finite and increasing in float32');
    }
}

/**
 * @param {readonly number[]} axis
 * @param {readonly number[]} origin
 * @param {string} label
 */
function requireWorldToLightTranslationFloat32(axis, origin, label) {
    requireFiniteFloat32(-dot3(axis, origin), label);
    let roundedDot = 0;
    for (let index = 0; index < 3; index += 1) {
        const product = Math.fround(Math.fround(axis[index]) * Math.fround(origin[index]));
        roundedDot = Math.fround(roundedDot + product);
    }
    requireFiniteFloat32(Math.fround(-roundedDot), label + ' from float32 operands');
}

/** @param {readonly number[]} left @param {readonly number[]} right */
function dot3(left, right) {
    return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

/** @param {readonly number[]} left @param {readonly number[]} right @returns {[number, number, number]} */
function cross3(left, right) {
    return [
        left[1] * right[2] - left[2] * right[1],
        left[2] * right[0] - left[0] * right[2],
        left[0] * right[1] - left[1] * right[0]
    ];
}

/** @param {readonly number[]} left @param {readonly number[]} right @param {number} tolerance */
function vectorsNearlyEqual(left, right, tolerance) {
    return left.length === right.length && left.every((entry, index) => nearlyEqual(entry, right[index], tolerance));
}

/** @param {number} left @param {number} right @param {number} tolerance */
function nearlyEqual(left, right, tolerance) {
    return Math.abs(left - right) <= tolerance * Math.max(1, Math.abs(left), Math.abs(right));
}

/** @param {number} value */
function cleanZero(value) {
    return Object.is(value, -0) ? 0 : value;
}
