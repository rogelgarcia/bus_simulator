import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createGrassCoverageDefinition,
    sampleGrassRootEligibility
} from '../../../src/app/grass/GrassCoverageContract.js';
import { createGrassAutoLodFieldUnitHandoff } from '../../../src/app/grass/GrassAutoLodContract.js';
import {
    GRASS_COHESIVE_FIELD_DEFAULTS,
    createGrassCohesiveFieldLayout,
    sanitizeGrassCohesiveFieldConfig
} from '../../../src/app/grass/GrassCohesiveFieldLayout.js';

function rectangleLoop(x0, x1, z0, z1) {
    return [
        { x: x0, z: z0 },
        { x: x0, z: z1 },
        { x: x1, z: z1 },
        { x: x1, z: z0 }
    ];
}

function createExactCoverage({ sidewalkHalfWidth = 0.35, bounds = null } = {}) {
    return createGrassCoverageDefinition({
        seed: 'ai361-cohesive-layout',
        bounds: bounds ?? { minX: -4, maxX: 4, minZ: -4, maxZ: 4 },
        boundaryExclusions: [{
            id: 'sidewalk-cut',
            kind: 'sidewalk',
            sourceIdentity: 'rendered-sidewalk-loop',
            sourceLoop: rectangleLoop(-0.2, 0.2, -4, 4),
            onsetLoop: rectangleLoop(-sidewalkHalfWidth, sidewalkHalfWidth, -4, 4),
            substrateRevealMeters: 0.08
        }, {
            id: 'tree-cut',
            kind: 'tree_base',
            sourceIdentity: 'tree-base-loop',
            sourceLoop: rectangleLoop(1.7, 2.1, -0.2, 0.2),
            onsetLoop: rectangleLoop(1.55, 2.25, -0.35, 0.35),
            substrateRevealMeters: 0.15
        }]
    });
}

function makeOptions(coverageDefinition, overrides = {}) {
    return {
        cameraX: 0.25,
        cameraZ: 0.25,
        config: { radiusMeters: 3 },
        terrainBounds: { minX: -4, maxX: 4, minZ: -4, maxZ: 4 },
        coverageDefinition,
        coverageConfig: { enabled: true, rootClearanceMeters: 0.003 },
        exclusionRects: [{ id: 'contradictory-legacy', x0: -4, x1: 4, z0: -4, z1: 4 }],
        ...overrides
    };
}

function correlation(pairs) {
    const leftMean = pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.length;
    const rightMean = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length;
    const covariance = pairs.reduce((sum, pair) => (
        sum + (pair[0] - leftMean) * (pair[1] - rightMean)
    ), 0);
    const leftVariance = pairs.reduce((sum, pair) => sum + (pair[0] - leftMean) ** 2, 0);
    const rightVariance = pairs.reduce((sum, pair) => sum + (pair[1] - rightMean) ** 2, 0);
    return covariance / Math.sqrt(leftVariance * rightVariance);
}

test('cohesive field defaults use one shared 1 m layout with one billboard and two middle cards', () => {
    const config = sanitizeGrassCohesiveFieldConfig(null);
    assert.equal(config.version, 2);
    assert.equal(config.unitSizeMeters, 1);
    assert.equal(config.radiusMeters, 25);
    assert.equal(config.rootJitterFactor, 0.56);
    assert.equal(config.billboard.cardsPerUnit, 1);
    assert.equal(config.middle.cardsPerUnit, 2);
    assert.equal(config.billboard.widthMeters, 1.15);
    assert.equal(config.middle.widthMeters, 1.15);
    assert.deepEqual(config, sanitizeGrassCohesiveFieldConfig(GRASS_COHESIVE_FIELD_DEFAULTS));
});

