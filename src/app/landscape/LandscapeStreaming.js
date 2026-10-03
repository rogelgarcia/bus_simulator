// Selects a balanced terrain partition from projected error without allocating terrain payloads.
// @ts-check
import { validateLandscapeManifest, createLandscapeChunkId } from './LandscapeManifest.js';

function positive(value, label) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`[LandscapeStreaming] ${label} must be positive`);
    return value;
}

function cameraInput(input) {
    if (!input || !['perspective', 'orthographic'].includes(input.projection)) throw new Error('[LandscapeStreaming] projection must be perspective or orthographic');
    for (const axis of ['x', 'y', 'z']) if (!Number.isFinite(input.position?.[axis])) throw new Error(`[LandscapeStreaming] position.${axis} must be finite`);
    const result = { ...input, viewportHeight: positive(input.viewportHeight, 'viewportHeight'), zoom: positive(input.zoom ?? 1, 'zoom') };
    if (input.projection === 'perspective') {
        result.fovYRadians = positive(input.fovYRadians, 'fovYRadians');
        if (result.fovYRadians >= Math.PI) throw new Error('[LandscapeStreaming] field of view must be below pi');
    } else result.orthoHeight = positive(input.orthoHeight, 'orthoHeight');
    if (input.direction) {
        const length = Math.hypot(input.direction.x, input.direction.y, input.direction.z);
        positive(length, 'direction length');
        result.direction = { x: input.direction.x / length, y: input.direction.y / length, z: input.direction.z / length };
    }
    if (input.velocity) for (const axis of ['x', 'y', 'z']) if (!Number.isFinite(input.velocity[axis])) throw new Error(`[LandscapeStreaming] velocity.${axis} must be finite`);
    result.frustumPlanes = input.frustumPlanes ?? [];
    if (!Array.isArray(result.frustumPlanes) || result.frustumPlanes.length > 6) throw new Error('[LandscapeStreaming] frustumPlanes must contain at most six planes');
    for (const plane of result.frustumPlanes) for (const key of ['x', 'y', 'z', 'w']) if (!Number.isFinite(plane[key])) throw new Error('[LandscapeStreaming] invalid frustum plane');
    return result;
}

function visible(chunk, planes, margin = 0, offset = { x: 0, y: 0, z: 0 }) {
    const b = chunk.bounds;
    return planes.every(p => p.x * ((p.x >= 0 ? b.maxX : b.minX) - offset.x) + p.y * ((p.y >= 0 ? chunk.maxHeight : chunk.minHeight) - offset.y) + p.z * ((p.z >= 0 ? b.maxZ : b.minZ) - offset.z) + p.w + margin * Math.hypot(p.x, p.y, p.z) >= 0);
}

function prefetchCandidates(leaves, chunks, children, camera, visibilityById) {
    const velocity = camera.velocity ?? { x: 0, y: 0, z: 0 };
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    const horizon = speed ? Math.min(0.5, 500 / speed) : 0;
    const offset = { x: velocity.x * horizon, y: velocity.y * horizon, z: velocity.z * horizon };
    const candidates = [];
    for (const id of leaves) {
        if (!chunks.get(id).geometricError) continue;
        for (const child of children.get(id) ?? []) {
            if (visibilityById[child.id]) continue;
            const b = child.bounds;
            const margin = Math.min(250, (b.maxX - b.minX) / 4, (b.maxZ - b.minZ) / 4);
            const predicted = horizon > 0 && visible(child, camera.frustumPlanes, 0, offset);
            if (!predicted && !visible(child, camera.frustumPlanes, margin)) continue;
            const distance = Math.hypot((b.minX + b.maxX) / 2 - camera.position.x, (b.minZ + b.maxZ) / 2 - camera.position.z);
            candidates.push({ id: child.id, predicted, distance });
        }
    }
    return candidates.sort((a, b) => Number(b.predicted) - Number(a.predicted) || a.distance - b.distance || a.id.localeCompare(b.id)).slice(0, 2).map(candidate => candidate.id);
}

function projectedError(chunk, camera) {
    if (!chunk.geometricError) return 0;
    if (camera.projection === 'orthographic') return chunk.geometricError * camera.viewportHeight * camera.zoom / camera.orthoHeight;
    const b = chunk.bounds;
    const p = camera.position;
    let distance;
    let magnification = 1;
    if (camera.direction) {
        const d = camera.direction;
        distance = d.x * ((d.x >= 0 ? b.minX : b.maxX) - p.x)
            + d.y * ((d.y >= 0 ? chunk.minHeight : chunk.maxHeight) - p.y)
            + d.z * ((d.z >= 0 ? b.minZ : b.maxZ) - p.z);
        let transverseRadius = 0;
        for (const x of [b.minX, b.maxX]) for (const y of [chunk.minHeight, chunk.maxHeight]) for (const z of [b.minZ, b.maxZ]) {
            const qx = x - p.x, qy = y - p.y, qz = z - p.z;
            const depth = qx * d.x + qy * d.y + qz * d.z;
            transverseRadius = Math.max(transverseRadius, Math.sqrt(Math.max(0, qx * qx + qy * qy + qz * qz - depth * depth)));
        }
        magnification = Math.sqrt(Math.max(0, 1 - d.y * d.y)) + Math.abs(d.y) * transverseRadius / Math.max(0.01, distance);
    } else {
        distance = Math.hypot(Math.max(b.minX - p.x, 0, p.x - b.maxX), Math.max(chunk.minHeight - p.y, 0, p.y - chunk.maxHeight), Math.max(b.minZ - p.z, 0, p.z - b.maxZ));
    }
    return chunk.geometricError * magnification * camera.viewportHeight * camera.zoom / (2 * Math.tan(camera.fovYRadians / 2) * Math.max(0.01, distance));
}

