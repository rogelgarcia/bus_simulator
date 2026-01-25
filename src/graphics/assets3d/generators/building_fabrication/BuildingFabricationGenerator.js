// src/graphics/assets3d/generators/building_fabrication/BuildingFabricationGenerator.js
// Generates building fabrication meshes from layer definitions.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

import { ROOF_COLOR, resolveRoofColorHex } from '../../../../app/buildings/RoofColor.js';
import { resolveBeltCourseColorHex } from '../../../../app/buildings/BeltCourseColor.js';
import { BUILDING_STYLE } from '../../../../app/buildings/BuildingStyle.js';
import { WINDOW_TYPE, getDefaultWindowParams, getWindowGlassMaskTexture, getWindowTexture, isWindowTypeId } from '../buildings/WindowTextureGenerator.js';
import { computeBuildingLoopsFromTiles, offsetOrthogonalLoopXZ, resolveBuildingStyleWallMaterialUrls } from '../buildings/BuildingGenerator.js';
import { LAYER_TYPE, normalizeBuildingLayers } from './BuildingFabricationTypes.js';
import { applyMaterialVariationToMeshStandardMaterial, computeMaterialVariationSeedFromTiles, MATERIAL_VARIATION_ROOT } from '../../materials/MaterialVariationSystem.js';
import { applyUvTilingToMeshStandardMaterial } from '../../materials/MaterialUvTilingSystem.js';
import { getPbrMaterialTileMeters, isPbrMaterialId, tryGetPbrMaterialIdFromUrl } from '../../materials/PbrMaterialCatalog.js';

const EPS = 1e-6;
const QUANT = 1000;

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function clampInt(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    const rounded = Math.round(num);
    return Math.max(min, Math.min(max, rounded));
}

function q(value) {
    return Math.round(Number(value) * QUANT);
}

function disableIblOnMaterial(mat) {
    if (!mat || !('envMapIntensity' in mat)) return;
    mat.userData = mat.userData ?? {};
    mat.userData.iblNoAutoEnvMapIntensity = true;
    mat.envMapIntensity = 0;
    mat.needsUpdate = true;
}

function hashUint32(x) {
    let v = (Number.isFinite(x) ? x : 0) >>> 0;
    v ^= v >>> 16;
    v = Math.imul(v, 0x7feb352d);
    v ^= v >>> 15;
    v = Math.imul(v, 0x846ca68b);
    v ^= v >>> 16;
    return v >>> 0;
}

function resolvePbrTileMetersFromUrls(urls, styleId) {
    const direct = typeof styleId === 'string' ? styleId : '';
    const pbrId = isPbrMaterialId(direct) ? direct : tryGetPbrMaterialIdFromUrl(urls?.baseColorUrl ?? null);
    if (!pbrId) return 1.0;
    const tileMeters = getPbrMaterialTileMeters(pbrId);
    const t = Number(tileMeters);
    return (Number.isFinite(t) && t > EPS) ? t : 1.0;
}

function signedArea(points) {
    let sum = 0;
    const n = points.length;
    if (n < 3) return 0;
    for (let i = 0; i < n; i++) {
        const a = points[i];
        const b = points[(i + 1) % n];
        sum += a.x * b.z - b.x * a.z;
    }
    return sum * 0.5;
}

function splitLoops(loops) {
    const list = Array.isArray(loops) ? loops : [];
    const outer = [];
    const holes = [];
    for (const loop of list) {
        if (!loop || loop.length < 3) continue;
        if (signedArea(loop) >= 0) outer.push(loop);
        else holes.push(loop);
    }
    return { outer, holes };
}

function computeBuildingBaseAndSidewalk({ generatorConfig, floorHeight }) {
    const roadCfg = generatorConfig?.road ?? {};
    const baseRoadY = Number.isFinite(roadCfg.surfaceY) ? roadCfg.surfaceY : 0;
    const curbHeight = Number.isFinite(roadCfg?.curb?.height) ? roadCfg.curb.height : 0;
    const curbExtra = Number.isFinite(roadCfg?.curb?.extraHeight) ? roadCfg.curb.extraHeight : 0;
    const sidewalkLift = Number.isFinite(roadCfg?.sidewalk?.lift) ? roadCfg.sidewalk.lift : 0;
    const sidewalkWidth = Number.isFinite(roadCfg?.sidewalk?.extraWidth) ? roadCfg.sidewalk.extraWidth : 0;
    const hasSidewalk = sidewalkWidth > EPS;

    const groundY = generatorConfig?.ground?.surfaceY ?? baseRoadY;
    const sidewalkSurfaceY = hasSidewalk ? (baseRoadY + curbHeight + curbExtra + sidewalkLift) : null;
    const baseSurfaceY = (hasSidewalk && Number.isFinite(sidewalkSurfaceY)) ? sidewalkSurfaceY : groundY;
    const baseY = (Number(baseSurfaceY) || 0) + 0.01;

    const extraFirstFloor = (hasSidewalk && Number.isFinite(sidewalkSurfaceY) && Number.isFinite(groundY))
        ? Math.max(0, sidewalkSurfaceY - groundY)
        : 0;

    const fh = clamp(floorHeight, 1.0, 12.0);
    const extra = clamp(extraFirstFloor, 0, Math.max(0, fh * 2));

    const planBase = (hasSidewalk && Number.isFinite(sidewalkSurfaceY))
        ? sidewalkSurfaceY
        : (Number.isFinite(baseRoadY) ? baseRoadY : (Number.isFinite(groundY) ? groundY : 0));
    const planY = planBase + 0.07;

    return { baseY, extraFirstFloor: extra, planY };
}

function normalize2(v) {
    const len = Math.hypot(v.x, v.z);
    if (!(len > EPS)) return { x: 0, z: 0, len: 0 };
    return { x: v.x / len, z: v.z / len, len };
}

function cross2(a, b) {
    return a.x * b.z - a.z * b.x;
}

function dot2(a, b) {
    return a.x * b.x + a.z * b.z;
}

function buildExteriorRunsFromLoop(loop) {
    const pts = Array.isArray(loop) ? loop : [];
    const n = pts.length;
    if (n < 2) return [];

    const runs = [];
    const collinear = (a, b) => Math.abs(cross2(a, b)) < 1e-6 && dot2(a, b) > 0.999;

    for (let i = 0; i < n; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        if (!a || !b) continue;
        const v = normalize2({ x: b.x - a.x, z: b.z - a.z });
        const L = v.len;
        if (!(L > EPS)) continue;

        const last = runs[runs.length - 1] ?? null;
        if (last && collinear(last.dir, v)) {
            last.b = b;
            last.length += L;
            continue;
        }

        runs.push({
            a,
            b,
            dir: { x: v.x, z: v.z },
            length: L
        });
    }

    if (runs.length > 1) {
        const first = runs[0];
        const last = runs[runs.length - 1];
        if (first && last && collinear(first.dir, last.dir)) {
            first.a = last.a;
            first.length += last.length;
            runs.pop();
        }
    }

    return runs;
}

function computeEvenWindowLayoutMinGap({
    length,
    windowWidth,
    minGap
} = {}) {
    const L = Number(length);
    const w = clamp(windowWidth, 0.2, 50);
    const g = clamp(minGap, 0, 50);
    if (!Number.isFinite(L) || !(L > 0) || !(w > 0)) return { count: 0, gap: 0, starts: [] };

    let count = Math.floor((L - g) / (w + g));
    if (!Number.isFinite(count) || count < 0) count = 0;
    if (count === 0) return { count: 0, gap: 0, starts: [] };

    const gap = (L - count * w) / (count + 1);
    if (!(gap >= g - 1e-6)) return { count: 0, gap: 0, starts: [] };

    const starts = [];
    for (let i = 0; i < count; i++) starts.push(gap + i * (w + gap));
    return { count, gap, starts };
}

