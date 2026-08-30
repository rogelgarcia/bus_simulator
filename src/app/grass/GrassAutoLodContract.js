// Defines the deterministic near, cluster, and texture-only grass handoff.
// @ts-check

export const GRASS_AUTO_LOD_SCHEMA = 'bus-simulator.grass-auto-lod';
export const GRASS_AUTO_LOD_VERSION = 1;

export const GRASS_AUTO_LOD_FORCE = Object.freeze({
    AUTO: 'auto',
    NEAR: 'near',
    CLUSTER: 'cluster',
    TEXTURE: 'texture'
});

export const GRASS_AUTO_LOD_DEFAULTS = Object.freeze({
    enabled: true,
    force: GRASS_AUTO_LOD_FORCE.AUTO,
    nearEndMeters: 9,
    clusterEndMeters: 30,
    transitionWidthMeters: 2,
    hysteresisMeters: 0.75,
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
    return Object.values(GRASS_AUTO_LOD_FORCE).includes(force) ? force : GRASS_AUTO_LOD_DEFAULTS.force;
}

export function sanitizeGrassAutoLodConfig(value) {
    const source = value && typeof value === 'object' ? value : {};
    const angle = source.angle && typeof source.angle === 'object' ? source.angle : {};
    const nearEndMeters = clamp(source.nearEndMeters, 4, 18, GRASS_AUTO_LOD_DEFAULTS.nearEndMeters);
    const clusterEndMeters = clamp(source.clusterEndMeters, nearEndMeters + 4, 48, GRASS_AUTO_LOD_DEFAULTS.clusterEndMeters);
    const grazingDeg = clamp(angle.grazingDeg, 0, 60, GRASS_AUTO_LOD_DEFAULTS.angle.grazingDeg);
    return Object.freeze({
        schema: GRASS_AUTO_LOD_SCHEMA,
        version: GRASS_AUTO_LOD_VERSION,
        enabled: source.enabled !== false,
        force: sanitizeForce(source.force),
        nearEndMeters,
        clusterEndMeters,
        transitionWidthMeters: clamp(source.transitionWidthMeters, 0.5, 5, GRASS_AUTO_LOD_DEFAULTS.transitionWidthMeters),
        hysteresisMeters: clamp(source.hysteresisMeters, 0, 2.5, GRASS_AUTO_LOD_DEFAULTS.hysteresisMeters),
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
    const withinCutoff = effectiveDistanceMeters < settings.clusterEndMeters;
    let nearWeight = 0;
    let clusterWeight = 0;

    if (settings.enabled && withinCutoff) {
        if (settings.force === GRASS_AUTO_LOD_FORCE.NEAR) nearWeight = 1;
        else if (settings.force === GRASS_AUTO_LOD_FORCE.CLUSTER) clusterWeight = 1;
        else if (settings.force === GRASS_AUTO_LOD_FORCE.AUTO) {
            const clusterMix = smoothstep(
                settings.nearEndMeters - halfTransition,
                settings.nearEndMeters + halfTransition,
                effectiveDistanceMeters
            );
            const cutoffWeight = 1 - smoothstep(
                settings.clusterEndMeters - settings.transitionWidthMeters,
                settings.clusterEndMeters,
                effectiveDistanceMeters
            );
            nearWeight = 1 - clusterMix;
            clusterWeight = clusterMix * cutoffWeight;
        }
    }

    const textureWeight = clamp(1 - Math.max(nearWeight, clusterWeight), 0, 1, 1);
    const transitionState = nearWeight > 0 && clusterWeight > 0
        ? 'near_to_cluster'
        : clusterWeight > 0 && textureWeight > 0
            ? 'cluster_to_texture'
            : nearWeight > 0
                ? 'near'
                : clusterWeight > 0
                    ? 'cluster'
                    : 'texture_only';
    const activeTier = nearWeight >= clusterWeight && nearWeight > 0
        ? 'near'
        : clusterWeight > 0
            ? 'cluster'
            : 'texture';

    return Object.freeze({
        distanceMeters: distance,
        effectiveDistanceMeters,
        viewAngleDeg: clamp(viewAngleDeg, 0, 90, 0),
        angleScale,
        weights: Object.freeze({ near: nearWeight, cluster: clusterWeight, texture: textureWeight }),
        activeTier,
        transitionState,
        beyondGeometryCutoff: effectiveDistanceMeters >= settings.clusterEndMeters
    });
}

export function getGrassAutoLodCandidateRadius(config, tier, viewAngleDeg) {
    const settings = sanitizeGrassAutoLodConfig(config);
    if (!settings.enabled || settings.force === GRASS_AUTO_LOD_FORCE.TEXTURE) return 0;
    const angleScale = getGrassAutoLodAngleScale(settings, viewAngleDeg);
    const requestedTier = String(tier ?? '');
    if (settings.force === GRASS_AUTO_LOD_FORCE.NEAR && requestedTier === 'near') return settings.clusterEndMeters / angleScale;
    if (settings.force === GRASS_AUTO_LOD_FORCE.CLUSTER && requestedTier === 'cluster') return settings.clusterEndMeters / angleScale;
    if (settings.force !== GRASS_AUTO_LOD_FORCE.AUTO) return 0;
    const effectiveRadius = requestedTier === 'near'
        ? settings.nearEndMeters + settings.transitionWidthMeters
        : requestedTier === 'cluster'
            ? settings.clusterEndMeters
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
