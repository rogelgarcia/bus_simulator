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
