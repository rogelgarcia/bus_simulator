// Unit tests of the AI 597 D2 coast classes: the rock flag and the shore exposure rasterized from synthetic geology pages at the ocean field's texel centres.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LANDSCAPE_OCEAN_COAST, landscapeOceanCoastBeachMask, landscapeOceanCoastZoneBreaking, neutralLandscapeOceanCoast, rasterizeLandscapeOceanCoast } from '../../../src/graphics/engine3d/landscape/ocean/LandscapeOceanCoast.js';
import { landscapeOceanFieldLayout } from '../../../src/graphics/engine3d/landscape/ocean/LandscapeOceanField.js';
import { LANDSCAPE_GEOLOGY_CATEGORIES, LANDSCAPE_GEOLOGY_CHANNELS, landscapeGeologyLayout } from '../../../src/app/landscape/LandscapeGeology.js';

const ZONES = LANDSCAPE_GEOLOGY_CATEGORIES.find(category => category.name === 'coastalZone').labels;
const zone = name => ZONES.indexOf(name);
const EXPOSURE = LANDSCAPE_GEOLOGY_CHANNELS.find(channel => channel.name === 'waveExposure');

/** One level-2 page of 5 x 5 samples over a 40 m chunk: zones by sample column, the exposure byte per sample, row 0 north. */
function fixture() {
    const layout = landscapeGeologyLayout(5), samples = 5;
    const manifest = { id: 'coast', bounds: { minX: 0, maxX: 40, minZ: 0, maxZ: 40 }, grid: { spacingX: 1, spacingZ: 1, chunkIntervals: 4 }, coordinates: { seaLevel: 0 },
        chunks: [{ id: 'l2/c0/r0', level: 2, column: 0, row: 0, bounds: { minX: 0, maxX: 40, minZ: 0, maxZ: 40 } }] };
    const columns = ['offshore', 'offshore', 'surf', 'platform', 'bluff-toe'].map(zone);
    const categorical = new Uint8Array(layout.categorical.byteLength), fields = new Uint8Array(layout.pageBytes);
    const zoneLayer = LANDSCAPE_GEOLOGY_CATEGORIES.findIndex(category => category.name === 'coastalZone') * layout.categorical.layerBytes;
    const component = 'rgba'.indexOf(EXPOSURE.component);
    for (let rowNorth = 0; rowNorth < samples; rowNorth++) for (let column = 0; column < samples; column++) {
        categorical[zoneLayer + rowNorth * samples + column] = rowNorth === 0 && column === 0 ? zone('reef') : columns[column];
        fields[EXPOSURE.layer * layout.layerBytes + ((rowNorth + layout.halo) * layout.width + column + layout.halo) * 4 + component] = column === 2 ? 128 : 230;
    }
    return { manifest, geology: { layout, pages: [{ id: 'l2/c0/r0', level: 2 }] }, pages: new Map([['l2/c0/r0', { fields, categorical }]]) };
}

test('Ocean coast: rock and exposure follow the geology zones at the texel centres, north-first pages, undefined exposure off its zones', () => {
    const { manifest, geology, pages } = fixture(), layout = landscapeOceanFieldLayout(manifest, 2, 8);
    const coast = rasterizeLandscapeOceanCoast(layout, geology, pages, manifest);
    const at = (column, row) => row * 8 + column;
    // texel centres at 2.5, 7.5, ... map to the nearest samples 0, 1, 1, 2, 2, 3, 3, 4 (sample 2 surf, 3 platform, 4 bluff toe)
    for (let row = 0; row < 8; row++) {
        assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(column => coast.rock[at(column, row)]), [0, 0, 0, 0, 0, 1, 1, 1], `rock row ${row}`);
        assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(column => coast.exposure[at(column, row)] < 0 ? -1 : Math.round(coast.exposure[at(column, row)] * 255)), [-1, -1, -1, 128, 128, -1, -1, -1], `exposure row ${row}`);
    }
    // the page's north row (sample row 0) lands on the raster's top row (max z): the reef sample covers the westmost texel there only
    assert.equal(coast.zone[at(0, 7)], zone('reef')); assert.equal(coast.zone[at(1, 7)], zone('offshore')); assert.equal(coast.zone[at(0, 6)], zone('offshore'));
    assert.equal(coast.statistics.rockTexels, 24); assert.equal(coast.statistics.exposureTexels, 16);
    assert.equal(coast.statistics.zones.reef, 1); assert.equal(coast.statistics.zones.offshore, 23); assert.equal(coast.statistics.zones.surf, 16); assert.equal(coast.statistics.zones.platform, 16); assert.equal(coast.statistics.zones['bluff-toe'], 8);
    assert.ok(Math.abs(coast.statistics.exposure.mean - 128 / 255) < 1e-9 && coast.statistics.exposure.min === coast.statistics.exposure.max);
    assert.equal(LANDSCAPE_OCEAN_COAST.undefinedExposure, -1);
    // the model's zone names must exist in the geology; a page of the wrong size or a missing page is refused
    assert.throws(() => rasterizeLandscapeOceanCoast(layout, geology, pages, manifest, { rockZones: ['cliff'] }), /not a coastal zone/);
    assert.throws(() => rasterizeLandscapeOceanCoast(layout, geology, new Map(), manifest), /missing from the loaded set/);
    assert.throws(() => rasterizeLandscapeOceanCoast(layout, geology, new Map([['l2/c0/r0', { fields: new Uint8Array(3), categorical: pages.get('l2/c0/r0').categorical }]]), manifest), /does not match its layout/);
    // breaking per zone: counts and shares for the zones present, the mask and the labels must match
    const breaking = new Uint8Array(64); for (let row = 0; row < 8; row++) { breaking[at(3, row)] = 1; breaking[at(5, row)] = row < 4 ? 1 : 0; }
    const perZone = landscapeOceanCoastZoneBreaking(breaking, coast.zone);
    assert.deepEqual(perZone.surf, { texels: 16, breaking: 8, share: .5 }); assert.deepEqual(perZone.platform, { texels: 16, breaking: 4, share: .25 }); assert.deepEqual(perZone.reef, { texels: 1, breaking: 0, share: 0 });
    assert.equal(perZone.inland, undefined);
    assert.throws(() => landscapeOceanCoastZoneBreaking(new Uint8Array(3), coast.zone), /same length/);
    // the beach mask: the surf and swash zones only (the reef, the platform and the open sea are not the gate's beach)
    const beach = landscapeOceanCoastBeachMask(coast.zone);
    assert.equal(beach.reduce((sum, value) => sum + value, 0), 16);
    for (let row = 0; row < 8; row++) assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(column => beach[at(column, row)]), [0, 0, 0, 1, 1, 0, 0, 0]);
    assert.throws(() => landscapeOceanCoastBeachMask(coast.zone, ['lagoon']), /not a coastal zone/);
    // the neutral coast: no rock, full exposure, no statistics
    const neutral = neutralLandscapeOceanCoast(4);
    assert.equal(neutral.rock.length, 16); assert.ok(neutral.exposure.every(value => value === 1)); assert.deepEqual(neutral.statistics, { rockTexels: 0, exposureTexels: 0, exposure: null, zones: {} });
});