test('default field roots and orientations break the visible one-metre lattice deterministically', () => {
    const coverageDefinition = createGrassCoverageDefinition({
        seed: 'ai361-anti-lattice-layout',
        bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
        boundaryExclusions: [{
            id: 'distant-tree-cut',
            kind: 'tree_base',
            sourceIdentity: 'distant-tree-loop',
            sourceLoop: rectangleLoop(18, 18.2, 18, 18.2),
            onsetLoop: rectangleLoop(17.9, 18.3, 17.9, 18.3),
            substrateRevealMeters: 0.1
        }]
    });
    const options = {
        cameraX: 0.25,
        cameraZ: 0.25,
        terrainBounds: coverageDefinition.bounds,
        coverageDefinition,
        coverageConfig: { rootClearanceMeters: 0.003 },
        config: { radiusMeters: 10, rootJitterFactor: 0.9 }
    };
    const layout = createGrassCohesiveFieldLayout(options);
    const repeated = createGrassCohesiveFieldLayout(options);
    const jitteredUnits = layout.units.filter((unit) => unit.probeRole === 'jittered');
    const xOffsets = jitteredUnits.map((unit) => unit.x - (unit.cellX + 0.5));
    const zOffsets = jitteredUnits.map((unit) => unit.z - (unit.cellZ + 0.5));
    const yaws = layout.units.map((unit) => Math.abs(unit.yawRadians));
    assert.equal(repeated.placementSignature, layout.placementSignature);
    assert.deepEqual(repeated.units, layout.units);
    assert.ok(Math.max(...xOffsets) - Math.min(...xOffsets) > 0.65);
    assert.ok(Math.max(...zOffsets) - Math.min(...zOffsets) > 0.65);
    for (const unit of jitteredUnits) {
        assert.ok(unit.x >= unit.cellX + 0.04 - 1e-9);
        assert.ok(unit.x <= unit.cellX + 0.96 + 1e-9);
        assert.ok(unit.z >= unit.cellZ + 0.04 - 1e-9);
        assert.ok(unit.z <= unit.cellZ + 0.96 + 1e-9);
    }
    const byKey = new Map(jitteredUnits.map((unit) => [unit.key, unit]));
    const adjacent = jitteredUnits
        .map((unit) => [unit, byKey.get(`${unit.cellX + 1},${unit.cellZ}`)])
        .filter((pair) => pair[1]);
    assert.ok(adjacent.length > 100);
    assert.ok(Math.abs(correlation(adjacent.map(([left, right]) => [
        left.x - left.cellX,
        right.x - right.cellX
    ]))) < 0.25);
    assert.ok(Math.abs(correlation(adjacent.map(([left, right]) => [
        left.z - left.cellZ,
        right.z - right.cellZ
    ]))) < 0.25);
    assert.ok(Math.max(...yaws) > Math.PI / 6);
    assert.equal(layout.diagnostics.unrepresentedEligibleUnits, 0);
    assert.equal(layout.diagnostics.exactEnvelopeFailures, 0);
});

test('cohesive unit scale variation is deterministic and symmetric around nominal size', () => {
    const coverageDefinition = createExactCoverage({
        bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 }
    });
    const options = makeOptions(coverageDefinition, {
        terrainBounds: coverageDefinition.bounds,
        config: { seed: 'symmetric-scale', radiusMeters: 10, scaleVariation: 0.2 }
    });
    const layout = createGrassCohesiveFieldLayout(options);
    const repeated = createGrassCohesiveFieldLayout(options);
    const scales = layout.units.map((unit) => unit.scale);
    const minimum = Math.min(...scales);
    const maximum = Math.max(...scales);
    assert.deepEqual(repeated.units.map((unit) => unit.scale), scales);
    assert.ok(minimum >= 0.8);
    assert.ok(maximum <= 1.2);
    assert.ok(scales.some((scale) => scale < 1));
    assert.ok(scales.some((scale) => scale > 1));
});

test('jittered render roots retain canonical cell-center handoff distance and immutable placement', () => {
    const coverageDefinition = createExactCoverage();
    const layout = createGrassCohesiveFieldLayout(makeOptions(coverageDefinition, {
        cameraX: 0.25,
        cameraZ: 0.25,
        config: { seed: 'shared-distance', radiusMeters: 3, rootJitterFactor: 0.56 }
    }));
    const unit = layout.units.find((candidate) => (
        Math.abs(candidate.x - (candidate.cellX + 0.5)) > 0.02
        || Math.abs(candidate.z - (candidate.cellZ + 0.5)) > 0.02
    ));
    assert.ok(unit, 'fixture must contain a visibly jittered render root');
    const before = {
        placementSignature: layout.placementSignature,
        x: unit.x,
        z: unit.z,
        yawRadians: unit.yawRadians,
        scale: unit.scale
    };
    const nearSelection = createGrassAutoLodFieldUnitHandoff({
        unitKey: unit.key,
        fieldSeed: layout.config.seed,
        boundarySignature: layout.boundarySignature,
        cameraX: 0.25,
        cameraZ: 0.25
    });
    const fieldSelection = createGrassAutoLodFieldUnitHandoff({
        unitKey: unit.key,
        fieldSeed: layout.config.seed,
        boundarySignature: layout.boundarySignature,
        cameraX: 0.25,
        cameraZ: 0.25
    });
    assert.deepEqual(fieldSelection, nearSelection);
    assert.notEqual(
        fieldSelection.distanceMeters,
        Math.hypot(unit.x - 0.25, unit.z - 0.25),
        'selection distance must not follow the jittered render root'
    );
    assert.deepEqual({
        placementSignature: layout.placementSignature,
        x: unit.x,
        z: unit.z,
        yawRadians: unit.yawRadians,
        scale: unit.scale
    }, before);
});

