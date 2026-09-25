// Place independent leaf rows by random pose, then retry shape at that fixed pose before moving on.
// Square bounds always apply; optional collision rejection uses conservative blade-section prisms.
// @ts-check
export const GRASS_V2_PATCH_PACKING = Object.freeze({
    seed: 20260925, tufts: 80, leaves: 400, allowIntersections: true, size: Object.freeze([0.8, 1.05]),
    inclination: Object.freeze([0.95, 1.2]), depth: Object.freeze([1, 1.05]),
    clearanceMeters: 0.00021, shapeTrialsPerPose: 24, maxPosesPerTuft: 4000
});

/** @typedef {{positions: ArrayLike<number>, roots: readonly number[], side: number, id: string, curvatureId: string, lengthId: string, fraction: number}} Source */
/** @typedef {{x: number, z: number, hx: number, hz: number, minY: number, maxY: number, c: number, s: number}} Prism */

function randomStream(seed) {
    return () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
        value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
        return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
}

function overlap(a, b) {
    if (a.maxY <= b.minY || b.maxY <= a.minY) return false;
    const dx = b.x - a.x, dz = b.z - a.z;
    const cc = Math.abs(a.c * b.c + a.s * b.s), ss = Math.abs(a.c * b.s - a.s * b.c);
    return Math.abs(dx * a.c - dz * a.s) < a.hx + b.hx * cc + b.hz * ss
        && Math.abs(dx * a.s + dz * a.c) < a.hz + b.hx * ss + b.hz * cc
        && Math.abs(dx * b.c - dz * b.s) < b.hx + a.hx * cc + a.hz * ss
        && Math.abs(dx * b.s + dz * b.c) < b.hz + a.hx * ss + a.hz * cc;
}

function cells(box) {
    const ex = Math.abs(box.c) * box.hx + Math.abs(box.s) * box.hz;
    const ez = Math.abs(box.s) * box.hx + Math.abs(box.c) * box.hz, keys = [];
    for (let x = Math.floor((box.x - ex) * 50); x <= Math.floor((box.x + ex) * 50); x++)
        for (let z = Math.floor((box.z - ez) * 50); z <= Math.floor((box.z + ez) * 50); z++) keys.push(x * 1000 + z);
    return keys;
}

function intersects(boxes, grid) {
    for (const box of boxes) for (const key of cells(box)) for (const other of grid.get(key) ?? [])
        if (overlap(box, other)) return true;
    return false;
}

function insert(boxes, grid) {
    for (const box of boxes) for (const key of cells(box)) {
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(box);
    }
}

function shapePrisms(source, shape, rootY, stride) {
    const { scale, pitch, burialMeters } = shape, c = Math.cos(pitch), s = Math.sin(pitch);
    const positions = source.positions, rows = [];
    for (let start = 0; start < positions.length / 3; start += stride) {
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (let i = start; i < Math.min(start + stride, positions.length / 3); i++) {
            const x = positions[i * 3] * scale, y = positions[i * 3 + 1] - rootY, z = positions[i * 3 + 2];
            const point = [x, (y * c - z * s) * scale + rootY - burialMeters, (y * s + z * c) * scale];
            for (let axis = 0; axis < 3; axis++) {
                min[axis] = Math.min(min[axis], point[axis]); max[axis] = Math.max(max[axis], point[axis]);
            }
        }
        rows.push({ min, max });
    }
    const gap = GRASS_V2_PATCH_PACKING.clearanceMeters;
    return source.roots.flatMap(root => rows.slice(1).map((row, index) => {
        const min = row.min.map((value, axis) => Math.min(value, rows[index].min[axis]));
        const max = row.max.map((value, axis) => Math.max(value, rows[index].max[axis]));
        return { x: (min[0] + max[0]) / 2 + root * scale, z: (min[2] + max[2]) / 2,
            hx: (max[0] - min[0]) / 2 + gap, hz: (max[2] - min[2]) / 2 + gap, minY: min[1] - gap, maxY: max[1] + gap };
    }));
}

function worldPrisms(boxes, pose) {
    const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
    return boxes.map(box => ({ ...box, x: pose.x + c * box.x + s * box.z, z: pose.z - s * box.x + c * box.z, c, s }));
}

