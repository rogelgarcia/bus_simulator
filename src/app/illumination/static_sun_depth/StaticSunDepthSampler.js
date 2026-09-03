// Samples a resident static-sun depth tile set at arbitrary world positions.
// @ts-check

import {lookupValidatedStaticSunDepthTile} from './StaticSunDepthContract.js';
import {decodeStaticSunDepthMeters} from './StaticSunDepthEncoding.js';
import {
    getStaticSunDepthResidencyMetadata,
    readStaticSunDepthResidentQuantized
} from './StaticSunDepthResidency.js';

/**
 * Performs the descriptor's exact static-sun comparison. The API deliberately
 * contains no bus, route or entity logic. Three r183's screen-rotated Vogel
 * filter additionally requires the exact fragment coordinate that Three
 * supplies as gl_FragCoord.xy; omitting it fails closed instead of inventing
 * a world-space noise phase.
 * Inactive, incomplete, identity-mismatched and out-of-domain queries return
 * zero visibility with an explicit status instead of sampling stale data.
 *
 * @param {unknown} residency
 * @param {readonly number[]} worldPosition
 * @param {readonly number[]} receiverNormalWorld Geometric/interpolated receiver
 * normal matching Three r183's vertex shadow normal, never a fragment normal-map normal.
 * @param {{fragmentCoordinatePixels: readonly [number, number]}} [samplingContext]
 * @returns {Readonly<Record<string, any>>}
 */
