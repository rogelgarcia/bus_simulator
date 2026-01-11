// src/graphics/assets3d/generators/buildings/WindowTextureGenerator.js
// Generates window textures from "type + params" with caching and previews.
import * as THREE from 'three';
import { WINDOW_STYLE, isWindowStyle } from '../../../../app/buildings/WindowStyle.js';

const QUANT = 1000;
const _textureCache = new Map();
const _previewUrlCache = new Map();

export const WINDOW_TYPE = Object.freeze({
    STYLE_DEFAULT: 'window.style.default',
    STYLE_DARK: 'window.style.dark',
    STYLE_BLUE: 'window.style.blue',
    STYLE_WARM: 'window.style.warm',
    STYLE_GRID: 'window.style.grid',
    ARCH_V1: 'window.arch.v1',
    MODERN_V1: 'window.modern.v1'
});

export function isWindowTypeId(value) {
    if (typeof value !== 'string') return false;
    return value === WINDOW_TYPE.STYLE_DEFAULT
        || value === WINDOW_TYPE.STYLE_DARK
        || value === WINDOW_TYPE.STYLE_BLUE
        || value === WINDOW_TYPE.STYLE_WARM
        || value === WINDOW_TYPE.STYLE_GRID
        || value === WINDOW_TYPE.ARCH_V1
        || value === WINDOW_TYPE.MODERN_V1;
}

function q(value) {
    return Math.round(Number(value) * QUANT);
}

function applyTextureColorSpace(tex, { srgb = true } = {}) {
    if (!tex) return;
    if ('colorSpace' in tex) {
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        return;
    }
    if ('encoding' in tex) tex.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
}

function makeCanvas(width, height) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');
    return { c, ctx };
}

function canvasToTexture(canvas, { srgb = true } = {}) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 8;
    applyTextureColorSpace(tex, { srgb });
    tex.needsUpdate = true;
    tex.userData = tex.userData ?? {};
    tex.userData.buildingShared = true;
    return tex;
}

function hexToCss(hex) {
    const safe = Number.isFinite(hex) ? hex : 0xffffff;
    return `#${safe.toString(16).padStart(6, '0')}`;
}

function resolveTypeLabel(typeId) {
    if (typeId === WINDOW_TYPE.STYLE_DEFAULT) return 'Default';
    if (typeId === WINDOW_TYPE.STYLE_DARK) return 'Dark';
    if (typeId === WINDOW_TYPE.STYLE_BLUE) return 'Blue';
    if (typeId === WINDOW_TYPE.STYLE_WARM) return 'Warm';
    if (typeId === WINDOW_TYPE.STYLE_GRID) return 'Grid';
    if (typeId === WINDOW_TYPE.ARCH_V1) return 'Arched';
    if (typeId === WINDOW_TYPE.MODERN_V1) return 'Modern';
    return 'Default';
}

function normalizeLegacyStyleToTypeId(styleId) {
    const id = isWindowStyle(styleId) ? styleId : WINDOW_STYLE.DEFAULT;
    if (id === WINDOW_STYLE.DARK) return WINDOW_TYPE.STYLE_DARK;
    if (id === WINDOW_STYLE.BLUE) return WINDOW_TYPE.STYLE_BLUE;
    if (id === WINDOW_STYLE.WARM) return WINDOW_TYPE.STYLE_WARM;
    if (id === WINDOW_STYLE.GRID) return WINDOW_TYPE.STYLE_GRID;
    return WINDOW_TYPE.STYLE_DEFAULT;
}

function normalizeWindowTypeId(typeId) {
    if (isWindowTypeId(typeId)) return typeId;
    if (isWindowStyle(typeId)) return normalizeLegacyStyleToTypeId(typeId);
    return WINDOW_TYPE.STYLE_DEFAULT;
}