function computeWindowSegmentsWithSpacers({
    length,
    windowWidth,
    desiredGap,
    cornerEps,
    spacerEnabled,
    spacerEvery,
    spacerWidth
} = {}) {
    const L = Number(length);
    const w = clamp(windowWidth, 0.2, 50);
    const desired = clamp(desiredGap, 0, 50);
    const eps = clamp(cornerEps, 0.001, 2.0);
    const minGap = Math.max(desired, eps);
    const enabled = !!spacerEnabled && clampInt(spacerEvery, 0, 9999) > 0 && (Number(spacerWidth) || 0) > EPS;
    const band = enabled ? clamp(spacerWidth, 0.01, 10.0) : 0;
    const N = enabled ? clampInt(spacerEvery, 1, 9999) : 0;

    if (!enabled) {
        return {
            segments: [{
                offset: 0,
                layout: computeEvenWindowLayoutMinGap({ length: L, windowWidth: w, minGap })
            }],
            spacerCenters: []
        };
    }

    let layout = computeEvenWindowLayoutMinGap({ length: L, windowWidth: w, minGap });
    let count = clampInt(layout.count, 0, 9999);
    if (count === 0) return { segments: [{ offset: 0, layout }], spacerCenters: [] };

    let spacerCount = 0;
    let effectiveLength = L;

    for (let i = 0; i < 16; i++) {
        spacerCount = Math.floor(Math.max(0, count - 1) / N);
        effectiveLength = L - spacerCount * band;
        if (!(effectiveLength > w + minGap * 2)) {
            count = 0;
            layout = { count: 0, gap: 0, starts: [] };
            break;
        }

        const nextLayout = computeEvenWindowLayoutMinGap({ length: effectiveLength, windowWidth: w, minGap });
        const nextCount = clampInt(nextLayout.count, 0, 9999);
        layout = nextLayout;
        if (nextCount === count) break;
        count = nextCount;
    }

    spacerCount = count > N ? Math.floor(Math.max(0, count - 1) / N) : 0;

    const segments = [];
    for (let group = 0; group * N < count; group++) {
        const startIndex = group * N;
        const endIndex = Math.min(count, (group + 1) * N);
        segments.push({
            offset: group * band,
            layout: { starts: layout.starts.slice(startIndex, endIndex) }
        });
    }

    const spacerCenters = [];
    for (let k = 1; k <= spacerCount; k++) {
        const leftIndex = k * N - 1;
        const rightIndex = k * N;
        if (leftIndex < 0 || rightIndex >= count) break;
        const leftEndEff = layout.starts[leftIndex] + w;
        const rightStartEff = layout.starts[rightIndex];
        const leftEnd = leftEndEff + (k - 1) * band;
        const rightStart = rightStartEff + k * band;
        spacerCenters.push((leftEnd + rightStart) * 0.5);
    }

    return { segments, spacerCenters };
}

function getRendererResolution(renderer, out = new THREE.Vector2()) {
    if (!renderer?.getSize) return null;
    renderer.getSize(out);
    return out;
}

function createLineMaterial({ renderer, color, linewidth, opacity, renderOrder }) {
    const mat = new LineMaterial({
        color,
        linewidth,
        worldUnits: false,
        transparent: true,
        opacity,
        depthTest: false,
        depthWrite: false
    });

    const res = getRendererResolution(renderer);
    if (res) mat.resolution.set(res.x, res.y);

    mat.userData = mat.userData ?? {};
    if (Number.isFinite(renderOrder)) mat.userData.renderOrder = renderOrder;
    return mat;
}

function makeDeterministicColor(seed) {
    const s = Math.sin(seed * 999.123) * 43758.5453;
    const r = s - Math.floor(s);
    const color = new THREE.Color();
    color.setHSL(r, 0.55, 0.58);
    return color;
}

function collectGeometryVertexIndicesForMaterialIndex(geometry, materialIndex) {
    const geo = geometry ?? null;
    const groups = Array.isArray(geo?.groups) ? geo.groups : [];
    if (!groups.length) return null;

    const target = Number.isFinite(materialIndex) ? Number(materialIndex) : 0;
    const out = new Set();
    const index = geo.index ?? null;

    for (const group of groups) {
        if (!group) continue;
        const idx = Number(group.materialIndex) || 0;
        if (idx !== target) continue;
        const start = Math.max(0, Number(group.start) || 0);
        const count = Math.max(0, Number(group.count) || 0);
        if (!count) continue;

        if (index?.getX) {
            for (let i = start; i < start + count; i++) out.add(index.getX(i));
            continue;
        }

        for (let i = start; i < start + count; i++) out.add(i);
    }

    return out.size ? Array.from(out) : null;
}

function applyUvYContinuityOffsetToGeometry(geometry, { yOffset = 0.0, materialIndex = 1 } = {}) {
    const geo = geometry ?? null;
    const uv = geo?.getAttribute?.('uv') ?? null;
    const pos = geo?.getAttribute?.('position') ?? null;
    if (!uv?.getY || !uv?.setY || !pos?.getY) return;

    const dy = Number(yOffset) || 0.0;
    if (Math.abs(dy) < 1e-9) return;

    const vertexIndices = collectGeometryVertexIndicesForMaterialIndex(geo, materialIndex);
    if (!vertexIndices?.length) return;

    let n = 0;
    let sumY = 0;
    let sumV = 0;
    let sumYV = 0;
    const step = Math.max(1, Math.floor(vertexIndices.length / 128));
    for (let i = 0; i < vertexIndices.length; i += step) {
        const vi = vertexIndices[i];
        const y = pos.getY(vi);
        const v = uv.getY(vi);
        if (!Number.isFinite(y) || !Number.isFinite(v)) continue;
        n += 1;
        sumY += y;
        sumV += v;
        sumYV += y * v;
    }
    if (!n) return;

    const meanY = sumY / n;
    const meanV = sumV / n;
    const cov = sumYV / n - meanY * meanV;
    const dir = cov >= 0 ? 1 : -1;
    const delta = dir * dy;

    for (const vi of vertexIndices) {
        const v = uv.getY(vi);
        if (!Number.isFinite(v)) continue;
        uv.setY(vi, v + delta);
    }
    uv.needsUpdate = true;
}

function collectLoopCornerPointsXZ(loop) {
    const pts = Array.isArray(loop) ? loop : [];
    const n = pts.length;
    if (n < 3) return [];

    const corners = [];
    for (let i = 0; i < n; i++) {
        const prev = pts[(i + n - 1) % n];
        const curr = pts[i];
        const next = pts[(i + 1) % n];
        if (!prev || !curr || !next) continue;

        const a = normalize2({ x: curr.x - prev.x, z: curr.z - prev.z });
        const b = normalize2({ x: next.x - curr.x, z: next.z - curr.z });
        if (!(a.len > EPS) || !(b.len > EPS)) continue;

        const dot = Math.abs(a.x * b.x + a.z * b.z);
        if (dot > 0.999) continue;
        corners.push({ x: curr.x, z: curr.z });
    }

    return corners;
}

function applyMatVarCornerDistanceToGeometry(geometry, { loops } = {}) {
    const geo = geometry ?? null;
    const pos = geo?.getAttribute?.('position') ?? null;
    if (!pos?.count || !pos.getX || !pos.getZ) return;

    const srcLoops = Array.isArray(loops) ? loops : [];
    const corners = [];
    for (const loop of srcLoops) corners.push(...collectLoopCornerPointsXZ(loop));
    if (!corners.length) return;

    const data = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        let best = Infinity;
        for (const c of corners) {
            const d = Math.hypot(x - c.x, z - c.z);
            if (d < best) best = d;
        }
        data[i] = Number.isFinite(best) ? best : 0.0;
    }
    geo.setAttribute('matVarCornerDist', new THREE.Float32BufferAttribute(data, 1));
}

