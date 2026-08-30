// src/graphics/gui/grass_debugger/GrassLabContract.js
// Deterministic fixtures and adapter contract for the canonical offline Grass Lab.
// @ts-check

import { createDefaultGrassEngineConfig, sanitizeGrassEngineConfig } from '../../engine3d/grass/GrassConfig.js';
import { deriveLowCutGrassRuntimeProfile, sanitizeLowCutGrassProfile } from '../../engine3d/grass/LowCutGrassProfile.js';
import { createGrassCoverageDefinition, sanitizeGrassCoverageConfig } from '../../../app/grass/GrassCoverageContract.js';

export const GRASS_LAB_CONTRACT_VERSION = 7;
export const GRASS_LAB_CANONICAL_URL = 'debug_tools/grass_debug.html';
export const GRASS_LAB_DEFAULT_SEED = 'grass-lab-baseline-v1';

function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max, fallback = min) {
    return Math.max(min, Math.min(max, finite(value, fallback)));
}

function normalizeBounds(bounds) {
    const minX = finite(bounds?.minX, -180);
    const minZ = finite(bounds?.minZ, -180);
    const maxX = Math.max(minX + 1, finite(bounds?.maxX, 180));
    const maxZ = Math.max(minZ + 1, finite(bounds?.maxZ, 180));
    return { minX, minZ, maxX, maxZ, sizeX: maxX - minX, sizeZ: maxZ - minZ };
}

function makeSegmentExclusionRects(points, halfWidth) {
    const margin = Math.max(0, finite(halfWidth, 0));
    const out = [];
    for (let i = 0; i + 1 < points.length; i++) {
        const a = points[i];
        const b = points[i + 1];
        out.push({
            id: `sidewalk_segment_${i}`,
            kind: 'sidewalk',
            x0: Math.min(a.x, b.x) - margin,
            x1: Math.max(a.x, b.x) + margin,
            z0: Math.min(a.z, b.z) - margin,
            z1: Math.max(a.z, b.z) + margin
        });
    }
    return out;
}

export function pointIsInsideGrassLabExclusion(x, z, exclusionRects) {
    const px = finite(x, 0);
    const pz = finite(z, 0);
    return (Array.isArray(exclusionRects) ? exclusionRects : []).some((rect) => (
        px >= Math.min(finite(rect?.x0), finite(rect?.x1))
        && px <= Math.max(finite(rect?.x0), finite(rect?.x1))
        && pz >= Math.min(finite(rect?.z0), finite(rect?.z1))
        && pz <= Math.max(finite(rect?.z0), finite(rect?.z1))
    ));
}

