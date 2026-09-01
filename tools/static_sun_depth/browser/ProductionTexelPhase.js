// Proves production cache texels share the prepared Three r183 shadow lattice.
// @ts-check

const AXIS_TOLERANCE = 1e-9;
const PHASE_TOLERANCE_TEXELS = 1e-9;

const SIGNED_PERMUTATIONS = Object.freeze([
    Object.freeze([Object.freeze([1, 0]), Object.freeze([0, 1])]),
    Object.freeze([Object.freeze([1, 0]), Object.freeze([0, -1])]),
    Object.freeze([Object.freeze([-1, 0]), Object.freeze([0, 1])]),
    Object.freeze([Object.freeze([-1, 0]), Object.freeze([0, -1])]),
    Object.freeze([Object.freeze([0, 1]), Object.freeze([1, 0])]),
    Object.freeze([Object.freeze([0, 1]), Object.freeze([-1, 0])]),
    Object.freeze([Object.freeze([0, -1]), Object.freeze([1, 0])]),
    Object.freeze([Object.freeze([0, -1]), Object.freeze([-1, 0])])
]);

/**
 * @param {any} descriptor
 */
export function validateProductionStaticSunTexelLattice(descriptor) {
    const basis = requireRecord(descriptor?.identity?.basis, 'descriptor.identity.basis');
    const layout = requireRecord(descriptor?.identity?.layout, 'descriptor.identity.layout');
    const sampling = requireRecord(
        descriptor?.identity?.sampling,
        'descriptor.identity.sampling'
    );
    const pcf = requireRecord(sampling.pcf, 'descriptor.identity.sampling.pcf');
    const sourceMapSizeTexels = requirePositiveIntegerVector2(
        pcf.shadowMapSizeTexels,
        'descriptor.identity.sampling.pcf.shadowMapSizeTexels'
    );
    const sourceMapWorldExtentMeters = requirePositiveVector2(
        pcf.shadowMapWorldExtentMeters,
        'descriptor.identity.sampling.pcf.shadowMapWorldExtentMeters'
    );
    if (sourceMapSizeTexels.some((value) => value % 2 !== 0)) {
        throw new Error('Production live source shadow map dimensions must be even');
    }
    const sourceTexelPitchMeters = /** @type {[number, number]} */ ([
        sourceMapWorldExtentMeters[0] / sourceMapSizeTexels[0],
        sourceMapWorldExtentMeters[1] / sourceMapSizeTexels[1]
    ]);
    const cacheTexelPitchMeters = requirePositiveFiniteNumber(
        layout.texelSizeMeters,
        'descriptor.identity.layout.texelSizeMeters'
    );
    if (sourceTexelPitchMeters[0] !== sourceTexelPitchMeters[1]
        || cacheTexelPitchMeters !== sourceTexelPitchMeters[0]) {
        throw new Error(
            'Production cache texel pitch differs from the live source shadow texel pitch'
        );
    }

    const sourceAxes = [
        requireVector3(pcf.sourceMapRightAxisWorld, 'sourceMapRightAxisWorld'),
        requireVector3(pcf.sourceMapUpAxisWorld, 'sourceMapUpAxisWorld')
    ];
    const cacheAxes = [
        requireVector3(basis.rightAxisWorld, 'basis.rightAxisWorld'),
        requireVector3(basis.upAxisWorld, 'basis.upAxisWorld')
    ];
    const sourceToCacheLightAxisTransform = cacheAxes.map((cacheAxis) => (
        sourceAxes.map((sourceAxis) => dot3(cacheAxis, sourceAxis))
    ));
    const match = closestSignedPermutation(sourceToCacheLightAxisTransform);
    if (match.maximumError > AXIS_TOLERANCE) {
        throw new Error('Production source/cache light axes are not a signed permutation');
    }

    const originWorld = requireVector3(basis.originWorld, 'basis.originWorld');
    const bounds = requireRecord(layout.boundsLightMeters, 'layout.boundsLightMeters');
    const boundsMin = requireVector2(bounds.min, 'layout.boundsLightMeters.min');
    const boundsMax = requireVector2(bounds.max, 'layout.boundsLightMeters.max');
    const originCacheLightMeters = /** @type {[number, number]} */ (
        cacheAxes.map((axis) => dot3(originWorld, axis))
    );
    const absoluteEdges = {
        min: /** @type {[number, number]} */ (boundsMin.map(
            (value, axis) => value + originCacheLightMeters[axis]
        )),
        max: /** @type {[number, number]} */ (boundsMax.map(
            (value, axis) => value + originCacheLightMeters[axis]
        ))
    };
    const edgeIndices = {
        min: /** @type {[number, number]} */ (absoluteEdges.min.map(
            (value) => value / cacheTexelPitchMeters
        )),
        max: /** @type {[number, number]} */ (absoluteEdges.max.map(
            (value) => value / cacheTexelPitchMeters
        ))
    };
    const edgeErrors = [...edgeIndices.min, ...edgeIndices.max].map(integerPhaseError);
    const maximumEdgePhaseErrorTexels = Math.max(...edgeErrors);
    if (maximumEdgePhaseErrorTexels > PHASE_TOLERANCE_TEXELS) {
        throw new Error(
            'Production cache grid edge is not phase-aligned with the world-origin live source shadow lattice'
        );
    }

    return freezeDeep({
        cacheAbsoluteGridEdgesMeters: absoluteEdges,
        cacheAbsoluteGridEdgeTexelIndices: edgeIndices,
        cacheTexelPitchMeters,
        matchedSignedPermutation: match.permutation,
        maximumEdgePhaseErrorTexels,
        signedPermutationMaximumError: match.maximumError,
        sourceTexelPitchMeters,
        sourceToCacheLightAxisTransform
    });
}

