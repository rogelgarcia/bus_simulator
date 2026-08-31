// Defines deterministic close, billboard, middle, and texture-only grass handoffs.
// @ts-check

export const GRASS_AUTO_LOD_SCHEMA = 'bus-simulator.grass-auto-lod';
export const GRASS_AUTO_LOD_VERSION = 2;

export const GRASS_AUTO_LOD_FORCE = Object.freeze({
    AUTO: 'auto',
    NEAR: 'near',
    BILLBOARD: 'billboard',
    MIDDLE: 'middle',
    CLUSTER: 'cluster',
    TEXTURE: 'texture'
});

export const GRASS_AUTO_LOD_DEFAULTS = Object.freeze({
    enabled: true,
    force: GRASS_AUTO_LOD_FORCE.AUTO,
    nearEndMeters: 3,
    billboardEndMeters: 8,
    middleEndMeters: 25,
    clusterEndMeters: 25,
    transitionWidthMeters: 2,
    hysteresisMeters: 0.75,
    overlapMeters: 0.5,
    angle: Object.freeze({
        grazingDeg: 12,
        topDownDeg: 70,
        grazingDistanceScale: 0.8,
        topDownDistanceScale: 1.2
    })
});

function clamp(value, min, max, fallback) {
    const number = Number(value);
    return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
}

function smoothstep(edge0, edge1, value) {
    if (edge1 <= edge0) return value >= edge1 ? 1 : 0;
    const t = clamp((value - edge0) / (edge1 - edge0), 0, 1, 0);
    return t * t * (3 - 2 * t);
}

function sanitizeForce(value) {
    const force = String(value ?? GRASS_AUTO_LOD_DEFAULTS.force);
    if (force === GRASS_AUTO_LOD_FORCE.CLUSTER) return GRASS_AUTO_LOD_FORCE.MIDDLE;
    return Object.values(GRASS_AUTO_LOD_FORCE).includes(force) ? force : GRASS_AUTO_LOD_DEFAULTS.force;
}

export function sanitizeGrassAutoLodConfig(value) {
    const source = value && typeof value === 'object' ? value : {};
    const angle = source.angle && typeof source.angle === 'object' ? source.angle : {};
    const nearEndMeters = clamp(source.nearEndMeters, 1, 12, GRASS_AUTO_LOD_DEFAULTS.nearEndMeters);
    const billboardEndMeters = clamp(
        source.billboardEndMeters,
        nearEndMeters + 1,
        24,
        Math.max(nearEndMeters + 1, GRASS_AUTO_LOD_DEFAULTS.billboardEndMeters)
    );
    const middleEndMeters = clamp(
        source.middleEndMeters ?? source.clusterEndMeters,
        billboardEndMeters + 2,
        48,
        Math.max(billboardEndMeters + 2, GRASS_AUTO_LOD_DEFAULTS.middleEndMeters)
    );
    const transitionWidthMeters = clamp(
        source.transitionWidthMeters,
        0.5,
        5,
        GRASS_AUTO_LOD_DEFAULTS.transitionWidthMeters
    );
    const grazingDeg = clamp(angle.grazingDeg, 0, 60, GRASS_AUTO_LOD_DEFAULTS.angle.grazingDeg);
    return Object.freeze({
        schema: GRASS_AUTO_LOD_SCHEMA,
        version: GRASS_AUTO_LOD_VERSION,
        enabled: source.enabled !== false,
        force: sanitizeForce(source.force),
        nearEndMeters,
        billboardEndMeters,
        middleEndMeters,
        clusterEndMeters: middleEndMeters,
        transitionWidthMeters,
        hysteresisMeters: clamp(source.hysteresisMeters, 0, 2.5, GRASS_AUTO_LOD_DEFAULTS.hysteresisMeters),
        overlapMeters: clamp(source.overlapMeters, 0, transitionWidthMeters, GRASS_AUTO_LOD_DEFAULTS.overlapMeters),
        angle: Object.freeze({
            grazingDeg,
            topDownDeg: clamp(angle.topDownDeg, grazingDeg + 5, 90, GRASS_AUTO_LOD_DEFAULTS.angle.topDownDeg),
            grazingDistanceScale: clamp(angle.grazingDistanceScale, 0.55, 1, GRASS_AUTO_LOD_DEFAULTS.angle.grazingDistanceScale),
            topDownDistanceScale: clamp(angle.topDownDistanceScale, 1, 1.75, GRASS_AUTO_LOD_DEFAULTS.angle.topDownDistanceScale)
        })
    });
}

export function getGrassAutoLodAngleScale(config, viewAngleDeg) {
    const settings = sanitizeGrassAutoLodConfig(config);
    const angle = clamp(viewAngleDeg, 0, 90, 0);
    const t = clamp(
        (angle - settings.angle.grazingDeg) / (settings.angle.topDownDeg - settings.angle.grazingDeg),
        0,
        1,
        0
    );
    return settings.angle.grazingDistanceScale
        + (settings.angle.topDownDistanceScale - settings.angle.grazingDistanceScale) * t;
}

