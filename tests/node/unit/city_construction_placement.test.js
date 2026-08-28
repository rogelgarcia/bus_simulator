// Node unit tests: city construction placement (squares + limits + reservations).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCityConfig } from '../../../src/app/city/CityConfig.js';
import { CityMap } from '../../../src/app/city/CityMap.js';
import { BIG_CITY_2_SPEC } from '../../../src/app/city/specs/BigCity2Spec.js';
import { PLACEMENT_DIAGNOSTIC, RESERVATION_TYPE, findReservationByType } from '../../../src/app/city/placement/index.js';

const ROAD_GEOMETRY = { laneWidth: 4.8, shoulder: 0.525, curbThickness: 0.48, sidewalkWidth: 1.875 };

// Avenue centreline z = 48, 3 lanes each way: the kerb line is
// 48 - (3 * 4.8 + 0.525 + 0.48 + 1.875).
const AVENUE_STREET_LINE_Z = 48 - (3 * ROAD_GEOMETRY.laneWidth + ROAD_GEOMETRY.shoulder + ROAD_GEOMETRY.curbThickness + ROAD_GEOMETRY.sidewalkWidth);

function boundsOf(loops) {
    const pts = (loops ?? []).flat();
    return {
        minX: Math.min(...pts.map((p) => p.x)),
        maxX: Math.max(...pts.map((p) => p.x)),
        minZ: Math.min(...pts.map((p) => p.z)),
        maxZ: Math.max(...pts.map((p) => p.z))
    };
}

function buildBigCity2() {
    const config = createCityConfig({ size: 600, mapTileSize: 24, seed: 'x' });
    return CityMap.fromSpec(BIG_CITY_2_SPEC, config, { roadGeometry: ROAD_GEOMETRY });
}

function makeMinimalMap({ buildings = [], reservations = [] } = {}) {
    const config = createCityConfig({ size: 600, mapTileSize: 24, seed: 't' });
    return CityMap.fromSpec({
        version: 1,
        seed: 't',
        width: 25,
        height: 25,
        tileSize: 24,
        origin: { x: -288, z: -288 },
        roads: [{ points: [{ x: -240, z: 48 }, { x: 216, z: 48 }], lanesF: 3, lanesB: 3, tag: 'road', rendered: true }],
        buildings,
        reservations
    }, config, { roadGeometry: ROAD_GEOMETRY });
}

test('Placement: a street limit reaches the kerb line, not the tile boundary', () => {
    const map = makeMinimalMap({
        buildings: [{
            id: 'b1',
            squares: [[11, 12], [12, 12], [11, 13], [12, 13]],
            placement: { limits: { north: 'street' }, front: 'north' }
        }]
    });

    const parcel = map.buildings[0].parcel;
    assert.ok(parcel, 'placement-driven entry gets a parcel');
    // The square bounds stop at z = 36, which is INSIDE the avenue.
    assert.equal(parcel.limits.north.type, 'street');
    assert.ok(Math.abs(parcel.rect.maxZ - AVENUE_STREET_LINE_Z) < 1e-6, `expected ${AVENUE_STREET_LINE_Z}, got ${parcel.rect.maxZ}`);
    assert.ok(parcel.rect.maxZ < 36, 'the parcel is pulled back off the carriageway');
});

test('Placement: a design is seated at its authored size against the front limit', () => {
    const design = [[
        { x: -10, z: -6 }, { x: 10, z: -6 }, { x: 10, z: 6 }, { x: -10, z: 6 }
    ]];
    const map = makeMinimalMap({
        buildings: [{
            id: 'b1',
            squares: [[11, 12], [12, 12], [11, 13], [12, 13]],
            designLoops: design,
            layers: [{ type: 'floor', floors: 2, floorHeight: 3 }],
            placement: { limits: { north: 'street' }, front: 'north', align: 'center' }
        }]
    });

    const entry = map.buildings[0];
    const b = boundsOf(entry.footprintLoops);
    assert.equal(entry.footprintPlacement, 'anchor', 'a solved placement is anchored, never re-fitted');
    assert.ok(Math.abs((b.maxX - b.minX) - 20) < 1e-6, 'authored width kept');
    assert.ok(Math.abs((b.maxZ - b.minZ) - 12) < 1e-6, 'authored depth kept');
    assert.ok(Math.abs(b.maxZ - AVENUE_STREET_LINE_Z) < 1e-6, 'front flush with the street line');
    assert.ok(Math.abs((b.minX + b.maxX) * 0.5 - (-12)) < 1e-6, 'centred across the parcel');
});

test('Placement: undeclared square sharing is reported, declared sharing is not', () => {
    const undeclared = makeMinimalMap({
        buildings: [
            { id: 'b1', configId: null, squares: [[11, 12]], layers: [{ type: 'floor', floors: 1 }] },
            { id: 'b2', configId: null, squares: [[11, 12]], layers: [{ type: 'floor', floors: 1 }] }
        ]
    });
    const conflicts = undeclared.placementDiagnostics.filter((d) => d.code === PLACEMENT_DIAGNOSTIC.SQUARE_CONFLICT);
    assert.equal(conflicts.length, 1, 'the overlapping claim is reported once');

    const declared = makeMinimalMap({
        buildings: [
            { id: 'b1', squares: [[11, 12]], sharesSquaresWith: ['b2'], layers: [{ type: 'floor', floors: 1 }] },
            { id: 'b2', squares: [[11, 12]], layers: [{ type: 'floor', floors: 1 }] }
        ]
    });
    assert.equal(
        declared.placementDiagnostics.filter((d) => d.code === PLACEMENT_DIAGNOSTIC.SQUARE_CONFLICT).length,
        0,
        'a deliberate share is silent'
    );
});

