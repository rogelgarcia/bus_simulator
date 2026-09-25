// Resolve one authored lower blade against an upper blade before atlas generation; no runtime physics.
// Heights are constrained over entire intersecting triangle projections, including edge-only contacts.
// @ts-check
import * as THREE from 'three';

const CELL_METERS = 0.01;
const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);

function triangles(geometry) {
    const p = geometry.attributes.position, index = geometry.index, result = [];
    for (let i = 0; i < index.count; i += 3) {
        const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
        const points = ids.map(id => ({ x: p.getX(id), y: p.getY(id), z: p.getZ(id) }));
        const area = cross(...points);
        if (Math.abs(area) < 1e-13 || Math.max(...points.map(point => point.y)) < 0) continue;
        result.push({ ids, points, area, minX: Math.min(...points.map(v => v.x)), maxX: Math.max(...points.map(v => v.x)),
            minZ: Math.min(...points.map(v => v.z)), maxZ: Math.max(...points.map(v => v.z)) });
    }
    return result;
}

function cells(triangle) {
    const keys = [];
    for (let x = Math.floor(triangle.minX / CELL_METERS); x <= Math.floor(triangle.maxX / CELL_METERS); x++)
        for (let z = Math.floor(triangle.minZ / CELL_METERS); z <= Math.floor(triangle.maxZ / CELL_METERS); z++) keys.push(x + ':' + z);
    return keys;
}

function weights(point, triangle) {
    const [a, b, c] = triangle.points;
    return [cross(point, b, c), cross(a, point, c), cross(a, b, point)].map(value => value / triangle.area);
}

function clip(polygon, distance) {
    const output = [];
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], b = polygon[(i + 1) % polygon.length], da = distance(a), db = distance(b);
        if (da >= 0) output.push(a);
        if ((da >= 0) !== (db >= 0)) {
            const t = da / (da - db);
            output.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
        }
    }
    return output;
}

function constraintsFor(upper, lower, clearanceMeters, minimumHeightMeters) {
    const grid = new Map();
    for (const triangle of triangles(upper)) for (const key of cells(triangle)) {
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(triangle);
    }
    const constraints = [];
    for (const bottom of triangles(lower)) {
        const candidates = new Set(cells(bottom).flatMap(key => grid.get(key) ?? []));
        for (const top of candidates) {
            if (bottom.maxX < top.minX || bottom.minX > top.maxX || bottom.maxZ < top.minZ || bottom.minZ > top.maxZ) continue;
            let polygon = bottom.points.map(({ x, z }) => ({ x, z }));
            for (let edge = 0; edge < 3 && polygon.length; edge++)
                polygon = clip(polygon, point => Math.sign(top.area) * cross(top.points[edge], top.points[(edge + 1) % 3], point));
            const height = point => weights(point, top).reduce((sum, weight, i) => sum + weight * top.points[i].y, 0);
            polygon = clip(polygon, point => height(point) - minimumHeightMeters);
            for (const point of polygon) constraints.push({ ids: bottom.ids, weights: weights(point, bottom), limit: height(point) - clearanceMeters });
        }
    }
    return constraints;
}

/**
 * Mutates only the lower geometry in the common authoring frame.
 * Vertices at least 1 mm below the contact region stay fixed, preserving nested root sheaths.
 * @param {{upper: THREE.BufferGeometry, lower: THREE.BufferGeometry, clearanceMeters?: number, blendRadiusMeters?: number, acrossSegments?: number, minimumHeightMeters?: number}} options
 */
