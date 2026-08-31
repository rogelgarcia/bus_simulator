import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createGrassCoverageDefinition } from '../../../src/app/grass/GrassCoverageContract.js';
import {
    createGrassNearCarpetCellSet,
    sanitizeGrassNearCarpetConfig
} from '../../../src/graphics/engine3d/grass/GrassNearCarpetLayout.js';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

function rectangleLoop(x0, x1, z0, z1) {
    return [
        { x: x0, z: z0 },
        { x: x0, z: z1 },
        { x: x1, z: z1 },
        { x: x1, z: z0 }
    ];
}

function createBudgetCoverage(onsetHalfWidth = 0.38) {
    return createGrassCoverageDefinition({
        seed: 'ai360-budget',
        bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
        boundaryExclusions: [{
            id: 'sidewalk',
            kind: 'sidewalk',
            sourceIdentity: 'budget-sidewalk-loop',
            sourceLoop: rectangleLoop(-0.3, 0.3, -20, 20),
            onsetLoop: rectangleLoop(-onsetHalfWidth, onsetHalfWidth, -20, 20),
            substrateRevealMeters: 0.08
        }]
    });
}

test('AI 360 reuses exact coverage samples and invalidates them when the boundary signature changes', () => {
    const coverageSampleCache = new Map();
    const config = sanitizeGrassNearCarpetConfig({
        enabled: true,
        patchSizeMeters: 1,
        bladesPerSquareMeter: 64,
        fibersPerRoot: 3,
        radiusMeters: 3
    });
    const createOptions = (coverageDefinition) => ({
        cameraX: 0.25,
        cameraZ: 0.25,
        config,
        terrainBounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
        coverageDefinition,
        coverageConfig: { enabled: true, rootClearanceMeters: 0.003 },
        coverageSampleCache
    });
    const initialCoverage = createBudgetCoverage(0.38);
    const cold = createGrassNearCarpetCellSet(createOptions(initialCoverage));
    const warmCacheSize = coverageSampleCache.size;
    assert.ok(cold.diagnostics.coverageSampleCacheMisses > 0);
    assert.ok(warmCacheSize > 0);

    const warm = createGrassNearCarpetCellSet(createOptions(initialCoverage));
    assert.equal(warm.diagnostics.coverageSampleCacheMisses, 0);
    assert.ok(warm.diagnostics.coverageSampleCacheHits > 0);
    assert.equal(coverageSampleCache.size, warmCacheSize);
    assert.equal(warm.placementSignature, cold.placementSignature);
    assert.deepEqual([...warm.cells], [...cold.cells]);

    const changedCoverage = createBudgetCoverage(0.58);
    assert.notEqual(changedCoverage.boundarySignature, initialCoverage.boundarySignature);
    const invalidated = createGrassNearCarpetCellSet(createOptions(changedCoverage));
    assert.ok(invalidated.diagnostics.coverageSampleCacheMisses > 0);
    assert.ok(coverageSampleCache.size > warmCacheSize);
    assert.notEqual(invalidated.boundarySignature, warm.boundarySignature);
    assert.notEqual(invalidated.placementSignature, warm.placementSignature);
});

test('AI 360 shared coverage samples include exact definition bounds in their cache identity', () => {
    const coverageSampleCache = new Map();
    const wideCoverage = createBudgetCoverage();
    const narrowCoverage = Object.freeze({
        ...wideCoverage,
        // AI 359 signatures describe polygon loops; consumers must independently key bounds.
        bounds: Object.freeze({ minX: 0, maxX: 20, minZ: -20, maxZ: 20 })
    });
    assert.equal(narrowCoverage.boundarySignature, wideCoverage.boundarySignature);
    assert.equal(narrowCoverage.exclusions, wideCoverage.exclusions);

    const config = sanitizeGrassNearCarpetConfig({
        enabled: true,
        patchSizeMeters: 1,
        bladesPerSquareMeter: 64,
        fibersPerRoot: 3,
        radiusMeters: 3
    });
    const createOptions = (coverageDefinition) => ({
        cameraX: -0.75,
        cameraZ: 0.25,
        config,
        terrainBounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
        coverageDefinition,
        coverageConfig: { enabled: true, rootClearanceMeters: 0.003 },
        coverageSampleCache
    });
    const wide = createGrassNearCarpetCellSet(createOptions(wideCoverage));
    const wideCacheSize = coverageSampleCache.size;
    assert.ok([...wide.cells.values()].some((cell) => cell.roots.some((root) => root.x < 0)));

    const narrow = createGrassNearCarpetCellSet(createOptions(narrowCoverage));
    const narrowRoots = [...narrow.cells.values()].flatMap((cell) => cell.roots);
    assert.ok(narrow.diagnostics.coverageSampleCacheMisses > 0, 'changed bounds must not reuse same-signature samples');
    assert.ok(coverageSampleCache.size > wideCacheSize);
    assert.equal(narrowRoots.every((root) => root.x >= 0), true);
    assert.ok(narrow.diagnostics.acceptedRoots < wide.diagnostics.acceptedRoots);
    assert.notEqual(narrow.placementSignature, wide.placementSignature);
});