function normalizeModernParams(params) {
    const p = params && typeof params === 'object' ? params : {};
    return {
        frameWidth: Math.max(0.02, Math.min(0.2, Number(p.frameWidth) || 0.06)),
        frameColor: Number.isFinite(p.frameColor) ? p.frameColor : 0xdfe7f2,
        glassTop: Number.isFinite(p.glassTop) ? p.glassTop : 0x1d5c8d,
        glassBottom: Number.isFinite(p.glassBottom) ? p.glassBottom : 0x061a2c
    };
}

function normalizeArchParams(params) {
    const p = params && typeof params === 'object' ? params : {};
    return {
        frameWidth: Math.max(0.02, Math.min(0.2, Number(p.frameWidth) || 0.06)),
        frameColor: Number.isFinite(p.frameColor) ? p.frameColor : 0xdfe7f2,
        glassTop: Number.isFinite(p.glassTop) ? p.glassTop : 0x10395a,
        glassBottom: Number.isFinite(p.glassBottom) ? p.glassBottom : 0x061a2c
    };
}

function buildLegacyStyleCanvas(styleTypeId, { size = 256 } = {}) {
    const { c, ctx } = makeCanvas(size, size);
    if (!ctx) return c;

    const styleId = styleTypeId === WINDOW_TYPE.STYLE_DARK
        ? WINDOW_STYLE.DARK
        : styleTypeId === WINDOW_TYPE.STYLE_BLUE
            ? WINDOW_STYLE.BLUE
            : styleTypeId === WINDOW_TYPE.STYLE_WARM
                ? WINDOW_STYLE.WARM
                : styleTypeId === WINDOW_TYPE.STYLE_GRID
                    ? WINDOW_STYLE.GRID
                    : WINDOW_STYLE.DEFAULT;

    const w = size;
    const h = size;

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    if (styleId === WINDOW_STYLE.WARM) {
        grad.addColorStop(0, '#4a3a2f');
        grad.addColorStop(0.5, '#16283a');
        grad.addColorStop(1, '#061a2c');
    } else if (styleId === WINDOW_STYLE.BLUE) {
        grad.addColorStop(0, '#1d5c8d');
        grad.addColorStop(1, '#051526');
    } else if (styleId === WINDOW_STYLE.DARK) {
        grad.addColorStop(0, '#0a101a');
        grad.addColorStop(1, '#04070c');
    } else {
        grad.addColorStop(0, '#10395a');
        grad.addColorStop(1, '#061a2c');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const frame = Math.max(10, Math.round(size * 0.06));
    ctx.strokeStyle = 'rgba(210, 230, 255, 0.75)';
    ctx.lineWidth = frame;
    ctx.strokeRect(frame * 0.5, frame * 0.5, w - frame, h - frame);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(frame + 6, frame + 6, w - (frame + 6) * 2, h - (frame + 6) * 2);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.5, frame + 8);
    ctx.lineTo(w * 0.5, h - frame - 8);
    ctx.moveTo(frame + 8, h * 0.5);
    ctx.lineTo(w - frame - 8, h * 0.5);
    ctx.stroke();

    if (styleId === WINDOW_STYLE.WARM) {
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = 'rgba(255, 204, 120, 0.35)';
        ctx.fillRect(frame + 10, frame + 10, w - (frame + 10) * 2, h - (frame + 10) * 2);
        ctx.globalAlpha = 1.0;
    }

    if (styleId === WINDOW_STYLE.GRID) {
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = 'rgba(240, 245, 255, 0.7)';
        ctx.lineWidth = 1;
        const step = Math.max(12, Math.round(size / 12));
        for (let i = step; i < size; i += step) {
            ctx.beginPath();
            ctx.moveTo(i + 0.5, 0);
            ctx.lineTo(i + 0.5, size);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i + 0.5);
            ctx.lineTo(size, i + 0.5);
            ctx.stroke();
        }
        ctx.globalAlpha = 1.0;
    }

    return c;
}

