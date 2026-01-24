// src/graphics/visuals/postprocessing/ColorGradingCubeLutLoader.js
// Loads .cube 3D LUT files into THREE.Data3DTexture (WebGL2 required).
// @ts-check

import * as THREE from 'three';

const LUT_CACHE = new Map();
const LUT_PROMISES = new Map();

function clamp01(x) {
    return Math.max(0, Math.min(1, x));
}

function toByte(x) {
    return Math.max(0, Math.min(255, Math.round(clamp01(x) * 255)));
}

function parseCubeText(text) {
    const src = typeof text === 'string' ? text : '';
    const lines = src.split(/\r?\n/);
    let size = 0;
    const triples = [];

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        if (line.startsWith('#')) continue;
        const parts = line.split(/\s+/);
        const head = parts[0]?.toUpperCase?.() ?? '';
        if (head === 'TITLE') continue;
        if (head === 'DOMAIN_MIN' || head === 'DOMAIN_MAX') continue;
        if (head === 'LUT_3D_SIZE') {
            const n = Number.parseInt(parts[1] ?? '', 10);
            if (Number.isFinite(n) && n > 1) size = n;
            continue;
        }
        if (parts.length < 3) continue;

        const r = Number(parts[0]);
        const g = Number(parts[1]);
        const b = Number(parts[2]);
        if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) continue;
        triples.push([r, g, b]);
    }

    if (!(size > 1)) throw new Error('[ColorGrading] Invalid or missing LUT_3D_SIZE');
    const expected = size * size * size;
    if (triples.length !== expected) {
        throw new Error(`[ColorGrading] LUT data size mismatch: expected ${expected} triples, got ${triples.length}`);
    }

    const data = new Uint8Array(expected * 4);
    for (let i = 0; i < expected; i++) {
        const t = triples[i];
        const base = i * 4;
        data[base + 0] = toByte(t[0]);
        data[base + 1] = toByte(t[1]);
        data[base + 2] = toByte(t[2]);
        data[base + 3] = 255;
    }

    return { size, data };
}

export function is3dLutSupported(renderer) {
    const r = renderer && typeof renderer === 'object' ? renderer : null;
    return !!r?.capabilities?.isWebGL2;
}

export async function loadCubeLut3DTexture(cubeUrl, { signal = null } = {}) {
    const url = typeof cubeUrl === 'string' ? cubeUrl : '';
    if (!url) throw new Error('[ColorGrading] LUT url is required');

    const cached = LUT_CACHE.get(url) ?? null;
    if (cached) return cached;

    const existing = LUT_PROMISES.get(url) ?? null;
    if (existing) return existing;

    const promise = (async () => {
        const res = await fetch(url, { signal: signal ?? undefined });
        if (!res.ok) throw new Error(`[ColorGrading] Failed to fetch LUT (${res.status}): ${url}`);
        const text = await res.text();
        const parsed = parseCubeText(text);
        const tex = new THREE.Data3DTexture(parsed.data, parsed.size, parsed.size, parsed.size);
        tex.format = THREE.RGBAFormat;
        tex.type = THREE.UnsignedByteType;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.wrapR = THREE.ClampToEdgeWrapping;
        tex.generateMipmaps = false;
        tex.needsUpdate = true;
        LUT_CACHE.set(url, tex);
        return tex;
    })().finally(() => {
        LUT_PROMISES.delete(url);
    });

    LUT_PROMISES.set(url, promise);
    return promise;
}