export function createGrassLabFixtureDefinition({ bounds, tileSize = 24, roadHalfWidth = 8 } = {}) {
    const b = normalizeBounds(bounds);
    const tile = Math.max(4, finite(tileSize, 24));
    const inset = tile;
    const routePoints = [
        { x: -tile * 1.5, z: b.minZ + inset },
        { x: -tile * 1.5, z: tile },
        { x: tile * 3.0, z: tile },
        { x: tile * 3.0, z: b.maxZ - inset }
    ];
    const exclusionRects = makeSegmentExclusionRects(routePoints, Math.max(0, roadHalfWidth));
    const firstRoadPoint = routePoints[0];
    const eastSidewalkEdgeX = firstRoadPoint.x + Math.max(0, roadHalfWidth);
    const irregularCenterZ = firstRoadPoint.z + tile * 1.2;
    const irregularCutRects = [
        { id: 'irregular_cut_0', kind: 'irregular_cut', x0: eastSidewalkEdgeX, x1: eastSidewalkEdgeX + 2.1, z0: irregularCenterZ - 2.0, z1: irregularCenterZ + 2.0 },
        { id: 'irregular_cut_1', kind: 'irregular_cut', x0: eastSidewalkEdgeX + 2.1, x1: eastSidewalkEdgeX + 4.0, z0: irregularCenterZ - 1.45, z1: irregularCenterZ + 1.65 },
        { id: 'irregular_cut_2', kind: 'irregular_cut', x0: eastSidewalkEdgeX + 4.0, x1: eastSidewalkEdgeX + 5.5, z0: irregularCenterZ - 0.75, z1: irregularCenterZ + 0.85 }
    ];
    const grassCoverage = createGrassCoverageDefinition({
        seed: `${GRASS_LAB_DEFAULT_SEED}|coverage-v1`,
        bounds: b,
        exclusionRects,
        irregularCutRects
    });

    const treePlacements = [
        { id: 'tree_northwest', x: -tile * 3.6, y: 0, z: tile * 3.6, rotation: 0.35, scaleVar: 1.05, variant: 0 },
        { id: 'tree_southwest', x: -tile * 3.8, y: 0, z: -tile * 2.1, rotation: 1.8, scaleVar: 0.92, variant: 1 },
        { id: 'tree_southeast', x: tile * 3.8, y: 0, z: -tile * 2.2, rotation: 3.2, scaleVar: 1.12, variant: 0 },
        { id: 'tree_northeast', x: tile * 4.4, y: 0, z: tile * 4.0, rotation: 4.7, scaleVar: 0.98, variant: 1 }
    ].filter((placement) => !pointIsInsideGrassLabExclusion(placement.x, placement.z, exclusionRects));
    const accentFeaturePlacements = [{
        id: 'worn_irregular_edge_0',
        x: eastSidewalkEdgeX + 6.4,
        y: 0,
        z: irregularCenterZ + 2.6,
        rotation: 0.8,
        scaleVar: 0.9,
        variant: 0
    }];

    const first = routePoints[0];
    const second = routePoints[1];
    const forwardLength = Math.max(1e-6, Math.hypot(second.x - first.x, second.z - first.z));

    return {
        version: GRASS_LAB_CONTRACT_VERSION,
        seed: GRASS_LAB_DEFAULT_SEED,
        roadSegments: [{
            kind: 'polyline',
            tag: 'grass_lab_straight_and_corner_fixture',
            rendered: true,
            lanesF: 1,
            lanesB: 1,
            points: routePoints
        }],
        exclusionRects,
        irregularCutRects,
        grassCoverage,
        coverageCameraTargets: {
            straight: { x: eastSidewalkEdgeX, z: firstRoadPoint.z + tile * 3.4 },
            corner: { x: routePoints[1].x + roadHalfWidth, z: routePoints[1].z + roadHalfWidth },
            irregular: { x: eastSidewalkEdgeX + 3.2, z: irregularCenterZ }
        },
        lodCameraTargets: {
            grazing: { x: eastSidewalkEdgeX + 18, z: firstRoadPoint.z + tile * 3.4 },
            topDown: { x: eastSidewalkEdgeX + 18, z: firstRoadPoint.z + tile * 3.4 },
            cutoff: { x: eastSidewalkEdgeX + 34, z: firstRoadPoint.z + tile * 3.4 }
        },
        accentCameraTargets: {
            tree: { x: treePlacements[0]?.x ?? 0, z: treePlacements[0]?.z ?? 0 },
            wornFeature: { x: accentFeaturePlacements[0].x, z: accentFeaturePlacements[0].z }
        },
        treePlacements,
        accentFeaturePlacements,
        busAnchor: {
            position: { x: first.x, y: 0, z: first.z + tile * 0.25 },
            forward: { x: (second.x - first.x) / forwardLength, y: 0, z: (second.z - first.z) / forwardLength }
        },
        labels: {
            maintainedGrass: 'Canonical GrassEngine field',
            substrate: 'PBR ground below grass',
            boundary: 'Road + curb + sidewalk straight/corner fixture',
            trees: 'Deterministic localized tree accents'
        }
    };
}

export function createGrassLabTerrainGrid({ bounds, tileSize = 24, widthTiles = 15, depthTiles = 15, nx = 30, nz = 30 } = {}) {
    const b = normalizeBounds(bounds);
    const safeNx = Math.max(1, Math.round(finite(nx, 30)));
    const safeNz = Math.max(1, Math.round(finite(nz, 30)));
    return {
        tileSize: Math.max(4, finite(tileSize, 24)),
        widthTiles: Math.max(1, Math.round(finite(widthTiles, 15))),
        depthTiles: Math.max(1, Math.round(finite(depthTiles, 15))),
        minX: b.minX,
        minZ: b.minZ,
        minY: 0,
        maxY: 0,
        nx: safeNx,
        nz: safeNz,
        dx: b.sizeX / safeNx,
        dz: b.sizeZ / safeNz
    };
}