function buildModernCanvas({
    width = 256,
    height = 256,
    frameWidth = 0.06,
    frameColor = 0xdfe7f2,
    glassTop = 0x1d5c8d,
    glassBottom = 0x061a2c
} = {}) {
    const w = Math.max(32, Math.round(width));
    const h = Math.max(32, Math.round(height));
    const { c, ctx } = makeCanvas(w, h);
    if (!ctx) return c;

    ctx.fillStyle = hexToCss(frameColor);
    ctx.fillRect(0, 0, w, h);

    const fw = Math.max(2, Math.round(Math.min(w, h) * frameWidth));
    const ix = fw;
    const iy = fw;
    const iw = Math.max(1, w - fw * 2);
    const ih = Math.max(1, h - fw * 2);

    const grad = ctx.createLinearGradient(0, iy, 0, iy + ih);
    grad.addColorStop(0, hexToCss(glassTop));
    grad.addColorStop(1, hexToCss(glassBottom));
    ctx.fillStyle = grad;
    ctx.fillRect(ix, iy, iw, ih);

    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = Math.max(1, Math.round(fw * 0.25));
    ctx.strokeRect(ix + 0.5, iy + 0.5, iw - 1, ih - 1);

    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ix + iw * 0.5, iy);
    ctx.lineTo(ix + iw * 0.5, iy + ih);
    ctx.stroke();
    ctx.globalAlpha = 1.0;

    return c;
}

function buildArchedCanvas({
    width = 256,
    height = 256,
    frameWidth = 0.06,
    frameColor = 0xdfe7f2,
    glassTop = 0x10395a,
    glassBottom = 0x061a2c
} = {}) {
    const w = Math.max(64, Math.round(width));
    const h = Math.max(64, Math.round(height));
    const { c, ctx } = makeCanvas(w, h);
    if (!ctx) return c;

    const fw = Math.max(2, Math.round(Math.min(w, h) * frameWidth));
    const outerRadius = (w * 0.5);
    const innerRadius = Math.max(2, outerRadius - fw);

    const archHeight = outerRadius;
    const rectHeight = Math.max(0, h - archHeight);

    ctx.fillStyle = 'rgba(0,0,0,0.0)';
    ctx.clearRect(0, 0, w, h);

    const outerPath = new Path2D();
    outerPath.moveTo(0, archHeight);
    outerPath.arc(w * 0.5, archHeight, outerRadius, Math.PI, 0, false);
    outerPath.lineTo(w, h);
    outerPath.lineTo(0, h);
    outerPath.closePath();

    ctx.fillStyle = hexToCss(frameColor);
    ctx.fill(outerPath);

    const innerArchHeight = innerRadius;
    const innerRectHeight = Math.max(0, (h - fw) - innerArchHeight);
    const innerPath = new Path2D();
    innerPath.moveTo(fw, innerArchHeight + fw);
    innerPath.arc(w * 0.5, innerArchHeight + fw, innerRadius, Math.PI, 0, false);
    innerPath.lineTo(w - fw, fw + innerArchHeight + innerRectHeight);
    innerPath.lineTo(fw, fw + innerArchHeight + innerRectHeight);
    innerPath.closePath();

    const grad = ctx.createLinearGradient(0, fw, 0, h - fw);
    grad.addColorStop(0, hexToCss(glassTop));
    grad.addColorStop(1, hexToCss(glassBottom));
    ctx.fillStyle = grad;
    ctx.fill(innerPath);

    ctx.strokeStyle = 'rgba(255,255,255,0.38)';
    ctx.lineWidth = Math.max(1, Math.round(fw * 0.25));
    ctx.stroke(innerPath);

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#ffffff';
    const sheenW = Math.max(6, Math.round(w * 0.12));
    ctx.fillRect(fw + Math.round(w * 0.12), fw + 2, sheenW, h - fw * 2 - 4);
    ctx.globalAlpha = 1.0;

    return c;
}