test('AI 361 near cache pads same-cell candidate data while keeping visibility bounded to the effective radius', () => {
    const effectiveRadiusMeters = 2;
    const patchSizeMeters = 1;
    const createLayout = (radiusMeters) => createGrassNearCarpetCellSet({
        cameraX: 0.5,
        cameraZ: 0.5,
        config: sanitizeGrassNearCarpetConfig({
            enabled: true,
            patchSizeMeters,
            bladesPerSquareMeter: 64,
            fibersPerRoot: 3,
            radiusMeters
        }),
        terrainBounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }
    });
    const unpadded = createLayout(effectiveRadiusMeters);
    const padded = createLayout(effectiveRadiusMeters + patchSizeMeters / Math.SQRT2);
    const movedCamera = { x: 0.99, z: 0.99 };
    const enteringCell = padded.cells.get('2,1');

    assert.ok(enteringCell, 'the ownership-cell cache must include a unit that enters range before the cell changes');
    assert.ok(Math.hypot(enteringCell.x - movedCamera.x, enteringCell.z - movedCamera.z) <= effectiveRadiusMeters);
    assert.ok(
        enteringCell.roots.length > (unpadded.cells.get(enteringCell.key)?.roots.length ?? 0),
        'candidate padding must preserve root data that the centered effective-radius layout clipped'
    );

    const source = readFileSync(`${REPO_ROOT}/src/graphics/engine3d/grass/GrassNearCarpetSystem.js`, 'utf8');
    assert.match(source, /radiusMeters:\s*effectiveRadiusMeters \+ config\.patchSizeMeters \/ Math\.SQRT2/);
    assert.match(source, /const insideSelectionRadius = handoff\.distanceMeters <= effectiveRadiusMeters/);
    assert.match(source, /const visible = insideSelectionRadius && \([\s\S]*?forcedEvidence \|\| resolveGrassAutoLodUnitVisibility/);
});

test('AI 360 high near carpet leaves triangle headroom under the combined V2 200k ceiling', () => {
    const config = sanitizeGrassNearCarpetConfig({
        enabled: true,
        patchSizeMeters: 1,
        bladesPerSquareMeter: 64,
        fibersPerRoot: 3,
        radiusMeters: 12
    });
    assert.equal(config.fibersPerRoot, 3);
    const layout = createGrassNearCarpetCellSet({
        cameraX: 0.25,
        cameraZ: 0.25,
        config,
        terrainBounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
        coverageDefinition: createBudgetCoverage(),
        coverageConfig: { enabled: true, rootClearanceMeters: 0.003 }
    });
    const rootCount = [...layout.cells.values()]
        .reduce((sum, cell) => sum + (Array.isArray(cell.roots) ? cell.roots.length : 0), 0);
    const nearTriangles = rootCount * config.fibersPerRoot;
    const ai359BoundaryTriangles = 95_219;
    assert.ok(rootCount > 0);
    assert.ok(nearTriangles + ai359BoundaryTriangles <= 200_000, JSON.stringify({
        nearTriangles,
        ai359BoundaryTriangles,
        combinedTriangles: nearTriangles + ai359BoundaryTriangles
    }));
    assert.equal(layout.diagnostics.unrepresentedEligibleBins, 0);
    assert.equal(layout.diagnostics.exactPostcheckFailures, 0);
});

test('AI 360 renderer remains one opaque shared material path with no tier-local texture loader', () => {
    const source = readFileSync(`${REPO_ROOT}/src/graphics/engine3d/grass/GrassNearCarpetSystem.js`, 'utf8');
    assert.match(source, /transparent:\s*false/);
    assert.match(source, /depthWrite:\s*true/);
    assert.match(source, /mesh\.castShadow = false/);
    assert.match(source, /mesh\.receiveShadow = false/);
    assert.match(source, /mesh\.frustumCulled = true/);
    assert.doesNotMatch(source, /new\s+THREE\.TextureLoader/);
    assert.doesNotMatch(source, /new\s+PbrTextureLoaderService/);
});
