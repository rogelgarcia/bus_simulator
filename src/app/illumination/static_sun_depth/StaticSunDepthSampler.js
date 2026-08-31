// Samples a resident static-sun depth tile set at arbitrary world positions.
// @ts-check

import {lookupValidatedStaticSunDepthTile} from './StaticSunDepthContract.js';
import {decodeStaticSunDepthMeters} from './StaticSunDepthEncoding.js';
import {
    getStaticSunDepthResidencyMetadata,
    readStaticSunDepthResidentQuantized
} from './StaticSunDepthResidency.js';

/**
 * Performs the V1 nearest box PCF comparison. The API deliberately accepts
 * only world-space receiver data and contains no bus, route or entity logic.
 * Inactive, incomplete, identity-mismatched and out-of-domain queries return
 * zero visibility with an explicit status instead of sampling stale data.
 *
 * @param {unknown} residency
 * @param {readonly number[]} worldPosition
 * @param {readonly number[]} receiverNormalWorld
 * @returns {Readonly<Record<string, any>>}
 */
export function sampleStaticSunDepthWorld(residency, worldPosition, receiverNormalWorld) {
    const state = getStaticSunDepthResidencyMetadata(residency);
    const position = requireFiniteVector3(worldPosition, 'worldPosition');
    const normal = normalizeVector3(receiverNormalWorld, 'receiverNormalWorld');
    const descriptor = state.descriptor;
    const identity = descriptor.identity;
    const lightPosition = transformWorldToLight(identity.basis, position);
    const normalSunDot = clamp(dot3(normal, identity.sunPointDirectionWorld), -1, 1);
    const appliedBiasMeters = identity.sampling.bias.constantMeters
        + identity.sampling.bias.normalOffsetScaleMeters * (1 - normalSunDot);
    const failureContext = {
        position,
        normal,
        lightPosition,
        normalSunDot,
        appliedBiasMeters,
        constantBiasMeters: identity.sampling.bias.constantMeters,
        normalOffsetScaleMeters: identity.sampling.bias.normalOffsetScaleMeters,
        pcfRadiusTexels: identity.sampling.pcf.radiusTexels
    };

    if (state.status !== 'active') {
        const status = state.status === 'incomplete' ? 'unresident' : state.status;
        return failClosedResult({
            ...failureContext,
            status,
            reason: 'static sun depth residency is ' + state.status
        });
    }

    const encoding = identity.encoding;
    const receiverDepthMeters = lightPosition[2];
    if (receiverDepthMeters < encoding.minDepthMeters
        || receiverDepthMeters > encoding.maxDepthMeters) {
        return failClosedResult({
            ...failureContext,
            status: 'depth_out_of_bounds',
            reason: 'receiver light-space depth is outside the encoded range'
        });
    }

    const lookup = lookupValidatedStaticSunDepthTile(
        descriptor,
        lightPosition[0],
        lightPosition[1]
    );
    if (!lookup) {
        return failClosedResult({
            ...failureContext,
            status: 'out_of_bounds',
            reason: 'receiver light-space XY is outside the half-open tile domain'
        });
    }

    const residentCenter = readStaticSunDepthResidentQuantized(
        residency,
        lookup.tile.id,
        lookup.storedTexel[0],
        lookup.storedTexel[1]
    );
    if (residentCenter === null) {
        return failClosedResult({
            ...failureContext,
            status: 'unresident',
            reason: 'owning tile is not resident',
            tileId: lookup.tile.id,
            tileCoordinates: lookup.tileCoordinates,
            interiorTexel: lookup.interiorTexel,
            centerStoredTexel: lookup.storedTexel
        });
    }

    const radius = identity.sampling.pcf.radiusTexels;
    const storedWidth = lookup.tile.storedTexels[0];
    const storedHeight = lookup.tile.storedTexels[1];
    let visibleTapCount = 0;
    let occludedTapCount = 0;
    let emptyTapCount = 0;
    let outOfBoundsTapCount = 0;
    let centerQuantizedDepth = null;
    let centerDecodedDepthMeters = null;
    let minCasterDepthMeters = Infinity;
    let maxCasterDepthMeters = -Infinity;
    const tapCount = (radius * 2 + 1) ** 2;
    const globalCenterX = lookup.tileCoordinates[0] * identity.layout.interiorTexels[0]
        + lookup.interiorTexel[0];
    const globalCenterY = lookup.tileCoordinates[1] * identity.layout.interiorTexels[1]
        + lookup.interiorTexel[1];
    const globalWidth = identity.layout.tileCount[0] * identity.layout.interiorTexels[0];
    const globalHeight = identity.layout.tileCount[1] * identity.layout.interiorTexels[1];
    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
            const globalX = globalCenterX + offsetX;
            const globalY = globalCenterY + offsetY;
            if (globalX < 0 || globalX >= globalWidth || globalY < 0 || globalY >= globalHeight) {
                outOfBoundsTapCount += 1;
                occludedTapCount += 1;
                continue;
            }
            const storedX = lookup.storedTexel[0] + offsetX;
            const storedY = lookup.storedTexel[1] + offsetY;
            if (storedX < 0 || storedX >= storedWidth || storedY < 0 || storedY >= storedHeight) {
                return failClosedResult({
                    ...failureContext,
                    status: 'invalid_residency',
                    reason: 'PCF tap escaped validated guard storage',
                    tileId: lookup.tile.id,
                    tileCoordinates: lookup.tileCoordinates,
                    interiorTexel: lookup.interiorTexel,
                    centerStoredTexel: lookup.storedTexel
                });
            }
            const quantized = readStaticSunDepthResidentQuantized(
                residency,
                lookup.tile.id,
                storedX,
                storedY
            );
            if (quantized === null) {
                return failClosedResult({
                    ...failureContext,
                    status: 'unresident',
                    reason: 'PCF tap tile is not resident',
                    tileId: lookup.tile.id,
                    tileCoordinates: lookup.tileCoordinates,
                    interiorTexel: lookup.interiorTexel,
                    centerStoredTexel: lookup.storedTexel
                });
            }
            const casterDepthMeters = decodeStaticSunDepthMeters(quantized, encoding);
            if (offsetX === 0 && offsetY === 0) {
                centerQuantizedDepth = quantized;
                centerDecodedDepthMeters = casterDepthMeters;
            }
            if (casterDepthMeters === null) {
                emptyTapCount += 1;
                visibleTapCount += 1;
                continue;
            }
            minCasterDepthMeters = Math.min(minCasterDepthMeters, casterDepthMeters);
            maxCasterDepthMeters = Math.max(maxCasterDepthMeters, casterDepthMeters);
            if (receiverDepthMeters - appliedBiasMeters <= casterDepthMeters) visibleTapCount += 1;
            else occludedTapCount += 1;
        }
    }
    const visibility = visibleTapCount / tapCount;
    return freezeResult({
        status: 'sampled',
        reason: null,
        failClosed: false,
        visibility,
        fullyVisible: visibleTapCount === tapCount,
        fullyOccluded: visibleTapCount === 0,
        worldPosition: position,
        receiverNormalWorld: normal,
        lightPosition,
        receiverDepthMeters,
        normalSunDot,
        appliedBiasMeters,
        constantBiasMeters: identity.sampling.bias.constantMeters,
        normalOffsetScaleMeters: identity.sampling.bias.normalOffsetScaleMeters,
        pcfRadiusTexels: radius,
        pcfKernelWidthTexels: radius * 2 + 1,
        tapCount,
        residentTapCount: tapCount - outOfBoundsTapCount,
        visibleTapCount,
        occludedTapCount,
        emptyTapCount,
        outOfBoundsTapCount,
        tileId: lookup.tile.id,
        tileCoordinates: lookup.tileCoordinates,
        interiorTexel: lookup.interiorTexel,
        centerStoredTexel: lookup.storedTexel,
        centerQuantizedDepth,
        centerDecodedDepthMeters,
        minCasterDepthMeters: minCasterDepthMeters === Infinity ? null : minCasterDepthMeters,
        maxCasterDepthMeters: maxCasterDepthMeters === -Infinity ? null : maxCasterDepthMeters
    });
}

