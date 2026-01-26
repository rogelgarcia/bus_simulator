// src/graphics/gui/atmosphere_debugger/AtmosphereDebuggerHdri.js
// HDR loader + sun direction estimator for the Atmosphere Debug tool.

import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

const GIT_LFS_POINTER_PREFIX = 'version https://git-lfs.github.com/spec/v1';

function applyHdrColorSpace(tex) {
    if (!tex) return;
    if ('colorSpace' in tex) {
        tex.colorSpace = THREE.LinearSRGBColorSpace ?? THREE.NoColorSpace;
        return;
    }
    if ('encoding' in tex) tex.encoding = THREE.LinearEncoding;
}

function createDataTextureFromParsed(parsed) {
    const width = Number(parsed?.width) || 0;
    const height = Number(parsed?.height) || 0;
    const data = parsed?.data ?? null;
    if (!(width > 0) || !(height > 0) || !data) {
        throw new Error('[AtmosphereDebuggerHdri] Failed to parse HDR buffer');
    }

    const type = parsed?.type ?? THREE.HalfFloatType ?? THREE.UnsignedByteType;
    const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, type);
    tex.flipY = true;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
}

function decodeAsciiPrefix(buffer, maxBytes = 96) {
    if (!buffer) return '';
    const len = Math.min(Math.max(0, Number(maxBytes) || 0), buffer.byteLength || 0);
    if (len <= 0) return '';
    const view = new Uint8Array(buffer, 0, len);
    if (typeof TextDecoder !== 'undefined') {
        try {
            return new TextDecoder('utf-8', { fatal: false }).decode(view);
        } catch {}
    }
    let out = '';
    for (let i = 0; i < view.length; i++) out += String.fromCharCode(view[i]);
    return out;
}

function isGitLfsPointerBuffer(buffer) {
    const prefix = decodeAsciiPrefix(buffer, 96);
    if (!prefix) return false;
    if (prefix.startsWith(GIT_LFS_POINTER_PREFIX)) return true;
    return prefix.includes('oid sha256:') && prefix.includes('git-lfs.github.com/spec/v1');
}

async function fetchArrayBuffer(url) {
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status} loading ${url}`);
    return res.arrayBuffer();
}

function halfFloatToFloat(value) {
    const v = value & 0xffff;
    const sign = (v & 0x8000) ? -1 : 1;
    const exp = (v >> 10) & 0x1f;
    const frac = v & 0x03ff;

    if (exp === 0) {
        if (frac === 0) return sign * 0;
        return sign * Math.pow(2, -14) * (frac / 1024);
    }
    if (exp === 31) return frac ? NaN : sign * Infinity;
    return sign * Math.pow(2, exp - 15) * (1 + frac / 1024);
}

function readLinearRgb(data, idx, { halfFloat = false } = {}) {
    if (!data || idx < 0) return { r: 0, g: 0, b: 0 };
    if (!halfFloat) {
        const r = Number(data[idx]) || 0;
        const g = Number(data[idx + 1]) || 0;
        const b = Number(data[idx + 2]) || 0;
        return { r, g, b };
    }
    const r = halfFloatToFloat(data[idx] ?? 0);
    const g = halfFloatToFloat(data[idx + 1] ?? 0);
    const b = halfFloatToFloat(data[idx + 2] ?? 0);
    return { r, g, b };
}

function estimateSunDirectionFromHdrTexture(hdrTexture) {
    const img = hdrTexture?.image ?? null;
    const width = Number(img?.width) || 0;
    const height = Number(img?.height) || 0;
    const data = img?.data ?? null;
    if (!(width > 0) || !(height > 0) || !data) return new THREE.Vector3(1, 1, 1).normalize();

    const isHalfFloat = data instanceof Uint16Array;
    const stepX = Math.max(1, Math.floor(width / 256));
    const stepY = Math.max(1, Math.floor(height / 128));

    let bestLum = -Infinity;
    let bestX = 0;
    let bestY = 0;

    for (let y = 0; y < height; y += stepY) {
        for (let x = 0; x < width; x += stepX) {
            const idx = (y * width + x) * 4;
            const { r, g, b } = readLinearRgb(data, idx, { halfFloat: isHalfFloat });
            const lum = r * 0.2126 + g * 0.7152 + b * 0.0722;
            if (lum > bestLum) {
                bestLum = lum;
                bestX = x;
                bestY = y;
            }
        }
    }

    const u = (bestX + 0.5) / width;
    const v = (bestY + 0.5) / height;

    const phi = (u - 0.5) * Math.PI * 2;
    const theta = v * Math.PI;

    const sinTheta = Math.sin(theta);
    return new THREE.Vector3(
        Math.cos(phi) * sinTheta,
        Math.cos(theta),
        Math.sin(phi) * sinTheta
    ).normalize();
}

export async function loadHdriEnvironment(renderer, hdrUrl) {
    if (!renderer) throw new Error('[AtmosphereDebuggerHdri] Missing renderer');
    const url = typeof hdrUrl === 'string' ? hdrUrl : '';
    if (!url) throw new Error('[AtmosphereDebuggerHdri] Missing hdrUrl');

    const buffer = await fetchArrayBuffer(url);
    if (isGitLfsPointerBuffer(buffer)) {
        throw new Error(`HDRI at ${url} is a Git LFS pointer. Run git lfs pull to download assets.`);
    }

    const loader = new RGBELoader();
    if (THREE.HalfFloatType) loader.setDataType(THREE.HalfFloatType);
    const parsed = loader.parse(buffer);
    const hdr = parsed?.isTexture ? parsed : createDataTextureFromParsed(parsed);
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    applyHdrColorSpace(hdr);
    hdr.needsUpdate = true;

    const sunDirection = estimateSunDirectionFromHdrTexture(hdr);

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader?.();
    const envMap = pmrem.fromEquirectangular(hdr).texture;
    pmrem.dispose();
    applyHdrColorSpace(envMap);

    return { hdrTexture: hdr, envMap, sunDirection };
}
