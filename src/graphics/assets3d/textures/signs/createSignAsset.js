// src/graphics/assets3d/textures/signs/createSignAsset.js
// Builds immutable sign asset descriptors from atlas rects.
import { getSignAtlasById, resolveSignAtlasUrl } from './SignAtlases.js';
import { getSignAtlasTexture } from './SignAtlasTextureCache.js';

function clampInt(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    const rounded = Math.round(num);
    return Math.max(min, Math.min(max, rounded));
}

function normalizeRectPx(rectPx, { width, height }) {
    const x = clampInt(rectPx?.x, 0, Math.max(0, width - 1));
    const y = clampInt(rectPx?.y, 0, Math.max(0, height - 1));
    const w = clampInt(rectPx?.w, 1, Math.max(1, width - x));
    const h = clampInt(rectPx?.h, 1, Math.max(1, height - y));
    return { x, y, w, h };
}

function computeUvRect({ x, y, w, h }, { width, height }) {
    const u0 = x / width;
    const u1 = (x + w) / width;
    const v0 = 1 - (y + h) / height;
    const v1 = 1 - y / height;
    return { u0, v0, u1, v1 };
}

export function createSignAsset({ id, label, atlasId, rectPx } = {}) {
    const safeId = typeof id === 'string' ? id : '';
    if (!safeId) throw new Error('[createSignAsset] id must be a non-empty string');

    const safeLabel = typeof label === 'string' && label ? label : safeId;
    const atlas = getSignAtlasById(atlasId);
    const rect = normalizeRectPx(rectPx, atlas);
    const uv = computeUvRect(rect, atlas);

    const repeat = Object.freeze({ x: rect.w / atlas.width, y: rect.h / atlas.height });
    const offset = Object.freeze({ x: uv.u0, y: uv.v0 });
    const aspect = rect.h > 0 ? rect.w / rect.h : 1;

    const rectFrozen = Object.freeze({ ...rect });
    const uvFrozen = Object.freeze({ ...uv });

    const getAtlasTexture = () => getSignAtlasTexture(atlas.id);
    const getTextureDescriptor = () => ({
        texture: getAtlasTexture(),
        offset: { ...offset },
        repeat: { ...repeat }
    });

    return Object.freeze({
        id: safeId,
        label: safeLabel,
        atlasId: atlas.id,
        atlasLabel: atlas.label,
        atlasUrl: resolveSignAtlasUrl(atlas.id),
        rectPx: rectFrozen,
        uv: uvFrozen,
        offset,
        repeat,
        aspect,
        getAtlasTexture,
        getTextureDescriptor
    });
}