function balance(leaves, chunks, children) {
    let changed = true;
    while (changed) {
        changed = false;
        for (const id of [...leaves]) {
            const chunk = chunks.get(id);
            for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const c = chunk.column + dc;
                const r = chunk.row + dr;
                if (c < 0 || r < 0 || c >= 2 ** chunk.level || r >= 2 ** chunk.level) continue;
                for (let level = chunk.level; level >= 0; level--) {
                    const ratio = 2 ** (chunk.level - level);
                    const neighbor = createLandscapeChunkId(level, Math.floor(c / ratio), Math.floor(r / ratio));
                    if (!leaves.has(neighbor)) continue;
                    if (chunk.level - level > 1 && children.get(neighbor)?.length === 4) {
                        leaves.delete(neighbor);
                        for (const child of children.get(neighbor)) leaves.add(child.id);
                        changed = true;
                    }
                    break;
                }
            }
        }
    }
}

/**
 * Indexes a validated manifest once. Plans contain IDs and pixel errors only; the caller admits resources separately.
 * @param {object} input
 * @returns {{plan:Function,manifest:object}}
 */
export function createLandscapeViewPlanner(input) {
    const manifest = validateLandscapeManifest(input);
    const chunks = new Map(manifest.chunks.map(chunk => [chunk.id, chunk]));
    const children = new Map();
    for (const chunk of manifest.chunks) {
        if (chunk.parentId === null || chunks.get(chunk.parentId).level !== chunk.level - 1) continue;
        if (!children.has(chunk.parentId)) children.set(chunk.parentId, []);
        children.get(chunk.parentId).push(chunk);
    }
    function plan(cameraSnapshot, options = {}) {
        const camera = cameraInput(cameraSnapshot);
        const targetErrorPixels = positive(options.targetErrorPixels ?? 1.5, 'targetErrorPixels');
        const hysteresis = positive(options.hysteresis ?? 0.65, 'hysteresis');
        if (hysteresis >= 1) throw new Error('[LandscapeStreaming] hysteresis must be below one');
        const maxLevel = options.maxLevel ?? manifest.grid.maxLevel;
        if (!Number.isInteger(maxLevel) || maxLevel < 0 || maxLevel > manifest.grid.maxLevel) throw new Error('[LandscapeStreaming] invalid maxLevel');
        const previouslySplit = new Set();
        for (const id of options.previousLeafIds ?? []) {
            let chunk = chunks.get(id);
            if (!chunk) throw new Error(`[LandscapeStreaming] unknown previous leaf ${id}`);
            while (chunk.parentId !== null) {
                previouslySplit.add(chunk.parentId);
                chunk = chunks.get(chunk.parentId);
            }
        }
        const errorsById = {};
        const visibilityById = {};
        for (const chunk of manifest.chunks) {
            errorsById[chunk.id] = projectedError(chunk, camera);
            visibilityById[chunk.id] = visible(chunk, camera.frustumPlanes);
        }
        const leaves = new Set();
        const visit = chunk => {
            const threshold = targetErrorPixels * (previouslySplit.has(chunk.id) ? hysteresis : 1);
            if (chunk.level < maxLevel && visibilityById[chunk.id] && errorsById[chunk.id] > threshold && children.get(chunk.id)?.length === 4) {
                for (const child of children.get(chunk.id)) visit(child);
            } else leaves.add(chunk.id);
        };
        visit(chunks.get(manifest.overviewId));
        balance(leaves, chunks, children);
        const desiredLeafIds = [...leaves].sort();
        const desiredVisibleLeafIds = desiredLeafIds.filter(id => visibilityById[id]);
        const desiredErrorPixels = desiredVisibleLeafIds.reduce((max, id) => Math.max(max, errorsById[id]), 0);
        const prefetchIds = prefetchCandidates(leaves, chunks, children, camera, visibilityById);
        return Object.freeze({
            desiredLeafIds: Object.freeze(desiredLeafIds), desiredVisibleLeafIds: Object.freeze(desiredVisibleLeafIds),
            errorsById: Object.freeze(errorsById), visibilityById: Object.freeze(visibilityById), targetErrorPixels,
            desiredErrorPixels, sourceLimited: desiredErrorPixels > targetErrorPixels, prefetchIds: Object.freeze(prefetchIds)
        });
    }
    return Object.freeze({ manifest, plan });
}

/** @param {object} manifest @param {object} camera @param {object} [options] */
export function planLandscapeView(manifest, camera, options) {
    return createLandscapeViewPlanner(manifest).plan(camera, options);
}

/** @param {object} manifest @param {object} descriptor @param {string} channel */
export function landscapeResourceKey(manifest, descriptor, channel) {
    const payload = descriptor.channels[channel];
    if (!payload) throw new Error(`[LandscapeStreaming] unknown channel ${channel}`);
    return JSON.stringify([manifest.id, manifest.revision, descriptor.id, descriptor.level, channel, payload.revision, payload.sha256]);
}
