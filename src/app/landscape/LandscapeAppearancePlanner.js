// Selects categorical mask coverage and material texel density independently from terrain geometric error.
// @ts-check
import { validateLandscapeManifest } from './LandscapeManifest.js';
import { validateLandscapeAppearanceManifest, LANDSCAPE_APPEARANCE_TIERS } from './LandscapeAppearanceManifest.js';
import { createLandscapeSurfaceDetailIndex, LANDSCAPE_SURFACE_DETAIL_MAX_LEVELS } from './LandscapeSurfaceDetail.js';
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

function closestView(node, camera) {
    const p = camera.position, d = camera.direction, b = node.bounds;
    let depth = Infinity, radius = 0;
    for (const x of [b.minX, b.maxX]) for (const y of [node.minHeight, node.maxHeight]) for (const z of [b.minZ, b.maxZ]) {
        const qx = x - p.x, qy = y - p.y, qz = z - p.z, forward = qx * d.x + qy * d.y + qz * d.z;
        depth = Math.min(depth, forward);
        radius = Math.max(radius, Math.sqrt(Math.max(0, qx * qx + qy * qy + qz * qz - forward * forward)));
    }
    return { depth: Math.max(.01, depth), radius };
}

function pixelsPerMeter(node, camera) {
    if (camera.projection === 'orthographic') return camera.viewportHeight * camera.zoom / camera.orthoHeight;
    const { depth, radius } = closestView(node, camera);
    return camera.viewportHeight * camera.zoom / (2 * Math.tan(camera.fovYRadians / 2)) * (1 + radius / depth) / depth;
}

