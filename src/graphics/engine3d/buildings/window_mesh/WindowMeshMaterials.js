// src/graphics/engine3d/buildings/window_mesh/WindowMeshMaterials.js
// Builds materials + procedural textures for the window mesh generator.
// @ts-check

import * as THREE from 'three';
import {
    sanitizeWindowMeshSettings,
    WINDOW_HANDLE_MATERIAL_MODE
} from '../../../../app/buildings/window_mesh/WindowMeshSettings.js';
import { getWindowInteriorAtlasById } from '../../../content3d/catalogs/WindowInteriorAtlasCatalog.js';

const QUANT = 1000;

const _bevelNormalCache = new Map();
let _shadeFabricNoise = null;
const _atlasCache = new Map();

function q(value) {
    return Math.round(Number(value) * QUANT);
}

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function applyTextureColorSpace(tex, { srgb = true } = {}) {
    if (!tex) return;
    if ('colorSpace' in tex) {
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        return;
    }
    if ('encoding' in tex) tex.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
}

function disableIblOnMaterial(mat) {
    if (!mat || !('envMapIntensity' in mat)) return;
    mat.userData = mat.userData ?? {};
    mat.userData.iblNoAutoEnvMapIntensity = true;
    mat.envMapIntensity = 0;
    mat.needsUpdate = true;
}

function makeNoiseTexture({ size = 64, seed = 1 } = {}) {
    const w = Math.max(8, size | 0);
    const h = w;
    const pixels = new Uint8Array(w * h * 4);

    let s = (Number(seed) >>> 0) || 1;
    const rng = () => {
        s ^= (s << 13) >>> 0;
        s ^= (s >>> 17) >>> 0;
        s ^= (s << 5) >>> 0;
        return (s >>> 0) / 0xffffffff;
    };

    for (let i = 0; i < w * h; i++) {
        const v = Math.floor(rng() * 256) & 255;
        const idx = i * 4;
        pixels[idx] = v;
        pixels[idx + 1] = v;
        pixels[idx + 2] = v;
        pixels[idx + 3] = 255;
    }

    const tex = new THREE.DataTexture(pixels, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 8;
    applyTextureColorSpace(tex, { srgb: false });
    tex.needsUpdate = true;
    return tex;
}

function getShadeFabricNoiseTexture() {
    _shadeFabricNoise ??= makeNoiseTexture({ size: 64, seed: 0x1234abcd });
    return _shadeFabricNoise;
}

function makeBevelNormalTexture({ bevelSize = 0.3, roundness = 0.65, size = 128, strength = 2.0 } = {}) {
    const b = clamp(bevelSize, 0.0, 1.0);
    const r = clamp(roundness, 0.0, 1.0);
    const s = Math.max(16, size | 0);
    const pixels = new Uint8Array(s * s * 4);
    const bw = Math.max(1e-6, b * 0.5);

    const heightAt = (u, v) => {
        const d = Math.min(u, 1 - u, v, 1 - v);
        const t = clamp((bw - d) / bw, 0.0, 1.0);
        const sm = t * t * (3 - 2 * t);
        return t * (1 - r) + sm * r;
    };

    for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
            const u = x / (s - 1);
            const v = y / (s - 1);
            const h0 = heightAt(u, v);
            const hX = heightAt(Math.min(1, (x + 1) / (s - 1)), v);
            const hY = heightAt(u, Math.min(1, (y + 1) / (s - 1)));
            const dx = (hX - h0) * strength;
            const dy = (hY - h0) * strength;
            const len = Math.hypot(dx, dy, 1);
            const nx = -dx / len;
            const ny = -dy / len;
            const nz = 1 / len;

            const idx = (y * s + x) * 4;
            pixels[idx] = Math.max(0, Math.min(255, Math.round((nx * 0.5 + 0.5) * 255)));
            pixels[idx + 1] = Math.max(0, Math.min(255, Math.round((ny * 0.5 + 0.5) * 255)));
            pixels[idx + 2] = Math.max(0, Math.min(255, Math.round((nz * 0.5 + 0.5) * 255)));
            pixels[idx + 3] = 255;
        }
    }

    const tex = new THREE.DataTexture(pixels, s, s, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 8;
    applyTextureColorSpace(tex, { srgb: false });
    tex.needsUpdate = true;
    tex.userData = tex.userData ?? {};
    tex.userData.windowBevelNormal = true;
    return tex;
}

