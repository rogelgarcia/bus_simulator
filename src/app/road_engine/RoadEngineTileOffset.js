// src/app/road_engine/RoadEngineTileOffset.js
// Canonical tile+offset representation utilities for road authoring tools.

export const ROAD_ENGINE_TILE_OFFSET_EPS = 1e-6;

function clamp(v, lo, hi) {
    const n = Number(v);
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n));
}

function clampInt(v, lo, hi) {
    const n = Number(v);
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n | 0));
}

function normalizeAxis(tile, offset, half) {
    const eps = ROAD_ENGINE_TILE_OFFSET_EPS;
    let t = Number.isFinite(Number(tile)) ? (Number(tile) | 0) : 0;
    let o = Number(offset) || 0;
    if (!Number.isFinite(o)) o = 0;
    o = clamp(o, -half, half);
    if (o > half - eps) {
        t += 1;
        o = -half;
    }
    if (Math.abs(o) < eps) o = 0;
    return { tile: t, offset: o };
}

export function normalizeRoadTileOffsetBoundary(point, { tileSize = 24 } = {}) {
    const size = Number(tileSize) || 24;
    const half = size * 0.5;

    const ax = normalizeAxis(point?.tileX, point?.offsetX, half);
    const ay = normalizeAxis(point?.tileY, point?.offsetY, half);

    return {
        tileX: ax.tile,
        tileY: ay.tile,
        offsetX: ax.offset,
        offsetY: ay.offset
    };
}

export function normalizeRoadTileOffsetBoundaryInPlace(point, { tileSize = 24 } = {}) {
    if (!point || typeof point !== 'object') return point;
    const norm = normalizeRoadTileOffsetBoundary(point, { tileSize });
    point.tileX = norm.tileX;
    point.tileY = norm.tileY;
    point.offsetX = norm.offsetX;
    point.offsetY = norm.offsetY;
    return point;
}

export function normalizeRoadTileOffsetForMap(point, { tileSize = 24, mapWidth = null, mapHeight = null } = {}) {
    const size = Number(tileSize) || 24;
    const half = size * 0.5;
    const norm = normalizeRoadTileOffsetBoundary(point, { tileSize: size });

    if (!Number.isFinite(Number(mapWidth)) && !Number.isFinite(Number(mapHeight))) return norm;

    const maxX = Number.isFinite(Number(mapWidth)) ? Math.max(0, (Number(mapWidth) | 0) - 1) : null;
    const maxY = Number.isFinite(Number(mapHeight)) ? Math.max(0, (Number(mapHeight) | 0) - 1) : null;

    let tileX = norm.tileX;
    let tileY = norm.tileY;
    let offsetX = norm.offsetX;
    let offsetY = norm.offsetY;

    if (maxX !== null) {
        if (tileX < 0) tileX = 0;
        if (tileX > maxX + 1) tileX = maxX + 1;
        if (tileX === maxX + 1) offsetX = -half;
    }

    if (maxY !== null) {
        if (tileY < 0) tileY = 0;
        if (tileY > maxY + 1) tileY = maxY + 1;
        if (tileY === maxY + 1) offsetY = -half;
    }

    return {
        tileX,
        tileY,
        offsetX,
        offsetY
    };
}

export function clampRoadTileOffsetForMap(point, { tileSize = 24, mapWidth = null, mapHeight = null } = {}) {
    const size = Number(tileSize) || 24;
    const half = size * 0.5;
    const maxX = Number.isFinite(Number(mapWidth)) ? Math.max(0, (Number(mapWidth) | 0) - 1) : null;
    const maxY = Number.isFinite(Number(mapHeight)) ? Math.max(0, (Number(mapHeight) | 0) - 1) : null;

    const tileX = maxX === null ? (Number(point?.tileX) | 0) : clampInt(point?.tileX, 0, maxX + 1);
    const tileY = maxY === null ? (Number(point?.tileY) | 0) : clampInt(point?.tileY, 0, maxY + 1);
    const offsetX = clamp(point?.offsetX ?? 0, -half, half);
    const offsetY = clamp(point?.offsetY ?? 0, -half, half);

    return normalizeRoadTileOffsetForMap({ tileX, tileY, offsetX, offsetY }, { tileSize: size, mapWidth, mapHeight });
}