function detailPixelsPerMeter(node, camera) {
    if (camera.projection === 'orthographic') return camera.viewportHeight * camera.zoom / camera.orthoHeight;
    const { depth, radius } = closestView(node, camera);
    return camera.viewportHeight * camera.zoom / (2 * Math.tan(camera.fovYRadians / 2)) * Math.min(1 + radius / depth, 2) / depth;
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

function surfaceDetailConfiguration(manifest, input) {
    if (input === undefined) return null;
    requireCondition(!!input && typeof input === 'object' && !Array.isArray(input) && Object.keys(input).every(key => key === 'levels' || key === 'targetPixels'), 'surfaceDetail accepts only levels and targetPixels');
    requireCondition(Number.isSafeInteger(input.levels) && input.levels >= 0 && input.levels <= LANDSCAPE_SURFACE_DETAIL_MAX_LEVELS, `surfaceDetail.levels must be an integer in 0..${LANDSCAPE_SURFACE_DETAIL_MAX_LEVELS}`);
    requireCondition(input.targetPixels === undefined || Number.isFinite(input.targetPixels) && input.targetPixels > 0, 'surfaceDetail.targetPixels must be positive');
    return input.levels ? Object.freeze({ levels: input.levels, targetPixels: input.targetPixels, index: createLandscapeSurfaceDetailIndex(manifest, { levels: input.levels }) }) : null;
}

/**
 * @param {any} input @param {any} appearanceInput
 * @param {{materialTiling?:Object<string,{nearTileMeters:number,macroTileMeters:number,blendStartMetersPerPixel:number,blendEndMetersPerPixel:number}>,surfaceDetail?:{levels:number,targetPixels?:number}}} [configuration]
 */
export function createLandscapeAppearancePlanner(input, appearanceInput, { materialTiling = {}, surfaceDetail } = {}) {
    const manifest = validateLandscapeManifest(input), appearance = validateLandscapeAppearanceManifest(appearanceInput, manifest);
    for (const [id, tiling] of Object.entries(materialTiling)) {
        requireCondition(appearance.materials.some(material => material.soilId === id), `unknown material tiling soil ${id}`);
        requireCondition(['nearTileMeters', 'macroTileMeters', 'blendStartMetersPerPixel', 'blendEndMetersPerPixel'].every(key => Number.isFinite(tiling[key]) && tiling[key] > 0)
            && tiling.blendEndMetersPerPixel > tiling.blendStartMetersPerPixel, 'appearance material tiling periods and footprint interval must be positive');
    }
    const tilings = Object.fromEntries(Object.entries(materialTiling).map(([id, value]) => [id, { ...value }]));
    const detail = surfaceDetailConfiguration(manifest, surfaceDetail);
    const byId = new Map(manifest.chunks.map(chunk => [chunk.id, chunk])), children = new Map();
    for (const chunk of manifest.chunks) if (chunk.parentId && byId.get(chunk.parentId).level === chunk.level - 1) {
        if (!children.has(chunk.parentId)) children.set(chunk.parentId, []);
        children.get(chunk.parentId).push(chunk);
    }

    // refine visible native mask leaves into generated fine pages with capped transverse magnification
    function planDetail(camera, visibleMaskIds, targetMaskPixels, previousDetailIds) {
        const { index, levels } = detail, target = detail.targetPixels ?? targetMaskPixels, maxLevel = manifest.grid.maxLevel, previouslySplit = new Set();
        for (const id of previousDetailIds) {
            requireCondition(index.isFine(id), `unknown previous surface detail page ${id}`);
            for (let parent = index.parentId(id); ; parent = index.parentId(parent)) { previouslySplit.add(parent); if (!index.isFine(parent)) break; }
        }
        const spacingMetersByLevel = {};
        for (let level = maxLevel; level <= index.finestLevel; level++) { const spacing = index.spacing(level); spacingMetersByLevel[level] = Math.max(spacing.x, spacing.z); }
        const desiredIds = [], visibleIds = [], pixelsById = {};
        const splits = (id, density, level) => level < index.finestLevel && density * spacingMetersByLevel[level + 1] > target / 2 * (previouslySplit.has(id) ? .65 : 1);
        function visit(node) {
            if (!visible(node, camera.frustumPlanes)) { desiredIds.push(node.id); return; }
            const density = detailPixelsPerMeter(node, camera);
            pixelsById[node.id] = density * spacingMetersByLevel[node.level];
            if (splits(node.id, density, node.level)) index.children(node.id).forEach(visit);
            else { desiredIds.push(node.id); visibleIds.push(node.id); }
        }
        for (const id of visibleMaskIds) {
            const node = byId.get(id);
            if (node.level === maxLevel && splits(id, detailPixelsPerMeter(node, camera), maxLevel)) index.children(id).forEach(visit);
        }
        delete spacingMetersByLevel[maxLevel];
        return Object.freeze({ levels, targetPixels: target, desiredIds: Object.freeze(desiredIds), visibleIds: Object.freeze(visibleIds), pixelsById: Object.freeze(pixelsById),
            spacingMetersByLevel: Object.freeze(spacingMetersByLevel), sourceLimited: visibleIds.some(id => index.descriptor(id).level === index.finestLevel && pixelsById[id] > target) });
    }

    /** @param {any} cameraSnapshot @param {{previousMaskIds?:string[],previousTier?:string,previousTiers?:object,targetMaskPixels?:number,targetTexelPixels?:number,previousDetailIds?:string[]}} [options] */
    function plan(cameraSnapshot, { previousMaskIds = [], previousTier, previousTiers = {}, targetMaskPixels = 4, targetTexelPixels = 1.5, previousDetailIds = [] } = {}) {
        const camera = cameraInput(cameraSnapshot);
        requireCondition(Number.isFinite(targetMaskPixels) && targetMaskPixels > 0 && Number.isFinite(targetTexelPixels) && targetTexelPixels > 0, 'appearance pixel targets must be positive');
        requireCondition(Array.isArray(previousDetailIds) && (detail !== null || previousDetailIds.length === 0), 'previousDetailIds must be an array and requires configured surface detail levels');
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
        const desiredTiers = Object.fromEntries(appearance.materials.map(material => {
            const tiling = tilings[material.soilId];
            let texels = material.tileMeters * density;
            if (tiling && density > 0) {
                const footprint = 1 / density;
                const near = footprint < tiling.blendEndMetersPerPixel ? tiling.nearTileMeters * density : 0;
                const macro = tiling.macroTileMeters * density;
                texels = Math.max(near, macro);
            }
            return [material.soilId, tierFor(texels / targetTexelPixels, previousTiers[material.soilId] ?? previousTier)];
        }));
        const desiredTier = String(Math.max(...Object.values(desiredTiers).map(Number)));
        const desiredMaskPixels = Math.max(0, ...visibleMaskIds.map(id => maskPixelsById[id]));
        const result = { desiredMaskIds: Object.freeze(desiredMaskIds), visibleMaskIds: Object.freeze(visibleMaskIds), desiredTier,
            desiredTiers: Object.freeze(desiredTiers), maskPixelsById: Object.freeze(maskPixelsById), visibilityById: Object.freeze(visibilityById),
            targetMaskPixels, targetTexelPixels, desiredMaskPixels, sourceLimited: desiredMaskPixels > targetMaskPixels,
            sourceRevision: manifest.revision, appearanceRevision: appearance.revision };
        return Object.freeze(detail ? { ...result, detail: planDetail(camera, visibleMaskIds, targetMaskPixels, previousDetailIds) } : result);
    }
    return Object.freeze({ manifest, appearance, plan, surfaceDetail: detail?.index ?? null });
}