export function evaluateGrassAutoLod({ distanceMeters, viewAngleDeg, config } = {}) {
    const settings = sanitizeGrassAutoLodConfig(config);
    const distance = Math.max(0, Number(distanceMeters) || 0);
    const angleScale = getGrassAutoLodAngleScale(settings, viewAngleDeg);
    const effectiveDistanceMeters = distance * angleScale;
    const halfTransition = settings.transitionWidthMeters * 0.5;
    const withinCutoff = effectiveDistanceMeters < settings.middleEndMeters;
    let nearWeight = 0;
    let billboardWeight = 0;
    let middleWeight = 0;

    if (settings.enabled && withinCutoff) {
        if (settings.force === GRASS_AUTO_LOD_FORCE.NEAR) nearWeight = 1;
        else if (settings.force === GRASS_AUTO_LOD_FORCE.BILLBOARD) billboardWeight = 1;
        else if (settings.force === GRASS_AUTO_LOD_FORCE.MIDDLE || settings.force === GRASS_AUTO_LOD_FORCE.CLUSTER) middleWeight = 1;
        else if (settings.force === GRASS_AUTO_LOD_FORCE.AUTO) {
            const billboardMix = smoothstep(
                settings.nearEndMeters - halfTransition,
                settings.nearEndMeters + halfTransition,
                effectiveDistanceMeters
            );
            const middleMix = smoothstep(
                settings.billboardEndMeters - halfTransition,
                settings.billboardEndMeters + halfTransition,
                effectiveDistanceMeters
            );
            const cutoffWeight = 1 - smoothstep(
                settings.middleEndMeters - settings.transitionWidthMeters,
                settings.middleEndMeters,
                effectiveDistanceMeters
            );
            nearWeight = 1 - billboardMix;
            billboardWeight = billboardMix * (1 - middleMix);
            middleWeight = middleMix * cutoffWeight;
        }
    }

    const geometryWeight = clamp(nearWeight + billboardWeight + middleWeight, 0, 1, 0);
    const textureWeight = 1 - geometryWeight;
    const transitionState = nearWeight > 0 && billboardWeight > 0
        ? 'near_to_billboard'
        : billboardWeight > 0 && middleWeight > 0
            ? 'billboard_to_middle'
            : middleWeight > 0 && textureWeight > 0
                ? 'middle_to_texture'
                : nearWeight > 0
                    ? 'near'
                    : billboardWeight > 0
                        ? 'billboard'
                        : middleWeight > 0
                            ? 'middle'
                            : 'texture_only';
    const transitionProgress = transitionState === 'near_to_billboard'
        ? billboardWeight
        : transitionState === 'billboard_to_middle'
            ? middleWeight
            : transitionState === 'middle_to_texture'
                ? textureWeight
                : 0;
    let activeTier = 'texture';
    let activeWeight = 0;
    for (const [tier, weight] of [['near', nearWeight], ['billboard', billboardWeight], ['middle', middleWeight]]) {
        if (weight > activeWeight) {
            activeTier = tier;
            activeWeight = weight;
        }
    }

    return Object.freeze({
        distanceMeters: distance,
        effectiveDistanceMeters,
        viewAngleDeg: clamp(viewAngleDeg, 0, 90, 0),
        angleScale,
        weights: Object.freeze({
            near: nearWeight,
            billboard: billboardWeight,
            middle: middleWeight,
            texture: textureWeight
        }),
        geometryWeight,
        activeTier,
        transitionState,
        transitionProgress,
        beyondGeometryCutoff: effectiveDistanceMeters >= settings.middleEndMeters
    });
}

export function getGrassAutoLodCandidateRadius(config, tier, viewAngleDeg) {
    const settings = sanitizeGrassAutoLodConfig(config);
    if (!settings.enabled || settings.force === GRASS_AUTO_LOD_FORCE.TEXTURE) return 0;
    const angleScale = getGrassAutoLodAngleScale(settings, viewAngleDeg);
    const requestedTier = String(tier ?? '');
    const requestedIsCluster = requestedTier === 'cluster';
    const retention = settings.transitionWidthMeters * 0.5 + settings.overlapMeters + settings.hysteresisMeters;
    if (settings.force === GRASS_AUTO_LOD_FORCE.NEAR && requestedTier === 'near') {
        return (settings.nearEndMeters + retention) / angleScale;
    }
    if (
        (settings.force === GRASS_AUTO_LOD_FORCE.BILLBOARD && (requestedTier === 'billboard' || requestedIsCluster))
    ) {
        return (settings.billboardEndMeters + retention) / angleScale;
    }
    if (settings.force === GRASS_AUTO_LOD_FORCE.MIDDLE && (requestedTier === 'middle' || requestedIsCluster)) {
        return settings.middleEndMeters / angleScale;
    }
    if (settings.force !== GRASS_AUTO_LOD_FORCE.AUTO) return 0;
    const effectiveRadius = requestedTier === 'near'
        ? settings.nearEndMeters + retention
        : requestedTier === 'billboard'
            ? settings.billboardEndMeters + retention
            : requestedTier === 'middle' || requestedIsCluster
                ? settings.middleEndMeters
                : 0;
    return effectiveRadius / angleScale;
}

