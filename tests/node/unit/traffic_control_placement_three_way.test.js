// Node unit tests: 3-way intersections can use traffic lights when lane criteria is met.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCityConfig } from '../../../src/app/city/CityConfig.js';
import { CityMap } from '../../../src/app/city/CityMap.js';
import { createGeneratorConfig } from '../../../src/graphics/assets3d/generators/GeneratorParams.js';
import { computeTrafficControlPlacements, TRAFFIC_CONTROL } from '../../../src/app/city/TrafficControlPlacement.js';

test('TrafficControlPlacement: 3-way intersections with 2+ lanes each direction use traffic lights', () => {
    const cfg = createCityConfig({ size: 120, mapTileSize: 24, seed: 'traffic-3way-light' });
    const w = cfg.map.width;
    const h = cfg.map.height;
    const spec = {
        version: 1,
        seed: cfg.seed,
        width: w,
        height: h,
        tileSize: cfg.map.tileSize,
        origin: cfg.map.origin,
        roads: [
            { a: [0, 2], b: [w - 1, 2], lanesF: 3, lanesB: 3, tag: 'main' },
            { a: [2, 2], b: [2, h - 1], lanesF: 2, lanesB: 2, tag: 'stem' }
        ],
        buildings: []
    };

    const map = CityMap.fromSpec(spec, cfg);
    const gen = createGeneratorConfig();
    const placements = computeTrafficControlPlacements({ map, generatorConfig: gen, laneThreshold: 2 });
    const local = placements.filter((p) => p?.nodeId === 't:2,2');

    assert.equal(local.length, 3, 'Expected 3 traffic light placements at the T-junction.');
    assert.ok(local.every((p) => p.kind === TRAFFIC_CONTROL.TRAFFIC_LIGHT), 'Expected all placements to be traffic lights.');
});

test('TrafficControlPlacement: smaller 3-way intersections keep stop signs', () => {
    const cfg = createCityConfig({ size: 120, mapTileSize: 24, seed: 'traffic-3way-stop' });
    const w = cfg.map.width;
    const h = cfg.map.height;
    const spec = {
        version: 1,
        seed: cfg.seed,
        width: w,
        height: h,
        tileSize: cfg.map.tileSize,
        origin: cfg.map.origin,
        roads: [
            { a: [0, 2], b: [w - 1, 2], lanesF: 1, lanesB: 1, tag: 'main' },
            { a: [2, 2], b: [2, h - 1], lanesF: 1, lanesB: 1, tag: 'stem' }
        ],
        buildings: []
    };

    const map = CityMap.fromSpec(spec, cfg);
    const gen = createGeneratorConfig();
    const placements = computeTrafficControlPlacements({ map, generatorConfig: gen, laneThreshold: 2 });
    const local = placements.filter((p) => p?.nodeId === 't:2,2');

    assert.equal(local.length, 3, 'Expected 3 stop sign placements at the T-junction.');
    assert.ok(local.every((p) => p.kind === TRAFFIC_CONTROL.STOP_SIGN), 'Expected all placements to be stop signs.');
});
