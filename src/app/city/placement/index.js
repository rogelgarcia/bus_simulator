// src/app/city/placement/index.js
// Public API of the city construction placement model.
// @ts-check

export {
    CONSTRUCTION_KIND,
    PARCEL_ALIGN,
    PARCEL_LIMIT,
    PARCEL_SIDE,
    PARCEL_SIDES,
    PLACEMENT_DEFAULTS,
    PLACEMENT_DIAGNOSTIC,
    RESERVATION_GROUND,
    RESERVATION_TYPE,
    isParcelSide
} from './types.js';

export { planCityConstructions, findReservationByType } from './CityConstructionPlanner.js';
export { CITY_ROAD_GEOMETRY_DEFAULTS, normalizeRoadGeometry } from './internal/StreetLines.js';
