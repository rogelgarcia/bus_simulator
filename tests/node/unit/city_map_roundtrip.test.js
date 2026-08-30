// Node unit tests: CityMap fromSpec/toSpec stability.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCityConfig } from '../../../src/app/city/CityConfig.js';
import { CityMap } from '../../../src/app/city/CityMap.js';
import { getBuildingConfigById } from '../../../src/app/city/buildings/index.js';
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
            layers: [{
                id: 'floor_1',
                type: 'floor',
                floors: 1,
                floorHeight: 3,
                silhouette: {
                    version: 1,
                    mode: 'detached',
                    loop: [
                        { x: -4, z: 2, cornerId: 'corner_1', runId: 'A', runForward: true },
                        { x: 4, z: 2, cornerId: 'corner_2', runId: 'B', runForward: true, arc: { bulge: -0.25 } },
                        { x: 0, z: -4, cornerId: 'corner_3', runId: 'C', runForward: true, split: true }
                    ],
                    idState: { nextCornerSerial: 4, retiredCornerIds: [], retiredRunIds: ['D'] },
                    preferredSize: { widthMeters: 11, depthMeters: 8 },
                    stretchBands: [{ id: 'A:end', runId: 'A', end: 'end', preference: 'allow' }],
                    stretchProvenance: { version: 1, sourceRunIds: ['A', 'B', 'C'] },
                    targetRemap: {
                        version: 1,
                        decisions: { 'attachment:D': { action: 'orphan' } },
                        resolved: [{ targetId: 'attachment:D', decision: 'orphan' }],
                        unresolved: []
                    }
                }
            }],
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
    assert.deepEqual(entry.layers[0].silhouette, spec.buildings[0].layers[0].silhouette);

    const exported = map.exportSpec({ seed: spec.seed, version: 1 });
    assert.equal(exported.buildings[0].fitToLot, true);
    assert.deepEqual(exported.buildings[0].footprintStretch, spec.buildings[0].footprintStretch);
    assert.deepEqual(exported.buildings[0].footprintLoops[0].map((point) => point.runId), ['A', 'B', 'C', 'D']);
    assert.deepEqual(exported.buildings[0].footprintLoops[0][1].arc, { bulge: Math.SQRT2 - 1, segments: 18 });
    assert.equal(exported.buildings[0].footprintLoops[0][2].split, true);
    assert.deepEqual(exported.buildings[0].layers[0].silhouette, spec.buildings[0].layers[0].silhouette);
});

test('CityMap: catalog-backed entries export changed layer silhouettes without bloating unchanged instances', () => {
    const config = createCityConfig({ size: 200, mapTileSize: 24, seed: 'ai-520-config-roundtrip' });
    const catalog = getBuildingConfigById('burban');
    assert.ok(catalog);
    const layers = structuredClone(catalog.layers);
    layers[0].silhouette = {
        version: 1,
        mode: 'detached',
        loop: [
            { x: -5, z: 3, cornerId: 'corner_1', runId: 'A', runForward: true },
            { x: 5, z: 3, cornerId: 'corner_2', runId: 'B', runForward: true, arc: { bulge: -0.2 } },
            { x: 5, z: -3, cornerId: 'corner_3', runId: 'C', runForward: true },
            { x: -5, z: -3, cornerId: 'corner_4', runId: 'D', runForward: true }
        ],
        idState: { nextCornerSerial: 5, retiredCornerIds: [], retiredRunIds: [] },
        targetRemap: {
            version: 1,
            decisions: { 'facade:floor_burban_ground:B': { action: 'remap', runId: 'A' } },
            resolved: [],
            unresolved: []
        }
    };
    const footprintLoops = [[
        { x: -5, z: 3 },
        { x: 5, z: 3 },
        { x: 5, z: -3 },
        { x: -5, z: -3 }
    ]];
    const spec = {
        version: 1,
        seed: 'ai-520-config-roundtrip',
        width: config.map.width,
        height: config.map.height,
        tileSize: config.map.tileSize,
        origin: config.map.origin,
        roads: [],
        buildings: [
            { id: 'changed_catalog', configId: 'burban', tiles: [[2, 2]], footprintLoops, layers },
            { id: 'unchanged_catalog', configId: 'burban', tiles: [[4, 4]], footprintLoops }
        ]
    };

    const map = CityMap.fromSpec(spec, config);
    const exported = map.exportSpec({ seed: spec.seed, version: 1 });
    const changed = exported.buildings.find((entry) => entry.id === 'changed_catalog');
    const unchanged = exported.buildings.find((entry) => entry.id === 'unchanged_catalog');
    assert.deepEqual(changed.layers[0].silhouette, layers[0].silhouette);
    assert.equal(Object.hasOwn(unchanged, 'layers'), false);

    const roundTripped = CityMap.fromSpec(exported, config);
    const roundEntry = roundTripped.buildings.find((entry) => entry.id === 'changed_catalog');
    assert.deepEqual(roundEntry.layers[0].silhouette, layers[0].silhouette);
    const exportedAgain = roundTripped.exportSpec({ seed: spec.seed, version: 1 });
    assert.deepEqual(
        exportedAgain.buildings.find((entry) => entry.id === 'changed_catalog').layers[0].silhouette,
        layers[0].silhouette
    );
});
