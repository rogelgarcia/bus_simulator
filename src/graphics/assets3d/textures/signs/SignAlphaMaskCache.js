// src/graphics/assets3d/textures/signs/SignAlphaMaskCache.js
// Generates and caches alpha masks for sign textures.
import * as THREE from 'three';
import { getSignAtlasImage } from './SignAtlasTextureCache.js';
import { getSignAssetById } from './SignAssets.js';

const BACKGROUND_THRESHOLD = 250;

const _cache = new Map();

function clampInt(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    const rounded = Math.round(num);
    return Math.max(min, Math.min(max, rounded));
}

function makeCanvas(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = clampInt(w, 1, 8192);
    canvas.height = clampInt(h, 1, 8192);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    return { canvas, ctx };
}

function isBackground(r, g, b) {
    return (r + g + b) / 3 >= BACKGROUND_THRESHOLD;
}

function computeOutsideMask(imgData, w, h) {
    const n = w * h;
    const outside = new Uint8Array(n);
    const queue = new Int32Array(n);
    let qh = 0;
    let qt = 0;

    const enqueue = (idx) => {
        outside[idx] = 1;
        queue[qt++] = idx;
    };

    const tryEnqueue = (x, y) => {
        const idx = x + y * w;
        if (outside[idx]) return;
        const p = idx * 4;
        if (!isBackground(imgData[p], imgData[p + 1], imgData[p + 2])) return;
        enqueue(idx);
    };

    for (let x = 0; x < w; x++) {
        tryEnqueue(x, 0);
        tryEnqueue(x, h - 1);
    }
    for (let y = 1; y < h - 1; y++) {
        tryEnqueue(0, y);
        tryEnqueue(w - 1, y);
    }

    while (qh < qt) {
        const idx = queue[qh++];
        const x = idx % w;
        const y = (idx / w) | 0;

        if (x > 0) tryEnqueue(x - 1, y);
        if (x + 1 < w) tryEnqueue(x + 1, y);
        if (y > 0) tryEnqueue(x, y - 1);
        if (y + 1 < h) tryEnqueue(x, y + 1);
    }

    return outside;
}

function fillMaskImageData(maskData, outside, w, h) {
    const n = w * h;
    for (let i = 0; i < n; i++) {
        const m = outside[i] ? 0 : 255;
        const p = i * 4;
        maskData[p] = m;
        maskData[p + 1] = m;
        maskData[p + 2] = m;
        maskData[p + 3] = 255;
    }
}

function buildMaskFromAtlas({ canvas, ctx }, atlasImage, rectPx) {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.drawImage(
        atlasImage,
        rectPx.x,
        rectPx.y,
        rectPx.w,
        rectPx.h,
        0,
        0,
        w,
        h
    );

    const img = ctx.getImageData(0, 0, w, h);
    const outside = computeOutsideMask(img.data, w, h);

    const mask = ctx.createImageData(w, h);
    fillMaskImageData(mask.data, outside, w, h);
    ctx.putImageData(mask, 0, 0);
}

export function getSignAlphaMaskTextureById(signId) {
    const id = typeof signId === 'string' ? signId : '';
    if (!id) return null;

    const existing = _cache.get(id) ?? null;
    if (existing) return existing.texture;

    const asset = getSignAssetById(id);
    const { canvas, ctx } = makeCanvas(asset.rectPx.w, asset.rectPx.h);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 8;
    tex.needsUpdate = true;

    const entry = { texture: tex, loading: true };
    _cache.set(id, entry);

    getSignAtlasImage(asset.atlasId).then((atlasImage) => {
        if (!atlasImage) return;
        buildMaskFromAtlas({ canvas, ctx }, atlasImage, asset.rectPx);
        tex.needsUpdate = true;
        entry.loading = false;
    }).catch(() => {
        entry.loading = false;
    });

    return tex;
}