function getBevelNormalTexture(bevel) {
    const src = bevel && typeof bevel === 'object' ? bevel : {};
    const b = clamp(src.size, 0.0, 1.0);
    const r = clamp(src.roundness, 0.0, 1.0);
    const key = `bevel|b:${q(b)}|r:${q(r)}`;
    const cached = _bevelNormalCache.get(key);
    if (cached) return cached;
    const tex = makeBevelNormalTexture({ bevelSize: b, roundness: r, size: 128, strength: 2.25 });
    _bevelNormalCache.set(key, tex);
    return tex;
}

function makeProceduralInteriorAtlas({ cols, rows, size = 512 } = {}) {
    const c = document.createElement('canvas');
    c.width = Math.max(64, size | 0);
    c.height = Math.max(64, size | 0);
    const ctx = c.getContext('2d');
    if (!ctx) return c;

    const w = c.width;
    const h = c.height;
    const cellW = w / Math.max(1, cols | 0);
    const cellH = h / Math.max(1, rows | 0);

    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, w, h);

    for (let r = 0; r < rows; r++) {
        for (let col = 0; col < cols; col++) {
            const x0 = col * cellW;
            const y0 = r * cellH;
            const seed = (r * 131 + col * 313) >>> 0;
            const hue = (seed % 360);

            const grad = ctx.createLinearGradient(x0, y0, x0 + cellW, y0 + cellH);
            grad.addColorStop(0, `hsl(${hue}, 35%, 28%)`);
            grad.addColorStop(1, `hsl(${(hue + 40) % 360}, 45%, 16%)`);
            ctx.fillStyle = grad;
            ctx.fillRect(x0, y0, cellW, cellH);

            ctx.save();
            ctx.globalAlpha = 0.24;
            ctx.fillStyle = '#ffffff';
            const stripeW = Math.max(6, Math.floor(cellW / 10));
            for (let i = -cellH; i < cellW + cellH; i += stripeW * 2) {
                ctx.save();
                ctx.translate(x0 + i, y0);
                ctx.rotate(-Math.PI / 6);
                ctx.fillRect(0, 0, stripeW, cellH * 2);
                ctx.restore();
            }
            ctx.restore();

            ctx.save();
            ctx.globalAlpha = 0.18;
            ctx.fillStyle = '#000000';
            ctx.fillRect(x0 + cellW * 0.08, y0 + cellH * 0.12, cellW * 0.84, cellH * 0.18);
            ctx.fillRect(x0 + cellW * 0.08, y0 + cellH * 0.36, cellW * 0.54, cellH * 0.18);
            ctx.fillRect(x0 + cellW * 0.08, y0 + cellH * 0.6, cellW * 0.7, cellH * 0.22);
            ctx.restore();

            ctx.strokeStyle = 'rgba(255,255,255,0.22)';
            ctx.lineWidth = Math.max(1, Math.floor(Math.min(cellW, cellH) * 0.015));
            ctx.strokeRect(x0 + 2, y0 + 2, cellW - 4, cellH - 4);
        }
    }

    return c;
}