/**
 * @param {import('./StaticSunDepthContract.js').StaticSunDepthBasis} basis
 * @param {readonly [number, number, number]} position
 * @returns {[number, number, number]}
 */
function transformWorldToLight(basis, position) {
    const relative = /** @type {[number, number, number]} */ ([
        position[0] - basis.originWorld[0],
        position[1] - basis.originWorld[1],
        position[2] - basis.originWorld[2]
    ]);
    return [
        dot3(relative, basis.rightAxisWorld),
        dot3(relative, basis.upAxisWorld),
        dot3(relative, basis.depthAxisWorld)
    ];
}

/**
 * @param {{
 *   status: string,
 *   reason: string,
 *   position: readonly [number, number, number],
 *   normal: readonly [number, number, number],
 *   lightPosition: readonly [number, number, number],
 *   normalSunDot: number,
 *   appliedBiasMeters: number,
 *   constantBiasMeters: number,
 *   normalOffsetScaleMeters: number,
 *   pcfRadiusTexels: number,
 *   tileId?: string,
 *   tileCoordinates?: readonly [number, number],
 *   interiorTexel?: readonly [number, number],
 *   centerStoredTexel?: readonly [number, number]
 * }} options
 */
function failClosedResult(options) {
    return freezeResult({
        status: options.status,
        reason: options.reason,
        failClosed: true,
        visibility: 0,
        fullyVisible: false,
        fullyOccluded: true,
        worldPosition: options.position,
        receiverNormalWorld: options.normal,
        lightPosition: options.lightPosition,
        receiverDepthMeters: options.lightPosition[2],
        normalSunDot: options.normalSunDot,
        appliedBiasMeters: options.appliedBiasMeters,
        constantBiasMeters: options.constantBiasMeters,
        normalOffsetScaleMeters: options.normalOffsetScaleMeters,
        pcfRadiusTexels: options.pcfRadiusTexels,
        pcfKernelWidthTexels: options.pcfRadiusTexels * 2 + 1,
        tapCount: 0,
        residentTapCount: 0,
        visibleTapCount: 0,
        occludedTapCount: 0,
        emptyTapCount: 0,
        outOfBoundsTapCount: 0,
        tileId: options.tileId ?? null,
        tileCoordinates: options.tileCoordinates ?? null,
        interiorTexel: options.interiorTexel ?? null,
        centerStoredTexel: options.centerStoredTexel ?? null,
        centerQuantizedDepth: null,
        centerDecodedDepthMeters: null,
        minCasterDepthMeters: null,
        maxCasterDepthMeters: null
    });
}

/** @param {Record<string, any>} value */
function freezeResult(value) {
    for (const entry of Object.values(value)) {
        if (Array.isArray(entry) && !Object.isFrozen(entry)) Object.freeze(entry);
    }
    return Object.freeze(value);
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {[number, number, number]}
 */
function requireFiniteVector3(value, label) {
    if (!Array.isArray(value) || value.length !== 3 || value.some((entry) => !Number.isFinite(entry))) {
        throw new TypeError(label + ' must contain exactly three finite numbers');
    }
    return /** @type {[number, number, number]} */ (value.map((entry) => Object.is(entry, -0) ? 0 : entry));
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {[number, number, number]}
 */
function normalizeVector3(value, label) {
    const vector = requireFiniteVector3(value, label);
    const magnitude = Math.hypot(vector[0], vector[1], vector[2]);
    if (!Number.isFinite(magnitude) || magnitude <= Number.EPSILON) {
        throw new RangeError(label + ' must be non-zero');
    }
    return /** @type {[number, number, number]} */ (vector.map((entry) => {
        const normalized = entry / magnitude;
        return Object.is(normalized, -0) ? 0 : normalized;
    }));
}

/** @param {readonly number[]} left @param {readonly number[]} right */
function dot3(left, right) {
    return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
