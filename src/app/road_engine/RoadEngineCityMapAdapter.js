// src/app/road_engine/RoadEngineCityMapAdapter.js
// Converts CityMap road specs into the RoadEngine road schema (tile + offset points).

const EPS = 1e-9;

function clampInt(value, lo, hi) {
    const n = Math.trunc(Number(value) || 0);
    if (n < lo) return lo;
    if (n > hi) return hi;
    return n;
}

function clamp(value, lo, hi) {
    const n = Number(value);
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n));
}

function pointKey(p) {
    return `${p.tileX}|${p.tileY}|${Math.round((Number(p.offsetU) || 0) * 1e6)}|${Math.round((Number(p.offsetV) || 0) * 1e6)}`;
}

function tileId(tileX, tileY) {
    return `t:${tileX | 0},${tileY | 0}`;
}

function pointId(p) {
    const u = Number(p?.offsetU) || 0;
    const v = Number(p?.offsetV) || 0;
    if (Math.abs(u) <= 1e-6 && Math.abs(v) <= 1e-6) return tileId(p?.tileX ?? 0, p?.tileY ?? 0);
    const uq = Math.round(u * 1e6);
    const vq = Math.round(v * 1e6);
    return `p:${(p?.tileX ?? 0) | 0},${(p?.tileY ?? 0) | 0}:${uq},${vq}`;
}

function tileOffsetFromWorld(world, { origin, tileSize, mapWidth, mapHeight }) {
    const ts = Math.max(EPS, Number(tileSize) || 1);
    const ox = Number(origin?.x) || 0;
    const oz = Number(origin?.z) || 0;

    const wx = Number(world?.x);
    const wz = Number.isFinite(world?.z) ? Number(world.z) : Number(world?.y);
    if (!Number.isFinite(wx) || !Number.isFinite(wz)) return null;

    let tileX = Math.round((wx - ox) / ts);
    let tileY = Math.round((wz - oz) / ts);
    tileX = clampInt(tileX, 0, Math.max(0, (Number(mapWidth) || 1) - 1));
    tileY = clampInt(tileY, 0, Math.max(0, (Number(mapHeight) || 1) - 1));

    let offsetU = (wx - (ox + tileX * ts)) / ts;
    let offsetV = (wz - (oz + tileY * ts)) / ts;
    offsetU = clamp(offsetU, -0.5, 0.5);
    offsetV = clamp(offsetV, -0.5, 0.5);

    return { tileX, tileY, offsetU, offsetV, tangentFactor: 1 };
}

export function buildRoadEngineRoadsFromCityMap(map, { includeUnrendered = false } = {}) {
    const m = map ?? null;
    if (!m) return [];

    const width = Math.max(1, Number(m.width) || 1);
    const height = Math.max(1, Number(m.height) || 1);
    const tileSize = Math.max(EPS, Number(m.tileSize) || 1);
    const origin = m.origin ?? { x: 0, z: 0 };

    const roads = [];
    const segments = Array.isArray(m.roadSegments) ? m.roadSegments : [];
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i] ?? null;
        if (!seg) continue;
        if (!includeUnrendered && seg.rendered === false) continue;

        const lanesF = Math.max(0, Number(seg.lanesF) || 0);
        const lanesB = Math.max(0, Number(seg.lanesB) || 0);
        const id = seg.id ?? i;
        const name = typeof seg.tag === 'string' && seg.tag.trim() ? seg.tag.trim() : String(id);

        const points = [];
        if (seg.kind === 'polyline' && Array.isArray(seg.points) && seg.points.length >= 2) {
            for (const raw of seg.points) {
                const pt = tileOffsetFromWorld(raw, { origin, tileSize, mapWidth: width, mapHeight: height });
                if (!pt) continue;
                const last = points[points.length - 1] ?? null;
                if (last && pointKey(last) === pointKey(pt)) continue;
                points.push({ ...pt, id: pointId(pt) });
            }
        } else {
            const a = seg?.a ?? null;
            const b = seg?.b ?? null;
            const ax = Number(a?.x);
            const ay = Number.isFinite(a?.y) ? Number(a.y) : Number(a?.z);
            const bx = Number(b?.x);
            const by = Number.isFinite(b?.y) ? Number(b.y) : Number(b?.z);
            if (Number.isFinite(ax) && Number.isFinite(ay) && Number.isFinite(bx) && Number.isFinite(by)) {
                const aTileX = clampInt(ax, 0, width - 1);
                const aTileY = clampInt(ay, 0, height - 1);
                const bTileX = clampInt(bx, 0, width - 1);
                const bTileY = clampInt(by, 0, height - 1);
                points.push({
                    id: tileId(aTileX, aTileY),
                    tileX: aTileX,
                    tileY: aTileY,
                    offsetU: 0,
                    offsetV: 0,
                    tangentFactor: 1
                });
                points.push({
                    id: tileId(bTileX, bTileY),
                    tileX: bTileX,
                    tileY: bTileY,
                    offsetU: 0,
                    offsetV: 0,
                    tangentFactor: 1
                });
            }
        }

        if (points.length < 2) continue;

        const deduped = [];
        for (const pt of points) {
            const last = deduped[deduped.length - 1] ?? null;
            if (last && pointKey(last) === pointKey(pt)) continue;
            deduped.push(pt);
        }
        if (deduped.length < 2) continue;

        roads.push({
            id,
            name,
            lanesF,
            lanesB,
            points: deduped
        });
    }

    return roads;
}