test('Placement: a reservation cuts the parcel it overlaps', () => {
    const map = makeMinimalMap({
        buildings: [{
            id: 'b1',
            squares: [[11, 12], [12, 12], [11, 13], [12, 13]],
            designLoops: [[{ x: -10, z: -6 }, { x: 10, z: -6 }, { x: 10, z: 6 }, { x: -10, z: 6 }]],
            layers: [{ type: 'floor', floors: 2, floorHeight: 3 }],
            sharesSquaresWith: ['blocker'],
            placement: { limits: { north: 'street' }, front: 'north', padding: 1 }
        }],
        reservations: [{
            id: 'blocker',
            type: 'area',
            position: { x: -30, z: 10 },
            size: { width: 12, depth: 12 },
            sharesSquaresWith: ['b1']
        }]
    });

    const parcel = map.buildings[0].parcel;
    // Reservation spans x -36..-24 with 1 m padding: the parcel starts east of it.
    assert.ok(Math.abs(parcel.rect.minX - (-23)) < 1e-6, `expected -23, got ${parcel.rect.minX}`);
    assert.ok(Math.abs(parcel.rect.maxZ - AVENUE_STREET_LINE_Z) < 1e-6, 'the street frontage is not the side that gets cut');
    const b = boundsOf(map.buildings[0].footprintLoops);
    assert.ok(b.minX >= -23 - 1e-6, 'the design sits clear of the reservation');
});

test('Placement: a design larger than its parcel is reported, never scaled', () => {
    const map = makeMinimalMap({
        buildings: [{
            id: 'b1',
            squares: [[11, 12]],
            designLoops: [[{ x: -40, z: -6 }, { x: 40, z: -6 }, { x: 40, z: 6 }, { x: -40, z: 6 }]],
            layers: [{ type: 'floor', floors: 2, floorHeight: 3 }],
            placement: { limits: {}, front: 'north' }
        }]
    });

    const b = boundsOf(map.buildings[0].footprintLoops);
    assert.ok(Math.abs((b.maxX - b.minX) - 80) < 1e-6, 'the authored size survives');
    assert.equal(
        map.placementDiagnostics.filter((d) => d.code === PLACEMENT_DIAGNOSTIC.DESIGN_OVERFLOW).length,
        1,
        'the overflow is reported'
    );
});

test('Big City 2: the bank fills its parcel to the avenue and clears the bus start', () => {
    const map = buildBigCity2();

    assert.deepEqual(map.placementDiagnostics, [], 'the shipped spec resolves without placement diagnostics');

    const busStart = findReservationByType(map.reservations, RESERVATION_TYPE.BUS_START);
    assert.ok(busStart, 'the bus starting position is a city construction');
    assert.equal(busStart.ground, 'slab');
    assert.ok(Math.abs(busStart.rect.maxZ - AVENUE_STREET_LINE_Z) < 1e-6, 'the bus apron meets the avenue sidewalk');

    const bank = map.buildings.find((b) => b.id === 'building_9_b');
    const bradbury = map.buildings.find((b) => b.id === 'building_9');
    assert.ok(bank?.parcel, 'the bank is placed from squares + limits');

    const bankBounds = boundsOf(bank.footprintLoops);
    const bradburyBounds = boundsOf(bradbury.footprintLoops);

    assert.ok(Math.abs(bankBounds.maxZ - AVENUE_STREET_LINE_Z) < 1e-6, 'the bank front sits on the avenue street line');
    assert.ok(Math.abs((bankBounds.maxX - bankBounds.minX) - 34.15) < 1e-3, 'the bank keeps its authored width');
    assert.ok(Math.abs((bankBounds.maxZ - bankBounds.minZ) - 30.4) < 1e-3, 'the bank keeps its authored depth');
    assert.ok(bankBounds.minX - bradburyBounds.maxX >= 8, 'the declared 8 m padding to the Bradbury is honoured');
    assert.ok(bankBounds.minX >= busStart.rect.maxX, 'the bank is laid out clear of the bus starting position');
});

test('Big City 2: a parcel placement round-trips through exportSpec as squares + limits', () => {
    const map = buildBigCity2();
    const exported = map.exportSpec({ seed: 'x', version: 1 });

    const bank = exported.buildings.find((b) => b.id === 'building_9_b');
    assert.ok(bank.placement, 'the placement block is exported');
    assert.equal(bank.placement.limits.north, 'street', 'authored shorthand survives the round trip');
    assert.equal(bank.placement.limits.west.id, 'building_9');
    assert.equal(bank.footprintLoops, undefined, 'solved world loops never leak back into the spec');
    assert.ok(Array.isArray(exported.reservations) && exported.reservations.length === 1, 'reservations are exported');

    const config = createCityConfig({ size: 600, mapTileSize: 24, seed: 'x' });
    const round = CityMap.fromSpec(exported, config, { roadGeometry: ROAD_GEOMETRY });
    const before = boundsOf(map.buildings.find((b) => b.id === 'building_9_b').footprintLoops);
    const after = boundsOf(round.buildings.find((b) => b.id === 'building_9_b').footprintLoops);
    assert.deepEqual(after, before, 're-planning the exported spec reproduces the same placement');
});