function insideSquare(boxes) {
    return boxes.every(box => {
        const ex = Math.abs(box.c) * box.hx + Math.abs(box.s) * box.hz;
        const ez = Math.abs(box.s) * box.hx + Math.abs(box.c) * box.hz;
        return Math.abs(box.x) + ex < 0.5 && Math.abs(box.z) + ez < 0.5;
    });
}

/** @param {{sources: Source[], rootDepthMeters: number, acrossSegments: number, seed?: number}} options */
export function createGrassDebugV2PlantPatchLayout({ sources, rootDepthMeters, acrossSegments, seed = GRASS_V2_PATCH_PACKING.seed }) {
    if (sources.length !== 8 || !sources.every(source => source.positions.length > 0 && source.roots.length === 5))
        throw new Error('Random patch requires both sides of the five-leaf curvature and length variants.');
    const started = performance.now(), config = GRASS_V2_PATCH_PACKING;
    const poseRandom = randomStream(seed), shapeRandom = randomStream(seed ^ 0x9E3779B9);
    const queue = sources.flatMap(source => {
        const count = config.tufts * source.fraction;
        if (!Number.isInteger(count) || count < 1) throw new Error('Patch shape shares must yield whole tufts.');
        return Array(count).fill(source);
    });
    for (let i = queue.length - 1; i > 0; i--) {
        const j = Math.floor(poseRandom() * (i + 1));
        [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    const grid = new Map(), placements = [], rootY = -rootDepthMeters;
    const stats = { seed, allowIntersections: config.allowIntersections, poseAttempts: 0, shapeAttempts: 0, collisionAttempts: 0, outsideAttempts: 0,
        acceptedAfterAdjustment: 0, recoveredCollidingPoses: 0, maxShapeTrialsUsed: 0 };
    const sampleRange = range => range[0] + shapeRandom() * (range[1] - range[0]);
    for (const source of queue) {
        const p = source.positions, angle = Math.atan2(p[p.length - 2] - rootY, Math.hypot(p[p.length - 3], p[p.length - 1]));
        let accepted = false;
        for (let attempt = 0; attempt < config.maxPosesPerTuft && !accepted; attempt++) {
            const pose = { x: poseRandom() - 0.5, z: poseRandom() - 0.5, yaw: poseRandom() * Math.PI * 2 };
            let hitAtPose = false;
            stats.poseAttempts++;
            for (let trial = 0; trial < config.shapeTrialsPerPose; trial++) {
                const scale = sampleRange(config.size), inclination = sampleRange(config.inclination), depth = sampleRange(config.depth);
                const pitch = -(source.side === 0 ? 1 : -1) * angle * (inclination - 1);
                const shape = { scale, inclination, depth, pitch, burialMeters: rootDepthMeters * (depth - 1) };
                const boxes = worldPrisms(shapePrisms(source, shape, rootY, acrossSegments + 1), pose);
                stats.shapeAttempts++;
                if (!insideSquare(boxes)) { stats.outsideAttempts++; continue; }
                if (!config.allowIntersections && intersects(boxes, grid)) { hitAtPose = true; stats.collisionAttempts++; continue; }
                placements.push(Object.freeze({ ...pose, ...shape, side: source.side,
                    sourceId: source.id, curvatureId: source.curvatureId, lengthId: source.lengthId, leafCount: source.roots.length, shapeTrials: trial + 1, recoveredCollision: hitAtPose }));
                if (!config.allowIntersections) insert(boxes, grid);
                accepted = true;
                if (trial > 0) stats.acceptedAfterAdjustment++;
                if (hitAtPose) stats.recoveredCollidingPoses++;
                stats.maxShapeTrialsUsed = Math.max(stats.maxShapeTrialsUsed, trial + 1);
                break;
            }
        }
        if (!accepted) throw new Error('Unable to pack ' + config.leaves + ' leaves within the square and placement constraints; seed ' + seed + ', accepted tufts ' + placements.length);
    }
    return Object.freeze({ placements: Object.freeze(placements), stats: Object.freeze({ ...stats, elapsedMs: performance.now() - started }) });
}