export function sampleStaticSunDepthWorld(
    residency,
    worldPosition,
    receiverNormalWorld,
    samplingContext
) {
    const state = getStaticSunDepthResidencyMetadata(residency);
    const position = requireFiniteVector3(worldPosition, 'worldPosition');
    const normal = normalizeVector3(receiverNormalWorld, 'receiverNormalWorld');
    const descriptor = state.descriptor;
    const identity = descriptor.identity;
    const bias = identity.sampling.bias;
    const pcf = identity.sampling.pcf;
    const threeR183Filter = pcf.model === 'three-r183-vogel-5-linear-compare-v1';
    const geometricBias = bias.model
        === 'geometric-normal-offset-plus-constant-depth-relief-v1';
    const geometricNormalOffsetMeters = geometricBias
        ? bias.geometricNormalOffsetMeters : 0;
    const biasedWorldPosition = /** @type {[number, number, number]} */ (geometricBias
        ? [
            position[0] + normal[0] * geometricNormalOffsetMeters,
            position[1] + normal[1] * geometricNormalOffsetMeters,
            position[2] + normal[2] * geometricNormalOffsetMeters
        ] : [...position]);
    const lightPosition = transformWorldToLight(identity.basis, biasedWorldPosition);
    const normalSunDot = clamp(dot3(normal, identity.sunPointDirectionWorld), -1, 1);
    const appliedBiasMeters = geometricBias
        ? bias.constantDepthReliefMeters
        : bias.constantMeters + bias.normalOffsetScaleMeters * (1 - normalSunDot);
    const effectiveDepthReliefMeters = geometricBias
        ? bias.constantDepthReliefMeters + geometricNormalOffsetMeters * normalSunDot
        : appliedBiasMeters;
    let failureContext = {
        position,
        normal,
        biasModel: bias.model,
        biasedWorldPosition,
        lightPosition,
        normalSunDot,
        appliedBiasMeters,
        effectiveDepthReliefMeters,
        constantBiasMeters: geometricBias ? null : bias.constantMeters,
        normalOffsetScaleMeters: geometricBias ? null : bias.normalOffsetScaleMeters,
        constantDepthReliefMeters: geometricBias ? bias.constantDepthReliefMeters : null,
        geometricNormalOffsetMeters,
        pcfModel: pcf.model,
        pcfRadiusTexels: pcf.radiusTexels,
        fragmentCoordinatePixels: null
    };

    let fragmentCoordinatePixels = null;
    if (threeR183Filter) {
        fragmentCoordinatePixels = readFragmentCoordinatePixels(samplingContext);
        if (!fragmentCoordinatePixels) {
            return failClosedResult({
                ...failureContext,
                status: 'invalid_sampling_context',
                reason: 'Three r183 Vogel filtering requires exact fragmentCoordinatePixels'
            });
        }
        failureContext = {...failureContext, fragmentCoordinatePixels};
    }

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

    if (threeR183Filter) {
        return sampleThreeR183VogelFilter({
            residency,
            descriptor,
            identity,
            pcf,
            failureContext,
            lookup,
            residentCenter,
            receiverDepthMeters,
            fragmentCoordinatePixels
        });
    }

    const radius = pcf.radiusTexels;
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
            if (receiverDepthMeters - appliedBiasMeters
                <= conservativeCasterDepthMeters(casterDepthMeters, encoding)) visibleTapCount += 1;
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
        biasedWorldPosition,
        receiverNormalWorld: normal,
        lightPosition,
        receiverDepthMeters,
        normalSunDot,
        biasModel: bias.model,
        appliedBiasMeters,
        effectiveDepthReliefMeters,
        constantBiasMeters: geometricBias ? null : bias.constantMeters,
        normalOffsetScaleMeters: geometricBias ? null : bias.normalOffsetScaleMeters,
        constantDepthReliefMeters: geometricBias ? bias.constantDepthReliefMeters : null,
        geometricNormalOffsetMeters,
        pcfModel: pcf.model,
        pcfRadiusTexels: radius,
        pcfKernelWidthTexels: radius * 2 + 1,
        filterSampleCount: tapCount,
        hardwareComparison: null,
        filterWorldRadiusMeters: null,
        fragmentCoordinatePixels: null,
        comparisonTapCount: tapCount,
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
 * Emulates Three r183's five sampler2DShadow lookups over the RG8 cache. Each
 * Vogel lookup is four depth comparisons blended with hardware-linear weights.
 * Integer taps are resolved through the complete resident tile grid, so a
 * linear footprint crossing an array-layer seam samples the adjacent owner.
 *
 * @param {Record<string, any>} options
 */
function sampleThreeR183VogelFilter(options) {
    const {
        residency,
        descriptor,
        identity,
        pcf,
        failureContext,
        lookup,
        residentCenter,
        receiverDepthMeters,
        fragmentCoordinatePixels
    } = options;
    const layout = identity.layout;
    const encoding = identity.encoding;
    const sampleCount = pcf.sampleCount;
    const comparisonTapCount = sampleCount * 4;
    const filterWorldRadiusMeters = pcf.radiusTexels
        * pcf.shadowMapWorldExtentMeters[0]
        / pcf.shadowMapSizeTexels[0];
    const sourceXLight = [
        dot3(pcf.sourceMapRightAxisWorld, identity.basis.rightAxisWorld)
            * filterWorldRadiusMeters,
        dot3(pcf.sourceMapRightAxisWorld, identity.basis.upAxisWorld)
            * filterWorldRadiusMeters
    ];
    const sourceYLight = [
        dot3(pcf.sourceMapUpAxisWorld, identity.basis.rightAxisWorld)
            * filterWorldRadiusMeters,
        dot3(pcf.sourceMapUpAxisWorld, identity.basis.upAxisWorld)
            * filterWorldRadiusMeters
    ];
    const globalCoordinate = [
        (failureContext.lightPosition[0] - layout.boundsLightMeters.min[0])
            / layout.texelSizeMeters,
        (failureContext.lightPosition[1] - layout.boundsLightMeters.min[1])
            / layout.texelSizeMeters
    ];
    const phi = interleavedGradientNoise(fragmentCoordinatePixels) * Math.PI * 2;
    const comparisonDepthMeters = receiverDepthMeters - failureContext.appliedBiasMeters;
    let weightedVisibleSampleSum = 0;
    let visibleTapCount = 0;
    let emptyTapCount = 0;
    let outOfBoundsTapCount = 0;
    let minCasterDepthMeters = Infinity;
    let maxCasterDepthMeters = -Infinity;

    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
        const disk = vogelDiskSample(sampleIndex, sampleCount, phi);
        const offsetX = (
            disk[0] * sourceXLight[0] + disk[1] * sourceYLight[0]
        ) / layout.texelSizeMeters;
        const offsetY = (
            disk[0] * sourceXLight[1] + disk[1] * sourceYLight[1]
        ) / layout.texelSizeMeters;
        const linearPositionX = globalCoordinate[0] + offsetX - 0.5;
        const linearPositionY = globalCoordinate[1] + offsetY - 0.5;
        const baseX = Math.floor(linearPositionX);
        const baseY = Math.floor(linearPositionY);
        const fractionX = linearPositionX - baseX;
        const fractionY = linearPositionY - baseY;
        const taps = [
            [baseX, baseY, (1 - fractionX) * (1 - fractionY)],
            [baseX + 1, baseY, fractionX * (1 - fractionY)],
            [baseX, baseY + 1, (1 - fractionX) * fractionY],
            [baseX + 1, baseY + 1, fractionX * fractionY]
        ];
        let sampleVisibility = 0;
        for (const [globalX, globalY, weight] of taps) {
            const tap = readGlobalComparisonTap(
                residency,
                descriptor,
                globalX,
                globalY,
                comparisonDepthMeters
            );
            if (tap.status === 'unresident') {
                return failClosedResult({
                    ...failureContext,
                    status: 'unresident',
                    reason: 'Three r183 hardware-PCF tap tile is not resident',
                    tileId: lookup.tile.id,
                    tileCoordinates: lookup.tileCoordinates,
                    interiorTexel: lookup.interiorTexel,
                    centerStoredTexel: lookup.storedTexel
                });
            }
            if (tap.outOfBounds) outOfBoundsTapCount += 1;
            if (tap.empty) emptyTapCount += 1;
            if (tap.visible) visibleTapCount += 1;
            if (tap.casterDepthMeters !== null) {
                minCasterDepthMeters = Math.min(
                    minCasterDepthMeters,
                    tap.casterDepthMeters
                );
                maxCasterDepthMeters = Math.max(
                    maxCasterDepthMeters,
                    tap.casterDepthMeters
                );
            }
            sampleVisibility += tap.visibility * weight;
        }
        weightedVisibleSampleSum += sampleVisibility;
    }

    const visibility = weightedVisibleSampleSum / sampleCount;
    const centerDecodedDepthMeters = decodeStaticSunDepthMeters(residentCenter, encoding);
    return freezeResult({
        status: 'sampled',
        reason: null,
        failClosed: false,
        visibility,
        fullyVisible: visibility === 1,
        fullyOccluded: visibility === 0,
        worldPosition: failureContext.position,
        biasedWorldPosition: failureContext.biasedWorldPosition,
        receiverNormalWorld: failureContext.normal,
        lightPosition: failureContext.lightPosition,
        receiverDepthMeters,
        normalSunDot: failureContext.normalSunDot,
        biasModel: failureContext.biasModel,
        appliedBiasMeters: failureContext.appliedBiasMeters,
        effectiveDepthReliefMeters: failureContext.effectiveDepthReliefMeters,
        constantBiasMeters: failureContext.constantBiasMeters,
        normalOffsetScaleMeters: failureContext.normalOffsetScaleMeters,
        constantDepthReliefMeters: failureContext.constantDepthReliefMeters,
        geometricNormalOffsetMeters: failureContext.geometricNormalOffsetMeters,
        pcfModel: pcf.model,
        pcfRadiusTexels: pcf.radiusTexels,
        pcfKernelWidthTexels: null,
        filterSampleCount: sampleCount,
        hardwareComparison: pcf.hardwareComparison,
        filterWorldRadiusMeters,
        fragmentCoordinatePixels,
        tapCount: comparisonTapCount,
        comparisonTapCount,
        residentTapCount: comparisonTapCount - outOfBoundsTapCount,
        visibleTapCount,
        occludedTapCount: comparisonTapCount - visibleTapCount,
        emptyTapCount,
        outOfBoundsTapCount,
        weightedVisibleSampleSum,
        tileId: lookup.tile.id,
        tileCoordinates: lookup.tileCoordinates,
        interiorTexel: lookup.interiorTexel,
        centerStoredTexel: lookup.storedTexel,
        centerQuantizedDepth: residentCenter,
        centerDecodedDepthMeters,
        minCasterDepthMeters: minCasterDepthMeters === Infinity
            ? null : minCasterDepthMeters,
        maxCasterDepthMeters: maxCasterDepthMeters === -Infinity
            ? null : maxCasterDepthMeters
    });
}

