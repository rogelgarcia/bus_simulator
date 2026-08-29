// Node unit tests: deterministic lot fitting through valid building stretch bands.
import test from 'node:test';
import assert from 'node:assert/strict';

import { fitBuildingFootprintToLot } from '../../../src/app/buildings/footprint_fitting/BuildingFootprintLotFitter.js';

const rectangle = () => [
    { x: -5, z: 3 },
    { x: 5, z: 3 },
    { x: 5, z: -3 },
    { x: -5, z: -3 }
];

function lot(minX, maxX, minZ = -3, maxZ = 3) {
    return [[
        { x: minX, z: maxZ },
        { x: maxX, z: maxZ },
        { x: maxX, z: minZ },
        { x: minX, z: minZ }
    ]];
}

function bounds(plan) {
    const xs = plan.points.map((point) => point.x);
    const zs = plan.points.map((point) => point.z);
    return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minZ: Math.min(...zs),
        maxZ: Math.max(...zs)
    };
}

test('BuildingFootprintLotFitter: distributes growth proportionally across opposite stretch sides', () => {
    const result = fitBuildingFootprintToLot({
        footprint: rectangle(),
        buildAreaLoops: lot(-7, 7),
        seed: 515,
        quantumMeters: 0.1
    });
    assert.deepEqual(bounds(result.footprint), { minX: -7, maxX: 7, minZ: -3, maxZ: 3 });
    assert.equal(result.exact, true);
    const xMoves = result.applications.filter((entry) => entry.axis === 'x');
    assert.equal(xMoves.length, 2);
    assert.deepEqual(xMoves.map((entry) => entry.appliedDelta).sort((a, b) => a - b), [2, 2]);
});

test('BuildingFootprintLotFitter: never preference pins one side while the preferred side grows', () => {
    const result = fitBuildingFootprintToLot({
        footprint: rectangle(),
        buildAreaLoops: lot(-7, 7),
        seed: 515,
        stretchMetadata: {
            bands: {
                'A:start': 'never',
                'C:end': 'never',
                'A:end': 'prefer_expand',
                'C:start': 'prefer_expand'
            }
        }
    });
    const fitted = bounds(result.footprint);
    assert.equal(fitted.minX, -5);
    assert.equal(fitted.maxX, 7);
    assert.equal(result.exact, false);
    assert.ok(result.warnings.some((warning) => warning.includes('pinned')));
});

test('BuildingFootprintLotFitter: solver minima clamp shrinking bands', () => {
    const result = fitBuildingFootprintToLot({
        footprint: rectangle(),
        buildAreaLoops: lot(-2, 2),
        seed: 515,
        minLengthByRunId: { A: 6, C: 6 },
        quantumMeters: 0.1
    });
    const fitted = bounds(result.footprint);
    assert.ok(Math.abs((fitted.maxX - fitted.minX) - 6) < 1e-6);
    assert.equal(result.exact, false);
    assert.ok(result.warnings.some((warning) => warning.includes('solver-valid')));
});

test('BuildingFootprintLotFitter: dry-run rejection returns the nearest solvable quantized size', () => {
    const result = fitBuildingFootprintToLot({
        footprint: rectangle(),
        buildAreaLoops: lot(-2, 2),
        seed: 515,
        quantumMeters: 0.5,
        isFootprintSolvable: (plan) => {
            const fitted = bounds(plan);
            return fitted.maxX - fitted.minX >= 7;
        }
    });
    const fitted = bounds(result.footprint);
    assert.ok(Math.abs((fitted.maxX - fitted.minX) - 7) < 1e-6);
    assert.equal(result.exact, false);
    assert.ok(result.warnings.length > 0);
});

test('BuildingFootprintLotFitter: same lot, seed, and metadata are deterministic', () => {
    const input = {
        footprint: rectangle(),
        buildAreaLoops: lot(-7.03, 7.03),
        seed: 'ai-515-determinism',
        quantumMeters: 0.1
    };
    const first = fitBuildingFootprintToLot(input);
    const second = fitBuildingFootprintToLot(input);
    assert.deepEqual(first, second);
    assert.deepEqual(first.footprint.runIds, ['A', 'B', 'C', 'D']);
});