/**
 * @param {{
 *   descriptor: any,
 *   sourceCameraBoundsMeters: {left: number, right: number, bottom: number, top: number},
 *   sourceCameraCenterWorld: readonly number[],
 *   sourceMapRightAxisWorld: readonly number[],
 *   sourceMapUpAxisWorld: readonly number[]
 * }} value
 */
export function createProductionLiveTexelPhaseEvidence(value) {
    const descriptor = value?.descriptor;
    const staticEvidence = validateProductionStaticSunTexelLattice(descriptor);
    const basis = descriptor.identity.basis;
    const layout = descriptor.identity.layout;
    const pcf = descriptor.identity.sampling.pcf;
    const originWorld = requireVector3(basis.originWorld, 'basis.originWorld');
    const bounds = requireRecord(layout.boundsLightMeters, 'layout.boundsLightMeters');
    const boundsMin = requireVector2(bounds.min, 'layout.boundsLightMeters.min');
    const boundsMax = requireVector2(bounds.max, 'layout.boundsLightMeters.max');
    const cacheAxes = [basis.rightAxisWorld, basis.upAxisWorld];
    const sourceAxes = [
        requireVector3(value?.sourceMapRightAxisWorld, 'sourceMapRightAxisWorld'),
        requireVector3(value?.sourceMapUpAxisWorld, 'sourceMapUpAxisWorld')
    ];
    const declaredSourceAxes = [pcf.sourceMapRightAxisWorld, pcf.sourceMapUpAxisWorld];
    const sourceAxisMaximumError = Math.max(...sourceAxes.flatMap(
        (axis, axisIndex) => axis.map(
            (component, componentIndex) => (
                Math.abs(component - declaredSourceAxes[axisIndex][componentIndex])
            )
        )
    ));
    if (sourceAxisMaximumError > AXIS_TOLERANCE) {
        throw new Error(
            'Prepared live source shadow axes differ from the active descriptor axes'
        );
    }
    const liveSourceToCacheLightAxisTransform = cacheAxes.map((cacheAxis) => (
        sourceAxes.map((sourceAxis) => dot3(cacheAxis, sourceAxis))
    ));
    const livePermutationMatch = closestSignedPermutation(
        liveSourceToCacheLightAxisTransform
    );
    if (livePermutationMatch.maximumError > AXIS_TOLERANCE) {
        throw new Error(
            'Prepared live source/cache light axes are not a signed permutation'
        );
    }
    const sourceCameraCenterWorld = requireVector3(
        value?.sourceCameraCenterWorld,
        'sourceCameraCenterWorld'
    );
    const cameraBounds = requireCameraBounds(value?.sourceCameraBoundsMeters);
    const liveExtent = [
        cameraBounds.right - cameraBounds.left,
        cameraBounds.top - cameraBounds.bottom
    ];
    if (liveExtent[0] !== pcf.shadowMapWorldExtentMeters[0]
        || liveExtent[1] !== pcf.shadowMapWorldExtentMeters[1]) {
        throw new Error(
            'Prepared live source shadow camera bounds differ from the descriptor filter extent'
        );
    }

    const sourceCameraCenterSourceMeters = /** @type {[number, number]} */ (
        sourceAxes.map((axis) => dot3(sourceCameraCenterWorld, axis))
    );
    const sourceCameraCenterTexelIndices = /** @type {[number, number]} */ (
        sourceCameraCenterSourceMeters.map(
            (value, axis) => value / staticEvidence.sourceTexelPitchMeters[axis]
        )
    );
    const sourceCameraCenterMaximumSnapErrorTexels = Math.max(
        ...sourceCameraCenterTexelIndices.map(integerPhaseError)
    );
    if (sourceCameraCenterMaximumSnapErrorTexels > PHASE_TOLERANCE_TEXELS) {
        throw new Error(
            'Prepared live source shadow camera center is not snapped to the world-origin texel lattice'
        );
    }

    const sourceLowerTexelCenterOffsetMeters = [
        cameraBounds.left + staticEvidence.sourceTexelPitchMeters[0] / 2,
        cameraBounds.bottom + staticEvidence.sourceTexelPitchMeters[1] / 2
    ];
    const sourceCameraCenterCacheLightMeters = /** @type {[number, number]} */ (
        cacheAxes.map((axis) => dot3(subtract3(sourceCameraCenterWorld, originWorld), axis))
    );
    const sourceLowerTexelCenterCacheLightMeters = /** @type {[number, number]} */ (
        sourceCameraCenterCacheLightMeters.map((center, cacheAxis) => (
            center
            + liveSourceToCacheLightAxisTransform[cacheAxis][0]
                * sourceLowerTexelCenterOffsetMeters[0]
            + liveSourceToCacheLightAxisTransform[cacheAxis][1]
                * sourceLowerTexelCenterOffsetMeters[1]
        ))
    );
    const cacheFirstTexelCenterLightMeters = /** @type {[number, number]} */ (
        layout.boundsLightMeters.min.map(
            (edge) => edge + staticEvidence.cacheTexelPitchMeters / 2
        )
    );
    const cacheToLivePhaseIndices = /** @type {[number, number]} */ (
        cacheFirstTexelCenterLightMeters.map((center, axis) => (
            (center - sourceLowerTexelCenterCacheLightMeters[axis])
                / staticEvidence.cacheTexelPitchMeters
        ))
    );
    const maximumPhaseIndexError = Math.max(
        ...cacheToLivePhaseIndices.map(integerPhaseError)
    );
    if (maximumPhaseIndexError > PHASE_TOLERANCE_TEXELS) {
        throw new Error(
            'Production cache texel centers are not phase-aligned with the prepared live source shadow camera'
        );
    }

    return freezeDeep({
        schema: 'ai531-production-live-texel-phase-evidence-v1',
        policy: 'three-r183-even-map-world-origin-snapped-live-texel-center-v1',
        status: 'verified',
        ...staticEvidence,
        cacheBasis: {
            originWorld,
            rightAxisWorld: cacheAxes[0],
            upAxisWorld: cacheAxes[1]
        },
        cacheBoundsLightMeters: {
            max: boundsMax,
            min: boundsMin
        },
        sourceCameraBoundsMeters: cameraBounds,
        sourceCameraCenterWorld,
        sourceCameraCenterSourceMeters,
        sourceCameraCenterTexelIndices,
        sourceCameraCenterMaximumSnapErrorTexels,
        sourceCameraCenterCacheLightMeters,
        sourceAxisMaximumError,
        sourceMapRightAxisWorld: sourceAxes[0],
        sourceMapUpAxisWorld: sourceAxes[1],
        liveMatchedSignedPermutation: livePermutationMatch.permutation,
        liveSignedPermutationMaximumError: livePermutationMatch.maximumError,
        liveSourceToCacheLightAxisTransform,
        sourceLowerTexelCenterOffsetMeters,
        sourceLowerTexelCenterCacheLightMeters,
        cacheFirstTexelCenterLightMeters,
        cacheToLivePhaseIndices,
        maximumPhaseIndexError
    });
}