/**
 * @param {unknown} residency
 * @param {Readonly<Record<string, any>>} descriptor
 * @param {number} globalX
 * @param {number} globalY
 * @param {number} comparisonDepthMeters
 */
function readGlobalComparisonTap(
    residency,
    descriptor,
    globalX,
    globalY,
    comparisonDepthMeters
) {
    const identity = descriptor.identity;
    const layout = identity.layout;
    const globalWidth = layout.tileCount[0] * layout.interiorTexels[0];
    const globalHeight = layout.tileCount[1] * layout.interiorTexels[1];
    if (globalX < 0 || globalX >= globalWidth
        || globalY < 0 || globalY >= globalHeight) {
        return {
            status: 'sampled',
            visibility: 0,
            visible: false,
            empty: false,
            outOfBounds: true,
            casterDepthMeters: null
        };
    }
    const tileX = Math.floor(globalX / layout.interiorTexels[0]);
    const tileY = Math.floor(globalY / layout.interiorTexels[1]);
    const tile = descriptor.tiles[tileY * layout.tileCount[0] + tileX];
    const storedX = globalX - tileX * layout.interiorTexels[0] + layout.guardTexels;
    const storedY = globalY - tileY * layout.interiorTexels[1] + layout.guardTexels;
    const quantized = readStaticSunDepthResidentQuantized(
        residency,
        tile.id,
        storedX,
        storedY
    );
    if (quantized === null) return {status: 'unresident'};
    const casterDepthMeters = decodeStaticSunDepthMeters(quantized, identity.encoding);
    const empty = casterDepthMeters === null;
    const visible = empty || comparisonDepthMeters
        <= conservativeCasterDepthMeters(casterDepthMeters, identity.encoding);
    return {
        status: 'sampled',
        visibility: visible ? 1 : 0,
        visible,
        empty,
        outOfBounds: false,
        casterDepthMeters
    };
}

