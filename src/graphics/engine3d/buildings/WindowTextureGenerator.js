// src/graphics/engine3d/buildings/WindowTextureGenerator.js
// Generates window textures from "type + params" with caching and previews.
import * as THREE from 'three';
import {
    WINDOW_TYPE,
    isWindowTypeId,
    normalizeWindowTypeId,
    getWindowTypeDefinition,
    getWindowTypeParamSpec,
    listWindowTypeIds
} from '../../content3d/catalogs/WindowTypeCatalog.js';

const QUANT = 1000;
const _textureCache = new Map();
const _glassMaskCache = new Map();
const _interiorEmissiveCache = new Map();
const _previewUrlCache = new Map();

export { WINDOW_TYPE, isWindowTypeId };

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

function buildLegacyStyleCanvas(styleTypeId, { size = 256 } = {}) {
    const { c, ctx } = makeCanvas(size, size);
    if (!ctx) return c;

    const w = size;
    const h = size;

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    if (styleTypeId === WINDOW_TYPE.STYLE_WARM) {
        grad.addColorStop(0, '#4a3a2f');
        grad.addColorStop(0.5, '#16283a');
        grad.addColorStop(1, '#061a2c');
    } else if (styleTypeId === WINDOW_TYPE.STYLE_LIGHT_BLUE) {
        grad.addColorStop(0, '#56c2ff');
        grad.addColorStop(1, '#0b2e52');
    } else if (styleTypeId === WINDOW_TYPE.STYLE_GREEN) {
        grad.addColorStop(0, '#2fa88a');
        grad.addColorStop(1, '#06261f');
    } else if (styleTypeId === WINDOW_TYPE.STYLE_BLUE) {
        grad.addColorStop(0, '#1d5c8d');
        grad.addColorStop(1, '#051526');
    } else if (styleTypeId === WINDOW_TYPE.STYLE_DARK) {
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

    if (styleTypeId === WINDOW_TYPE.STYLE_WARM) {
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = 'rgba(255, 204, 120, 0.35)';
        ctx.fillRect(frame + 10, frame + 10, w - (frame + 10) * 2, h - (frame + 10) * 2);
        ctx.globalAlpha = 1.0;
    }

    if (styleTypeId === WINDOW_TYPE.STYLE_GRID) {
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

    const def = getWindowTypeDefinition(t);
    const paramSpec = getWindowTypeParamSpec(t);
    if (def?.renderKind === 'arch_v1' && paramSpec) {
        const p = normalizeParamsFromSpec(paramSpec, params);
        return `${t}|a:${aspectQ}|fw:${q(p.frameWidth)}|fc:${p.frameColor}|gt:${p.glassTop}|gb:${p.glassBottom}`;
    }
    if (def?.renderKind === 'modern_v1' && paramSpec) {
        const p = normalizeParamsFromSpec(paramSpec, params);
        return `${t}|a:${aspectQ}|fw:${q(p.frameWidth)}|fc:${p.frameColor}|gt:${p.glassTop}|gb:${p.glassBottom}`;
    }
    return `${t}|legacy`;
}

export function getWindowTypeOptions() {
    const types = listWindowTypeIds();

    const out = [];
    for (const id of types) {
        const def = getWindowTypeDefinition(id);
        let previewUrl = _previewUrlCache.get(id) ?? null;
        if (!previewUrl) {
            const preview = def?.preview ?? null;
            const canvas = def?.renderKind === 'arch_v1'
                ? buildArchedCanvas({ width: preview?.width ?? 96, height: preview?.height ?? 128 })
                : def?.renderKind === 'modern_v1'
                    ? buildModernCanvas({ width: preview?.width ?? 96, height: preview?.height ?? 96 })
                    : buildLegacyStyleCanvas(id, { size: preview?.size ?? 96 });
            previewUrl = canvas?.toDataURL?.('image/png') ?? null;
            if (previewUrl) _previewUrlCache.set(id, previewUrl);
        }
        out.push({
            id,
            label: def?.label ?? id,
            previewUrl
        });
    }
    return out;
}

export function getDefaultWindowParams(typeId) {
    const t = normalizeWindowTypeId(typeId);
    const spec = getWindowTypeParamSpec(t);
    if (!spec) return {};
    return normalizeParamsFromSpec(spec, null);
}

export function getWindowTexture({ typeId, params, windowWidth = 1, windowHeight = 1 } = {}) {
    const t = normalizeWindowTypeId(typeId);
    const key = buildCacheKey(t, params, { windowWidth, windowHeight });
    const cached = _textureCache.get(key);
    if (cached) return cached;

    let tex;
    const def = getWindowTypeDefinition(t);
    const paramSpec = getWindowTypeParamSpec(t);
    if (def?.renderKind === 'arch_v1' && paramSpec) {
        const p = normalizeParamsFromSpec(paramSpec, params);
        const aspect = (Number(windowHeight) || 1) / Math.max(0.01, Number(windowWidth) || 1);
        const hPx = Math.max(64, Math.min(512, Math.round(256 * aspect)));
        const canvas = buildArchedCanvas({
            width: 256,
            height: hPx,
            ...p
        });
        tex = canvasToTexture(canvas, { srgb: true });
    } else if (def?.renderKind === 'modern_v1' && paramSpec) {
        const p = normalizeParamsFromSpec(paramSpec, params);
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

export function getWindowGlassMaskTexture({ typeId, params, windowWidth = 1, windowHeight = 1 } = {}) {
    const t = normalizeWindowTypeId(typeId);
    const baseKey = buildCacheKey(t, params, { windowWidth, windowHeight });
    const key = `glassMask|${baseKey}`;
    const cached = _glassMaskCache.get(key);
    if (cached) return cached;

    let tex;
    const def = getWindowTypeDefinition(t);
    const paramSpec = getWindowTypeParamSpec(t);
    if (def?.renderKind === 'arch_v1' && paramSpec) {
        const p = normalizeParamsFromSpec(paramSpec, params);
        const aspect = (Number(windowHeight) || 1) / Math.max(0.01, Number(windowWidth) || 1);
        const hPx = Math.max(64, Math.min(512, Math.round(256 * aspect)));
        const canvas = buildArchedGlassMaskCanvas({
            width: 256,
            height: hPx,
            frameWidth: p.frameWidth
        });
        tex = canvasToTexture(canvas, { srgb: false });
    } else if (def?.renderKind === 'modern_v1' && paramSpec) {
        const p = normalizeParamsFromSpec(paramSpec, params);
        const aspect = (Number(windowHeight) || 1) / Math.max(0.01, Number(windowWidth) || 1);
        const hPx = Math.max(64, Math.min(512, Math.round(256 * aspect)));
        const canvas = buildModernGlassMaskCanvas({
            width: 256,
            height: hPx,
            frameWidth: p.frameWidth
        });
        tex = canvasToTexture(canvas, { srgb: false });
    } else {
        const canvas = buildLegacyStyleGlassMaskCanvas({ size: 256 });
        tex = canvasToTexture(canvas, { srgb: false });
    }

    _glassMaskCache.set(key, tex);
    return tex;
}

export function getWindowInteriorEmissiveTexture({
    typeId,
    params,
    windowWidth = 1,
    windowHeight = 1,
    patternIndex = 0
} = {}) {
    const t = normalizeWindowTypeId(typeId);
    const baseKey = buildCacheKey(t, params, { windowWidth, windowHeight });
    const p = Number.isFinite(Number(patternIndex)) ? (Number(patternIndex) | 0) : 0;
    const key = `interiorEmissive|${baseKey}|p:${p}`;
    const cached = _interiorEmissiveCache.get(key);
    if (cached) return cached;

    let tex;
    const def = getWindowTypeDefinition(t);
    const paramSpec = getWindowTypeParamSpec(t);
    if (def?.renderKind === 'arch_v1' && paramSpec) {
        const normalized = normalizeParamsFromSpec(paramSpec, params);
        const aspect = (Number(windowHeight) || 1) / Math.max(0.01, Number(windowWidth) || 1);
        const hPx = Math.max(64, Math.min(512, Math.round(256 * aspect)));
        const canvas = buildArchedInteriorEmissiveCanvas({
            width: 256,
            height: hPx,
            frameWidth: normalized.frameWidth,
            seed: hashStringToUint32(`${key}|arch`)
        });
        tex = canvasToTexture(canvas, { srgb: true });
    } else if (def?.renderKind === 'modern_v1' && paramSpec) {
        const normalized = normalizeParamsFromSpec(paramSpec, params);
        const aspect = (Number(windowHeight) || 1) / Math.max(0.01, Number(windowWidth) || 1);
        const hPx = Math.max(64, Math.min(512, Math.round(256 * aspect)));
        const canvas = buildModernInteriorEmissiveCanvas({
            width: 256,
            height: hPx,
            frameWidth: normalized.frameWidth,
            seed: hashStringToUint32(`${key}|modern`)
        });
        tex = canvasToTexture(canvas, { srgb: true });
    } else {
        const canvas = buildLegacyStyleInteriorEmissiveCanvas({
            size: 256,
            seed: hashStringToUint32(`${key}|legacy`)
        });
        tex = canvasToTexture(canvas, { srgb: true });
    }

    _interiorEmissiveCache.set(key, tex);
    return tex;
}

function normalizeParamsFromSpec(paramSpec, params) {
    const p = params && typeof params === 'object' ? params : {};
    const out = {};

    for (const [key, spec] of Object.entries(paramSpec ?? {})) {
        if (!spec || typeof spec !== 'object') continue;
        const raw = p[key];
        if (Number.isFinite(spec.min) && Number.isFinite(spec.max)) {
            const num = Number(raw);
            const fallback = Number.isFinite(spec.default) ? spec.default : 0;
            out[key] = Math.max(spec.min, Math.min(spec.max, Number.isFinite(num) ? num : fallback));
            continue;
        }
        if (Number.isFinite(raw)) out[key] = raw;
        else if (Number.isFinite(spec.default)) out[key] = spec.default;
    }

    return out;
}

function buildLegacyStyleGlassMaskCanvas({ size = 256 } = {}) {
    const { c, ctx } = makeCanvas(size, size);
    if (!ctx) return c;

    const w = size;
    const h = size;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    const frame = Math.max(10, Math.round(size * 0.06));
    const x = frame;
    const y = frame;
    const iw = Math.max(1, w - frame * 2);
    const ih = Math.max(1, h - frame * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, iw, ih);
    return c;
}

function buildModernGlassMaskCanvas({ width = 256, height = 256, frameWidth = 0.06 } = {}) {
    const w = Math.max(32, Math.round(width));
    const h = Math.max(32, Math.round(height));
    const { c, ctx } = makeCanvas(w, h);
    if (!ctx) return c;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    const fw = Math.max(2, Math.round(Math.min(w, h) * frameWidth));
    const ix = fw;
    const iy = fw;
    const iw = Math.max(1, w - fw * 2);
    const ih = Math.max(1, h - fw * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ix, iy, iw, ih);
    return c;
}

function buildArchedGlassMaskCanvas({ width = 256, height = 256, frameWidth = 0.06 } = {}) {
    const w = Math.max(64, Math.round(width));
    const h = Math.max(64, Math.round(height));
    const { c, ctx } = makeCanvas(w, h);
    if (!ctx) return c;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    const fw = Math.max(2, Math.round(Math.min(w, h) * frameWidth));
    const outerRadius = (w * 0.5);
    const innerRadius = Math.max(2, outerRadius - fw);
    const innerArchHeight = innerRadius;
    const innerRectHeight = Math.max(0, (h - fw) - innerArchHeight);

    const innerPath = new Path2D();
    innerPath.moveTo(fw, innerArchHeight + fw);
    innerPath.arc(w * 0.5, innerArchHeight + fw, innerRadius, Math.PI, 0, false);
    innerPath.lineTo(w - fw, fw + innerArchHeight + innerRectHeight);
    innerPath.lineTo(fw, fw + innerArchHeight + innerRectHeight);
    innerPath.closePath();

    ctx.fillStyle = '#ffffff';
    ctx.fill(innerPath);
    return c;
}

function hashStringToUint32(text) {
    const str = typeof text === 'string' ? text : '';
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function makeRng(seed) {
    let t = (Number.isFinite(seed) ? seed : 0) >>> 0;
    return () => {
        t += 0x6D2B79F5;
        let x = t;
        x = Math.imul(x ^ (x >>> 15), x | 1);
        x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
}

function buildLegacyStyleInteriorEmissiveCanvas({ size = 256, seed = 0 } = {}) {
    const { c, ctx } = makeCanvas(size, size);
    if (!ctx) return c;

    const w = size;
    const h = size;
    const rng = makeRng(seed);

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    const frame = Math.max(10, Math.round(size * 0.06));
    const x0 = frame;
    const y0 = frame;
    const iw = Math.max(1, w - frame * 2);
    const ih = Math.max(1, h - frame * 2);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, iw, ih);
    ctx.clip();

    paintInteriorPattern(ctx, { x: x0, y: y0, w: iw, h: ih, rng });

    ctx.restore();
    return c;
}

function buildModernInteriorEmissiveCanvas({ width = 256, height = 256, frameWidth = 0.06, seed = 0 } = {}) {
    const w = Math.max(32, Math.round(width));
    const h = Math.max(32, Math.round(height));
    const { c, ctx } = makeCanvas(w, h);
    if (!ctx) return c;

    const rng = makeRng(seed);

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    const fw = Math.max(2, Math.round(Math.min(w, h) * frameWidth));
    const ix = fw;
    const iy = fw;
    const iw = Math.max(1, w - fw * 2);
    const ih = Math.max(1, h - fw * 2);

    ctx.save();
    ctx.beginPath();
    ctx.rect(ix, iy, iw, ih);
    ctx.clip();

    paintInteriorPattern(ctx, { x: ix, y: iy, w: iw, h: ih, rng });

    ctx.restore();
    return c;
}

function buildArchedInteriorEmissiveCanvas({ width = 256, height = 256, frameWidth = 0.06, seed = 0 } = {}) {
    const w = Math.max(64, Math.round(width));
    const h = Math.max(64, Math.round(height));
    const { c, ctx } = makeCanvas(w, h);
    if (!ctx) return c;

    const rng = makeRng(seed);

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    const fw = Math.max(2, Math.round(Math.min(w, h) * frameWidth));
    const outerRadius = (w * 0.5);
    const innerRadius = Math.max(2, outerRadius - fw);
    const innerArchHeight = innerRadius;
    const innerRectHeight = Math.max(0, (h - fw) - innerArchHeight);

    const innerPath = new Path2D();
    innerPath.moveTo(fw, innerArchHeight + fw);
    innerPath.arc(w * 0.5, innerArchHeight + fw, innerRadius, Math.PI, 0, false);
    innerPath.lineTo(w - fw, fw + innerArchHeight + innerRectHeight);
    innerPath.lineTo(fw, fw + innerArchHeight + innerRectHeight);
    innerPath.closePath();

    ctx.save();
    ctx.clip(innerPath);

    const ix = fw;
    const iy = fw;
    const iw = Math.max(1, w - fw * 2);
    const ih = Math.max(1, h - fw * 2);
    paintInteriorPattern(ctx, { x: ix, y: iy, w: iw, h: ih, rng });

    ctx.restore();
    return c;
}

function paintInteriorPattern(ctx, { x, y, w, h, rng }) {
    const baseGrad = ctx.createLinearGradient(0, y, 0, y + h);
    baseGrad.addColorStop(0, 'rgba(255,255,255,0.10)');
    baseGrad.addColorStop(1, 'rgba(255,255,255,0.04)');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(x, y, w, h);

    const patchCount = 2 + Math.floor(rng() * 5);
    for (let i = 0; i < patchCount; i++) {
        const pw = w * (0.18 + rng() * 0.65);
        const ph = h * (0.12 + rng() * 0.65);
        const px = x + rng() * Math.max(1, w - pw);
        const py = y + rng() * Math.max(1, h - ph);
        const brightness = 0.45 + rng() * 0.55;
        ctx.fillStyle = `rgba(255,255,255,${brightness.toFixed(3)})`;
        ctx.fillRect(px, py, pw, ph);
    }

    if (rng() < 0.65) {
        const stripeCount = 3 + Math.floor(rng() * 7);
        const stripeW = Math.max(1, w / Math.max(4, stripeCount * 2));
        ctx.globalAlpha = 0.15 + rng() * 0.18;
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < stripeCount; i++) {
            const sx = x + (i + 0.2 + rng() * 0.4) * (w / stripeCount);
            ctx.fillRect(sx, y, stripeW, h);
        }
        ctx.globalAlpha = 1.0;
    }

    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#ffffff';
    const speckCount = 10 + Math.floor(rng() * 20);
    for (let i = 0; i < speckCount; i++) {
        const px = x + rng() * w;
        const py = y + rng() * h;
        const s = 1 + Math.floor(rng() * 3);
        ctx.fillRect(px, py, s, s);
    }
    ctx.globalAlpha = 1.0;
}