test('boundary-completion probes retain a narrow exact-eligible sliver missed by canonical cell probes', () => {
    const coverageDefinition = createGrassCoverageDefinition({
        seed: 'ai361-boundary-completion',
        bounds: { minX: -1, maxX: 2, minZ: -1, maxZ: 2 },
        boundaryExclusions: [{
            id: 'wide-sidewalk-cut',
            kind: 'sidewalk',
            sourceIdentity: 'wide-sidewalk-loop',
            sourceLoop: rectangleLoop(-1, 0.95, -1, 2),
            onsetLoop: rectangleLoop(-1, 0.95, -1, 2),
            substrateRevealMeters: 0
        }]
    });
    const layout = createGrassCohesiveFieldLayout({
        cameraX: 0.25,
        cameraZ: 0.25,
        terrainBounds: coverageDefinition.bounds,
        coverageDefinition,
        coverageConfig: { rootClearanceMeters: 0.003 },
        config: { radiusMeters: 2 }
    });
    const sliver = layout.units.find((unit) => unit.cellX === 0 && unit.cellZ === 0);
    assert.ok(sliver, 'the 50 mm grass sliver must remain represented');
    assert.equal(sliver.probeRole, 'boundary_completion');
    assert.ok(layout.diagnostics.boundaryCompletionProbes > 0);
    assert.ok(layout.diagnostics.boundaryCompletionSelectedUnits > 0);
    assert.equal(sliver.billboard.represented, true);
    assert.equal(sliver.middle.represented, true);
    assert.equal(layout.diagnostics.unrepresentedEligibleUnits, 0);
    assert.equal(layout.diagnostics.exactPostcheckFailures, 0);
    assert.equal(layout.diagnostics.exactEnvelopeFailures, 0);
});

test('exact polygons override legacy rectangles and retain partial sidewalk/tree units without gaps', () => {
    const coverageDefinition = createExactCoverage();
    const coverageConfig = { enabled: true, rootClearanceMeters: 0.003 };
    const layout = createGrassCohesiveFieldLayout(makeOptions(coverageDefinition, { coverageConfig }));
    assert.equal(layout.coverageMode, 'exact_polygon');
    assert.equal(layout.boundarySignature, coverageDefinition.boundarySignature);
    assert.ok(layout.units.length > 0, 'the contradictory full-field legacy rectangle must be ignored');
    assert.ok(layout.diagnostics.partialUnits > 0);
    assert.equal(layout.diagnostics.unrepresentedEligibleUnits, 0);
    assert.equal(layout.diagnostics.exactPostcheckFailures, 0);
    assert.equal(layout.diagnostics.exactEnvelopeFailures, 0);
    assert.equal(layout.diagnostics.eligibleAreaSquareMeters, layout.diagnostics.representedAreaSquareMeters);
    assert.equal(layout.tiers.billboard.diagnostics.unrepresentedEligibleUnits, 0);
    assert.equal(layout.tiers.middle.diagnostics.unrepresentedEligibleUnits, 0);
    assert.ok(layout.tiers.billboard.diagnostics.footprintClampedUnits > 0);

    const partial = layout.units.filter((unit) => unit.partial);
    assert.ok(partial.length > 0);
    for (const unit of layout.units) {
        assert.equal(sampleGrassRootEligibility(coverageDefinition, unit.x, unit.z, coverageConfig), true);
        assert.equal(unit.exactPostcheckPassed, true);
        assert.equal(unit.billboard.exactEnvelopePassed, true);
        assert.equal(unit.middle.exactEnvelopePassed, true);
        assert.equal(unit.billboard.unitKey, unit.key);
        assert.equal(unit.middle.unitKey, unit.key);
        assert.equal(unit.billboard.x, unit.middle.x);
        assert.equal(unit.billboard.z, unit.middle.z);
        assert.equal(unit.billboard.cardsPerUnit, 1);
        assert.equal(unit.middle.cardsPerUnit, 2);
    }
});

