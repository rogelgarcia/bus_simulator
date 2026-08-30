import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    createGrassNearCarpetCellSet,
    diffGrassNearCarpetCellSets,
    getGrassNearCarpetBladesPerPatch,
    getGrassNearCarpetRootsPerPatch,
    sanitizeGrassNearCarpetConfig
} from '../../../src/graphics/engine3d/grass/GrassNearCarpetLayout.js';
import {
    createGrassCoverageDefinition,
    sampleGrassRootEligibility
} from '../../../src/app/grass/GrassCoverageContract.js';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const BOUNDS = Object.freeze({ minX: -100, maxX: 100, minZ: -100, maxZ: 100 });

function rectangleLoop(x0, x1, z0, z1) {
    return [
        { x: x0, z: z0 },
        { x: x0, z: z1 },
        { x: x1, z: z1 },
        { x: x1, z: z0 }
    ];
}

function createExactCoverage({ sidewalkHalfWidth = 0.35, includeTree = true } = {}) {
    const exclusions = [{
        id: 'sidewalk-cut',
        kind: 'sidewalk',
        sourceIdentity: 'rendered-sidewalk-loop',
        sourceLoop: rectangleLoop(-0.2, 0.2, -4, 4),
        onsetLoop: rectangleLoop(-sidewalkHalfWidth, sidewalkHalfWidth, -4, 4),
        substrateRevealMeters: 0.08
    }];
    if (includeTree) exclusions.push({
        id: 'tree-cut',
        kind: 'tree_base',
        sourceIdentity: 'tree-base-loop',
        sourceLoop: rectangleLoop(1.7, 2.1, -0.2, 0.2),
        onsetLoop: rectangleLoop(1.55, 2.25, -0.35, 0.35),
        substrateRevealMeters: 0.15
    });
    return createGrassCoverageDefinition({
        seed: 'near-v2-test',
        bounds: { minX: -4, maxX: 4, minZ: -4, maxZ: 4 },
        boundaryExclusions: exclusions,
        compatibilityExclusionRects: [{ id: 'historical-only', kind: 'sidewalk', x0: -4, x1: 4, z0: -4, z1: 4 }]
    });
}

test('V2 near defaults separate absolute tip elevation from visible blade length', () => {
    const config = sanitizeGrassNearCarpetConfig({ enabled: true });
    assert.equal(config.patchSizeMeters, 1);
    assert.equal(config.bladesPerSquareMeter, 64);
    assert.equal(config.fibersPerRoot, 3);
    assert.equal(config.materialId, 'pbr.grass_low_cut_maintained_v2');
    assert.equal(getGrassNearCarpetRootsPerPatch(config), 64);
    assert.equal(getGrassNearCarpetBladesPerPatch(config), 192);
    assert.equal(config.structuralBaseHeightMeters, 0.0275);
    assert.deepEqual(config.bladeTipElevationMeters, { min: 0.04, max: 0.075 });
    assert.deepEqual(config.bladeHeightMeters, { min: 0.0125, max: 0.0475 });
});

test('near carpet layout is deterministic and excludes road cells', () => {
    const options = {
        cameraX: 0.25,
        cameraZ: 0.25,
        config: { enabled: true, radiusMeters: 4 },
        terrainBounds: BOUNDS,
        exclusionRects: [{ x0: -0.5, x1: 0.5, z0: -10, z1: 10 }]
    };
    const first = createGrassNearCarpetCellSet(options);
    const second = createGrassNearCarpetCellSet(options);
    assert.deepEqual([...first.cells], [...second.cells]);
    const roots = [...first.cells.values()].flatMap((cell) => cell.roots ?? []);
    assert.equal(roots.some((root) => root.x >= -0.5 && root.x <= 0.5), false);
});