function estimateFabricationHeightMax({ baseY, extraFirstFloor, layers } = {}) {
    const safeLayers = Array.isArray(layers) ? layers : [];
    let yCursor = Number.isFinite(baseY) ? Number(baseY) : 0;
    let firstExtra = Number.isFinite(extraFirstFloor) ? Math.max(0, Number(extraFirstFloor)) : 0;

    for (let layerIndex = 0; layerIndex < safeLayers.length; layerIndex++) {
        const layer = safeLayers[layerIndex];
        const type = layer?.type;

        if (type === LAYER_TYPE.FLOOR) {
            const floors = clampInt(layer?.floors, 0, 99);
            const floorHeight = clamp(layer?.floorHeight, 1.0, 12.0);

            const beltCfg = layer?.belt ?? {};
            const beltEnabled = !!beltCfg.enabled;
            const beltHeight = beltEnabled ? clamp(beltCfg.height, 0.02, 1.2) : 0.0;

            for (let floor = 0; floor < floors; floor++) {
                const segHeight = floorHeight + (floor === 0 ? firstExtra : 0);
                if (floor === 0) firstExtra = 0;
                yCursor += segHeight;
                if (beltEnabled && beltHeight > EPS) yCursor += beltHeight;
            }
            continue;
        }

        if (type === LAYER_TYPE.ROOF) {
            const ring = layer?.ring ?? {};
            const ringEnabled = !!ring.enabled;
            const ringHeight = ringEnabled ? clamp(ring.height, 0.02, 2.0) : 0.0;

            const nextLayer = safeLayers[layerIndex + 1] ?? null;
            const hasFloorsAboveRoof = nextLayer?.type === LAYER_TYPE.FLOOR;
            if (!hasFloorsAboveRoof) yCursor += ringHeight;
        }
    }

    return yCursor;
}

function makeWallMaterial({ style, baseColorHex, textureCache }) {
    const styleId = typeof style === 'string' && style ? style : BUILDING_STYLE.DEFAULT;
    const urls = resolveBuildingStyleWallMaterialUrls(styleId);
    const url = urls?.baseColorUrl ?? null;
    const normalUrl = urls?.normalUrl ?? null;
    const ormUrl = urls?.ormUrl ?? null;
    const mat = new THREE.MeshStandardMaterial({
        color: baseColorHex,
        roughness: 0.85,
        metalness: 0.05
    });

    if (url && textureCache) {
        mat.color.setHex(0xffffff);
        const tex = textureCache.trackMaterial(url, mat, { slot: 'map', srgb: true });
        if (tex) mat.map = tex;
    }

    if (normalUrl && textureCache) {
        const tex = textureCache.trackMaterial(normalUrl, mat, { slot: 'normalMap', srgb: false });
        if (tex) mat.normalMap = tex;
        mat.normalScale.set(0.9, 0.9);
    }

    if (ormUrl && textureCache) {
        const rough = textureCache.trackMaterial(ormUrl, mat, { slot: 'roughnessMap', srgb: false });
        if (rough) mat.roughnessMap = rough;
        mat.roughness = 1.0;
        mat.metalness = 0.0;
    }

    disableIblOnMaterial(mat);
    return mat;
}

function makeTextureMaterialFromBuildingStyle({
    style,
    baseColorHex,
    textureCache,
    roughness = 0.9,
    metalness = 0.0,
    polygonOffset = false,
    polygonOffsetFactor = 0,
    polygonOffsetUnits = 0
} = {}) {
    const styleId = typeof style === 'string' && style ? style : BUILDING_STYLE.DEFAULT;
    const urls = resolveBuildingStyleWallMaterialUrls(styleId);
    const url = urls?.baseColorUrl ?? null;
    const normalUrl = urls?.normalUrl ?? null;
    const ormUrl = urls?.ormUrl ?? null;
    const mat = new THREE.MeshStandardMaterial({
        color: baseColorHex,
        roughness,
        metalness,
        polygonOffset: !!polygonOffset,
        polygonOffsetFactor,
        polygonOffsetUnits
    });

    if (url && textureCache) {
        mat.color.setHex(0xffffff);
        const tex = textureCache.trackMaterial(url, mat, { slot: 'map', srgb: true });
        if (tex) mat.map = tex;
    }

    if (normalUrl && textureCache) {
        const tex = textureCache.trackMaterial(normalUrl, mat, { slot: 'normalMap', srgb: false });
        if (tex) mat.normalMap = tex;
        mat.normalScale.set(0.9, 0.9);
    }

    if (ormUrl && textureCache) {
        const tex = textureCache.trackMaterial(ormUrl, mat, { slot: 'roughnessMap', srgb: false });
        if (tex) mat.roughnessMap = tex;
    }

    disableIblOnMaterial(mat);
    return mat;
}

function makeWallMaterialFromSpec({ material, baseColorHex, textureCache }) {
    if (material?.kind === 'color') {
        const mat = new THREE.MeshStandardMaterial({
            color: resolveBeltCourseColorHex(material.id),
            roughness: 0.85,
            metalness: 0.05
        });
        disableIblOnMaterial(mat);
        return mat;
    }

    const style = material?.kind === 'texture' ? material.id : BUILDING_STYLE.DEFAULT;
    return makeWallMaterial({ style, baseColorHex, textureCache });
}

function makeBeltLikeMaterialFromSpec({ material, baseColorHex, textureCache }) {
    if (material?.kind === 'texture') {
        return makeTextureMaterialFromBuildingStyle({
            style: material.id,
            baseColorHex,
            textureCache,
            roughness: 0.9,
            metalness: 0.0
        });
    }

    const mat = new THREE.MeshStandardMaterial({
        color: resolveBeltCourseColorHex(material?.id),
        roughness: 0.9,
        metalness: 0.0
    });
    disableIblOnMaterial(mat);
    return mat;
}

function makeRoofSurfaceMaterialFromSpec({ material, baseColorHex, textureCache }) {
    if (material?.kind === 'texture') {
        return makeTextureMaterialFromBuildingStyle({
            style: material.id,
            baseColorHex,
            textureCache,
            roughness: 0.85,
            metalness: 0.05,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2
        });
    }

    const mat = new THREE.MeshStandardMaterial({
        color: resolveRoofColorHex(material?.id, baseColorHex),
        roughness: 0.85,
        metalness: 0.05,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
    });
    disableIblOnMaterial(mat);
    return mat;
}

