// Computes renderer-independent tree-trunk exclusion tests for city geometry.
// @ts-check

const EPS = 1e-9;

function pointSegmentDistanceSq(x, z, a, b) {
    const ax = a.x;
    const az = a.z;
    const dx = b.x - ax;
    const dz = b.z - az;
    const lengthSq = dx * dx + dz * dz;
    const t = lengthSq > EPS ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSq)) : 0;
    const px = ax + dx * t;
    const pz = az + dz * t;
    return (x - px) ** 2 + (z - pz) ** 2;
}

function pointInLoop(x, z, loop) {
    let inside = false;
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
        const a = loop[i];
        const b = loop[j];
        const crosses = ((a.z > z) !== (b.z > z))
            && (x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x);
        if (crosses) inside = !inside;
    }
    return inside;
}

function distanceToLoopSq(x, z, loop) {
    let distanceSq = Infinity;
    for (let i = 0; i < loop.length; i++) {
        const next = (i + 1) % loop.length;
        distanceSq = Math.min(distanceSq, pointSegmentDistanceSq(x, z, loop[i], loop[next]));
    }
    return distanceSq;
}

function normalizeLoop(raw) {
    if (!Array.isArray(raw)) return null;
    const loop = raw
        .map((point) => ({ x: Number(point?.x), z: Number(point?.z) }))
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.z));
    return loop.length >= 3 ? Object.freeze(loop) : null;
}

function normalizeFootprints(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map((footprint) => {
        const loops = Array.isArray(footprint) ? footprint.map(normalizeLoop).filter(Boolean) : [];
        return loops.length ? Object.freeze(loops) : null;
    }).filter(Boolean);
}

function normalizeTrafficControls(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map((control) => {
        const source = control?.position ?? control;
        const x = Number(source?.x);
        const z = Number(source?.z);
        return Number.isFinite(x) && Number.isFinite(z) ? Object.freeze({ x, z }) : null;
    }).filter(Boolean);
}

function intersectsFootprint(x, z, loops, marginSq) {
    let inside = false;
    for (const loop of loops) {
        if (pointInLoop(x, z, loop)) inside = !inside;
        if (distanceToLoopSq(x, z, loop) <= marginSq) return true;
    }
    return inside;
}

/**
 * @param {{roadPolygons?: unknown[], roadMargin?: number, buildingFootprints?: unknown[], buildingMargin?: number, trafficControls?: unknown[], trafficControlClearance?: number}} [options]
 */
export function createTreePlacementExclusion(options = {}) {
    const roadPolygons = Array.isArray(options.roadPolygons)
        ? options.roadPolygons.map(normalizeLoop).filter(Boolean)
        : [];
    const buildingFootprints = normalizeFootprints(options.buildingFootprints);
    const trafficControls = normalizeTrafficControls(options.trafficControls);
    const roadMarginSq = Math.max(0, Number(options.roadMargin) || 0) ** 2;
    const buildingMarginSq = Math.max(0, Number(options.buildingMargin) || 0) ** 2;
    const trafficControlClearanceSq = Math.max(0, Number(options.trafficControlClearance) || 0) ** 2;

    return Object.freeze({
        hasRoadPolygons: roadPolygons.length > 0,
        allowsTrunk(x, z) {
            if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
            for (const loop of roadPolygons) {
                if (pointInLoop(x, z, loop) || distanceToLoopSq(x, z, loop) <= roadMarginSq) return false;
            }
            for (const loops of buildingFootprints) {
                if (intersectsFootprint(x, z, loops, buildingMarginSq)) return false;
            }
            for (const control of trafficControls) {
                if ((x - control.x) ** 2 + (z - control.z) ** 2 <= trafficControlClearanceSq) return false;
            }
            return true;
        }
    });
}