export function createGrassLabEngineConfig(state, { tileSize = 24 } = {}) {
    const config = createDefaultGrassEngineConfig();
    const profile = sanitizeLowCutGrassProfile(state?.authoring?.profile);
    const runtimeProfile = deriveLowCutGrassRuntimeProfile(profile);
    const lod1 = state?.lod1 ?? {};
    const lod2 = state?.lod2 ?? {};
    const lod3 = state?.lod3 ?? {};
    const lod4 = state?.lod4 ?? {};
    const autoLod = state?.autoLod ?? {};
    const labSeed = String(state?.lab?.seed ?? GRASS_LAB_DEFAULT_SEED).trim() || GRASS_LAB_DEFAULT_SEED;
    const coverage = createGrassLabCoverageConfig(state);
    const tileArea = Math.max(1, finite(tileSize, 24) ** 2);
    const nearPerTile = Math.max(0, finite(lod1?.densityPerTile, 350));
    const midPerTile = Math.max(0, finite(lod2?.densityPerTile, 110));
    const basePerTile = nearPerTile > 0 ? nearPerTile : midPerTile;

    const carpetMode = ['auto', 'force', 'disabled'].includes(String(lod1?.carpetMode)) ? String(lod1.carpetMode) : 'auto';
    const nearEnabled = coverage.enabled && carpetMode !== 'disabled' && lod1?.enabled !== false;
    const clusterEnabled = coverage.enabled && lod2?.enabled !== false;
    const autoForce = ['auto', 'near', 'cluster', 'texture'].includes(String(autoLod?.force))
        ? String(autoLod.force)
        : (carpetMode === 'force' ? 'near' : 'auto');
    const nearEnd = clamp(autoLod?.nearEndMeters ?? lod1?.carpetRadiusMeters, 4, 18, 9);
    const clusterEnd = clamp(autoLod?.clusterEndMeters, nearEnd + 4, 48, 30);
    config.enabled = coverage.enabled && (nearEnabled || clusterEnabled);
    config.seed = `${labSeed}|${profile.seed}|${String(lod1?.seed ?? 'near')}|${String(lod2?.seed ?? 'mid')}`;
    config.patch.sizeMeters = 72;
    config.patch.yOffset = 0.02;
    config.field.density = basePerTile / tileArea;
    config.geometry.blade.width = (profile.blade.widthMeters.min + profile.blade.widthMeters.max) * 0.5;
    config.geometry.blade.height = 1.0;
    config.material.roughness = runtimeProfile.appearance.roughness;
    config.material.metalness = 0;
    config.nearCarpet = {
        enabled: nearEnabled,
        mode: carpetMode,
        seed: `${labSeed}|${profile.seed}|near-carpet`,
        patchSizeMeters: finite(lod1?.carpetPatchSizeMeters, 1),
        bladesPerSquareMeter: finite(lod1?.carpetBladesPerSquareMeter, 48) * coverage.densityMultiplier,
        radiusMeters: nearEnd,
        chunkSizeMeters: 32,
        yOffsetMeters: coverage.layerHeightMeters,
        patchScaleVariation: 0.04,
        colorBrightnessVariation: profile.appearance.colorVariation.brightness,
        baseColor: profile.appearance.baseColor,
        tipColor: profile.appearance.tipColor,
        bladeHeightMeters: { ...profile.blade.heightMeters },
        bladeWidthMeters: { ...profile.blade.widthMeters },
        bendDegrees: {
            min: profile.shape.bendDegrees.mean - profile.shape.bendDegrees.variation,
            max: profile.shape.bendDegrees.mean + profile.shape.bendDegrees.variation
        },
        inclinationDegrees: {
            min: profile.shape.inclinationDegrees.mean - profile.shape.inclinationDegrees.variation,
            max: profile.shape.inclinationDegrees.mean + profile.shape.inclinationDegrees.variation
        },
        roughness: runtimeProfile.appearance.roughness
    };
    config.midCluster = {
        enabled: clusterEnabled,
        seed: `${labSeed}|${profile.seed}|mid-cluster|${String(lod2?.seed ?? 'mid')}`,
        patchSizeMeters: finite(lod2?.clusterPatchSizeMeters, 2),
        cardsPerPatch: finite(lod2?.clusterCardsPerPatch, 2),
        cardWidthMeters: finite(lod2?.clusterCardWidthMeters, 1.15),
        cardHeightMeters: finite(lod2?.clusterCardHeightMeters, 0.055),
        yOffsetMeters: coverage.layerHeightMeters,
        scaleVariation: 0.08,
        brightnessVariation: profile.appearance.colorVariation.brightness,
        atlasVariants: 8
    };
    const accentState = state?.accents && typeof state.accents === 'object' ? state.accents : {};
    const coverageState = state?.coverage && typeof state.coverage === 'object' ? state.coverage : {};
    const coverageHeight = finite(coverageState.layerHeightMillimeters, 27.5) / 1000;
    config.localizedAccents = {
        enabled: accentState.enabled !== false && profile.accents.enabled !== false && coverageState.accentEligibility !== false,
        wornEnabled: accentState.wornEnabled !== false,
        featureAccentsEnabled: accentState.featureAccentsEnabled !== false,
        seed: `${String(state?.lab?.seed ?? GRASS_LAB_DEFAULT_SEED)}|${profile.seed}|localized-accents`,
        clustersPerTree: finite(accentState.clustersPerTree, Math.round(3 + profile.accents.densityMultiplier * 3)),
        clustersPerFeature: finite(accentState.clustersPerFeature, 3),
        trunkRadiusMeters: finite(accentState.trunkRadiusMeters, 0.55),
        ringInnerMeters: finite(accentState.ringInnerMeters, 0.82),
        ringOuterMeters: finite(accentState.ringOuterMeters, 1.25),
        wornRadiusMeters: finite(accentState.wornRadiusMeters, 0.76),
        cardWidthMeters: finite(accentState.cardWidthMeters, profile.accents.radiusMeters * 6.857143),
        cardHeightMeters: finite(accentState.cardHeightMeters, profile.blade.heightMeters.max * 2.5),
        yOffsetMeters: coverageHeight + 0.001,
        wornYOffsetMeters: coverageHeight + 0.0005,
        scaleVariation: 0.14,
        brightnessVariation: 0.12,
        atlasVariants: 8
    };
    config.autoLod = {
        enabled: coverage.enabled,
        force: autoForce,
        nearEndMeters: nearEnd,
        clusterEndMeters: clusterEnd,
        transitionWidthMeters: finite(autoLod?.transitionWidthMeters, 2),
        hysteresisMeters: finite(autoLod?.hysteresisMeters, 0.75),
        angle: {
            grazingDeg: 12,
            topDownDeg: 70,
            grazingDistanceScale: finite(autoLod?.grazingDistanceScale, 0.8),
            topDownDistanceScale: finite(autoLod?.topDownDistanceScale, 1.2)
        }
    };
    config.field.enabled = false;
    config.field.height = { ...profile.blade.heightMeters };
    config.field.color.base = profile.appearance.baseColor;
    config.field.color.variation.hueShiftDeg = {
        min: -profile.appearance.colorVariation.hueDegrees,
        max: profile.appearance.colorVariation.hueDegrees
    };
    config.field.color.variation.saturationMul = {
        min: runtimeProfile.appearance.saturationMultiplier * (1 - profile.appearance.colorVariation.saturation),
        max: runtimeProfile.appearance.saturationMultiplier * (1 + profile.appearance.colorVariation.saturation)
    };
    config.field.color.variation.brightnessMul = {
        min: runtimeProfile.appearance.brightnessMultiplier * (1 - profile.appearance.colorVariation.brightness),
        max: runtimeProfile.appearance.brightnessMultiplier * (1 + profile.appearance.colorVariation.brightness)
    };
    config.field.lod.allow = { master: false, near: false, mid: false, far: false };
    config.field.lod.force = 'auto';
    config.lod.renderMode = {
        master: 'star',
        near: 'star',
        mid: 'cross',
        far: 'cross_sparse'
    };
    config.density.masterMul = 1.5;
    config.density.nearMul = 1.0;
    config.density.midMul = basePerTile > 0 ? clamp(midPerTile / basePerTile, 0, 1, 0.3) : 0;
    config.density.farMul = Math.min(0.16, config.density.midMul);

    config.lod.distances = {
        master: 0,
        near: nearEnd,
        mid: clusterEnd,
        far: clusterEnd,
        cutoff: clusterEnd
    };
    config.lod.enableMaster = false;
    config.lod.transitionWidthMeters = finite(autoLod?.transitionWidthMeters, 2);
    config.lod.angle.grazingDistanceScale = finite(autoLod?.grazingDistanceScale, 0.8);
    config.lod.angle.topDownDistanceScale = finite(autoLod?.topDownDistanceScale, 1.2);
    config.debug.showLodRings = !!(lod1?.debug?.drawBounds || lod2?.debug?.drawBounds || lod3?.debug?.drawBounds || lod4?.debug?.drawBounds);
    config.debug.showLodAngleScaledRings = false;
    config.exclusion.enabled = true;
    config.exclusion.marginMeters = Math.max(
        config.nearCarpet.patchSizeMeters * (1 + config.nearCarpet.patchScaleVariation) * 0.5,
        config.midCluster.cardWidthMeters * (1 + config.midCluster.scaleVariation) * 0.5
    );

    return sanitizeGrassEngineConfig(config);
}

