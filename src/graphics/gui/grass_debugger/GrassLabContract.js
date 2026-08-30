// src/graphics/gui/grass_debugger/GrassLabContract.js
// Deterministic fixtures and adapter contract for the canonical offline Grass Lab.
// @ts-check

import { createDefaultGrassEngineConfig, sanitizeGrassEngineConfig } from '../../engine3d/grass/GrassConfig.js';
import { deriveLowCutGrassRuntimeProfile, sanitizeLowCutGrassProfile } from '../../engine3d/grass/LowCutGrassProfile.js';
import {
    createGrassCoverageDefinition,
    createGrassCoveragePartition,
    sanitizeGrassCoverageConfig
} from '../../../app/grass/GrassCoverageContract.js';
import { buildRoadSidewalkGrassBoundaryLoopPairs } from '../../../app/road_decoration/sidewalks/RoadSidewalkBuilder.js';

export const GRASS_LAB_CONTRACT_VERSION = 8;
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
        { x: -tile * 3.0, z: b.minZ + inset },
        { x: -tile * 3.0, z: -tile * 3.0 },
        { x: -tile * 1.5, z: -tile * 1.5 },
        { x: tile * 0.75, z: -tile * 1.25 },
        { x: tile * 2.25, z: tile * 0.75 },
        { x: tile * 3.0, z: tile * 3.0 },
        { x: tile * 3.0, z: b.maxZ - inset }
    ];
    const exclusionRects = makeSegmentExclusionRects(routePoints, Math.max(0, roadHalfWidth));

    const treePlacements = [
        { id: 'tree_northwest', x: -tile * 5.0, y: 0, z: tile * 3.8, rotation: 0.35, scaleVar: 1.05, variant: 0 },
        { id: 'tree_southwest', x: -tile * 5.0, y: 0, z: -tile * 1.2, rotation: 1.8, scaleVar: 0.92, variant: 1 },
        { id: 'tree_southeast', x: tile * 5.0, y: 0, z: -tile * 3.4, rotation: 3.2, scaleVar: 1.12, variant: 0 },
        { id: 'tree_northeast', x: tile * 5.0, y: 0, z: tile * 4.5, rotation: 4.7, scaleVar: 0.98, variant: 1 }
    ].filter((placement) => !pointIsInsideGrassLabExclusion(placement.x, placement.z, exclusionRects));
    const accentFeaturePlacements = [{
        id: 'localized_irregularity_0',
        x: -tile * 4.3,
        y: 0,
        z: tile * 1.0,
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
        boundaryApproval: {
            source: 'rendered_road_engine_sidewalk_outer_loops',
            substrateRevealMeters: 0.08,
            approvalShapes: ['straight', 'curve', 'diagonal', 'inside_corner', 'outside_corner', 'tree_base']
        },
        lodCameraTargets: {
            grazing: { x: routePoints[0].x + roadHalfWidth + 18, z: routePoints[0].z + tile * 1.6 },
            topDown: { x: routePoints[0].x + roadHalfWidth + 18, z: routePoints[0].z + tile * 1.6 },
            cutoff: { x: routePoints[0].x + roadHalfWidth + 34, z: routePoints[0].z + tile * 1.6 }
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
            boundary: 'Exact RoadEngine sidewalk loop + 80 mm substrate reveal',
            trees: 'Deterministic localized tree accents'
        }
    };
}

function createCircleLoop(x, z, radius, segments = 48) {
    const count = Math.max(12, Math.round(finite(segments, 48)));
    const r = Math.max(0.001, finite(radius, 0.55));
    return Array.from({ length: count }, (_, index) => {
        const angle = index / count * Math.PI * 2;
        return { x: x + Math.cos(angle) * r, z: z + Math.sin(angle) * r };
    });
}