test('cohesive placement is deterministic and shared exact sample caches invalidate on signature or bounds changes', () => {
    const coverageSampleCache = new Map();
    const initialDefinition = createExactCoverage({ sidewalkHalfWidth: 0.35 });
    const options = makeOptions(initialDefinition, { coverageSampleCache });
    const cold = createGrassCohesiveFieldLayout(options);
    const coldCacheSize = coverageSampleCache.size;
    assert.ok(cold.diagnostics.coverageSampleCacheMisses > 0);
    assert.ok(coldCacheSize > 0);

    const warm = createGrassCohesiveFieldLayout(options);
    assert.equal(warm.diagnostics.coverageSampleCacheMisses, 0);
    assert.ok(warm.diagnostics.coverageSampleCacheHits > 0);
    assert.equal(warm.cacheIdentity, cold.cacheIdentity);
    assert.equal(warm.placementSignature, cold.placementSignature);
    assert.deepEqual(warm.units, cold.units);

    const changedDefinition = createExactCoverage({ sidewalkHalfWidth: 0.55 });
    const changed = createGrassCohesiveFieldLayout(makeOptions(changedDefinition, { coverageSampleCache }));
    assert.ok(changed.diagnostics.coverageSampleCacheMisses > 0);
    assert.notEqual(changed.boundarySignature, cold.boundarySignature);
    assert.notEqual(changed.cacheIdentity, cold.cacheIdentity);
    assert.notEqual(changed.placementSignature, cold.placementSignature);

    const narrowedDefinition = Object.freeze({
        ...initialDefinition,
        bounds: Object.freeze({ minX: 0, maxX: 4, minZ: -4, maxZ: 4 })
    });
    assert.equal(narrowedDefinition.boundarySignature, initialDefinition.boundarySignature);
    const narrowed = createGrassCohesiveFieldLayout(makeOptions(narrowedDefinition, { coverageSampleCache }));
    assert.ok(narrowed.diagnostics.coverageSampleCacheMisses > 0);
    assert.notEqual(narrowed.cacheIdentity, cold.cacheIdentity);
    assert.notEqual(narrowed.placementSignature, cold.placementSignature);
    assert.equal(narrowed.units.every((unit) => unit.x >= 0), true);
});

test('cohesive tier triangle shape leaves ample room under the combined 200k V2 ceiling', () => {
    const coverageDefinition = createGrassCoverageDefinition({
        seed: 'ai361-budget-layout',
        bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 },
        boundaryExclusions: [{
            id: 'distant-tree-cut',
            kind: 'tree_base',
            sourceIdentity: 'distant-tree-loop',
            sourceLoop: rectangleLoop(35, 35.2, 35, 35.2),
            onsetLoop: rectangleLoop(34.9, 35.3, 34.9, 35.3),
            substrateRevealMeters: 0.1
        }]
    });
    const layout = createGrassCohesiveFieldLayout({
        cameraX: 0.25,
        cameraZ: 0.25,
        terrainBounds: coverageDefinition.bounds,
        coverageDefinition,
        coverageConfig: { rootClearanceMeters: 0.003 }
    });
    const billboardTriangles = layout.tiers.billboard.diagnostics.representedUnits * 2;
    const middleTriangles = layout.tiers.middle.diagnostics.representedUnits * 4;
    assert.equal(layout.diagnostics.unrepresentedEligibleUnits, 0);
    assert.equal(layout.diagnostics.exactPostcheckFailures, 0);
    assert.equal(layout.diagnostics.exactEnvelopeFailures, 0);
    assert.ok(95_219 + Math.max(billboardTriangles, middleTriangles) <= 200_000, JSON.stringify({
        boundaryTriangles: 95_219,
        billboardTriangles,
        middleTriangles
    }));
});