/** @param {number[][]} matrix */
function closestSignedPermutation(matrix) {
    let permutation = SIGNED_PERMUTATIONS[0];
    let maximumError = Infinity;
    for (const candidate of SIGNED_PERMUTATIONS) {
        const error = Math.max(
            Math.abs(matrix[0][0] - candidate[0][0]),
            Math.abs(matrix[0][1] - candidate[0][1]),
            Math.abs(matrix[1][0] - candidate[1][0]),
            Math.abs(matrix[1][1] - candidate[1][1])
        );
        if (error < maximumError) {
            maximumError = error;
            permutation = candidate;
        }
    }
    return {maximumError, permutation};
}

/** @param {unknown} value */
function requireCameraBounds(value) {
    const bounds = requireRecord(value, 'sourceCameraBoundsMeters');
    const keys = Object.keys(bounds).sort();
    if (JSON.stringify(keys) !== JSON.stringify(['bottom', 'left', 'right', 'top'])) {
        throw new TypeError('sourceCameraBoundsMeters must contain exactly bottom, left, right, top');
    }
    const result = {
        bottom: requireFiniteNumber(bounds.bottom, 'sourceCameraBoundsMeters.bottom'),
        left: requireFiniteNumber(bounds.left, 'sourceCameraBoundsMeters.left'),
        right: requireFiniteNumber(bounds.right, 'sourceCameraBoundsMeters.right'),
        top: requireFiniteNumber(bounds.top, 'sourceCameraBoundsMeters.top')
    };
    if (!(result.right > result.left) || !(result.top > result.bottom)) {
        throw new RangeError('sourceCameraBoundsMeters must have positive width and height');
    }
    return result;
}

