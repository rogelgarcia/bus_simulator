// Selects categorical mask coverage and material texel density independently from terrain geometric error.
// @ts-check
import { validateLandscapeManifest } from './LandscapeManifest.js';
import { validateLandscapeAppearanceManifest, LANDSCAPE_APPEARANCE_TIERS } from './LandscapeAppearanceManifest.js';
import { requireCondition } from './internal/LandscapeValidation.js';

function cameraInput(input) {
    requireCondition(input && ['perspective', 'orthographic'].includes(input.projection), 'appearance camera projection is required');
    for (const key of ['x', 'y', 'z']) requireCondition(Number.isFinite(input.position?.[key]), `appearance camera position.${key} must be finite`);
    requireCondition(Number.isFinite(input.viewportHeight) && input.viewportHeight > 0 && Number.isFinite(input.zoom ?? 1) && (input.zoom ?? 1) > 0, 'appearance camera viewport/zoom must be positive');
    const camera = { ...input, zoom: input.zoom ?? 1, frustumPlanes: input.frustumPlanes ?? [] };
    requireCondition(Array.isArray(camera.frustumPlanes) && camera.frustumPlanes.length <= 6 && camera.frustumPlanes.every(plane => ['x', 'y', 'z', 'w'].every(key => Number.isFinite(plane[key]))), 'appearance camera planes are invalid');
    if (camera.projection === 'orthographic') requireCondition(Number.isFinite(camera.orthoHeight) && camera.orthoHeight > 0, 'appearance orthoHeight must be positive');
    else {
        requireCondition(Number.isFinite(camera.fovYRadians) && camera.fovYRadians > 0 && camera.fovYRadians < Math.PI, 'appearance fovYRadians is invalid');
        const length = Math.hypot(input.direction?.x, input.direction?.y, input.direction?.z);
        requireCondition(Number.isFinite(length) && length > 0, 'appearance perspective direction is required');
        camera.direction = { x: input.direction.x / length, y: input.direction.y / length, z: input.direction.z / length };
    }
    return camera;
}

function visible(node, planes) {
    const b = node.bounds;
    return planes.every(p => p.x * (p.x >= 0 ? b.maxX : b.minX) + p.y * (p.y >= 0 ? node.maxHeight : node.minHeight) + p.z * (p.z >= 0 ? b.maxZ : b.minZ) + p.w >= 0);
}

function pixelsPerMeter(node, camera) {
    if (camera.projection === 'orthographic') return camera.viewportHeight * camera.zoom / camera.orthoHeight;
    const p = camera.position, d = camera.direction, b = node.bounds;
    let depth = Infinity, radius = 0;
    for (const x of [b.minX, b.maxX]) for (const y of [node.minHeight, node.maxHeight]) for (const z of [b.minZ, b.maxZ]) {
        const qx = x - p.x, qy = y - p.y, qz = z - p.z, forward = qx * d.x + qy * d.y + qz * d.z;
        depth = Math.min(depth, forward);
        radius = Math.max(radius, Math.sqrt(Math.max(0, qx * qx + qy * qy + qz * qz - forward * forward)));
    }
    depth = Math.max(.01, depth);
    return camera.viewportHeight * camera.zoom / (2 * Math.tan(camera.fovYRadians / 2)) * (1 + radius / depth) / depth;
}

function tierFor(required, previous) {
    const last = LANDSCAPE_APPEARANCE_TIERS.length - 1;
    let index = LANDSCAPE_APPEARANCE_TIERS.findIndex(size => size >= required);
    if (index < 0) index = last;
    const previousIndex = LANDSCAPE_APPEARANCE_TIERS.indexOf(Number(previous));
    if (previousIndex > index) {
        let retained = previousIndex;
        while (retained > index && required <= LANDSCAPE_APPEARANCE_TIERS[retained - 1] * .65) retained--;
        index = retained;
    }
    return String(LANDSCAPE_APPEARANCE_TIERS[index]);
}

/** @param {any} input @param {any} appearanceInput */
export function createLandscapeAppearancePlanner(input, appearanceInput) {
    const manifest = validateLandscapeManifest(input), appearance = validateLandscapeAppearanceManifest(appearanceInput, manifest);
    const byId = new Map(manifest.chunks.map(chunk => [chunk.id, chunk])), children = new Map();
    for (const chunk of manifest.chunks) if (chunk.parentId && byId.get(chunk.parentId).level === chunk.level - 1) {
        if (!children.has(chunk.parentId)) children.set(chunk.parentId, []);
        children.get(chunk.parentId).push(chunk);
    }
    /** @param {any} cameraSnapshot @param {{previousMaskIds?:string[],previousTier?:string,previousTiers?:object,targetMaskPixels?:number,targetTexelPixels?:number}} [options] */
    function plan(cameraSnapshot, { previousMaskIds = [], previousTier, previousTiers = {}, targetMaskPixels = 4, targetTexelPixels = 1.5 } = {}) {
        const camera = cameraInput(cameraSnapshot);
        requireCondition(Number.isFinite(targetMaskPixels) && targetMaskPixels > 0 && Number.isFinite(targetTexelPixels) && targetTexelPixels > 0, 'appearance pixel targets must be positive');
        const previouslySplit = new Set();
        for (const id of previousMaskIds) {
            let node = byId.get(id); requireCondition(!!node, `unknown previous appearance mask ${id}`);
            while (node.parentId) { previouslySplit.add(node.parentId); node = byId.get(node.parentId); }
        }
        const visibilityById = {}, maskPixelsById = {}, densityById = {};
        for (const node of manifest.chunks) {
            visibilityById[node.id] = visible(node, camera.frustumPlanes);
            densityById[node.id] = pixelsPerMeter(node, camera);
            maskPixelsById[node.id] = densityById[node.id] * node.sampleStride * Math.max(manifest.grid.spacingX, manifest.grid.spacingZ);
        }
        const desiredMaskIds = [];
        function visit(node) {
            if (visibilityById[node.id] && maskPixelsById[node.id] > targetMaskPixels * (previouslySplit.has(node.id) ? .65 : 1) && children.get(node.id)?.length === 4) children.get(node.id).forEach(visit);
            else desiredMaskIds.push(node.id);
        }
        visit(byId.get(manifest.overviewId));
        const visibleMaskIds = desiredMaskIds.filter(id => visibilityById[id]);
        const density = Math.max(0, ...visibleMaskIds.map(id => densityById[id]));
        const desiredTiers = Object.fromEntries(appearance.materials.map(material => [material.soilId, tierFor(material.tileMeters * density / targetTexelPixels, previousTiers[material.soilId] ?? previousTier)]));
        const desiredTier = String(Math.max(...Object.values(desiredTiers).map(Number)));
        const desiredMaskPixels = Math.max(0, ...visibleMaskIds.map(id => maskPixelsById[id]));
        return Object.freeze({ desiredMaskIds: Object.freeze(desiredMaskIds), visibleMaskIds: Object.freeze(visibleMaskIds), desiredTier,
            desiredTiers: Object.freeze(desiredTiers), maskPixelsById: Object.freeze(maskPixelsById), visibilityById: Object.freeze(visibilityById),
            targetMaskPixels, targetTexelPixels, desiredMaskPixels, sourceLimited: desiredMaskPixels > targetMaskPixels,
            sourceRevision: manifest.revision, appearanceRevision: appearance.revision });
    }
    return Object.freeze({ manifest, appearance, plan });
}