function buildCacheKey(typeId, params, { windowWidth = 1, windowHeight = 1 } = {}) {
    const t = normalizeWindowTypeId(typeId);
    const w = Number(windowWidth) || 1;
    const h = Number(windowHeight) || 1;
    const aspectQ = q(h / Math.max(0.01, w));

    if (t === WINDOW_TYPE.ARCH_V1) {
        const p = normalizeArchParams(params);
        return `${t}|a:${aspectQ}|fw:${q(p.frameWidth)}|fc:${p.frameColor}|gt:${p.glassTop}|gb:${p.glassBottom}`;
    }
    if (t === WINDOW_TYPE.MODERN_V1) {
        const p = normalizeModernParams(params);
        return `${t}|a:${aspectQ}|fw:${q(p.frameWidth)}|fc:${p.frameColor}|gt:${p.glassTop}|gb:${p.glassBottom}`;
    }
    return `${t}|legacy`;
}

export function getWindowTypeOptions() {
    const types = [
        WINDOW_TYPE.STYLE_DEFAULT,
        WINDOW_TYPE.STYLE_DARK,
        WINDOW_TYPE.STYLE_BLUE,
        WINDOW_TYPE.STYLE_WARM,
        WINDOW_TYPE.STYLE_GRID,
        WINDOW_TYPE.ARCH_V1,
        WINDOW_TYPE.MODERN_V1
    ];

    const out = [];
    for (const id of types) {
        let previewUrl = _previewUrlCache.get(id) ?? null;
        if (!previewUrl) {
            const canvas = id === WINDOW_TYPE.ARCH_V1
                ? buildArchedCanvas({ width: 96, height: 128 })
                : id === WINDOW_TYPE.MODERN_V1
                    ? buildModernCanvas({ width: 96, height: 96 })
                    : buildLegacyStyleCanvas(id, { size: 96 });
            previewUrl = canvas?.toDataURL?.('image/png') ?? null;
            if (previewUrl) _previewUrlCache.set(id, previewUrl);
        }
        out.push({
            id,
            label: resolveTypeLabel(id),
            previewUrl
        });
    }
    return out;
}

export function getDefaultWindowParams(typeId) {
    const t = normalizeWindowTypeId(typeId);
    if (t === WINDOW_TYPE.ARCH_V1) return normalizeArchParams(null);
    if (t === WINDOW_TYPE.MODERN_V1) return normalizeModernParams(null);
    return {};
}

export function getWindowTexture({ typeId, params, windowWidth = 1, windowHeight = 1 } = {}) {
    const t = normalizeWindowTypeId(typeId);
    const key = buildCacheKey(t, params, { windowWidth, windowHeight });
    const cached = _textureCache.get(key);
    if (cached) return cached;

    let tex;
    if (t === WINDOW_TYPE.ARCH_V1) {
        const p = normalizeArchParams(params);
        const aspect = (Number(windowHeight) || 1) / Math.max(0.01, Number(windowWidth) || 1);
        const hPx = Math.max(64, Math.min(512, Math.round(256 * aspect)));
        const canvas = buildArchedCanvas({
            width: 256,
            height: hPx,
            ...p
        });
        tex = canvasToTexture(canvas, { srgb: true });
    } else if (t === WINDOW_TYPE.MODERN_V1) {
        const p = normalizeModernParams(params);
        const aspect = (Number(windowHeight) || 1) / Math.max(0.01, Number(windowWidth) || 1);
        const hPx = Math.max(64, Math.min(512, Math.round(256 * aspect)));
        const canvas = buildModernCanvas({
            width: 256,
            height: hPx,
            ...p
        });
        tex = canvasToTexture(canvas, { srgb: true });
    } else {
        const canvas = buildLegacyStyleCanvas(t, { size: 256 });
        tex = canvasToTexture(canvas, { srgb: true });
    }

    _textureCache.set(key, tex);
    return tex;
}

export function getLegacyWindowStyleTexture(styleId) {
    const t = normalizeLegacyStyleToTypeId(styleId);
    return getWindowTexture({ typeId: t });
}
