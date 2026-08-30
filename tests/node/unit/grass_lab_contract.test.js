// Node unit tests: canonical offline Grass Lab contract and fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEBUG_TOOL_REGISTRY } from '../../../src/states/DebugToolRegistry.js';
import {
    createGrassLabBoundaryCameraTargets,
    createGrassLabCoverageDefinition,
    createGrassLabEngineConfig,
    createGrassLabFixtureDefinition,
    createGrassLabSnapshot,
    createGrassLabTerrainGrid,
    GRASS_LAB_CANONICAL_URL,
    GRASS_LAB_CONTRACT_VERSION,
    GRASS_LAB_DEFAULT_SEED,
    pointIsInsideGrassLabExclusion
} from '../../../src/graphics/gui/grass_debugger/GrassLabContract.js';

const BOUNDS = Object.freeze({ minX: -180, minZ: -180, maxX: 180, maxZ: 180 });
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

function makeApprovalBoundaryLoop() {
    return [
        { x: -14, z: -8 },
        { x: -2, z: -8 },
        { x: -2, z: -5 },
        { x: 0, z: -5 },
        { x: 0, z: -8 },
        { x: 4, z: -8 },
        { x: 4.8, z: -7.9 },
        { x: 5.55, z: -7.65 },
        { x: 6.2, z: -7.2 },
        { x: 6.65, z: -6.55 },
        { x: 6.9, z: -5.8 },
        { x: 7, z: -5 },
        { x: 7, z: 8 },
        { x: -10, z: 0 },
        { x: -14, z: 0 }
    ];
}

function distanceToLoop(point, loop) {
    return Math.min(...loop.map((a, index) => {
        const b = loop[(index + 1) % loop.length];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const lengthSquared = dx * dx + dz * dz;
        const t = lengthSquared > 0
            ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSquared))
            : 0;
        return Math.hypot(point.x - (a.x + dx * t), point.z - (a.z + dz * t));
    }));
}

test('Grass Lab has one registered canonical URL and the former URL redirects to it', () => {
    const entry = DEBUG_TOOL_REGISTRY.find((tool) => tool?.id === 'grass_lod_debug');
    assert.ok(entry);
    assert.equal(entry.label, 'Grass Lab');
    assert.equal(entry.href, GRASS_LAB_CANONICAL_URL);
    const redirect = readFileSync(`${REPO_ROOT}/debug_tools/grass_lod_debug.html`, 'utf8');
    assert.match(redirect, /window\.location\.replace\('\.\/grass_debug\.html'\)/);
    assert.doesNotMatch(redirect, /grass_debugger\/main\.js/);
});