function makeWindowMaterial({ typeId, params, windowWidth, windowHeight, fakeDepth } = {}) {
    const safeTypeId = isWindowTypeId(typeId) ? typeId : WINDOW_TYPE.STYLE_DEFAULT;
    const safeParams = { ...getDefaultWindowParams(safeTypeId), ...(params ?? {}) };
    const wantsAlpha = safeTypeId === WINDOW_TYPE.ARCH_V1;
    const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: getWindowTexture({ typeId: safeTypeId, params: safeParams, windowWidth, windowHeight }),
        roughness: 0.4,
        metalness: 0.0,
        emissive: new THREE.Color(0x0b1f34),
        emissiveIntensity: 0.35,
        transparent: wantsAlpha,
        alphaTest: wantsAlpha ? 0.01 : 0.0
    });
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -1;
    mat.polygonOffsetUnits = -1;

    const fd = fakeDepth && typeof fakeDepth === 'object' ? fakeDepth : null;
    const enabled = !!fd?.enabled;
    if (enabled) {
        const strength = clamp(fd?.strength ?? 0.06, 0.0, 0.25);
        const insetStrength = clamp(fd?.insetStrength ?? 0.25, 0.0, 1.0);
        const frameWidth = clamp(safeParams?.frameWidth ?? 0.06, 0.0, 0.25);
        const aspect = clamp((Number(windowHeight) || 1) / Math.max(0.01, Number(windowWidth) || 1), 0.1, 10.0);

        mat.userData = mat.userData ?? {};
        mat.userData.windowFakeDepth = { strength, insetStrength, frameWidth, aspect };
        mat.customProgramCacheKey = () => 'window_fake_depth_v1';
        mat.onBeforeCompile = (shader) => {
            shader.uniforms.uWinFakeDepth = { value: new THREE.Vector4(strength, insetStrength, frameWidth, aspect) };

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                `#include <common>
uniform vec4 uWinFakeDepth;
`
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                'vec4 diffuseColor = vec4( diffuse, opacity );',
                `vec4 diffuseColor = vec4( diffuse, opacity );
float mvWinOcclusion = 0.0;`
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <map_fragment>',
                `#ifdef USE_MAP
{
vec2 mvUvBase = vMapUv;
vec2 mvUv = mvUvBase;
vec3 mvNormal = normalize(vNormal);
vec3 mvViewDir = normalize(vViewPosition);
vec3 mvUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
vec3 mvTanU = cross(mvUp, mvNormal);
mvTanU /= max(1e-5, length(mvTanU));
vec3 mvTanV = normalize(cross(mvNormal, mvTanU));
vec3 mvViewTS = vec3(dot(mvViewDir, mvTanU), dot(mvViewDir, mvTanV), dot(mvViewDir, mvNormal));

float mvFrame = clamp(uWinFakeDepth.z, 0.0, 0.45);
float mvAspect = max(0.1, uWinFakeDepth.w);
float mvFrameU = mvFrame * min(1.0, mvAspect);
float mvFrameV = mvFrame * min(1.0, 1.0 / mvAspect);
float mvBlur = 0.02;
float mvInX = smoothstep(mvFrameU, mvFrameU + mvBlur, mvUvBase.x) * (1.0 - smoothstep(1.0 - mvFrameU - mvBlur, 1.0 - mvFrameU, mvUvBase.x));
float mvInY = smoothstep(mvFrameV, mvFrameV + mvBlur, mvUvBase.y) * (1.0 - smoothstep(1.0 - mvFrameV - mvBlur, 1.0 - mvFrameV, mvUvBase.y));
float mvInterior = mvInX * mvInY;

vec2 mvParDir = mvViewTS.xy / max(0.35, mvViewTS.z);
float mvDepth = clamp(uWinFakeDepth.x, 0.0, 0.25);
mvUv = mix(mvUv, mvUvBase - mvParDir * mvDepth, mvInterior);
mvUv = clamp(mvUv, vec2(0.0), vec2(1.0));

float mvInset = clamp(uWinFakeDepth.y, 0.0, 1.0);
float mvEdgeDist = min(min(mvUvBase.x, 1.0 - mvUvBase.x), min(mvUvBase.y, 1.0 - mvUvBase.y));
float mvOuterOcc = (1.0 - smoothstep(0.0, 0.08, mvEdgeDist)) * 0.55;
float mvDx = min(mvUvBase.x - mvFrameU, (1.0 - mvFrameU) - mvUvBase.x);
float mvDy = min(mvUvBase.y - mvFrameV, (1.0 - mvFrameV) - mvUvBase.y);
float mvInnerDist = max(0.0, min(mvDx, mvDy));
float mvInnerOcc = (1.0 - smoothstep(0.0, 0.12, mvInnerDist)) * mvInterior;
mvWinOcclusion = clamp(mvInset * (mvInnerOcc * 0.65 + mvOuterOcc * 0.35), 0.0, 1.0);

vec4 texelColor = texture2D(map, mvUv);
diffuseColor *= texelColor;
diffuseColor.rgb *= (1.0 - mvWinOcclusion * 0.35);
}
#endif`
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <normal_fragment_maps>',
                `#include <normal_fragment_maps>
#ifdef USE_MAP
{
float mvFrame = clamp(uWinFakeDepth.z, 0.0, 0.45);
float mvAspect = max(0.1, uWinFakeDepth.w);
float mvFrameU = mvFrame * min(1.0, mvAspect);
float mvFrameV = mvFrame * min(1.0, 1.0 / mvAspect);
float mvBlur = 0.02;
float mvInX = smoothstep(mvFrameU, mvFrameU + mvBlur, vMapUv.x) * (1.0 - smoothstep(1.0 - mvFrameU - mvBlur, 1.0 - mvFrameU, vMapUv.x));
float mvInY = smoothstep(mvFrameV, mvFrameV + mvBlur, vMapUv.y) * (1.0 - smoothstep(1.0 - mvFrameV - mvBlur, 1.0 - mvFrameV, vMapUv.y));
float mvInterior = mvInX * mvInY;
vec2 mvP = (vMapUv - vec2(0.5)) * 2.0;
float mvAmt = clamp(uWinFakeDepth.y, 0.0, 1.0) * 0.12 * mvInterior;
vec3 mvUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
vec3 mvTanU = cross(mvUp, normal);
mvTanU /= max(1e-5, length(mvTanU));
vec3 mvTanV = normalize(cross(normal, mvTanU));
normal = normalize(normal + mvTanU * (-mvP.x) * mvAmt + mvTanV * (-mvP.y) * mvAmt);
}
#endif`
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <emissivemap_fragment>',
                `#include <emissivemap_fragment>
totalEmissiveRadiance *= (1.0 - mvWinOcclusion * 0.55);`
            );
        };
    }

    mat.needsUpdate = true;
    return mat;
}

function applyPlanOffset({ loops, offset }) {
    const { outer, holes } = splitLoops(loops);
    const d = clamp(offset, -8.0, 8.0);
    if (!(Math.abs(d) > EPS)) return { outer, holes, all: [...outer, ...holes] };

    const nextOuter = outer.map((loop) => offsetOrthogonalLoopXZ(loop, d));
    const nextHoles = holes.map((loop) => offsetOrthogonalLoopXZ(loop, -d));
    return { outer: nextOuter, holes: nextHoles, all: [...nextOuter, ...nextHoles] };
}

function applyWallInset({ loops, inset }) {
    const { outer, holes } = splitLoops(loops);
    const d = clamp(inset, 0.0, 4.0);
    if (!(d > EPS)) return { outer, holes, all: [...outer, ...holes] };

    const nextOuter = outer.map((loop) => offsetOrthogonalLoopXZ(loop, d));
    const nextHoles = holes.map((loop) => offsetOrthogonalLoopXZ(loop, -d));
    return { outer: nextOuter, holes: nextHoles, all: [...nextOuter, ...nextHoles] };
}

function buildShapeFromLoops({ outerLoop, holeLoops }) {
    const shapePts = (outerLoop ?? []).map((p) => new THREE.Vector2(p.x, -p.z));
    shapePts.reverse();
    const shape = new THREE.Shape(shapePts);

    for (const hole of holeLoops ?? []) {
        const holePts = (hole ?? []).map((p) => new THREE.Vector2(p.x, -p.z));
        holePts.reverse();
        shape.holes.push(new THREE.Path(holePts));
    }

    return shape;
}

function appendLoopLinePositions(dst, loops, y) {
    for (const loop of loops ?? []) {
        if (!loop || loop.length < 2) continue;
        for (let i = 0; i < loop.length; i++) {
            const a = loop[i];
            const b = loop[(i + 1) % loop.length];
            dst.push(a.x, y, a.z, b.x, y, b.z);
        }
    }
}