export function createGrassLabCoverageConfig(state) {
    const profile = sanitizeLowCutGrassProfile(state?.authoring?.profile);
    const source = state?.coverage && typeof state.coverage === 'object' ? state.coverage : {};
    return sanitizeGrassCoverageConfig({
        enabled: source.enabled !== false,
        layerHeightMeters: finite(source.layerHeightMillimeters, 27.5) / 1000,
        densityMultiplier: finite(source.densityMultiplier, 1),
        exclusionMarginMeters: 0,
        farCoverageThreshold: finite(source.farCoverageThreshold, 0.35),
        edgeAntialiasMeters: finite(source.edgeAntialiasMillimeters, 15) / 1000,
        fringeEnabled: source.fringeEnabled !== false,
        fringeSpacingMeters: finite(source.fringeSpacingMeters, 0.35),
        fringeInsetMeters: finite(source.fringeInsetMeters, 0.055),
        accentEligibility: source.accentEligibility !== false && profile.accents.enabled !== false,
        humidity: profile.appearance.humidity,
        dryness: profile.appearance.dryness
    });
}

export function createGrassLabSnapshot({ seed, engineStats, coverageStats, lodInfo, rendererInfo, cpuMs, gpuMs, fixtures, authoring } = {}) {
    const render = rendererInfo?.render ?? rendererInfo ?? {};
    return {
        contractVersion: GRASS_LAB_CONTRACT_VERSION,
        canonicalRuntime: 'GrassEngine',
        canonicalUrl: GRASS_LAB_CANONICAL_URL,
        seed: String(seed ?? GRASS_LAB_DEFAULT_SEED),
        fixtures: {
            roadSegments: Array.isArray(fixtures?.roadSegments) ? fixtures.roadSegments.length : 0,
            exclusionRects: Array.isArray(fixtures?.exclusionRects) ? fixtures.exclusionRects.length : 0,
            irregularCuts: Array.isArray(fixtures?.irregularCutRects) ? fixtures.irregularCutRects.length : 0,
            treePlacements: Array.isArray(fixtures?.treePlacements) ? fixtures.treePlacements.length : 0
        },
        grass: {
            enabled: !!engineStats?.enabled,
            patches: Math.max(0, Math.round(finite(engineStats?.patches, 0))),
            instances: Math.max(0, Math.round(finite(engineStats?.totalInstances, 0))),
            triangles: Math.max(0, Math.round(finite(engineStats?.totalTriangles, 0))),
            logicalDrawCalls: Math.max(0, Math.round(finite(engineStats?.drawCalls, 0))),
            instancesByTier: { ...(engineStats?.instancesByTier ?? {}) },
            trianglesByTier: { ...(engineStats?.trianglesByTier ?? {}) },
            nearCarpet: engineStats?.nearCarpet && typeof engineStats.nearCarpet === 'object'
                ? { ...engineStats.nearCarpet }
                : null,
            midCluster: engineStats?.midCluster && typeof engineStats.midCluster === 'object'
                ? { ...engineStats.midCluster }
                : null,
            localizedAccents: engineStats?.localizedAccents && typeof engineStats.localizedAccents === 'object'
                ? { ...engineStats.localizedAccents }
                : null,
            updateCpuMs: cpuMs !== null && cpuMs !== undefined && Number.isFinite(Number(cpuMs)) ? Number(cpuMs) : null
        },
        coverage: coverageStats && typeof coverageStats === 'object' ? { ...coverageStats } : null,
        frame: {
            gpuMs: gpuMs !== null && gpuMs !== undefined && Number.isFinite(Number(gpuMs)) ? Number(gpuMs) : null,
            rendererDrawCalls: Math.max(0, Math.round(finite(render?.calls, 0))),
            rendererTriangles: Math.max(0, Math.round(finite(render?.triangles, 0)))
        },
        lod: {
            viewAngleDeg: finite(lodInfo?.viewAngleDeg, 0),
            angleScale: finite(lodInfo?.angleScale, 1),
            masterActiveByAngle: !!lodInfo?.masterActiveByAngle,
            effectiveDistanceMeters: finite(lodInfo?.effectiveDistanceMeters, 0),
            activeTier: String(lodInfo?.activeTier ?? 'texture'),
            transitionState: String(lodInfo?.transitionState ?? 'texture_only'),
            nearEndMeters: finite(lodInfo?.nearEndMeters, 0),
            clusterEndMeters: finite(lodInfo?.clusterEndMeters, 0),
            geometryCutoffWorldMeters: finite(lodInfo?.geometryCutoffWorldMeters, 0),
            force: String(lodInfo?.force ?? 'auto'),
            geometryBeyondCutoff: Math.max(0, Math.round(finite(lodInfo?.geometryBeyondCutoff, 0)))
        },
        authoring: authoring && typeof authoring === 'object' ? { ...authoring } : null
    };
}