export function createGrassLabCoverageDefinition({
    bounds,
    fixtures,
    sidewalkOuterBoundaryLoops,
    sidewalkBoundarySource,
    substrateRevealMeters = 0.08,
    onsetMiterLimit = 1.25,
    trunkRadiusMeters = 0.55,
    wornRadiusMeters = 0.76
} = {}) {
    const sourceLoops = Array.isArray(sidewalkOuterBoundaryLoops) ? sidewalkOuterBoundaryLoops : [];
    if (!sourceLoops.length) throw new Error('[GrassLabContract] Rendered sidewalk outer loops are required for coverage.');
    const reveal = clamp(substrateRevealMeters, 0.06, 0.1, 0.08);
    const boundaryPairs = buildRoadSidewalkGrassBoundaryLoopPairs(sourceLoops, {
        distance: reveal,
        boundaryEpsilon: 1e-4,
        miterLimit: clamp(onsetMiterLimit, 1, 2, 1.25)
    });
    if (boundaryPairs.length !== sourceLoops.length) throw new Error('[GrassLabContract] Grass onset loop count must match the rendered sidewalk source.');
    const loopIds = Array.isArray(sidewalkBoundarySource?.loopIds) ? sidewalkBoundarySource.loopIds : [];
    const boundaryExclusions = boundaryPairs.map(({ sourceLoop, onsetLoop }, index) => ({
        id: `sidewalk_outer_${index}`,
        kind: 'sidewalk',
        shape: 'rendered_polygon',
        sourceIdentity: `${String(sidewalkBoundarySource?.id ?? 'road-engine-sidewalk')}|${String(loopIds[index] ?? index)}`,
        substrateRevealMeters: reveal,
        sourceLoop,
        onsetLoop
    }));
    for (const tree of Array.isArray(fixtures?.treePlacements) ? fixtures.treePlacements : []) {
        const scale = Math.max(0.2, finite(tree?.scaleVar, 1));
        const x = finite(tree?.x);
        const z = finite(tree?.z);
        const sourceRadius = Math.max(0.2, finite(trunkRadiusMeters, 0.55)) * scale;
        const onsetRadius = Math.max(sourceRadius + 0.02, finite(wornRadiusMeters, 0.76) * scale);
        const sourceIdentity = [
            'grass-lab-tree',
            String(tree.id),
            scale.toFixed(6),
            `${x.toFixed(6)},${z.toFixed(6)}`,
            `r${sourceRadius.toFixed(6)}`
        ].join(':');
        boundaryExclusions.push({
            id: `tree_base_${String(tree.id)}`,
            kind: 'tree_base',
            shape: 'circle',
            sourceIdentity,
            substrateRevealMeters: onsetRadius - sourceRadius,
            sourceLoop: createCircleLoop(x, z, sourceRadius),
            onsetLoop: createCircleLoop(x, z, onsetRadius)
        });
    }
    return createGrassCoverageDefinition({
        seed: `${String(fixtures?.seed ?? GRASS_LAB_DEFAULT_SEED)}|coverage-v2`,
        bounds,
        boundaryExclusions,
        compatibilityExclusionRects: Array.isArray(fixtures?.exclusionRects) ? fixtures.exclusionRects : []
    });
}

function segmentPose(segment, id, kind = 'segment') {
    const dx = segment.b.x - segment.a.x;
    const dz = segment.b.z - segment.a.z;
    const length = Math.max(1e-6, Math.hypot(dx, dz));
    return Object.freeze({
        id,
        kind,
        x: (segment.a.x + segment.b.x) * 0.5,
        z: (segment.a.z + segment.b.z) * 0.5,
        tangent: Object.freeze({ x: dx / length, z: dz / length }),
        grassNormal: Object.freeze({ ...segment.grassNormal })
    });
}

function cornerPose(loop, index, id, kind) {
    const previous = loop[(index - 1 + loop.length) % loop.length];
    const current = loop[index];
    const next = loop[(index + 1) % loop.length];
    const aLength = Math.max(1e-6, Math.hypot(current.x - previous.x, current.z - previous.z));
    const bLength = Math.max(1e-6, Math.hypot(next.x - current.x, next.z - current.z));
    const tangent = { x: (next.x - previous.x) / Math.max(1e-6, Math.hypot(next.x - previous.x, next.z - previous.z)), z: (next.z - previous.z) / Math.max(1e-6, Math.hypot(next.x - previous.x, next.z - previous.z)) };
    const normalA = { x: (current.z - previous.z) / aLength, z: -(current.x - previous.x) / aLength };
    const normalB = { x: (next.z - current.z) / bLength, z: -(next.x - current.x) / bLength };
    const normalLength = Math.max(1e-6, Math.hypot(normalA.x + normalB.x, normalA.z + normalB.z));
    return Object.freeze({
        id,
        kind,
        x: current.x,
        z: current.z,
        tangent: Object.freeze(tangent),
        grassNormal: Object.freeze({ x: (normalA.x + normalB.x) / normalLength, z: (normalA.z + normalB.z) / normalLength })
    });
}