test('V2 exact polygons take precedence over contradictory legacy rectangles and clip roots instead of whole cells', () => {
    const coverageDefinition = createExactCoverage();
    const coverageConfig = { enabled: true, rootClearanceMeters: 0.003 };
    const options = {
        cameraX: 0.25,
        cameraZ: 0.25,
        config: { enabled: true, patchSizeMeters: 1, bladesPerSquareMeter: 64, fibersPerRoot: 3, radiusMeters: 3 },
        terrainBounds: { minX: -4, maxX: 4, minZ: -4, maxZ: 4 },
        coverageDefinition,
        coverageConfig,
        // Deliberately excludes the whole fixture. Exact polygon mode must ignore it.
        exclusionRects: [{ x0: -4, x1: 4, z0: -4, z1: 4 }]
    };
    const result = createGrassNearCarpetCellSet(options);
    assert.match(String(result.coverageMode), /exact|polygon/i);
    assert.equal(result.boundarySignature, coverageDefinition.boundarySignature);
    assert.ok(result.cells.size > 0, 'legacy rectangles must not erase exact-polygon placement');
    assert.ok(result.diagnostics.candidateBins > result.diagnostics.eligibleBins);
    assert.equal(result.diagnostics.eligibleBins, result.diagnostics.representedBins);
    assert.equal(result.diagnostics.unrepresentedEligibleBins, 0);
    assert.equal(result.diagnostics.exactPostcheckFailures, 0);
    assert.equal(result.diagnostics.eligibleAreaSquareMeters, result.diagnostics.representedAreaSquareMeters);
    assert.ok(result.diagnostics.rejectedByKind.sidewalk > 0);
    assert.ok(result.diagnostics.rejectedByKind.tree_base > 0);

    const roots = [...result.cells.values()].flatMap((cell) => cell.roots ?? []);
    assert.ok(roots.length > 0);
    assert.equal(roots.every((root) => sampleGrassRootEligibility(
        coverageDefinition,
        root.x,
        root.z,
        coverageConfig
    )), true);

    const partialCell = result.cells.get('0,0');
    assert.ok(partialCell?.roots?.length > 0, 'the edge cell must survive when only some roots overlap the sidewalk onset');
    assert.equal(partialCell.roots.every((root) => root.x > 0.35), true);
});

test('V2 near placement is deterministic and boundary signatures invalidate cached placement identity', () => {
    const makeOptions = (coverageDefinition) => ({
        cameraX: 0.25,
        cameraZ: 0.25,
        config: { enabled: true, patchSizeMeters: 1, bladesPerSquareMeter: 64, fibersPerRoot: 3, radiusMeters: 3 },
        terrainBounds: { minX: -4, maxX: 4, minZ: -4, maxZ: 4 },
        coverageDefinition,
        coverageConfig: { enabled: true, rootClearanceMeters: 0.003 },
        exclusionRects: [{ x0: -4, x1: 4, z0: -4, z1: 4 }]
    });
    const firstDefinition = createExactCoverage({ sidewalkHalfWidth: 0.35 });
    const first = createGrassNearCarpetCellSet(makeOptions(firstDefinition));
    const reloaded = createGrassNearCarpetCellSet(makeOptions(JSON.parse(JSON.stringify(firstDefinition))));
    assert.equal(reloaded.boundarySignature, first.boundarySignature);
    assert.equal(reloaded.cacheIdentity, first.cacheIdentity);
    assert.equal(reloaded.placementSignature, first.placementSignature);
    assert.deepEqual([...reloaded.cells], [...first.cells]);
    assert.deepEqual(reloaded.diagnostics, first.diagnostics);

    const changedDefinition = createExactCoverage({ sidewalkHalfWidth: 0.55 });
    const changed = createGrassNearCarpetCellSet(makeOptions(changedDefinition));
    assert.notEqual(changed.boundarySignature, first.boundarySignature);
    assert.notEqual(changed.cacheIdentity, first.cacheIdentity);
    assert.notEqual(changed.placementSignature, first.placementSignature);
    assert.notDeepEqual([...changed.cells], [...first.cells]);
    assert.equal(changed.diagnostics.unrepresentedEligibleBins, 0);
    assert.equal(changed.diagnostics.exactPostcheckFailures, 0);
});

test('crossing one camera cell retains the carpet and bounds buffer churn', () => {
    const config = { enabled: true, patchSizeMeters: 1, radiusMeters: 12 };
    const before = createGrassNearCarpetCellSet({ cameraX: 0.25, cameraZ: 0.25, config, terrainBounds: BOUNDS });
    const after = createGrassNearCarpetCellSet({ cameraX: 1.25, cameraZ: 0.25, config, terrainBounds: BOUNDS });
    const delta = diffGrassNearCarpetCellSets(before.cells, after.cells);
    assert.ok(delta.retained > delta.entering.length);
    assert.ok(delta.retained > delta.leaving.length);
    assert.ok(delta.entering.length + delta.leaving.length < after.cells.size);
});

test('near carpet renderer keeps geometry opaque, shadow-free, and frustum culled', () => {
    const source = readFileSync(`${REPO_ROOT}/src/graphics/engine3d/grass/GrassNearCarpetSystem.js`, 'utf8');
    assert.match(source, /transparent:\s*false/);
    assert.match(source, /mesh\.castShadow = false/);
    assert.match(source, /mesh\.frustumCulled = true/);
    assert.doesNotMatch(source, /mesh\.frustumCulled = false/);
});