function conservativeCasterDepthMeters(decodedDepthMeters, encoding) {
    if (decodedDepthMeters === null) return null;
    const safetyMargin = (encoding.maxDepthMeters - encoding.minDepthMeters)
        / encoding.maxQuantized * 0.375;
    return Math.max(encoding.minDepthMeters, decodedDepthMeters - safetyMargin);
}

/** @param {readonly [number, number]} position */
function interleavedGradientNoise(position) {
    return fract(52.9829189 * fract(
        position[0] * 0.06711056 + position[1] * 0.00583715
    ));
}

/** @param {number} sampleIndex @param {number} sampleCount @param {number} phi */
function vogelDiskSample(sampleIndex, sampleCount, phi) {
    const radius = Math.sqrt((sampleIndex + 0.5) / sampleCount);
    const theta = sampleIndex * 2.399963229728653 + phi;
    return [Math.cos(theta) * radius, Math.sin(theta) * radius];
}

/** @param {unknown} value @returns {[number, number] | null} */
function readFragmentCoordinatePixels(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    if (Object.keys(value).length !== 1
        || !Object.prototype.hasOwnProperty.call(value, 'fragmentCoordinatePixels')) {
        return null;
    }
    const property = Object.getOwnPropertyDescriptor(value, 'fragmentCoordinatePixels');
    if (!property || !Object.prototype.hasOwnProperty.call(property, 'value')) return null;
    const coordinates = property.value;
    if (!Array.isArray(coordinates) || coordinates.length !== 2
        || coordinates.some((entry) => !Number.isFinite(entry) || entry < 0)) {
        return null;
    }
    return /** @type {[number, number]} */ (coordinates.map((entry) => (
        Object.is(entry, -0) ? 0 : entry
    )));
}

/** @param {number} value */
function fract(value) {
    return value - Math.floor(value);
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
 *   biasModel: string,
 *   biasedWorldPosition: readonly [number, number, number],
 *   lightPosition: readonly [number, number, number],
 *   normalSunDot: number,
 *   appliedBiasMeters: number,
 *   effectiveDepthReliefMeters: number,
 *   constantBiasMeters: number | null,
 *   normalOffsetScaleMeters: number | null,
 *   constantDepthReliefMeters: number | null,
 *   geometricNormalOffsetMeters: number,
 *   pcfModel: string,
 *   pcfRadiusTexels: number,
 *   fragmentCoordinatePixels: readonly [number, number] | null,
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
        biasedWorldPosition: options.biasedWorldPosition,
        receiverNormalWorld: options.normal,
        lightPosition: options.lightPosition,
        receiverDepthMeters: options.lightPosition[2],
        normalSunDot: options.normalSunDot,
        biasModel: options.biasModel,
        appliedBiasMeters: options.appliedBiasMeters,
        effectiveDepthReliefMeters: options.effectiveDepthReliefMeters,
        constantBiasMeters: options.constantBiasMeters,
        normalOffsetScaleMeters: options.normalOffsetScaleMeters,
        constantDepthReliefMeters: options.constantDepthReliefMeters,
        geometricNormalOffsetMeters: options.geometricNormalOffsetMeters,
        pcfModel: options.pcfModel,
        pcfRadiusTexels: options.pcfRadiusTexels,
        pcfKernelWidthTexels: options.pcfModel === 'square-nearest-box-v1'
            ? options.pcfRadiusTexels * 2 + 1 : null,
        filterSampleCount: 0,
        hardwareComparison: options.pcfModel === 'three-r183-vogel-5-linear-compare-v1'
            ? 'linear-four-compare-taps-v1' : null,
        filterWorldRadiusMeters: null,
        fragmentCoordinatePixels: options.fragmentCoordinatePixels,
        comparisonTapCount: 0,
        tapCount: 0,
        residentTapCount: 0,
        visibleTapCount: 0,
        occludedTapCount: 0,
        emptyTapCount: 0,
        outOfBoundsTapCount: 0,
        weightedVisibleSampleSum: 0,
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