export function createGrassLabBoundaryCameraTargets(coverageDefinition) {
    const partition = createGrassCoveragePartition(coverageDefinition);
    const sidewalkSegments = partition.boundarySegments.filter((segment) => segment.kind === 'sidewalk');
    const straight = sidewalkSegments.filter((segment) => !segment.diagonal).sort((a, b) => b.length - a.length)[0] ?? sidewalkSegments[0];
    const diagonal = sidewalkSegments.filter((segment) => segment.diagonal && segment.length >= 2).sort((a, b) => b.length - a.length)[0] ?? sidewalkSegments[0];
    let curve = null;
    let inside = null;
    let outside = null;
    let strongestInsideTurn = 0;
    let strongestOutsideTurn = 0;
    const sidewalk = coverageDefinition.exclusions.find((entry) => entry.kind === 'sidewalk');
    const loop = sidewalk?.onsetLoop ?? [];
    for (let index = 0; index < loop.length; index++) {
        const previous = loop[(index - 1 + loop.length) % loop.length];
        const current = loop[index];
        const next = loop[(index + 1) % loop.length];
        const ax = current.x - previous.x;
        const az = current.z - previous.z;
        const bx = next.x - current.x;
        const bz = next.z - current.z;
        const turn = Math.atan2(ax * bz - az * bx, ax * bx + az * bz) * 180 / Math.PI;
        if (!curve && Math.abs(turn) >= 0.5 && Math.abs(turn) < 15) {
            const segment = sidewalkSegments.find((candidate) => candidate.a === current) ?? sidewalkSegments[0];
            curve = segmentPose(segment, 'curve', 'curve');
        }
        if (turn > strongestOutsideTurn + 0.01) {
            strongestOutsideTurn = turn;
            outside = cornerPose(loop, index, 'outside_corner', 'outside_corner');
        }
        if (turn < strongestInsideTurn - 0.01) {
            strongestInsideTurn = turn;
            inside = cornerPose(loop, index, 'inside_corner', 'inside_corner');
        }
    }
    const tree = coverageDefinition.exclusions.find((entry) => entry.kind === 'tree_base');
    const treePoint = tree?.onsetLoop?.reduce((best, point) => !best || point.x > best.x ? point : best, null);
    const treeCenter = tree?.sourceLoop?.reduce((sum, point) => ({ x: sum.x + point.x / tree.sourceLoop.length, z: sum.z + point.z / tree.sourceLoop.length }), { x: 0, z: 0 });
    const treeTarget = treePoint && treeCenter ? Object.freeze({
        id: 'tree_base',
        kind: 'tree_base',
        x: treePoint.x,
        z: treePoint.z,
        tangent: Object.freeze({ x: 0, z: 1 }),
        grassNormal: Object.freeze({ x: 1, z: 0 })
    }) : null;
    const targets = {
        straight: segmentPose(straight, 'straight', 'straight'),
        curve: curve ?? segmentPose(sidewalkSegments[0], 'curve', 'curve'),
        diagonal: segmentPose(diagonal, 'diagonal', 'diagonal'),
        inside_corner: inside ?? cornerPose(loop, 0, 'inside_corner', 'inside_corner'),
        outside_corner: outside ?? cornerPose(loop, 0, 'outside_corner', 'outside_corner'),
        tree_base: treeTarget
    };
    return Object.freeze(targets);
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
        wornEnabled: false,
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
        structuralBaseHeightMeters: finite(source.layerHeightMillimeters, 27.5) / 1000,
        substrateRevealMeters: finite(source.substrateRevealMillimeters, 80) / 1000,
        densityMultiplier: finite(source.densityMultiplier, 1),
        exclusionMarginMeters: 0,
        farCoverageThreshold: finite(source.farCoverageThreshold, 0.35),
        edgeAntialiasMeters: finite(source.edgeAntialiasMillimeters, 12) / 1000,
        rootClearanceMeters: finite(source.rootClearanceMillimeters, 3) / 1000,
        cutEdgeEnabled: source.cutEdgeEnabled !== false && source.fringeEnabled !== false,
        cutEdgeSpacingMeters: finite(source.cutEdgeSpacingMeters, 0.018),
        cutEdgeInsetMeters: finite(source.cutEdgeInsetMeters, 0.004),
        visibleBladeTipMinMeters: finite(source.visibleBladeTipMinMillimeters, 40) / 1000,
        visibleBladeTipMaxMeters: finite(source.visibleBladeTipMaxMillimeters, 75) / 1000,
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
            irregularCuts: 0,
            boundaryFeatures: Array.isArray(fixtures?.boundaryApproval?.approvalShapes) ? fixtures.boundaryApproval.approvalShapes.length : 0,
            treePlacements: Array.isArray(fixtures?.treePlacements) ? fixtures.treePlacements.length : 0,
            sourceLoopIdentity: String(fixtures?.grassCoverage?.sourceLoopIdentity ?? '')
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