test('Grass Lab is the only debug screen that instantiates the grass runtime', () => {
    const labView = readFileSync(`${REPO_ROOT}/src/graphics/gui/grass_debugger/view/GrassDebuggerView.js`, 'utf8');
    const terrainView = readFileSync(`${REPO_ROOT}/src/graphics/gui/terrain_debugger/view/TerrainDebuggerView.js`, 'utf8');
    assert.match(labView, /new GrassEngine\(/);
    assert.match(labView, /this\._grassEngine\?\.update\?\.\(\{ camera: this\.camera, focusDistanceMeters:/);
    assert.doesNotMatch(terrainView, /new GrassEngine\(/);
    assert.doesNotMatch(terrainView, /from ['"].*grass\/GrassEngine\.js['"]/);
});

test('Grass Lab evidence visibility and tree-hole rebuilds retain runtime ownership', () => {
    const source = readFileSync(`${REPO_ROOT}/src/graphics/gui/grass_debugger/view/GrassDebuggerView.js`, 'utf8');
    assert.match(source, /const wasBoundaryEvidenceActive = this\._boundaryEvidenceMode !== null/);
    assert.match(source, /wasBoundaryEvidenceActive && next === null/);
    assert.match(source, /if \(this\._boundaryEvidenceMode && this\._grassEngine\?\.group\)/);
    assert.doesNotMatch(source, /group\.visible = this\._boundaryEvidenceMode === null/);
    assert.match(source, /coverageDefinitionInputKey\(state, config\)/);
    assert.match(source, /trunkRadiusMeters: Math\.max/);
    assert.match(source, /wornRadiusMeters: finiteOr/);
});

test('Grass Lab v8 fixtures are deterministic and defer coverage to the exact rendered-loop handoff', () => {
    const first = createGrassLabFixtureDefinition({ bounds: BOUNDS, tileSize: 24, roadHalfWidth: 8 });
    const second = createGrassLabFixtureDefinition({ bounds: BOUNDS, tileSize: 24, roadHalfWidth: 8 });
    assert.deepEqual(first, second);
    assert.equal(first.seed, GRASS_LAB_DEFAULT_SEED);
    assert.equal(first.roadSegments.length, 1);

    const points = first.roadSegments[0].points;
    assert.ok(points.length >= 7, 'Expected long straight, diagonal, and corner transitions');
    assert.equal(first.exclusionRects.length, points.length - 1);
    assert.equal(Object.hasOwn(first, 'irregularCutRects'), false);
    assert.equal(Object.hasOwn(first, 'grassCoverage'), false, 'Coverage waits for RoadEngine to return rendered sidewalk loops');
    assert.equal(Object.hasOwn(first, 'coverageCameraTargets'), false);
    assert.deepEqual(first.boundaryApproval, {
        source: 'rendered_road_engine_sidewalk_outer_loops',
        substrateRevealMeters: 0.08,
        approvalShapes: ['straight', 'curve', 'diagonal', 'inside_corner', 'outside_corner', 'tree_base']
    });
    assert.ok(first.lodCameraTargets.grazing);
    assert.ok(first.lodCameraTargets.topDown);
    assert.ok(first.lodCameraTargets.cutoff);
    assert.ok(first.accentCameraTargets.tree);
    assert.ok(first.accentCameraTargets.wornFeature);

    let directionChanges = 0;
    for (let index = 0; index + 1 < points.length; index++) {
        const a = points[index];
        const b = points[index + 1];
        const midpoint = { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 };
        assert.equal(pointIsInsideGrassLabExclusion(midpoint.x, midpoint.z, first.exclusionRects), true);
        if (index + 2 < points.length) {
            const c = points[index + 2];
            const ab = { x: Math.sign(b.x - a.x), z: Math.sign(b.z - a.z) };
            const bc = { x: Math.sign(c.x - b.x), z: Math.sign(c.z - b.z) };
            if (ab.x !== bc.x || ab.z !== bc.z) directionChanges++;
        }
    }
    assert.ok(directionChanges >= 2, 'Expected at least two deterministic corner transitions');
    assert.ok(points.some((point, index) => {
        const next = points[index + 1];
        return next && Math.abs(next.x - point.x) > 1 && Math.abs(next.z - point.z) > 1;
    }), 'Expected at least one true diagonal route leg');
    assert.ok(first.treePlacements.length >= 3);
    for (const tree of first.treePlacements) {
        assert.equal(pointIsInsideGrassLabExclusion(tree.x, tree.z, first.exclusionRects), false);
        assert.equal(Number.isFinite(tree.scaleVar), true);
        assert.equal(Object.hasOwn(tree, 'scale'), false);
    }
    assert.equal(first.accentFeaturePlacements.length, 1);
});

test('Grass Lab builds the V2 polygon from the rendered sidewalk source with a nominal 80 mm onset', () => {
    const fixtures = createGrassLabFixtureDefinition({ bounds: BOUNDS, tileSize: 24, roadHalfWidth: 8 });
    const tree = { id: 'approval_tree', x: 12, y: 0, z: 12, rotation: 0.4, scaleVar: 1, variant: 0 };
    const sourceLoop = makeApprovalBoundaryLoop();
    const definition = createGrassLabCoverageDefinition({
        bounds: { minX: -20, minZ: -20, maxX: 20, maxZ: 20 },
        fixtures: { ...fixtures, treePlacements: [tree] },
        sidewalkOuterBoundaryLoops: [sourceLoop],
        sidewalkBoundarySource: { id: 'road-engine:test-sidewalk', loopIds: ['rendered-loop-0'] }
    });

    assert.equal(definition.version, 2);
    assert.equal(definition.exclusions.length, 2);
    assert.equal(definition.exclusions[0].kind, 'sidewalk');
    assert.equal(definition.exclusions[0].substrateRevealMeters, 0.08);
    assert.equal(definition.exclusions[0].sourceIdentity, 'road-engine:test-sidewalk|rendered-loop-0');
    assert.deepEqual(definition.exclusions[0].sourceLoop, sourceLoop);
    assert.notDeepEqual(definition.exclusions[0].onsetLoop, sourceLoop);
    assert.equal(definition.exclusions[1].kind, 'tree_base');
    assert.equal(definition.exclusions[1].shape, 'circle');
    assert.equal(definition.exclusions[1].sourceLoop.length, 48);
    assert.equal(definition.exclusions[1].onsetLoop.length, 48);

    const onsetDistances = definition.exclusions[0].onsetLoop.map((point) => distanceToLoop(point, definition.exclusions[0].sourceLoop));
    assert.ok(onsetDistances.every((distance) => distance >= 0.06 - 1e-9 && distance <= 0.1 + 1e-9), 'Every mitered onset point must stay within the approved 80 +/- 20 mm strip');
    assert.ok(onsetDistances.some((distance) => Math.abs(distance - 0.08) <= 0.000001), 'Unclamped segments must preserve the exact nominal 80 mm offset');

    const reloaded = createGrassLabCoverageDefinition({
        bounds: { minX: -20, minZ: -20, maxX: 20, maxZ: 20 },
        fixtures: { ...fixtures, treePlacements: [tree] },
        sidewalkOuterBoundaryLoops: JSON.parse(JSON.stringify([sourceLoop])),
        sidewalkBoundarySource: JSON.parse(JSON.stringify({ id: 'road-engine:test-sidewalk', loopIds: ['rendered-loop-0'] }))
    });
    assert.equal(reloaded.boundarySignature, definition.boundarySignature);
    assert.equal(reloaded.sourceLoopIdentity, definition.sourceLoopIdentity);

    const changedTrunk = createGrassLabCoverageDefinition({
        bounds: { minX: -20, minZ: -20, maxX: 20, maxZ: 20 },
        fixtures: { ...fixtures, treePlacements: [tree] },
        sidewalkOuterBoundaryLoops: [sourceLoop],
        sidewalkBoundarySource: { id: 'road-engine:test-sidewalk', loopIds: ['rendered-loop-0'] },
        trunkRadiusMeters: 0.6
    });
    const changedWear = createGrassLabCoverageDefinition({
        bounds: { minX: -20, minZ: -20, maxX: 20, maxZ: 20 },
        fixtures: { ...fixtures, treePlacements: [tree] },
        sidewalkOuterBoundaryLoops: [sourceLoop],
        sidewalkBoundarySource: { id: 'road-engine:test-sidewalk', loopIds: ['rendered-loop-0'] },
        wornRadiusMeters: 0.9
    });
    assert.notEqual(changedTrunk.sourceLoopIdentity, definition.sourceLoopIdentity);
    assert.notEqual(changedTrunk.boundarySignature, definition.boundarySignature);
    assert.equal(changedWear.sourceLoopIdentity, definition.sourceLoopIdentity);
    assert.notEqual(changedWear.boundarySignature, definition.boundarySignature);
});

test('Grass Lab exposes deterministic straight, curve, diagonal, corner, and tree approval cameras', () => {
    const definition = createGrassLabCoverageDefinition({
        bounds: { minX: -20, minZ: -20, maxX: 20, maxZ: 20 },
        fixtures: {
            seed: 'boundary-camera-test',
            treePlacements: [{ id: 'approval_tree', x: 12, y: 0, z: 12, rotation: 0, scaleVar: 1, variant: 0 }]
        },
        sidewalkOuterBoundaryLoops: [makeApprovalBoundaryLoop()],
        sidewalkBoundarySource: { id: 'road-engine:test-sidewalk', loopIds: ['rendered-loop-0'] }
    });
    const first = createGrassLabBoundaryCameraTargets(definition);
    const second = createGrassLabBoundaryCameraTargets(definition);

    assert.deepEqual(first, second);
    assert.deepEqual(Object.keys(first), ['straight', 'curve', 'diagonal', 'inside_corner', 'outside_corner', 'tree_base']);
    for (const [id, target] of Object.entries(first)) {
        assert.ok(target, `Missing ${id} approval target`);
        assert.equal(target.id, id);
        assert.equal(Number.isFinite(target.x), true);
        assert.equal(Number.isFinite(target.z), true);
        assert.ok(Math.abs(Math.hypot(target.tangent.x, target.tangent.z) - 1) < 1e-6);
        assert.ok(Math.abs(Math.hypot(target.grassNormal.x, target.grassNormal.z) - 1) < 1e-6);
    }
    assert.ok(Math.abs(first.diagonal.tangent.x) > 0.1 && Math.abs(first.diagonal.tangent.z) > 0.1);
    assert.notDeepEqual(first.inside_corner, first.outside_corner);
});

test('Grass Lab terrain grid matches the canonical segmented ground', () => {
    const grid = createGrassLabTerrainGrid({
        bounds: BOUNDS,
        tileSize: 24,
        widthTiles: 15,
        depthTiles: 15,
        nx: 30,
        nz: 30
    });
    assert.deepEqual(grid, {
        tileSize: 24,
        widthTiles: 15,
        depthTiles: 15,
        minX: -180,
        minZ: -180,
        minY: 0,
        maxY: 0,
        nx: 30,
        nz: 30,
        dx: 12,
        dz: 12
    });
});

test('Grass Lab maps source controls into one deterministic GrassEngine config', () => {
    const state = {
        lab: { seed: 'approval' },
        autoLod: { force: 'auto', nearEndMeters: 9, clusterEndMeters: 30, transitionWidthMeters: 2, hysteresisMeters: 0.75, grazingDistanceScale: 0.8, topDownDistanceScale: 1.2 },
        lod1: { enabled: true, carpetMode: 'auto', carpetPatchSizeMeters: 1, carpetBladesPerSquareMeter: 48, carpetRadiusMeters: 9, seed: 'near', densityPerTile: 576, region: { outerMeters: 9 }, debug: { drawBounds: true } },
        lod2: { enabled: true, seed: 'mid', clusterPatchSizeMeters: 2, clusterCardsPerPatch: 2, clusterCardWidthMeters: 1.15, clusterCardHeightMeters: 0.055, densityPerTile: 144, region: { outerMeters: 30 }, debug: { drawBounds: false } },
        lod3: { enabled: true, region: { outerMeters: 170 }, debug: { drawBounds: false } },
        lod4: { enabled: false, region: { outerMeters: 260 }, debug: { drawBounds: false } }
    };
    const first = createGrassLabEngineConfig(state, { tileSize: 24 });
    const second = createGrassLabEngineConfig(state, { tileSize: 24 });
    assert.deepEqual(first, second);
    assert.equal(first.seed, 'approval|maintained-turf-v1|near|mid');
    assert.equal(first.field.density, 1);
    assert.deepEqual(first.field.height, { min: 0.025, max: 0.03 });
    assert.equal(first.geometry.blade.width, 0.0027);
    assert.equal(first.field.enabled, false);
    assert.equal(first.nearCarpet.enabled, true);
    assert.equal(first.nearCarpet.mode, 'auto');
    assert.equal(first.nearCarpet.patchSizeMeters, 1);
    assert.equal(first.nearCarpet.bladesPerSquareMeter, 48);
    assert.equal(first.nearCarpet.radiusMeters, 9);
    assert.equal(first.nearCarpet.yOffsetMeters, 0.0275);
    assert.equal(first.midCluster.enabled, true);
    assert.equal(first.midCluster.patchSizeMeters, 2);
    assert.equal(first.midCluster.cardsPerPatch, 2);
    assert.equal(first.midCluster.atlasVariants, 8);
    assert.equal(first.localizedAccents.enabled, true);
    assert.equal(first.localizedAccents.clustersPerTree, 4);
    assert.equal(first.localizedAccents.cardHeightMeters, 0.075);
    assert.equal(first.autoLod.force, 'auto');
    assert.equal(first.autoLod.nearEndMeters, 9);
    assert.equal(first.autoLod.clusterEndMeters, 30);
    assert.equal(first.exclusion.marginMeters, 0.621);
    assert.deepEqual(first.lod.renderMode, { master: 'star', near: 'star', mid: 'cross', far: 'cross_sparse' });
    assert.equal(first.density.midMul, 0.25);
    assert.deepEqual(first.field.lod.allow, { master: false, near: true, mid: false, far: false });
    assert.deepEqual(first.lod.distances, { master: 0, near: 9, mid: 30, far: 30, cutoff: 30 });
    assert.equal(first.debug.showLodRings, true);
});

test('Grass Lab baseline snapshot has stable ownership and numeric diagnostics', () => {
    const baseFixtures = createGrassLabFixtureDefinition({ bounds: BOUNDS });
    const grassCoverage = createGrassLabCoverageDefinition({
        bounds: BOUNDS,
        fixtures: { ...baseFixtures, treePlacements: [] },
        sidewalkOuterBoundaryLoops: [makeApprovalBoundaryLoop()],
        sidewalkBoundarySource: { id: 'road-engine:snapshot', loopIds: ['rendered-loop-0'] }
    });
    const snapshot = createGrassLabSnapshot({
        seed: 'approval',
        fixtures: { ...baseFixtures, grassCoverage },
        engineStats: { enabled: true, patches: 4, totalInstances: 100, totalTriangles: 600, drawCalls: 3, nearCarpet: { enabled: true, patchInstances: 20, bladeInstances: 960 }, midCluster: { enabled: true, instances: 12, triangles: 48, drawCalls: 1 } },
        coverageStats: { enabled: true, structuralBaseHeightMeters: 0.0275, layerHeightMeters: 0.0275, triangles: 800, drawCalls: 2, opaqueCap: true, hardExclusionIntrusions: 0, ineligibleCutEdgeRoots: 0 },
        rendererInfo: { render: { calls: 11, triangles: 900 } },
        lodInfo: { viewAngleDeg: 12, angleScale: 0.9, effectiveDistanceMeters: 10, activeTier: 'cluster', transitionState: 'near_to_cluster', nearEndMeters: 9, clusterEndMeters: 30, geometryCutoffWorldMeters: 33.3, force: 'auto', geometryBeyondCutoff: 0 },
        authoring: { sourceGeometryHash: '00c0ffee', runtimeTrianglesPerBlade: 1, runtimeMaterialSlots: 1 },
        cpuMs: 0.35,
        gpuMs: null
    });
    assert.equal(snapshot.canonicalRuntime, 'GrassEngine');
    assert.equal(snapshot.canonicalUrl, GRASS_LAB_CANONICAL_URL);
    assert.equal(snapshot.contractVersion, GRASS_LAB_CONTRACT_VERSION);
    assert.equal(snapshot.contractVersion, 8);
    assert.equal(snapshot.grass.instances, 100);
    assert.equal(snapshot.grass.updateCpuMs, 0.35);
    assert.equal(snapshot.grass.nearCarpet.patchInstances, 20);
    assert.equal(snapshot.grass.midCluster.instances, 12);
    assert.equal(snapshot.coverage.layerHeightMeters, 0.0275);
    assert.equal(snapshot.coverage.drawCalls, 2);
    assert.equal(snapshot.coverage.opaqueCap, true);
    assert.equal(snapshot.coverage.hardExclusionIntrusions, 0);
    assert.equal(snapshot.frame.gpuMs, null);
    assert.equal(snapshot.frame.rendererDrawCalls, 11);
    assert.equal(snapshot.fixtures.treePlacements > 0, true);
    assert.equal(snapshot.fixtures.boundaryFeatures, 6);
    assert.equal(snapshot.fixtures.sourceLoopIdentity, 'road-engine:snapshot|rendered-loop-0');
    assert.equal(snapshot.authoring.sourceGeometryHash, '00c0ffee');
    assert.equal(snapshot.authoring.runtimeTrianglesPerBlade, 1);
    assert.equal(snapshot.lod.activeTier, 'cluster');
    assert.equal(snapshot.lod.geometryBeyondCutoff, 0);
});
