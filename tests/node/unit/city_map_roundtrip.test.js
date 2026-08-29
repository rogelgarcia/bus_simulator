// Node unit tests: CityMap fromSpec/toSpec stability.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCityConfig } from '../../../src/app/city/CityConfig.js';
import { CityMap } from '../../../src/app/city/CityMap.js';
import { createDemoCitySpec } from '../../../src/app/city/specs/DemoCitySpec.js';

test('CityMap: fromSpec then toSpec preserves core fields', () => {
    const config = createCityConfig({ size: 200, mapTileSize: 24, seed: 'demo' });
    const spec = createDemoCitySpec(config);
    const map = CityMap.fromSpec(spec, config);
    const round = map.exportSpec({ seed: spec.seed, version: 1 });
    const map2 = CityMap.fromSpec(round, config);

    assert.equal(round.version, 1);
    assert.equal(round.seed, 'demo');
    assert.equal(round.width, spec.width);
    assert.equal(round.height, spec.height);
    assert.equal(round.tileSize, spec.tileSize);
    assert.deepEqual(round.origin, spec.origin);
    assert.ok(Array.isArray(round.roads) && round.roads.length > 0);
    assert.equal(map2.countRoadTiles(), map.countRoadTiles());
    assert.equal(map2.roadNetwork?.edgeIds?.length ?? 0, map.roadNetwork?.edgeIds?.length ?? 0);
});

test('CityMap: entries preserve lot-fit flags, stable run ids, and curve metadata', () => {
    const config = createCityConfig({ size: 200, mapTileSize: 24, seed: 'ai-515-roundtrip' });
    const spec = {
        version: 1,
        seed: 'ai-515-roundtrip',
        width: config.map.width,
        height: config.map.height,
        tileSize: config.map.tileSize,
        origin: config.map.origin,
        roads: [],
        buildings: [{
            id: 'lot_fit_building',
            tiles: [[2, 2]],
            layers: [{ id: 'floor_1', type: 'floor', floors: 1, floorHeight: 3 }],
            footprintLoops: [[
                { x: -5, z: 3, runId: 'A', runForward: true },
                { x: 5, z: 3, runId: 'B', runForward: true, arc: { bulge: Math.SQRT2 - 1, segments: 18 } },
                { x: 5, z: -3, runId: 'C', runForward: true, split: true },
                { x: -5, z: -3, runId: 'D', runForward: true }
            ]],
            fitToLot: true,
            footprintStretch: { faces: { A: 'prefer_expand', C: 'never' }, quantumMeters: 0.25 }
        }]
    };
    const map = CityMap.fromSpec(spec, config);
    const entry = map.buildings[0];
    assert.equal(entry.fitToLot, true);
    assert.deepEqual(entry.footprintStretch, spec.buildings[0].footprintStretch);
    assert.deepEqual(entry.footprintLoops[0].map((point) => point.runId), ['A', 'B', 'C', 'D']);
    assert.deepEqual(entry.footprintLoops[0][1].arc, { bulge: Math.SQRT2 - 1, segments: 18 });
    assert.equal(entry.footprintLoops[0][2].split, true);

    const exported = map.exportSpec({ seed: spec.seed, version: 1 });
    assert.equal(exported.buildings[0].fitToLot, true);
    assert.deepEqual(exported.buildings[0].footprintStretch, spec.buildings[0].footprintStretch);
    assert.deepEqual(exported.buildings[0].footprintLoops[0].map((point) => point.runId), ['A', 'B', 'C', 'D']);
    assert.deepEqual(exported.buildings[0].footprintLoops[0][1].arc, { bulge: Math.SQRT2 - 1, segments: 18 });
    assert.equal(exported.buildings[0].footprintLoops[0][2].split, true);
});