/** @param {unknown} value @param {string} label */
function requireRecord(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(`${label} must be an object`);
    }
    return /** @type {Record<string, any>} */ (value);
}

/** @param {unknown} value @param {string} label */
function requireVector2(value, label) {
    if (!Array.isArray(value) || value.length !== 2) {
        throw new TypeError(`${label} must be a two-number array`);
    }
    return /** @type {[number, number]} */ (value.map(
        (entry, index) => requireFiniteNumber(entry, `${label}[${index}]`)
    ));
}

/** @param {unknown} value @param {string} label */
function requirePositiveVector2(value, label) {
    const result = requireVector2(value, label);
    if (result.some((entry) => entry <= 0)) throw new RangeError(`${label} must be positive`);
    return result;
}

/** @param {unknown} value @param {string} label */
function requirePositiveIntegerVector2(value, label) {
    const result = requirePositiveVector2(value, label);
    if (result.some((entry) => !Number.isSafeInteger(entry))) {
        throw new TypeError(`${label} must contain positive safe integers`);
    }
    return result;
}

/** @param {unknown} value @param {string} label */
function requireVector3(value, label) {
    if (!Array.isArray(value) || value.length !== 3) {
        throw new TypeError(`${label} must be a three-number array`);
    }
    return /** @type {[number, number, number]} */ (value.map(
        (entry, index) => requireFiniteNumber(entry, `${label}[${index}]`)
    ));
}

/** @param {unknown} value @param {string} label */
function requireFiniteNumber(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(`${label} must be finite`);
    }
    return value;
}

/** @param {unknown} value @param {string} label */
function requirePositiveFiniteNumber(value, label) {
    const result = requireFiniteNumber(value, label);
    if (result <= 0) throw new RangeError(`${label} must be positive`);
    return result;
}

/** @param {readonly number[]} a @param {readonly number[]} b */
function dot3(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** @param {readonly number[]} a @param {readonly number[]} b */
function subtract3(a, b) {
    return /** @type {[number, number, number]} */ ([
        a[0] - b[0],
        a[1] - b[1],
        a[2] - b[2]
    ]);
}

/** @param {number} value */
function integerPhaseError(value) {
    return Math.abs(value - Math.round(value));
}

/** @template T @param {T} value @returns {T} */
function freezeDeep(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) freezeDeep(child);
    return Object.freeze(value);
}
