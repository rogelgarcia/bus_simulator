// src/app/city/placement/types.js
// Vocabulary of the city construction placement model (constructions, parcel
// sides, limit kinds, diagnostics).
//
// Sides follow the map grid convention used by CityMap.DIR: north is +z
// (tile y + 1), east is +x, south is -z, west is -x.
// @ts-check

export const CONSTRUCTION_KIND = Object.freeze({
    BUILDING: 'building',
    RESERVATION: 'reservation'
});

export const PARCEL_SIDE = Object.freeze({
    NORTH: 'north',
    EAST: 'east',
    SOUTH: 'south',
    WEST: 'west'
});

export const PARCEL_SIDES = Object.freeze([
    PARCEL_SIDE.NORTH,
    PARCEL_SIDE.EAST,
    PARCEL_SIDE.SOUTH,
    PARCEL_SIDE.WEST
]);

// How far a construction may extend on one side of its assigned squares.
export const PARCEL_LIMIT = Object.freeze({
    SQUARE: 'square',
    STREET: 'street',
    CONSTRUCTION: 'construction',
    DISTANCE: 'distance'
});

export const PARCEL_ALIGN = Object.freeze({
    CENTER: 'center',
    MIN: 'min',
    MAX: 'max'
});

export const RESERVATION_TYPE = Object.freeze({
    BUS_START: 'bus_start',
    AREA: 'area'
});

export const RESERVATION_GROUND = Object.freeze({
    NONE: 'none',
    SLAB: 'slab'
});

export const PLACEMENT_DIAGNOSTIC = Object.freeze({
    SQUARE_CONFLICT: 'square_conflict',
    NO_STREET_LIMIT: 'no_street_limit',
    UNKNOWN_CONSTRUCTION: 'unknown_construction',
    LIMIT_CYCLE: 'limit_cycle',
    PARCEL_EMPTY: 'parcel_empty',
    DESIGN_OVERFLOW: 'design_overflow',
    RESERVATION_BLOCKED: 'reservation_blocked',
    INVALID_PLACEMENT: 'invalid_placement'
});

export const PLACEMENT_DEFAULTS = Object.freeze({
    padding: 0.0,
    align: PARCEL_ALIGN.CENTER,
    streetSearchMeters: 48.0,
    streetSampleCount: 9
});

/**
 * @typedef {{ minX:number, maxX:number, minZ:number, maxZ:number }} RectXZ
 * @typedef {{ x:number, z:number }} PointXZ
 * @typedef {{ type:string, meters?:number, id?:string, padding?:number }} ParcelLimit
 * @typedef {{ limits:Record<string,ParcelLimit>, padding:number, front:(string|null), align:string }} PlacementSpec
 * @typedef {{ level:string, code:string, id:(string|null), message:string }} PlacementDiagnostic
 */

export function isParcelSide(value) {
    return PARCEL_SIDES.includes(value);
}
