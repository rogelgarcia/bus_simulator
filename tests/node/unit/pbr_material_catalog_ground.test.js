// Node unit tests: PBR material catalog ground flags and map metadata.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPbrMaterialMeta, getPbrMaterialOptionsForGround } from '../../../src/graphics/content3d/catalogs/PbrMaterialCatalog.js';

test('PbrMaterialCatalog: ground options include ground materials', () => {
    const opts = getPbrMaterialOptionsForGround();
    const ids = new Set(opts.map((o) => o.id));

    assert.ok(ids.has('pbr.grass_001'));
    assert.ok(ids.has('pbr.grass_004'));
    assert.ok(ids.has('pbr.grass_005'));
    assert.ok(ids.has('pbr.ground_037'));
    assert.ok(ids.has('pbr.coast_sand_rocks_02'));
    assert.ok(ids.has('pbr.forrest_ground_01'));
    assert.ok(ids.has('pbr.gravelly_sand'));
    assert.ok(ids.has('pbr.rocky_terrain_02'));

    for (const opt of opts) assert.equal(!!opt.groundEligible, true);
});

test('PbrMaterialCatalog: grass materials expose AO/roughness map metadata', () => {
    const meta = getPbrMaterialMeta('pbr.grass_004');
    assert.ok(meta);
    assert.equal(meta.groundEligible, true);

    const maps = new Set(meta.maps ?? []);
    assert.ok(maps.has('baseColor'));
    assert.ok(maps.has('normal'));
    assert.ok(maps.has('ao'));
    assert.ok(maps.has('roughness'));
    assert.ok(maps.has('displacement'));
    assert.equal(maps.has('orm'), false);
});