function getOrCreateInteriorAtlasTexture({ url, cols, rows } = {}) {
    const safeUrl = typeof url === 'string' ? url.trim() : '';
    const key = safeUrl ? `url|${safeUrl}` : `proc|c:${cols | 0}|r:${rows | 0}`;
    const cached = _atlasCache.get(key) ?? null;
    if (cached?.texture) return cached.texture;

    const placeholderSize = safeUrl ? 1024 : 512;
    const placeholderCanvas = makeProceduralInteriorAtlas({
        cols: Math.max(1, cols | 0),
        rows: Math.max(1, rows | 0),
        size: placeholderSize
    });
    const tex = new THREE.Texture(placeholderCanvas);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 8;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    applyTextureColorSpace(tex, { srgb: true });
    tex.needsUpdate = true;
    tex.userData = tex.userData ?? {};
    tex.userData.windowInteriorAtlas = true;
    // Until the real image is uploaded this texture shows the procedural
    // placeholder; readiness gates must not treat it as a loaded atlas.
    tex.userData.windowInteriorAtlasPending = !!safeUrl;
    tex.userData.windowInteriorAtlasUrl = safeUrl;

    const entry = { texture: tex, promise: null };
    _atlasCache.set(key, entry);

    if (safeUrl && typeof document !== 'undefined') {
        const loader = new THREE.TextureLoader();
        entry.promise = new Promise((resolve) => {
            loader.load(
                safeUrl,
                (loaded) => resolve(loaded),
                undefined,
                () => resolve(null)
            );
        }).then((loaded) => {
            if (!loaded || !loaded.image) {
                tex.userData.windowInteriorAtlasFailed = true;
                tex.userData.windowInteriorAtlasPending = false;
                console.warn(`[WindowMeshMaterials] Interior atlas failed to load, keeping placeholder: ${safeUrl}`);
                return;
            }
            // The placeholder canvas and the real atlas rarely share pixel
            // dimensions, and three.js allocates immutable GPU storage
            // (texStorage2D) the first time a texture Source is uploaded.
            // Mutating tex.image keeps that Source, so a differently sized
            // atlas is silently rejected by the follow-up texSubImage2D and the
            // placeholder stays on screen. Release the placeholder allocation
            // and adopt the loaded Source so the next upload reallocates.
            tex.dispose();
            tex.flipY = loaded.flipY;
            tex.source = loaded.source;
            tex.needsUpdate = true;
            tex.userData.windowInteriorAtlasPending = false;
        });
    }

    return tex;
}

function patchShadeShader(mat) {
    mat.userData = mat.userData ?? {};
    mat.userData.windowShade = true;
    mat.userData.buildingWindowMergeSafeShader = 'window_shade_v4';
    mat.customProgramCacheKey = () => 'window_shade_v4';

    mat.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            `#include <common>
attribute float instanceShadeCoverage;
attribute float instanceShadeFlipX;
attribute vec2 instanceShadeFabricScale;
attribute float instanceShadeFabricIntensity;
attribute float instanceShadeAxis;
attribute vec2 windowShadeUv;
varying float vShadeCoverage;
varying float vShadeFlipX;
varying vec2 vShadeFabricScale;
varying float vShadeFabricIntensity;
varying float vShadeAxis;
varying float vShadeU;
varying float vShadeV;`
        );

        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
vShadeCoverage = instanceShadeCoverage;
vShadeFlipX = instanceShadeFlipX;
vShadeFabricScale = instanceShadeFabricScale;
vShadeFabricIntensity = instanceShadeFabricIntensity;
vShadeAxis = instanceShadeAxis;
vShadeU = windowShadeUv.x;
vShadeV = windowShadeUv.y;`
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            `#include <common>
varying float vShadeCoverage;
varying float vShadeFlipX;
varying vec2 vShadeFabricScale;
varying float vShadeFabricIntensity;
varying float vShadeAxis;
varying float vShadeU;
varying float vShadeV;`
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            `#ifdef USE_MAP
vec2 shadeUv = vMapUv * vShadeFabricScale;
vec4 texelColor = texture2D(map, shadeUv);
float n = texelColor.r * 2.0 - 1.0;
float f = 1.0 + n * vShadeFabricIntensity;
diffuseColor.rgb *= f;
#endif`
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            'vec4 diffuseColor = vec4( diffuse, opacity );',
            `vec4 diffuseColor = vec4( diffuse, opacity );
float cov = clamp(vShadeCoverage, 0.0, 1.0);
if (cov <= 0.001) discard;
float axis = step(0.5, clamp(vShadeAxis, 0.0, 1.0));
float coord = mix(vShadeV, vShadeU, axis);
float flip = step(0.5, vShadeFlipX);
coord = mix(coord, 1.0 - coord, flip);
if (coord > cov) discard;`
        );
    };
}

