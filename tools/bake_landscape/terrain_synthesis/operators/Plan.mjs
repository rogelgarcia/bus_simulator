// Parses the retained v2 plan files (districts, roads, shoreline, beach points) into validated world-meter geometry for the synthesis operators.
// @ts-check
// The plan JSON keeps the generator's conventions (X east, Y elevation, Z north, metres); this module checks them once and hands the
// operators plain arrays: district polygons with targets, road centerlines with per-vertex design heights and widths, the shoreline
// polyline and the beach reservations with the open-view corridor. A plan may hold no districts and no roads (the far-field surround of
// AI 596 D5 carries only its far shoreline); the shoreline is always required.

const requireFinite = (value, label) => { if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`[Synthesis] ${label} must be a finite number`); return value; };
const COORDINATE_ORDER = /^X east, Y (elevation|sea level), Z north; metres$/;

function pointXZ(value, label) {
    if (!Array.isArray(value) || value.length !== 2) throw new Error(`[Synthesis] ${label} must be an [x, z] pair`);
    return [requireFinite(value[0], `${label}[0]`), requireFinite(value[1], `${label}[1]`)];
}

function pointXYZ(value, label) {
    if (!Array.isArray(value) || value.length !== 3) throw new Error(`[Synthesis] ${label} must be an [x, y, z] triple`);
    return [requireFinite(value[0], `${label}[0]`), requireFinite(value[1], `${label}[1]`), requireFinite(value[2], `${label}[2]`)];
}

function requireOrder(data, label) {
    if (!data || typeof data !== 'object' || !COORDINATE_ORDER.test(data.coordinate_order)) throw new Error(`[Synthesis] ${label} must declare coordinate_order "X east, Y elevation|sea level, Z north; metres"`);
}

/** @param {any} data districts.json */
export function parsePlanDistricts(data) {
    if (!Array.isArray(data) || data.length > 255) throw new Error('[Synthesis] districts.json must be an array of 0..255 district records');
    const ids = new Set();
    return data.map((record, i) => {
        const label = `districts[${i}]`;
        if (!Number.isSafeInteger(record?.id) || record.id < 1 || record.id > 255 || ids.has(record.id)) throw new Error(`[Synthesis] ${label}.id must be a unique integer in 1..255`);
        ids.add(record.id);
        if (typeof record.name !== 'string' || !record.name) throw new Error(`[Synthesis] ${label}.name is required`);
        if (!Array.isArray(record.boundary_xz_m) || record.boundary_xz_m.length < 3 || record.boundary_xz_m.length > 128) throw new Error(`[Synthesis] ${label}.boundary_xz_m needs 3..128 vertices`);
        return { id: record.id, name: record.name, targetMeters: requireFinite(record.target_elevation_m, `${label}.target_elevation_m`), band: String(record.typical_design_band_m ?? ''),
            polygon: record.boundary_xz_m.map((entry, k) => pointXZ(entry, `${label}.boundary_xz_m[${k}]`)) };
    });
}

/** @param {any} data roads.json */
export function parsePlanRoads(data) {
    requireOrder(data, 'roads.json');
    if (!Array.isArray(data.roads) || data.roads.length > 512) throw new Error('[Synthesis] roads.json must hold 0..512 roads');
    const names = new Set();
    return data.roads.map((record, index) => {
        const label = `roads[${index}]`;
        if (typeof record?.name !== 'string' || !record.name || names.has(record.name)) throw new Error(`[Synthesis] ${label}.name must be a unique non-empty string`);
        names.add(record.name);
        const width = requireFinite(record.width_m, `${label}.width_m`);
        if (width <= 0 || width > 1000) throw new Error(`[Synthesis] ${label}.width_m must be in (0, 1000]`);
        if (!Array.isArray(record.centerline_xyz_m) || record.centerline_xyz_m.length < 2 || record.centerline_xyz_m.length > 32768) throw new Error(`[Synthesis] ${label}.centerline_xyz_m needs 2..32768 points`);
        const points = record.centerline_xyz_m.map((entry, k) => pointXYZ(entry, `${label}.centerline_xyz_m[${k}]`));
        return { index, name: record.name, from: String(record.from ?? ''), to: String(record.to ?? ''), type: String(record.type ?? ''), widthMeters: width, points,
            designMaxGradePercent: Number.isFinite(record.design_max_grade_percent) ? record.design_max_grade_percent : null };
    });
}

/** @param {any} data shoreline.json @returns {number[][]} [x, z] polyline */
export function parsePlanShoreline(data) {
    requireOrder(data, 'shoreline.json');
    if (!Array.isArray(data.points_xyz_m) || data.points_xyz_m.length < 2 || data.points_xyz_m.length > 32768) throw new Error('[Synthesis] shoreline.json needs 2..32768 points');
    return data.points_xyz_m.map((entry, k) => { const [x, , z] = pointXYZ(entry, `shoreline.points_xyz_m[${k}]`); return [x, z]; });
}

/** @param {any} data beach_points.json */
export function parsePlanBeachPoints(data) {
    requireOrder(data, 'beach_points.json');
    if (!Array.isArray(data.points) || data.points.length > 512) throw new Error('[Synthesis] beach_points.json points must be an array of at most 512 records');
    const points = data.points.map((record, i) => {
        const label = `beach_points.points[${i}]`;
        if (typeof record?.name !== 'string' || !record.name) throw new Error(`[Synthesis] ${label}.name is required`);
        const [x, y, z] = pointXYZ(record.xyz_m, `${label}.xyz_m`);
        let footprint = null;
        if (record.footprint_m !== undefined) {
            if (!Array.isArray(record.footprint_m) || record.footprint_m.length !== 2 || !record.footprint_m.every(value => Number.isFinite(value) && value > 0 && value <= 1000)) throw new Error(`[Synthesis] ${label}.footprint_m must be two positive extents`);
            footprint = [record.footprint_m[0], record.footprint_m[1]];
        }
        return { name: record.name, x, y, z, footprintMeters: footprint, note: String(record.note ?? '') };
    });
    let corridor = null;
    if (data.open_view_corridor_xz_m !== undefined) {
        if (!Array.isArray(data.open_view_corridor_xz_m) || data.open_view_corridor_xz_m.length < 3 || data.open_view_corridor_xz_m.length > 128) throw new Error('[Synthesis] beach_points.open_view_corridor_xz_m needs 3..128 vertices');
        corridor = data.open_view_corridor_xz_m.map((entry, k) => pointXZ(entry, `beach_points.open_view_corridor_xz_m[${k}]`));
    }
    return { points, corridor };
}

/**
 * @param {{districts:any,roads:any,shoreline:any,beachPoints:any}} files parsed JSON of the four plan files
 * @returns {{districts:ReturnType<typeof parsePlanDistricts>,roads:ReturnType<typeof parsePlanRoads>,shoreline:number[][],beachPoints:ReturnType<typeof parsePlanBeachPoints>}}
 */
export function parseSynthesisPlan(files) {
    return { districts: parsePlanDistricts(files.districts), roads: parsePlanRoads(files.roads), shoreline: parsePlanShoreline(files.shoreline), beachPoints: parsePlanBeachPoints(files.beachPoints) };
}
