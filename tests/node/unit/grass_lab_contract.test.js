// Node unit tests: canonical offline Grass Lab contract and fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEBUG_TOOL_REGISTRY } from '../../../src/states/DebugToolRegistry.js';
import {
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

test('Grass Lab fixtures are deterministic and cover straight, corner, exclusion, and tree cases', () => {
    const first = createGrassLabFixtureDefinition({ bounds: BOUNDS, tileSize: 24, roadHalfWidth: 8 });
    const second = createGrassLabFixtureDefinition({ bounds: BOUNDS, tileSize: 24, roadHalfWidth: 8 });
    assert.deepEqual(first, second);
    assert.equal(first.seed, GRASS_LAB_DEFAULT_SEED);
    assert.equal(first.roadSegments.length, 1);

    const points = first.roadSegments[0].points;
    assert.ok(points.length >= 4, 'Expected straight runs connected by representative corners');
    assert.equal(first.exclusionRects.length, points.length - 1);
    assert.equal(first.irregularCutRects.length, 3);
    assert.equal(first.grassCoverage.exclusionRects.length, first.exclusionRects.length + first.irregularCutRects.length);
    assert.ok(first.coverageCameraTargets.straight);
    assert.ok(first.coverageCameraTargets.corner);
    assert.ok(first.coverageCameraTargets.irregular);
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
    assert.ok(first.treePlacements.length >= 3);
    for (const tree of first.treePlacements) {
        assert.equal(pointIsInsideGrassLabExclusion(tree.x, tree.z, first.exclusionRects), false);
        assert.equal(Number.isFinite(tree.scaleVar), true);
        assert.equal(Object.hasOwn(tree, 'scale'), false);
    }
    assert.equal(first.accentFeaturePlacements.length, 1);
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
    const snapshot = createGrassLabSnapshot({
        seed: 'approval',
        fixtures: createGrassLabFixtureDefinition({ bounds: BOUNDS }),
        engineStats: { enabled: true, patches: 4, totalInstances: 100, totalTriangles: 600, drawCalls: 3, nearCarpet: { enabled: true, patchInstances: 20, bladeInstances: 960 }, midCluster: { enabled: true, instances: 12, triangles: 48, drawCalls: 1 } },
        coverageStats: { enabled: true, layerHeightMeters: 0.0275, triangles: 800, drawCalls: 3 },
        rendererInfo: { render: { calls: 11, triangles: 900 } },
        lodInfo: { viewAngleDeg: 12, angleScale: 0.9, effectiveDistanceMeters: 10, activeTier: 'cluster', transitionState: 'near_to_cluster', nearEndMeters: 9, clusterEndMeters: 30, geometryCutoffWorldMeters: 33.3, force: 'auto', geometryBeyondCutoff: 0 },
        authoring: { sourceGeometryHash: '00c0ffee', runtimeTrianglesPerBlade: 1, runtimeMaterialSlots: 1 },
        cpuMs: 0.35,
        gpuMs: null
    });
    assert.equal(snapshot.canonicalRuntime, 'GrassEngine');
    assert.equal(snapshot.canonicalUrl, GRASS_LAB_CANONICAL_URL);
    assert.equal(snapshot.contractVersion, GRASS_LAB_CONTRACT_VERSION);
    assert.equal(snapshot.contractVersion, 7);
    assert.equal(snapshot.grass.instances, 100);
    assert.equal(snapshot.grass.updateCpuMs, 0.35);
    assert.equal(snapshot.grass.nearCarpet.patchInstances, 20);
    assert.equal(snapshot.grass.midCluster.instances, 12);
    assert.equal(snapshot.coverage.layerHeightMeters, 0.0275);
    assert.equal(snapshot.coverage.drawCalls, 3);
    assert.equal(snapshot.frame.gpuMs, null);
    assert.equal(snapshot.frame.rendererDrawCalls, 11);
    assert.equal(snapshot.fixtures.treePlacements > 0, true);
    assert.equal(snapshot.authoring.sourceGeometryHash, '00c0ffee');
    assert.equal(snapshot.authoring.runtimeTrianglesPerBlade, 1);
    assert.equal(snapshot.lod.activeTier, 'cluster');
    assert.equal(snapshot.lod.geometryBeyondCutoff, 0);
});