function patchInteriorShader(mat) {
    mat.userData = mat.userData ?? {};
    mat.userData.windowInterior = true;
    mat.userData.buildingWindowMergeSafeShader = 'window_interior_v7';
    mat.customProgramCacheKey = () => 'window_interior_v7';

	    mat.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            `#include <common>
attribute vec2 instanceInteriorUvOffset;
attribute vec2 instanceInteriorUvScale;
attribute float instanceInteriorFlipX;
attribute vec3 instanceInteriorTint;
attribute vec4 instanceInteriorParams;
attribute vec2 instanceInteriorParallaxScale;
attribute vec2 instanceInteriorUvPan;
attribute vec3 instanceInteriorTanU;
attribute float instanceInteriorLight;
varying vec2 vInteriorUvOffset;
varying vec2 vInteriorUvScale;
varying float vInteriorFlipX;
varying vec3 vInteriorTint;
varying vec4 vInteriorParams;
varying vec2 vInteriorParallaxScale;
varying vec2 vInteriorUvPan;
varying vec3 vInteriorTanU;
varying float vInteriorLight;
`
        );

        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
vInteriorUvOffset = instanceInteriorUvOffset;
vInteriorUvScale = instanceInteriorUvScale;
vInteriorFlipX = instanceInteriorFlipX;
vInteriorTint = instanceInteriorTint;
vInteriorParams = instanceInteriorParams;
vInteriorParallaxScale = instanceInteriorParallaxScale;
vInteriorUvPan = instanceInteriorUvPan;
vec3 interiorTanU = instanceInteriorTanU;
#ifdef USE_INSTANCING
interiorTanU = mat3(instanceMatrix) * interiorTanU;
#endif
vInteriorTanU = normalize(normalMatrix * interiorTanU);
vInteriorLight = instanceInteriorLight;`
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            `#include <common>
varying vec2 vInteriorUvOffset;
varying vec2 vInteriorUvScale;
varying float vInteriorFlipX;
varying vec3 vInteriorTint;
varying vec4 vInteriorParams;
varying vec2 vInteriorParallaxScale;
varying vec2 vInteriorUvPan;
varying vec3 vInteriorTanU;
varying float vInteriorLight;

vec3 rgb2hsv(vec3 c){
    vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c){
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec3 winSrgbToLinear(vec3 c){
    vec3 lo = c / 12.92;
    vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));
    return mix(lo, hi, step(vec3(0.04045), c));
}`
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            `#ifdef USE_MAP
float openingAspect = max(1e-4, vInteriorParams.x);
float imageAspect = max(1e-4, vInteriorParams.y);
float zoom = max(1e-4, vInteriorParams.z);
float rel = openingAspect / imageAspect;
vec2 coverScale = vec2(1.0, 1.0);
coverScale.y = rel > 1.0 ? rel : 1.0;
coverScale.x = rel < 1.0 ? (1.0 / max(1e-4, rel)) : 1.0;
vec2 uvScale = coverScale * zoom;
vec2 uvLocal = (vMapUv - vec2(0.5)) / uvScale + vec2(0.5) + vInteriorUvPan;

vec3 mvNormal = normalize(vNormal);
vec3 mvViewDir = normalize(vViewPosition);
vec3 mvTanU = vInteriorTanU;
mvTanU -= mvNormal * dot(mvNormal, mvTanU);
mvTanU /= max(1e-5, length(mvTanU));
vec3 mvTanV = normalize(cross(mvNormal, mvTanU));
vec3 mvViewTS = vec3(dot(mvViewDir, mvTanU), dot(mvViewDir, mvTanV), dot(mvViewDir, mvNormal));

vec2 parDir = mvViewTS.xy / max(0.35, mvViewTS.z);
	uvLocal -= (parDir / uvScale) * (clamp(vInteriorParams.w, 0.0, 1.0) * max(vec2(0.0), vInteriorParallaxScale));
	uvLocal = clamp(uvLocal, vec2(0.0), vec2(1.0));

float flipX = step(0.5, vInteriorFlipX);
uvLocal.x = mix(uvLocal.x, 1.0 - uvLocal.x, flipX);