export function resolveGrassDebugV2LeafContact({ upper, lower, clearanceMeters = 0.00003, blendRadiusMeters = 0.003, acrossSegments = 32, minimumHeightMeters = 0 }) {
    if (!upper.index || !lower.index || !upper.attributes.position || !lower.attributes.position
        || upper === lower || !Number.isFinite(minimumHeightMeters) || minimumHeightMeters < 0 || !Number.isFinite(clearanceMeters) || clearanceMeters <= 0
        || !Number.isFinite(blendRadiusMeters) || blendRadiusMeters <= 0 || !Number.isInteger(acrossSegments) || acrossSegments < 1)
        throw new Error('Leaf contact requires distinct indexed geometries and positive contact settings.');
    const started = performance.now(), p = lower.attributes.position, original = p.array.slice();
    const constraints = constraintsFor(upper, lower, clearanceMeters, minimumHeightMeters), delta = new Float64Array(p.count);
    const error = constraint => constraint.weights.reduce((sum, w, i) => sum + w * p.getY(constraint.ids[i]), 0) - constraint.limit;
    const pinnedHeight = minimumHeightMeters - 0.001;
    const maximumPenetrationBefore = Math.max(0, ...constraints.map(error));
    for (const constraint of constraints) {
        const required = constraint.weights.reduce((sum, w, i) =>
            sum + w * original[constraint.ids[i] * 3 + 1], 0) - constraint.limit;
        if (required <= 0) continue;
        const movableWeight = constraint.weights.reduce((sum, w, i) => sum + (original[constraint.ids[i] * 3 + 1] > pinnedHeight ? w : 0), 0);
        if (movableWeight < 1e-8) throw new Error('Leaf contact reaches a pinned root.');
        // Distribute clearance over the triangle instead of amplifying a small
        // barycentric weight into a deep local dent. Later constraints only increase it.
        const amount = (required + 1e-8) / movableWeight;
        for (const id of constraint.ids) {
            if (original[id * 3 + 1] > pinnedHeight) delta[id] = Math.max(delta[id], amount);
        }
    }
    const contacts = Array.from(delta, (amount, id) => ({ amount, id })).filter(({ amount }) => amount > 0);
    const radius2 = blendRadiusMeters * blendRadiusMeters;
    for (let id = 0; id < p.count; id++) {
        if (original[id * 3 + 1] <= pinnedHeight) continue;
        for (const contact of contacts) {
            const distance2 = [0, 1, 2].reduce((sum, axis) =>
                sum + (original[id * 3 + axis] - original[contact.id * 3 + axis]) ** 2, 0);
            if (distance2 >= radius2) continue;
            const weight = 1 - THREE.MathUtils.smootherstep(Math.sqrt(distance2), 0, blendRadiusMeters);
            delta[id] = Math.max(delta[id], contact.amount * weight);
        }
        p.setY(id, original[id * 3 + 1] - delta[id]);
    }
    p.needsUpdate = true; lower.computeVertexNormals();
    const facing = lower.attributes.grassFacingNormal, stride = acrossSegments + 1, normal = new THREE.Vector3();
    if (facing) {
        for (let start = 0; start < p.count; start += stride) {
            const count = Math.min(stride, p.count - start);
            normal.fromBufferAttribute(lower.attributes.normal, start + Math.floor(count / 2));
            for (let i = start; i < start + count; i++) facing.setXYZ(i, normal.x, normal.y, normal.z);
        }
        facing.needsUpdate = true;
    }
    lower.computeBoundingBox(); lower.computeBoundingSphere();
    const finalErrors = constraints.map(error), maximumPenetrationAfter = Math.max(0, ...finalErrors);
    if (maximumPenetrationAfter > 1e-7) throw new Error('Leaf contact failed to remove penetration.');
    return Object.freeze({ clearanceMeters, blendRadiusMeters, minimumHeightMeters, constraints: constraints.length, contactVertices: contacts.length,
        deformedVertices: Array.from(delta).filter(value => value > 0).length, maximumDisplacementMeters: Math.max(0, ...delta),
        maximumPenetrationBefore, maximumPenetrationAfter,
        minimumGapMeters: constraints.length ? clearanceMeters - Math.max(...finalErrors) : null, elapsedMs: performance.now() - started });
}