function appendWirePositions(dst, geometry, yShift) {
    if (!geometry) return;
    const arr = geometry.attributes?.position?.array;
    if (!arr) return;
    const shift = Number(yShift) || 0;
    for (let i = 0; i < arr.length; i += 3) {
        dst.push(arr[i], arr[i + 1] + shift, arr[i + 2]);
    }
}

export function buildBuildingFabricationVisualParts({
    map,
    tiles,
    generatorConfig = null,
    tileSize = null,
    occupyRatio = 1.0,
    layers = null,
    materialVariationSeed = null,
    textureCache = null,
    renderer = null,
    windowVisuals = null,
    colors = null,
    overlays = null,
    walls = null
} = {}) {
    const footprintLoops = computeBuildingLoopsFromTiles({ map, tiles, generatorConfig, tileSize, occupyRatio });
    if (!footprintLoops.length) return null;

    const safeLayers = normalizeBuildingLayers(layers);
    const tileCount = Array.isArray(tiles) ? tiles.length : 0;
    const baseColorHex = makeDeterministicColor(tileCount * 97 + safeLayers.length * 31).getHex();
    const matVarSeed = Number.isFinite(materialVariationSeed)
        ? (Number(materialVariationSeed) >>> 0)
        : computeMaterialVariationSeedFromTiles(tiles, { salt: 'building' });

    const firstFloorLayer = safeLayers.find((layer) => layer?.type === LAYER_TYPE.FLOOR) ?? null;
    const firstFloorHeight = clamp(firstFloorLayer?.floorHeight ?? 3.2, 1.0, 12.0);
    const { baseY, extraFirstFloor, planY } = computeBuildingBaseAndSidewalk({ generatorConfig, floorHeight: firstFloorHeight });
    const matVarHeightMax = estimateFabricationHeightMax({ baseY, extraFirstFloor, layers: safeLayers });
    const overlayLoops = applyPlanOffset({ loops: footprintLoops, offset: firstFloorLayer?.planOffset ?? 0.0 }).all;

    const wallInset = clamp(walls?.inset, 0.0, 4.0);
    const lineColor = colors?.line ?? 0xff3b30;
    const borderColor = colors?.border ?? 0x64d2ff;

    const enabled = overlays ?? {};
    const showWire = enabled.wire ?? true;
    const showPlan = enabled.floorplan ?? true;
    const showBorder = enabled.border ?? true;
    const showFloors = enabled.floorDivisions ?? true;

    const solidMeshes = [];
    const wirePositions = [];
    const floorPositions = [];

    const windowsGroup = new THREE.Group();
    windowsGroup.name = 'windows';
    windowsGroup.userData = windowsGroup.userData ?? {};
    const windowVisualsObj = windowVisuals && typeof windowVisuals === 'object' ? windowVisuals : null;
    const reflectiveObj = windowVisualsObj?.reflective && typeof windowVisualsObj.reflective === 'object' ? windowVisualsObj.reflective : {};
    const reflectiveEnabled = reflectiveObj.enabled !== undefined ? !!reflectiveObj.enabled : true;
    const glassObj = reflectiveObj.glass && typeof reflectiveObj.glass === 'object' ? reflectiveObj.glass : {};
    const glassColorHex = Number.isFinite(glassObj.colorHex) ? ((Number(glassObj.colorHex) >>> 0) & 0xffffff) : 0xffffff;
    const glassMetalness = Number.isFinite(glassObj.metalness) ? glassObj.metalness : 0.0;
    const glassRoughness = Number.isFinite(glassObj.roughness) ? glassObj.roughness : 0.02;
    const glassTransmission = Number.isFinite(glassObj.transmission) ? glassObj.transmission : 0.0;
    const glassIor = Number.isFinite(glassObj.ior) ? glassObj.ior : 2.2;
    const glassEnvMapIntensity = Number.isFinite(glassObj.envMapIntensity) ? glassObj.envMapIntensity : 4.0;

    windowsGroup.userData.buildingWindowVisuals = Object.freeze({
        reflective: Object.freeze({
            enabled: reflectiveEnabled,
            glass: Object.freeze({
                colorHex: glassColorHex,
                metalness: glassMetalness,
                roughness: glassRoughness,
                transmission: glassTransmission,
                ior: glassIor,
                envMapIntensity: glassEnvMapIntensity
            })
        })
    });

    const glassLift = 0.02;
    const makeGlassMaterial = (alphaMap) => {
        const wantsTransmission = glassTransmission > 0.01;
        const mat = new THREE.MeshPhysicalMaterial({
            color: glassColorHex,
            metalness: glassMetalness,
            roughness: glassRoughness,
            transmission: wantsTransmission ? glassTransmission : 0.0,
            ior: glassIor,
            envMapIntensity: glassEnvMapIntensity,
            opacity: wantsTransmission ? 1.0 : 0.55
        });
        mat.transparent = true;
        mat.alphaMap = alphaMap ?? null;
        mat.alphaTest = 0.5;
        mat.depthWrite = false;
        mat.polygonOffset = true;
        mat.polygonOffsetFactor = -1;
        mat.polygonOffsetUnits = -1;
        mat.userData = mat.userData ?? {};
        mat.userData.iblEnvMapIntensityScale = glassEnvMapIntensity;
        return mat;
    };

    const planeGeoCache = new Map();
    const getPlaneGeometry = (width, height) => {
        const w = Number(width) || 1;
        const h = Number(height) || 1;
        const key = `${q(w)}|${q(h)}`;
        let geo = planeGeoCache.get(key);
        if (!geo) {
            geo = new THREE.PlaneGeometry(w, h);
            planeGeoCache.set(key, geo);
        }
        return geo;
    };

    const instancedBuckets = new Map();
    const addWindowInstance = ({ geometry, material, x, y, z, yaw, renderOrder }) => {
        if (!geometry || !material) return;
        const ro = Number.isFinite(renderOrder) ? renderOrder : 0;
        const key = `${geometry.uuid}|${material.uuid}|ro:${ro}`;
        let bucket = instancedBuckets.get(key);
        if (!bucket) {
            bucket = {
                geometry,
                material,
                renderOrder: ro,
                transforms: []
            };
            instancedBuckets.set(key, bucket);
        }
        bucket.transforms.push(Number(x) || 0, Number(y) || 0, Number(z) || 0, Number(yaw) || 0);
    };

    const beltsGroup = new THREE.Group();
    beltsGroup.name = 'belts';

    const roofRingGroup = new THREE.Group();
    roofRingGroup.name = 'roof_rings';

    const roofMatTemplate = new THREE.MeshStandardMaterial({
        color: resolveRoofColorHex(ROOF_COLOR.DEFAULT, baseColorHex),
        roughness: 0.85,
        metalness: 0.05
    });
    disableIblOnMaterial(roofMatTemplate);

    let currentLoops = footprintLoops;
    let yCursor = baseY;
    let firstFloorPendingExtra = extraFirstFloor;

    for (let layerIndex = 0; layerIndex < safeLayers.length; layerIndex++) {
        const layer = safeLayers[layerIndex];
        const type = layer?.type;
        if (type === LAYER_TYPE.FLOOR) {
            const planOffset = clamp(layer.planOffset, -8.0, 8.0);
            const { outer: planOuter, holes: planHoles, all: planLoops } = applyPlanOffset({ loops: currentLoops, offset: planOffset });

            const { outer: wallOuter, holes: wallHoles } = applyWallInset({ loops: planLoops, inset: wallInset });

            const floors = clampInt(layer.floors, 0, 99);
            const floorHeight = clamp(layer.floorHeight, 1.0, 12.0);
            const wallMat = makeWallMaterialFromSpec({ material: layer.material, baseColorHex, textureCache });
            const wallStyleId = layer.material?.kind === 'texture' ? layer.material.id : null;
            const wallUrls = wallStyleId ? resolveBuildingStyleWallMaterialUrls(wallStyleId) : null;
            const wallTiling = layer?.tiling ?? null;
            const wallUvEnabled = !!wallTiling?.uvEnabled;
            const wallUvOffsetU = wallUvEnabled ? clamp(wallTiling?.offsetU, -10.0, 10.0) : 0.0;
            const wallUvOffsetV = wallUvEnabled ? clamp(wallTiling?.offsetV, -10.0, 10.0) : 0.0;
            const wallUvRotationDegrees = wallUvEnabled ? clamp(wallTiling?.rotationDegrees, -180.0, 180.0) : 0.0;

            let wallUvScale = 1.0;
            if (wallTiling?.enabled && (Number(wallTiling?.tileMeters) || 0) > EPS) {
                const baseTileMeters = resolvePbrTileMetersFromUrls(wallUrls, wallStyleId);
                const desiredTileMeters = clamp(wallTiling.tileMeters, 0.1, 100.0);
                wallUvScale = baseTileMeters / desiredTileMeters;
            }
            if (wallUvEnabled || Math.abs(wallUvScale - 1.0) > 1e-6) {
                applyUvTilingToMeshStandardMaterial(wallMat, {
                    scale: wallUvScale,
                    offsetU: wallUvOffsetU,
                    offsetV: wallUvOffsetV,
                    rotationDegrees: wallUvRotationDegrees
                });
            }

            const wallMatVar = layer?.materialVariation ?? null;
            if (wallMatVar?.enabled) {
                applyMaterialVariationToMeshStandardMaterial(wallMat, {
                    seed: matVarSeed,
                    seedOffset: clampInt(wallMatVar?.seedOffset ?? 0, -9999, 9999),
                    heightMin: baseY,
                    heightMax: matVarHeightMax,
                    config: wallMatVar,
                    root: MATERIAL_VARIATION_ROOT.WALL,
                    cornerDist: true
                });
            }

            const beltCfg = layer.belt ?? {};
            const beltEnabled = !!beltCfg.enabled;
            const beltHeight = beltEnabled ? clamp(beltCfg.height, 0.02, 1.2) : 0.0;
            const beltExtrusion = beltEnabled ? clamp(beltCfg.extrusion, 0.0, 4.0) : 0.0;
            const beltOffset = wallInset - beltExtrusion;
            const { outer: beltOuter, holes: beltHoles } = applyPlanOffset({ loops: planLoops, offset: beltOffset });
            const beltMat = makeBeltLikeMaterialFromSpec({
                material: beltCfg.material,
                baseColorHex,
                textureCache
            });

            const winCfg = layer.windows ?? null;
            const winEnabled = !!winCfg?.enabled;
            const winWidth = clamp(winCfg?.width, 0.3, 12.0);
            const winSpacing = clamp(winCfg?.spacing, 0.0, 24.0);
            const winDesiredHeight = clamp(winCfg?.height, 0.3, 10.0);
            const winSill = clamp(winCfg?.sillHeight, 0.0, 12.0);
            const winTypeId = typeof winCfg?.typeId === 'string' ? winCfg.typeId : WINDOW_TYPE.STYLE_DEFAULT;
            const winParams = winCfg?.params ?? null;
            const winFakeDepth = winCfg?.fakeDepth ?? null;

            const columns = winCfg?.spaceColumns ?? null;
            const colsEnabled = !!columns?.enabled;
            const colsEvery = clampInt(columns?.every, 1, 99);
            const colsWidth = clamp(columns?.width, 0.1, 10.0);
            const colsExtrude = !!columns?.extrude;
            const colsExtrudeDistance = clamp(columns?.extrudeDistance, 0.0, 1.0);
            const colsMat = makeBeltLikeMaterialFromSpec({
                material: columns?.material,
                baseColorHex,
                textureCache
            });

            const windowOffset = clamp(winCfg?.offset, 0.0, 0.2);
            const cornerEps = clamp(winCfg?.cornerEps, 0.01, 2.0);

            const windowMat = winEnabled ? makeWindowMaterial({
                typeId: winTypeId,
                params: winParams,
                windowWidth: winWidth,
                windowHeight: winDesiredHeight,
                fakeDepth: winFakeDepth
            }) : null;

            const windowGlassMat = (reflectiveEnabled && winEnabled && windowMat) ? makeGlassMaterial(getWindowGlassMaskTexture({
                typeId: winTypeId,
                params: winParams,
                windowWidth: winWidth,
                windowHeight: winDesiredHeight
            })) : null;

            const windowRuns = [];
            if (winEnabled && windowMat && wallOuter.length) {
                for (const loop of wallOuter) {
                    if (!loop || loop.length < 2) continue;
                    const runs = buildExteriorRunsFromLoop(loop);
                    for (const run of runs) {
                        const a = run?.a ?? null;
                        const dir = run?.dir ?? null;
                        const L = Number(run?.length) || 0;
                        if (!a || !dir || !(L > EPS)) continue;
                        if (!(L > winWidth + cornerEps * 2)) continue;

                        const tx = dir.x;
                        const tz = dir.z;
                        const nx = tz;
                        const nz = -tx;
                        const yaw = Math.atan2(nx, nz);

                        const placement = computeWindowSegmentsWithSpacers({
                            length: L,
                            windowWidth: winWidth,
                            desiredGap: winSpacing,
                            cornerEps,
                            spacerEnabled: colsEnabled,
                            spacerEvery: colsEvery,
                            spacerWidth: colsWidth
                        });

                        windowRuns.push({
                            a,
                            tx,
                            tz,
                            nx,
                            nz,
                            yaw,
                            length: L,
                            segments: placement?.segments ?? [],
                            spacerCenters: placement?.spacerCenters ?? []
                        });
                    }
                }
            }

            const hadSolidMeshesBeforeLayer = solidMeshes.length;
            const layerStartY = yCursor;
            const continuousWalls = true;

            if (continuousWalls) {
                let totalWallHeight = 0.0;
                let pendingExtra = firstFloorPendingExtra;
                for (let floor = 0; floor < floors; floor++) {
                    const segHeight = floorHeight + (floor === 0 ? pendingExtra : 0);
                    if (floor === 0) pendingExtra = 0;
                    totalWallHeight += segHeight;
                    if (beltEnabled && beltHeight > EPS) totalWallHeight += beltHeight;
                }

                if (totalWallHeight > EPS) {
                    for (const outerLoop of wallOuter) {
                        if (!outerLoop || outerLoop.length < 3) continue;
                        const shape = buildShapeFromLoops({ outerLoop, holeLoops: wallHoles });
                        let geo = new THREE.ExtrudeGeometry(shape, {
                            depth: totalWallHeight,
                            bevelEnabled: false,
                            steps: 1
                        });
                        geo.rotateX(-Math.PI / 2);
                        applyUvYContinuityOffsetToGeometry(geo, { yOffset: layerStartY - baseY, materialIndex: 1 });
                        applyMatVarCornerDistanceToGeometry(geo, { loops: [outerLoop, ...wallHoles] });
                        if (geo.index) geo = geo.toNonIndexed();
                        geo.computeVertexNormals();

                        const roofMat = roofMatTemplate.clone();
                        const mesh = new THREE.Mesh(geo, [roofMat, wallMat]);
                        mesh.castShadow = true;
                        mesh.receiveShadow = true;
                        mesh.position.y = layerStartY;
                        solidMeshes.push(mesh);

                        if (showWire) {
                            const edgeGeo = new THREE.EdgesGeometry(geo, 1);
                            appendWirePositions(wirePositions, edgeGeo, layerStartY);
                            edgeGeo.dispose();
                        }
                    }
                }
            }

            for (let floor = 0; floor < floors; floor++) {
                if (showFloors && (hadSolidMeshesBeforeLayer || floor > 0 || Math.abs(yCursor - baseY) > EPS)) {
                    appendLoopLinePositions(floorPositions, planLoops, yCursor);
                }

                const floorExtra = firstFloorPendingExtra;
                const segHeight = floorHeight + (floor === 0 ? floorExtra : 0);
                if (floor === 0) firstFloorPendingExtra = 0;

                if (!continuousWalls) {
                    for (const outerLoop of wallOuter) {
                        if (!outerLoop || outerLoop.length < 3) continue;
                        const shape = buildShapeFromLoops({ outerLoop, holeLoops: wallHoles });
                        let geo = new THREE.ExtrudeGeometry(shape, {
                            depth: segHeight,
                            bevelEnabled: false,
                            steps: 1
                        });
                        geo.rotateX(-Math.PI / 2);
                        applyUvYContinuityOffsetToGeometry(geo, { yOffset: yCursor - baseY, materialIndex: 1 });
                        applyMatVarCornerDistanceToGeometry(geo, { loops: [outerLoop, ...wallHoles] });
                        if (geo.index) geo = geo.toNonIndexed();
                        geo.computeVertexNormals();

                        const roofMat = roofMatTemplate.clone();
                        const mesh = new THREE.Mesh(geo, [roofMat, wallMat]);
                        mesh.castShadow = true;
                        mesh.receiveShadow = true;
                        mesh.position.y = yCursor;
                        solidMeshes.push(mesh);

                        if (showWire) {
                            const edgeGeo = new THREE.EdgesGeometry(geo, 1);
                            appendWirePositions(wirePositions, edgeGeo, yCursor);
                            edgeGeo.dispose();
                        }
                    }
                }

                if (winEnabled && windowMat && windowRuns.length) {
                    const windowHeight = Math.min(winDesiredHeight, Math.max(0.3, segHeight * 0.95));
                    const windowYOffset = Math.min(winSill, Math.max(0, segHeight - windowHeight));
                    const y = yCursor + windowYOffset + windowHeight * 0.5;

                    for (const run of windowRuns) {
                        const runLength = Number(run?.length) || 0;
                        if (!(runLength > EPS)) continue;
                        const a = run.a;
                        const tx = run.tx;
                        const tz = run.tz;
                        const nx = run.nx;
                        const nz = run.nz;
                        const yaw = run.yaw;

                        for (const seg of run.segments ?? []) {
                            const segOffset = Number(seg?.offset) || 0;
                            const starts = seg?.layout?.starts ?? [];
                            for (const start of starts) {
                                const leftDist = segOffset + start;
                                const rightDist = leftDist + winWidth;
                                if (leftDist < cornerEps - 1e-6 || rightDist > runLength - cornerEps + 1e-6) continue;
                                const centerDist = segOffset + start + winWidth * 0.5;
                                const cx = a.x + tx * centerDist + nx * windowOffset;
                                const cz = a.z + tz * centerDist + nz * windowOffset;

                                const geo = getPlaneGeometry(winWidth, windowHeight);
                                addWindowInstance({ geometry: geo, material: windowMat, x: cx, y, z: cz, yaw, renderOrder: 0 });

                                if (windowGlassMat) {
                                    addWindowInstance({
                                        geometry: geo,
                                        material: windowGlassMat,
                                        x: cx + nx * glassLift,
                                        y,
                                        z: cz + nz * glassLift,
                                        yaw,
                                        renderOrder: 1
                                    });
                                }
                            }
                        }
                    }
                }

                yCursor += segHeight;

                if (beltEnabled && beltHeight > EPS) {
                    for (const outerLoop of beltOuter) {
                        if (!outerLoop || outerLoop.length < 3) continue;
                        const shape = buildShapeFromLoops({ outerLoop, holeLoops: beltHoles });
                        const geo = new THREE.ExtrudeGeometry(shape, {
                            depth: beltHeight,
                            bevelEnabled: false,
                            steps: 1
                        });
                        geo.rotateX(-Math.PI / 2);
                        geo.computeVertexNormals();

                        const mesh = new THREE.Mesh(geo, beltMat);
                        mesh.castShadow = true;
                        mesh.receiveShadow = true;
                        mesh.position.y = yCursor;
                        beltsGroup.add(mesh);

                        if (showWire) {
                            const edgeGeo = new THREE.EdgesGeometry(geo, 1);
                            appendWirePositions(wirePositions, edgeGeo, yCursor);
                            edgeGeo.dispose();
                        }
                    }

                    yCursor += beltHeight;
                }
            }

            const layerEndY = yCursor;
            if (colsExtrude && colsExtrudeDistance > EPS && colsWidth > EPS && windowRuns.length && layerEndY - layerStartY > EPS) {
                const bandY = (layerStartY + layerEndY) * 0.5;
                const bandHeight = Math.max(0.1, layerEndY - layerStartY);
                const bandOffset = windowOffset + colsExtrudeDistance * 0.5;
                const bandHalfWidth = colsWidth * 0.5;

                for (const run of windowRuns) {
                    if (!Array.isArray(run.spacerCenters) || !run.spacerCenters.length) continue;
                    const runLength = Number(run?.length) || 0;
                    if (!(runLength > EPS)) continue;
                    const a = run.a;
                    const tx = run.tx;
                    const tz = run.tz;
                    const nx = run.nx;
                    const nz = run.nz;
                    const yaw = run.yaw;

                    for (const centerDist of run.spacerCenters) {
                        if (centerDist - bandHalfWidth < cornerEps - 1e-6 || centerDist + bandHalfWidth > runLength - cornerEps + 1e-6) continue;
                        const cx = a.x + tx * centerDist + nx * bandOffset;
                        const cz = a.z + tz * centerDist + nz * bandOffset;
                        const geo = new THREE.BoxGeometry(colsWidth, bandHeight, colsExtrudeDistance);
                        const mesh = new THREE.Mesh(geo, colsMat);
                        mesh.position.set(cx, bandY, cz);
                        mesh.rotation.set(0, yaw, 0);
                        mesh.castShadow = true;
                        mesh.receiveShadow = true;
                        windowsGroup.add(mesh);
                    }
                }
            }

            currentLoops = planLoops.length ? planLoops : currentLoops;
            continue;
        }

        if (type === LAYER_TYPE.ROOF) {
            const roofCfg = layer.roof ?? {};
            const roofMat = makeRoofSurfaceMaterialFromSpec({
                material: roofCfg.material,
                baseColorHex,
                textureCache
            });
            const roofStyleId = roofCfg.material?.kind === 'texture' ? roofCfg.material.id : null;
            const roofUrls = roofStyleId ? resolveBuildingStyleWallMaterialUrls(roofStyleId) : null;
            const roofTiling = roofCfg?.tiling ?? null;
            const roofUvEnabled = !!roofTiling?.uvEnabled;
            const roofUvOffsetU = roofUvEnabled ? clamp(roofTiling?.offsetU, -10.0, 10.0) : 0.0;
            const roofUvOffsetV = roofUvEnabled ? clamp(roofTiling?.offsetV, -10.0, 10.0) : 0.0;
            const roofUvRotationDegrees = roofUvEnabled ? clamp(roofTiling?.rotationDegrees, -180.0, 180.0) : 0.0;

            let roofUvScale = 1.0;
            if (roofTiling?.enabled && (Number(roofTiling?.tileMeters) || 0) > EPS) {
                const baseTileMeters = resolvePbrTileMetersFromUrls(roofUrls, roofStyleId);
                const desiredTileMeters = clamp(roofTiling.tileMeters, 0.1, 100.0);
                roofUvScale = baseTileMeters / desiredTileMeters;
            }
            if (roofUvEnabled || Math.abs(roofUvScale - 1.0) > 1e-6) {
                applyUvTilingToMeshStandardMaterial(roofMat, {
                    scale: roofUvScale,
                    offsetU: roofUvOffsetU,
                    offsetV: roofUvOffsetV,
                    rotationDegrees: roofUvRotationDegrees
                });
            }

            const roofMatVar = roofCfg?.materialVariation ?? null;
            if (roofMatVar?.enabled) {
                applyMaterialVariationToMeshStandardMaterial(roofMat, {
                    seed: matVarSeed,
                    seedOffset: clampInt(roofMatVar?.seedOffset ?? 0, -9999, 9999),
                    heightMin: baseY,
                    heightMax: matVarHeightMax,
                    config: roofMatVar,
                    root: MATERIAL_VARIATION_ROOT.SURFACE
                });
            }

            const { outer: planOuter, holes: planHoles } = splitLoops(currentLoops);
            for (const outerLoop of planOuter) {
                if (!outerLoop || outerLoop.length < 3) continue;
                const shape = buildShapeFromLoops({ outerLoop, holeLoops: planHoles });
                const geo = new THREE.ShapeGeometry(shape);
                geo.rotateX(-Math.PI / 2);
                geo.computeVertexNormals();

                const mesh = new THREE.Mesh(geo, roofMat);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                mesh.position.y = yCursor + 0.002;
                solidMeshes.push(mesh);

                if (showWire) {
                    const edgeGeo = new THREE.EdgesGeometry(geo, 1);
                    appendWirePositions(wirePositions, edgeGeo, mesh.position.y);
                    edgeGeo.dispose();
                }
            }

            const ring = layer.ring ?? {};
            const ringEnabled = !!ring.enabled;
            const outerRadius = clamp(ring.outerRadius, 0.0, 8.0);
            const innerRadius = clamp(ring.innerRadius, 0.0, 8.0);
            const ringHeight = ringEnabled ? clamp(ring.height, 0.02, 2.0) : 0.0;

            if (ringEnabled && ringHeight > EPS && (outerRadius > EPS || innerRadius > EPS)) {
                const ringMat = makeBeltLikeMaterialFromSpec({
                    material: ring?.material,
                    baseColorHex,
                    textureCache
                });

                for (const outerLoop of planOuter) {
                    if (!outerLoop || outerLoop.length < 3) continue;
                    const outerLoopExpanded = outerRadius > EPS ? offsetOrthogonalLoopXZ(outerLoop, -outerRadius) : outerLoop;
                    const innerLoopInset = innerRadius > EPS ? offsetOrthogonalLoopXZ(outerLoop, innerRadius) : outerLoop;

                    if (!outerLoopExpanded || !innerLoopInset || outerLoopExpanded.length < 3 || innerLoopInset.length < 3) continue;

                    const shape = buildShapeFromLoops({ outerLoop: outerLoopExpanded, holeLoops: [innerLoopInset] });
                    const geo = new THREE.ExtrudeGeometry(shape, {
                        depth: ringHeight,
                        bevelEnabled: false,
                        steps: 1
                    });
                    geo.rotateX(-Math.PI / 2);
                    geo.computeVertexNormals();

                    const mesh = new THREE.Mesh(geo, ringMat);
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    mesh.position.y = yCursor;
                    roofRingGroup.add(mesh);

                    if (showWire) {
                        const edgeGeo = new THREE.EdgesGeometry(geo, 1);
                        appendWirePositions(wirePositions, edgeGeo, yCursor);
                        edgeGeo.dispose();
                    }
                }
            }

            const nextLayer = safeLayers[layerIndex + 1] ?? null;
            const hasFloorsAboveRoof = nextLayer?.type === LAYER_TYPE.FLOOR;
            if (!hasFloorsAboveRoof) yCursor += ringHeight;
        }
    }

    if (instancedBuckets.size) {
        const dummy = new THREE.Object3D();
        const orderedBuckets = Array.from(instancedBuckets.values()).sort((a, b) => {
            const ro = a.renderOrder - b.renderOrder;
            if (ro) return ro;
            const ma = a.material?.uuid ?? '';
            const mb = b.material?.uuid ?? '';
            if (ma < mb) return -1;
            if (ma > mb) return 1;
            const ga = a.geometry?.uuid ?? '';
            const gb = b.geometry?.uuid ?? '';
            if (ga < gb) return -1;
            if (ga > gb) return 1;
            return 0;
        });
        for (const bucket of orderedBuckets) {
            const transforms = bucket.transforms;
            const count = Math.floor(transforms.length / 4);
            if (!count) continue;

            const mesh = new THREE.InstancedMesh(bucket.geometry, bucket.material, count);
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            mesh.renderOrder = bucket.renderOrder;
            mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

            for (let i = 0; i < count; i++) {
                const idx = i * 4;
                dummy.position.set(transforms[idx], transforms[idx + 1], transforms[idx + 2]);
                dummy.rotation.set(0, transforms[idx + 3], 0);
                dummy.updateMatrix();
                mesh.setMatrixAt(i, dummy.matrix);
            }
            mesh.instanceMatrix.needsUpdate = true;
            mesh.computeBoundingBox();
            mesh.computeBoundingSphere();
            windowsGroup.add(mesh);
        }
    }

    let wire = null;
    if (showWire && wirePositions.length) {
        const wireGeo = new LineSegmentsGeometry();
        wireGeo.setPositions(wirePositions);
        const wireMat = createLineMaterial({
            renderer,
            color: lineColor,
            linewidth: 4,
            opacity: 0.98,
            renderOrder: 120
        });

        wire = new LineSegments2(wireGeo, wireMat);
        wire.renderOrder = 120;
        wire.frustumCulled = false;
    }

    let plan = null;
    if (showPlan) {
        const planPositions = [];
        appendLoopLinePositions(planPositions, overlayLoops, planY);
        if (planPositions.length) {
            const planGeo = new LineSegmentsGeometry();
            planGeo.setPositions(planPositions);
            const planMat = createLineMaterial({
                renderer,
                color: lineColor,
                linewidth: 4,
                opacity: 1.0,
                renderOrder: 140
            });

            plan = new LineSegments2(planGeo, planMat);
            plan.renderOrder = 140;
            plan.frustumCulled = false;
        }
    }

    let border = null;
    if (showBorder) {
        const borderPositions = [];
        appendLoopLinePositions(borderPositions, overlayLoops, planY + 0.02);
        if (borderPositions.length) {
            const borderGeo = new LineSegmentsGeometry();
            borderGeo.setPositions(borderPositions);
            const borderMat = createLineMaterial({
                renderer,
                color: borderColor,
                linewidth: 6,
                opacity: 0.98,
                renderOrder: 160
            });

            border = new LineSegments2(borderGeo, borderMat);
            border.renderOrder = 160;
            border.frustumCulled = false;
        }
    }

    let floorDivisions = null;
    if (showFloors && floorPositions.length) {
        const floorsGeo = new LineSegmentsGeometry();
        floorsGeo.setPositions(floorPositions);
        const floorsMat = createLineMaterial({
            renderer,
            color: lineColor,
            linewidth: 3,
            opacity: 0.72,
            renderOrder: 130
        });

        floorDivisions = new LineSegments2(floorsGeo, floorsMat);
        floorDivisions.renderOrder = 130;
        floorDivisions.frustumCulled = false;
    }

    return {
        baseColorHex,
        solidMeshes,
        wire,
        plan,
        border,
        floorDivisions,
        windows: windowsGroup.children.length ? windowsGroup : null,
        beltCourse: beltsGroup.children.length ? beltsGroup : null,
        topBelt: roofRingGroup.children.length ? roofRingGroup : null
    };
}