vec2 atlasUv = vInteriorUvOffset + uvLocal * vInteriorUvScale;
vec4 texelColor = texture2D(map, atlasUv);
texelColor = vec4(winSrgbToLinear(texelColor.rgb), texelColor.a);

vec3 hsv = rgb2hsv(texelColor.rgb);
hsv.x = fract(hsv.x + vInteriorTint.x);
hsv.y = clamp(hsv.y * vInteriorTint.y, 0.0, 1.0);
hsv.z = clamp(hsv.z * vInteriorTint.z, 0.0, 1.0);
texelColor.rgb = hsv2rgb(hsv);

diffuseColor *= texelColor;
#endif`
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
totalEmissiveRadiance *= clamp(vInteriorLight, 0.0, 1.0);`
        );
    };
}

export function createWindowMeshMaterials(settings, { renderer = null } = {}) {
    const s = sanitizeWindowMeshSettings(settings);
    const frameBevel = s.frame.bevel;
    const frameNormalMap = (frameBevel.size > 0.001) ? getBevelNormalTexture(frameBevel) : null;
    const framePbr = s.frame.material ?? {};
    const frameEnvMapIntensity = Number(framePbr.envMapIntensity) || 0;
    const frameNormalStrength = Number(framePbr.normalStrength) || 0;

    const frameMat = new THREE.MeshStandardMaterial({
        color: s.frame.colorHex,
        roughness: clamp(framePbr.roughness, 0.0, 1.0),
        metalness: clamp(framePbr.metalness, 0.0, 1.0),
        normalMap: frameNormalMap
    });
    if (frameEnvMapIntensity <= 1e-6) disableIblOnMaterial(frameMat);
    else {
        frameMat.userData = frameMat.userData ?? {};
        frameMat.userData.iblEnvMapIntensity = frameEnvMapIntensity;
    }
    if (frameNormalMap && frameMat.normalScale) frameMat.normalScale.set(frameNormalStrength, frameNormalStrength);

    const handleMaterialModeRaw = typeof s?.frame?.handleMaterialMode === 'string'
        ? s.frame.handleMaterialMode.trim().toLowerCase()
        : '';
    const handleMaterialMode = handleMaterialModeRaw === WINDOW_HANDLE_MATERIAL_MODE.METAL
        ? WINDOW_HANDLE_MATERIAL_MODE.METAL
        : WINDOW_HANDLE_MATERIAL_MODE.MATCH;
    // Optional explicit handle color (dark bronze pulls on a light frame);
    // absent (null sentinel — test the RAW value, Number(null) is a finite
    // 0), the mode's own color applies.
    const handleColorHex = Number.isFinite(s?.frame?.handleColorHex)
        ? ((Number(s.frame.handleColorHex) >>> 0) & 0xffffff)
        : null;
    let handlesMat = null;
    if (handleMaterialMode === WINDOW_HANDLE_MATERIAL_MODE.METAL) {
        handlesMat = new THREE.MeshStandardMaterial({
            color: handleColorHex ?? 0xc7ccd4,
            roughness: 0.18,
            metalness: 0.92
        });
        handlesMat.userData = handlesMat.userData ?? {};
        handlesMat.userData.iblEnvMapIntensity = 2.25;
    } else {
        handlesMat = new THREE.MeshStandardMaterial({
            color: handleColorHex ?? s.frame.colorHex,
            roughness: clamp(framePbr.roughness, 0.0, 1.0),
            metalness: clamp(framePbr.metalness, 0.0, 1.0)
        });
        if (frameEnvMapIntensity <= 1e-6) disableIblOnMaterial(handlesMat);
        else {
            handlesMat.userData = handlesMat.userData ?? {};
            handlesMat.userData.iblEnvMapIntensity = frameEnvMapIntensity;
        }
    }

    let muntinMat = frameMat;
    if (s.muntins.enabled) {
        const colorHex = s.muntins.colorHex === null ? s.frame.colorHex : s.muntins.colorHex;
        const bevel = s.muntins.bevel.inherit ? frameBevel : s.muntins.bevel.bevel;
        const normalMap = (bevel.size > 0.001) ? getBevelNormalTexture(bevel) : null;
        const muntinPbr = s.muntins.material?.inheritFromFrame ? framePbr : (s.muntins.material?.pbr ?? {});
        const muntinRoughness = clamp(muntinPbr.roughness, 0.0, 1.0);
        const muntinMetalness = clamp(muntinPbr.metalness, 0.0, 1.0);
        const muntinEnvMapIntensity = Number(muntinPbr.envMapIntensity) || 0;
        const muntinNormalStrength = Number(muntinPbr.normalStrength) || 0;

        const wantsOwnMat = (
            colorHex !== s.frame.colorHex
            || normalMap !== frameNormalMap
            || Math.abs(muntinRoughness - clamp(framePbr.roughness, 0.0, 1.0)) > 1e-6
            || Math.abs(muntinMetalness - clamp(framePbr.metalness, 0.0, 1.0)) > 1e-6
            || Math.abs(muntinEnvMapIntensity - frameEnvMapIntensity) > 1e-6
            || Math.abs(muntinNormalStrength - frameNormalStrength) > 1e-6
        );

        if (wantsOwnMat) {
            muntinMat = new THREE.MeshStandardMaterial({
                color: colorHex,
                roughness: muntinRoughness,
                metalness: muntinMetalness,
                normalMap
            });
            if (muntinEnvMapIntensity <= 1e-6) disableIblOnMaterial(muntinMat);
            else {
                muntinMat.userData = muntinMat.userData ?? {};
                muntinMat.userData.iblEnvMapIntensity = muntinEnvMapIntensity;
            }
            if (normalMap && muntinMat.normalScale) muntinMat.normalScale.set(muntinNormalStrength, muntinNormalStrength);
        }
    }

    const glassRefl = s.glass.reflection;
    const glassMat = new THREE.MeshPhysicalMaterial({
        color: s.glass.tintHex,
        metalness: glassRefl.metalness,
        roughness: glassRefl.roughness,
        transmission: glassRefl.transmission,
        ior: glassRefl.ior,
        thickness: 0.01,
        opacity: s.glass.opacity,
        transparent: true
    });
    glassMat.depthWrite = false;
    glassMat.shadowSide = THREE.DoubleSide;
    glassMat.polygonOffset = true;
    glassMat.polygonOffsetFactor = -1;
    glassMat.polygonOffsetUnits = -1;
    glassMat.userData = glassMat.userData ?? {};
    glassMat.userData.iblEnvMapIntensityScale = glassRefl.envMapIntensity;
    glassMat.userData.windowGlass = true;

    const shadeMat = new THREE.MeshStandardMaterial({
        color: s.shade.colorHex,
        roughness: 0.92,
        metalness: 0.0,
        map: getShadeFabricNoiseTexture()
    });
    disableIblOnMaterial(shadeMat);
    shadeMat.side = THREE.DoubleSide;
    patchShadeShader(shadeMat);
    shadeMat.needsUpdate = true;

    const atlasTex = getOrCreateInteriorAtlasTexture({
        url: getWindowInteriorAtlasById(s.interior.atlasId)?.url ?? '',
        cols: s.interior.atlas.cols,
        rows: s.interior.atlas.rows
    });

    const interiorMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: atlasTex,
        roughness: 1.0,
        metalness: 0.0,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: s.interior.emissiveIntensity
    });
    disableIblOnMaterial(interiorMat);
    interiorMat.side = THREE.DoubleSide;
    patchInteriorShader(interiorMat);
    interiorMat.needsUpdate = true;

    return {
        frameMat,
        handlesMat,
        muntinMat,
        glassMat,
        shadeMat,
        interiorMat
    };
}

export function disposeWindowMeshMaterialCaches() {
    for (const tex of _bevelNormalCache.values()) tex?.dispose?.();
    _bevelNormalCache.clear();
    _shadeFabricNoise?.dispose?.();
    _shadeFabricNoise = null;
    for (const entry of _atlasCache.values()) entry?.texture?.dispose?.();
    _atlasCache.clear();
}