export function getGrassAutoLodStableSample(key, tier = '') {
    const text = `${String(key ?? '')}|${String(tier ?? '')}`;
    let hash = 2166136261;
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967296;
}

/**
 * Creates the shared selection identity and sample distance for one canonical
 * world-aligned field unit without changing its renderer-owned root transform.
 * @param {object} options
 * @param {string} options.unitKey
 * @param {string} options.fieldSeed
 * @param {string} options.boundarySignature
 * @param {number} options.cameraX
 * @param {number} options.cameraZ
 * @returns {Readonly<{unitKey:string,identity:string,x:number,z:number,distanceMeters:number}>}
 */
export function createGrassAutoLodFieldUnitHandoff({
    unitKey,
    fieldSeed,
    boundarySignature,
    cameraX,
    cameraZ
} = {}) {
    const rawUnitKey = String(unitKey ?? '');
    const match = /^(-?\d+),(-?\d+)$/.exec(rawUnitKey);
    if (!match) throw new Error(`[GrassAutoLodContract] Invalid field unit key: ${rawUnitKey}`);
    const seed = String(fieldSeed ?? '');
    if (!seed) throw new Error('[GrassAutoLodContract] A field seed is required.');
    const signature = String(boundarySignature ?? '');
    if (!signature) throw new Error('[GrassAutoLodContract] A boundary signature is required.');
    const resolvedCameraX = Number(cameraX);
    const resolvedCameraZ = Number(cameraZ);
    if (!Number.isFinite(resolvedCameraX) || !Number.isFinite(resolvedCameraZ)) {
        throw new Error('[GrassAutoLodContract] Finite cameraX/cameraZ values are required.');
    }
    const x = Number(match[1]) + 0.5;
    const z = Number(match[2]) + 0.5;
    const identity = JSON.stringify([
        GRASS_AUTO_LOD_SCHEMA,
        GRASS_AUTO_LOD_VERSION,
        'field_unit',
        seed,
        signature,
        rawUnitKey
    ]);
    return Object.freeze({
        unitKey: rawUnitKey,
        identity,
        x,
        z,
        distanceMeters: Math.hypot(x - resolvedCameraX, z - resolvedCameraZ)
    });
}

/**
 * Resolves one world-owned unit with complementary adjacent-tier masks.
 * The same unit key produces the same handoff sample for both adjacent tiers.
 */
export function resolveGrassAutoLodUnitVisibility({
    evaluation,
    tier,
    unitKey = '',
    previousVisible = false,
    config
} = {}) {
    const settings = sanitizeGrassAutoLodConfig(config);
    const state = evaluation && typeof evaluation === 'object' ? evaluation : {};
    const weights = state.weights && typeof state.weights === 'object' ? state.weights : {};
    const requestedTier = String(tier ?? '');
    const weight = clamp(weights[requestedTier], 0, 1, 0);
    if (weight <= 0) return false;
    if (weight >= 1) return true;
    const transitionState = String(state.transitionState ?? '');
    const outgoingTier = transitionState === 'near_to_billboard'
        ? 'near'
        : transitionState === 'billboard_to_middle'
            ? 'billboard'
            : null;
    const incomingTier = transitionState === 'near_to_billboard'
        ? 'billboard'
        : transitionState === 'billboard_to_middle'
            ? 'middle'
            : null;
    if (requestedTier !== outgoingTier && requestedTier !== incomingTier) {
        return resolveGrassAutoLodMaskedVisibility({
            weight,
            stableSample: getGrassAutoLodStableSample(unitKey, requestedTier),
            previousVisible,
            config: settings
        });
    }
    const sample = getGrassAutoLodStableSample(unitKey, transitionState);
    const progress = clamp(state.transitionProgress, 0, 1, weight);
    const overlapHalfWeight = clamp(
        settings.overlapMeters / Math.max(0.001, settings.transitionWidthMeters) * 0.5,
        0,
        0.45,
        0
    );
    const hysteresisWeight = clamp(
        settings.hysteresisMeters / Math.max(0.001, settings.transitionWidthMeters) * 0.2,
        0,
        overlapHalfWeight,
        0
    );
    const threshold = 1 - sample;
    if (requestedTier === outgoingTier) {
        return progress <= threshold + overlapHalfWeight + (previousVisible ? hysteresisWeight : -hysteresisWeight);
    }
    return progress >= threshold - overlapHalfWeight + (previousVisible ? -hysteresisWeight : hysteresisWeight);
}

export function resolveGrassAutoLodMaskedVisibility({ weight, stableSample, previousVisible, config } = {}) {
    const settings = sanitizeGrassAutoLodConfig(config);
    const normalizedWeight = clamp(weight, 0, 1, 0);
    if (normalizedWeight <= 0) return false;
    if (normalizedWeight >= 1) return true;
    const hysteresisWeight = clamp(
        settings.hysteresisMeters / Math.max(0.001, settings.transitionWidthMeters) * 0.2,
        0,
        0.24,
        0
    );
    const threshold = clamp(stableSample, 0, 1, 0.5) + (previousVisible ? -hysteresisWeight : hysteresisWeight);
    return normalizedWeight >= threshold;
}
