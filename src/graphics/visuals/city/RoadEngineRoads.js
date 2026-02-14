// src/graphics/visuals/city/RoadEngineRoads.js
// Renders CityMap roads using the RoadEngine compute pipeline (asphalt + decorations + debug metadata).

import * as THREE from 'three';
import { computeRoadEngineEdges } from '../../../app/road_engine/RoadEngineCompute.js';
import { buildRoadEnginePolygonMeshData } from '../../../app/road_engine/RoadEngineMeshData.js';
import { buildRoadEngineRoadsFromCityMap } from '../../../app/road_engine/RoadEngineCityMapAdapter.js';
import { buildRoadCurbMeshDataFromRoadEnginePrimitives } from '../../../app/road_decoration/curbs/RoadCurbBuilder.js';
import { buildRoadAsphaltEdgeWearMeshDataFromRoadEnginePrimitives } from '../../../app/road_decoration/wear/RoadAsphaltEdgeWearBuilder.js';
import { buildRoadSidewalkMeshDataFromRoadEnginePrimitives } from '../../../app/road_decoration/sidewalks/RoadSidewalkBuilder.js';
import { buildRoadSidewalkEdgeDirtStripMeshDataFromRoadEnginePrimitives } from '../../../app/road_decoration/wear/RoadSidewalkEdgeDirtStripBuilder.js';
import { buildRoadMarkingsMeshDataFromRoadEngineDerived } from '../../../app/road_decoration/markings/RoadMarkingsBuilder.js';
import { createRoadMarkingsMeshesFromData } from './RoadMarkingsMeshes.js';
import { applyRoadSurfaceVariationToMeshStandardMaterial } from '../../assets3d/materials/RoadSurfaceVariationSystem.js';
import { hexToCssColor, ROAD_MARKING_WHITE_TARGET_SUN_HEX, ROAD_MARKING_YELLOW_TARGET_SUN_HEX } from '../../assets3d/materials/RoadMarkingsColors.js';
import { getResolvedAsphaltNoiseSettings } from './AsphaltNoiseSettings.js';
import { applyAsphaltRoadVisualsToMeshStandardMaterial } from './AsphaltRoadVisuals.js';
import { applyAsphaltMarkingsNoiseVisualsToMeshStandardMaterial } from './AsphaltMarkingsNoiseVisuals.js';
import { applyAsphaltEdgeWearVisualsToMeshStandardMaterial } from './AsphaltEdgeWearVisuals.js';
import { applySidewalkEdgeDirtStripVisualsToMeshStandardMaterial, getSidewalkEdgeDirtStripConfig } from './SidewalkEdgeDirtStripVisuals.js';

const EPS = 1e-9;

function clampNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function applyTextureColorSpace(tex, { srgb = true } = {}) {
    if (!tex) return;
    if ('colorSpace' in tex) {
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        return;
    }
    if ('encoding' in tex) tex.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
}

function resolveRoadConfig(config) {
    const cfg = config && typeof config === 'object' ? config : {};
    const road = cfg.road && typeof cfg.road === 'object' ? cfg.road : {};
    const ground = cfg.ground && typeof cfg.ground === 'object' ? cfg.ground : {};
    const render = cfg.render && typeof cfg.render === 'object' ? cfg.render : {};
    return { cfg, road, ground, render };
}

function resolveMaterials(materials, { debugMode = false } = {}) {
    const base = materials && typeof materials === 'object' ? materials : {};
    const road = base.road ?? new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.95, metalness: 0.0 });
    const roadEdgeWear = base.roadEdgeWear ?? new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 1.0, metalness: 0.0, transparent: true, opacity: 1.0, depthWrite: false });
    const sidewalk = base.sidewalk ?? new THREE.MeshStandardMaterial({ color: 0x8f8f8f, roughness: 1.0, metalness: 0.0 });
    const sidewalkEdgeDirt = base.sidewalkEdgeDirt ?? new THREE.MeshStandardMaterial({ color: 0x4d473c, roughness: 1.0, metalness: 0.0, transparent: true, opacity: 0.45, depthWrite: false });
    const curb = base.curb ?? new THREE.MeshStandardMaterial({ color: 0x7a7a7a, roughness: 0.9, metalness: 0.0 });
    const laneWhite = base.laneWhite ?? new THREE.MeshStandardMaterial({ color: ROAD_MARKING_WHITE_TARGET_SUN_HEX, roughness: 0.55, metalness: 0.0 });
    const laneYellow = base.laneYellow ?? new THREE.MeshStandardMaterial({ color: ROAD_MARKING_YELLOW_TARGET_SUN_HEX, roughness: 0.55, metalness: 0.0 });

    const ensureDecalMaterial = (mat, opts) => {
        if (!mat) return mat;
        const relative = opts?.relativeTo ?? null;
        let factor = clampNumber(opts?.factor, -3);
        let units = clampNumber(opts?.units, -16);
        if (relative?.polygonOffset) {
            const relFactor = clampNumber(relative?.polygonOffsetFactor, 0);
            const relUnits = clampNumber(relative?.polygonOffsetUnits, 0);
            factor = Math.min(factor, relFactor - 2);
            units = Math.min(units, relUnits - 4);
        }
        mat.transparent = true;
        mat.opacity = 1.0;
        mat.depthWrite = false;
        mat.blending = THREE.NoBlending;
        mat.polygonOffset = true;
        mat.polygonOffsetFactor = factor;
        mat.polygonOffsetUnits = units;
        return mat;
    };

    ensureDecalMaterial(laneWhite, { relativeTo: road, factor: -1, units: -16 });
    ensureDecalMaterial(laneYellow, { relativeTo: road, factor: -1, units: -16 });

    if (!debugMode) return { road, roadEdgeWear, sidewalk, sidewalkEdgeDirt, curb, laneWhite, laneYellow };

    const toBasic = (mat) => {
        const c = mat?.color?.getHex?.() ?? 0xffffff;
        const out = new THREE.MeshBasicMaterial({ color: c, transparent: false, opacity: 1.0 });
        out.toneMapped = false;
        if (mat?.side != null) out.side = mat.side;
        if (mat?.polygonOffset) {
            out.polygonOffset = true;
            out.polygonOffsetFactor = mat.polygonOffsetFactor ?? 0;
            out.polygonOffsetUnits = mat.polygonOffsetUnits ?? 0;
        }
        return out;
    };

    const toDecalBasic = (mat) => {
        const c = mat?.color?.getHex?.() ?? 0xffffff;
        const out = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 1.0 });
        out.toneMapped = false;
        out.depthWrite = false;
        out.blending = THREE.NoBlending;
        if (mat?.side != null) out.side = mat.side;
        const factor = clampNumber(mat?.polygonOffsetFactor, 0);
        const units = clampNumber(mat?.polygonOffsetUnits, -1);
        out.polygonOffset = true;
        out.polygonOffsetFactor = factor;
        out.polygonOffsetUnits = units;
        return out;
    };

    return {
        road: toBasic(road),
        roadEdgeWear: toDecalBasic(roadEdgeWear),
        sidewalk: toBasic(sidewalk),
        sidewalkEdgeDirt: toDecalBasic(sidewalkEdgeDirt),
        curb: toBasic(curb),
        laneWhite: toDecalBasic(laneWhite),
        laneYellow: toDecalBasic(laneYellow)
    };
}

function nextPow2(value) {
    const n = Math.max(1, Math.ceil(Number(value) || 1));
    return 2 ** Math.ceil(Math.log2(n));
}

function clampPow2(value, { min = 512, max = 4096 } = {}) {
    const lo = Math.max(1, nextPow2(min));
    const hi = Math.max(lo, nextPow2(max));
    const v = nextPow2(value);
    return Math.min(hi, Math.max(lo, v));
}

function getMapBoundsXZ(map) {
    const tileSize = Math.max(EPS, clampNumber(map?.tileSize, 1));
    const width = Math.max(1, Math.trunc(map?.width ?? 1));
    const height = Math.max(1, Math.trunc(map?.height ?? 1));
    const origin = map?.origin ?? { x: 0, z: 0 };

    const half = tileSize * 0.5;
    const minX = clampNumber(origin?.x, 0) - half;
    const minZ = clampNumber(origin?.z, 0) - half;
    const sizeX = width * tileSize;
    const sizeZ = height * tileSize;

    return { minX, minZ, sizeX, sizeZ };
}

function hashStringToVec2(str) {
    const s = String(str ?? '');
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    const a = ((h >>> 0) & 0xffff) / 65535;
    const b = ((h >>> 16) & 0xffff) / 65535;
    return new THREE.Vector2(a * 512.0, b * 512.0);
}

function createRoadMarkingsTexture(markings, {
    bounds,
    laneWidth = 4.8,
    lineWidthMeters = null,
    pixelsPerMeter = 6,
    maxSize = 4096,
    whiteColorHex = ROAD_MARKING_WHITE_TARGET_SUN_HEX,
    yellowColorHex = ROAD_MARKING_YELLOW_TARGET_SUN_HEX
} = {}) {
    const b = bounds && typeof bounds === 'object' ? bounds : null;
    if (!b) return null;
    const sizeX = clampNumber(b.sizeX, 0);
    const sizeZ = clampNumber(b.sizeZ, 0);
    if (!(sizeX > EPS) || !(sizeZ > EPS)) return null;

    const ppm = Math.max(0.1, clampNumber(pixelsPerMeter, 6));
    const canvasW = clampPow2(sizeX * ppm, { min: 512, max: maxSize });
    const canvasH = clampPow2(sizeZ * ppm, { min: 512, max: maxSize });

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const scaleX = canvasW / sizeX;
    const scaleZ = canvasH / sizeZ;
    const pxPerMeter = Math.min(scaleX, scaleZ);

    const lw = Math.max(EPS, clampNumber(laneWidth, 4.8));
    const widthMeters = Math.max(0.02, clampNumber(lineWidthMeters, lw * 0.07));
    const lineWidthPx = Math.max(1, widthMeters * pxPerMeter);

    const toX = (x) => (clampNumber(x, 0) - b.minX) * scaleX;
    const toY = (z) => (clampNumber(z, 0) - b.minZ) * scaleZ;

    const drawSegments = (segments, color) => {
        const arr = segments instanceof Float32Array ? segments : (Array.isArray(segments) ? new Float32Array(segments) : null);
        if (!arr?.length) return;
        const eps = 1e-4;
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidthPx;
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        ctx.miterLimit = 2.5;
        ctx.beginPath();

        let has = false;
        let startX = 0;
        let startZ = 0;
        let prevX = 0;
        let prevZ = 0;

        const closeIfLoop = () => {
            if (!has) return;
            if (Math.abs(prevX - startX) <= eps && Math.abs(prevZ - startZ) <= eps) ctx.closePath();
        };

        for (let i = 0; i + 5 < arr.length; i += 6) {
            const x0w = Number(arr[i]) || 0;
            const z0w = Number(arr[i + 2]) || 0;
            const x1w = Number(arr[i + 3]) || 0;
            const z1w = Number(arr[i + 5]) || 0;

            if (!has) {
                has = true;
                startX = x0w;
                startZ = z0w;
                prevX = x1w;
                prevZ = z1w;
                ctx.moveTo(toX(x0w), toY(z0w));
                ctx.lineTo(toX(x1w), toY(z1w));
                continue;
            }

            const connects = Math.abs(x0w - prevX) <= eps && Math.abs(z0w - prevZ) <= eps;
            if (!connects) {
                closeIfLoop();
                startX = x0w;
                startZ = z0w;
                ctx.moveTo(toX(x0w), toY(z0w));
            }

            ctx.lineTo(toX(x1w), toY(z1w));
            prevX = x1w;
            prevZ = z1w;
        }

        closeIfLoop();
        ctx.stroke();
    };

    const drawTriangles = (positions, color) => {
        const arr = positions instanceof Float32Array ? positions : (Array.isArray(positions) ? new Float32Array(positions) : null);
        if (!arr?.length) return;
        ctx.fillStyle = color;
        ctx.beginPath();
        for (let i = 0; i + 8 < arr.length; i += 9) {
            ctx.moveTo(toX(arr[i]), toY(arr[i + 2]));
            ctx.lineTo(toX(arr[i + 3]), toY(arr[i + 5]));
            ctx.lineTo(toX(arr[i + 6]), toY(arr[i + 8]));
            ctx.closePath();
        }
        ctx.fill();
    };

    ctx.clearRect(0, 0, canvasW, canvasH);

    const yellowCss = hexToCssColor(yellowColorHex);
    const whiteCss = hexToCssColor(whiteColorHex);
    drawSegments(markings?.yellowLineSegments ?? null, yellowCss);
    drawSegments(markings?.whiteLineSegments ?? null, whiteCss);
    drawTriangles(markings?.crosswalkPositions ?? null, whiteCss);
    drawTriangles(markings?.arrowPositions ?? null, whiteCss);

    const tex = new THREE.CanvasTexture(canvas);
    tex.name = 'RoadMarkingsTexture';
    tex.flipY = false;
    tex.anisotropy = 16;
    tex.generateMipmaps = false;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    applyTextureColorSpace(tex, { srgb: true });
    tex.needsUpdate = true;
    return tex;
}

function createAsphaltMaterialWithMarkings(
    baseMaterial,
    {
        markingsTexture = null,
        bounds = null,
        markingsVisuals = null,
        markingsSeed = null,
        asphaltNoise = null,
        markingsDebug = null
    } = {}
) {
    if (!baseMaterial || !markingsTexture || !bounds) return baseMaterial;

    const minX = clampNumber(bounds?.minX, 0);
    const minZ = clampNumber(bounds?.minZ, 0);
    const sizeX = clampNumber(bounds?.sizeX, 1);
    const sizeZ = clampNumber(bounds?.sizeZ, 1);
    const invX = sizeX > EPS ? 1 / sizeX : 1;
    const invZ = sizeZ > EPS ? 1 / sizeZ : 1;

    const mat = baseMaterial.clone();
    mat.userData = { ...(mat.userData ?? {}), roadMarkingsOverlay: true };
    if (!Object.prototype.hasOwnProperty.call(mat.userData, 'roadMarkingsOverlayEnabled')) {
        mat.userData.roadMarkingsOverlayEnabled = true;
    }
    if (markingsDebug && typeof markingsDebug === 'object') {
        mat.userData.roadMarkingsOverlayDebug = { ...markingsDebug };
    }

    const mv = markingsVisuals && typeof markingsVisuals === 'object' ? markingsVisuals : {};
    const markingsScale = Math.max(0.001, clampNumber(mv.scale, 1.4));
    const markingsColorStrength = Math.max(0.0, clampNumber(mv.colorStrength, 0.12));
    const markingsRoughnessStrength = Math.max(0.0, clampNumber(mv.roughnessStrength, 0.26));
    const markingsDirtyStrength = Math.max(0.0, clampNumber(mv.dirtyStrength, 0.35));
    const markingsEdgeBreakStrength = Math.max(0.0, clampNumber(mv.edgeBreakStrength, 0.14));
    const markingsBaseRoughness = clampNumber(mv.baseRoughness, 0.55);
    const seedVec2 = markingsSeed?.isVector2 ? markingsSeed.clone() : hashStringToVec2(String(markingsSeed ?? 'markings'));

    const asphaltCfg = asphaltNoise && typeof asphaltNoise === 'object' ? asphaltNoise : null;
    const markingsNoise = asphaltCfg?.markings && typeof asphaltCfg.markings === 'object' ? asphaltCfg.markings : null;
    const asphaltMarkingsEnabled = markingsNoise?.enabled === true;
    const asphaltMarkingsDebug = markingsNoise?.debug === true;
    const asphaltMarkingsColorStrength = asphaltMarkingsEnabled
        ? Math.max(0.0, Math.min(0.5, clampNumber(markingsNoise?.colorStrength, 0.025)))
        : 0.0;
    const asphaltMarkingsRoughnessStrength = asphaltMarkingsEnabled
        ? Math.max(0.0, Math.min(0.5, clampNumber(markingsNoise?.roughnessStrength, 0.09)))
        : 0.0;
    const asphaltFineScale = Math.max(0.1, Math.min(15, clampNumber(asphaltCfg?.fine?.scale, 12.0)));
    const asphaltFineBaseRoughness = Math.max(0.0, Math.min(1.0, clampNumber(baseMaterial?.userData?.asphaltRoadBase?.roughness, 0.95)));
    const asphaltFineRoughnessMap = baseMaterial?.userData?.asphaltFineTextures?.roughnessMap ?? baseMaterial?.roughnessMap ?? null;
    const asphaltFineRoughnessStrength = asphaltFineRoughnessMap?.isTexture
        ? Math.max(0.0, Math.min(0.5, clampNumber(asphaltCfg?.fine?.roughnessStrength, 0.16)))
        : 0.0;

    mat.userData.roadMarkingsAsphaltNoiseConfig = {
        enabled: asphaltMarkingsEnabled,
        debug: asphaltMarkingsDebug,
        colorStrength: asphaltMarkingsColorStrength,
        roughnessStrength: asphaltMarkingsRoughnessStrength,
        fineScale: asphaltFineScale,
        fineBaseRoughness: asphaltFineBaseRoughness,
        fineRoughnessStrength: asphaltFineRoughnessStrength,
        fineRoughnessMap: asphaltFineRoughnessMap?.isTexture ? asphaltFineRoughnessMap : null,
        shaderUniforms: null
    };

    const prevOnBeforeCompile = typeof mat.onBeforeCompile === 'function' ? mat.onBeforeCompile.bind(mat) : null;
    mat.onBeforeCompile = (shader, renderer) => {
        if (prevOnBeforeCompile) prevOnBeforeCompile(shader, renderer);
        shader.extensions = shader.extensions || {};
        shader.extensions.derivatives = true;
        shader.uniforms.uRoadMarkingsEnabled = { value: mat.userData?.roadMarkingsOverlayEnabled === false ? 0.0 : 1.0 };
        shader.uniforms.uRoadMarkingsMap = { value: markingsTexture };
        shader.uniforms.uRoadMarkingsMin = { value: new THREE.Vector2(minX, minZ) };
        shader.uniforms.uRoadMarkingsInvSize = { value: new THREE.Vector2(invX, invZ) };
        shader.uniforms.uRoadMarkingsVarScale = { value: markingsScale };
        shader.uniforms.uRoadMarkingsVarColorStrength = { value: markingsColorStrength };
        shader.uniforms.uRoadMarkingsVarRoughnessStrength = { value: markingsRoughnessStrength };
        shader.uniforms.uRoadMarkingsVarDirtyStrength = { value: markingsDirtyStrength };
        shader.uniforms.uRoadMarkingsVarEdgeBreakStrength = { value: markingsEdgeBreakStrength };
        shader.uniforms.uRoadMarkingsBaseRoughness = { value: markingsBaseRoughness };
        shader.uniforms.uRoadMarkingsVarSeed = { value: seedVec2 };

        const asphaltMarkingsCfg = mat.userData?.roadMarkingsAsphaltNoiseConfig ?? null;
        shader.uniforms.uRoadMarkingsAsphaltNoiseEnabled = { value: asphaltMarkingsCfg?.enabled ? 1.0 : 0.0 };
        shader.uniforms.uRoadMarkingsAsphaltNoiseColorStrength = { value: clampNumber(asphaltMarkingsCfg?.colorStrength, 0.0) };
        shader.uniforms.uRoadMarkingsAsphaltNoiseRoughnessStrength = { value: clampNumber(asphaltMarkingsCfg?.roughnessStrength, 0.0) };
        shader.uniforms.uRoadMarkingsAsphaltNoiseDebug = { value: asphaltMarkingsCfg?.debug ? 1.0 : 0.0 };
        shader.uniforms.uRoadMarkingsAsphaltFineScale = { value: clampNumber(asphaltMarkingsCfg?.fineScale, 12.0) };
        shader.uniforms.uRoadMarkingsAsphaltFineBaseRoughness = { value: clampNumber(asphaltMarkingsCfg?.fineBaseRoughness, 0.95) };
        shader.uniforms.uRoadMarkingsAsphaltFineRoughnessStrength = { value: clampNumber(asphaltMarkingsCfg?.fineRoughnessStrength, 0.0) };
        shader.uniforms.uRoadMarkingsAsphaltFineRoughnessMap = { value: asphaltMarkingsCfg?.fineRoughnessMap ?? null };

        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            '#include <common>\nvarying vec3 vRoadMarkingsWorldPos;'
        );
        shader.vertexShader = shader.vertexShader.replace(
            '#include <worldpos_vertex>',
            '#include <worldpos_vertex>\nvRoadMarkingsWorldPos = worldPosition.xyz;'
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            [
                '#include <common>',
                'uniform float uRoadMarkingsEnabled;',
                'uniform sampler2D uRoadMarkingsMap;',
                'uniform vec2 uRoadMarkingsMin;',
                'uniform vec2 uRoadMarkingsInvSize;',
                'uniform float uRoadMarkingsVarScale;',
                'uniform float uRoadMarkingsVarColorStrength;',
                'uniform float uRoadMarkingsVarRoughnessStrength;',
                'uniform float uRoadMarkingsVarDirtyStrength;',
                'uniform float uRoadMarkingsVarEdgeBreakStrength;',
                'uniform float uRoadMarkingsBaseRoughness;',
                'uniform vec2 uRoadMarkingsVarSeed;',
                'uniform float uRoadMarkingsAsphaltNoiseEnabled;',
                'uniform float uRoadMarkingsAsphaltNoiseColorStrength;',
                'uniform float uRoadMarkingsAsphaltNoiseRoughnessStrength;',
                'uniform float uRoadMarkingsAsphaltNoiseDebug;',
                'uniform float uRoadMarkingsAsphaltFineScale;',
                'uniform float uRoadMarkingsAsphaltFineBaseRoughness;',
                'uniform float uRoadMarkingsAsphaltFineRoughnessStrength;',
                'uniform sampler2D uRoadMarkingsAsphaltFineRoughnessMap;',
                'varying vec3 vRoadMarkingsWorldPos;',
                'float roadMarkingsAsphaltNoiseSigned = 0.0;',
                'float roadMarkingsVarSigned = 0.0;',
                'float roadMarkingsMask = 0.0;',
                'float roadMarkingsRoughTarget = 0.0;',
                'float roadMarkingsAsphaltNoiseCompute(vec2 worldXZ){',
                'float active = max(uRoadMarkingsAsphaltNoiseEnabled, uRoadMarkingsAsphaltNoiseDebug);',
                'if (active < 0.5) return 0.0;',
                'float denom = max(1e-5, uRoadMarkingsAsphaltFineRoughnessStrength);',
                'if (uRoadMarkingsAsphaltFineRoughnessStrength <= 1e-5) return 0.0;',
                'vec2 uv = worldXZ * uRoadMarkingsAsphaltFineScale;',
                'float r = texture2D(uRoadMarkingsAsphaltFineRoughnessMap, uv).r;',
                'float s = (r - uRoadMarkingsAsphaltFineBaseRoughness) / denom;',
                'return clamp(s, -1.0, 1.0);',
                '}',
                'float roadMarkingsVarHash12(vec2 p){',
                'vec3 p3 = fract(vec3(p.xyx) * 0.1031);',
                'p3 += dot(p3, p3.yzx + 33.33);',
                'return fract((p3.x + p3.y) * p3.z);',
                '}',
                'float roadMarkingsVarNoise(vec2 p){',
                'vec2 i = floor(p);',
                'vec2 f = fract(p);',
                'float a = roadMarkingsVarHash12(i);',
                'float b = roadMarkingsVarHash12(i + vec2(1.0, 0.0));',
                'float c = roadMarkingsVarHash12(i + vec2(0.0, 1.0));',
                'float d = roadMarkingsVarHash12(i + vec2(1.0, 1.0));',
                'vec2 u = f * f * (3.0 - 2.0 * f);',
                'return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;',
                '}',
                'float roadMarkingsVarFbm(vec2 p){',
                'mat2 r = mat2(0.80, -0.60, 0.60, 0.80);',
                'p = r * p;',
                'float n1 = roadMarkingsVarNoise(p);',
                'float n2 = roadMarkingsVarNoise(p * 2.07 + vec2(21.1, 5.7));',
                'return n1 * 0.68 + n2 * 0.32;',
                '}'
            ].join('\n')
        );
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_fragment>',
            [
                '#include <color_fragment>',
                'vec2 roadUv = (vRoadMarkingsWorldPos.xz - uRoadMarkingsMin) * uRoadMarkingsInvSize;',
                'roadUv = clamp(roadUv, 0.0, 1.0);',
                'roadUv.y = 1.0 - roadUv.y;',
                'vec4 roadMark = texture2D(uRoadMarkingsMap, roadUv);',
                'float roadMarkingsVar = roadMarkingsVarFbm((vRoadMarkingsWorldPos.xz + uRoadMarkingsVarSeed) * uRoadMarkingsVarScale);',
                'roadMarkingsVarSigned = (roadMarkingsVar - 0.5) * 2.0;',
                'roadMarkingsAsphaltNoiseSigned = roadMarkingsAsphaltNoiseCompute(vRoadMarkingsWorldPos.xz);',
                'vec3 roadMarkRgb = roadMark.rgb;',
                'roadMarkRgb *= (1.0 + uRoadMarkingsVarColorStrength * roadMarkingsVarSigned);',
                'roadMarkRgb *= (1.0 + uRoadMarkingsAsphaltNoiseColorStrength * roadMarkingsAsphaltNoiseSigned);',
                'roadMarkRgb = mix(roadMarkRgb, diffuseColor.rgb, clamp(uRoadMarkingsVarDirtyStrength, 0.0, 1.0) * roadMarkingsVar);',
                'if (uRoadMarkingsAsphaltNoiseDebug > 0.5) roadMarkRgb = vec3(0.5 + 0.5 * roadMarkingsAsphaltNoiseSigned);',
                'float a = roadMark.a;',
                'float w = fwidth(a);',
                'float edgeJitter = roadMarkingsVarSigned * uRoadMarkingsVarEdgeBreakStrength;',
                'roadMarkingsMask = uRoadMarkingsEnabled * smoothstep(0.5 - w, 0.5 + w, a + edgeJitter);',
                'diffuseColor.rgb = mix(diffuseColor.rgb, roadMarkRgb, roadMarkingsMask);'
            ].join('\n')
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <roughnessmap_fragment>',
            [
                '#include <roughnessmap_fragment>',
                'roadMarkingsRoughTarget = clamp(uRoadMarkingsBaseRoughness + uRoadMarkingsVarRoughnessStrength * roadMarkingsVarSigned + uRoadMarkingsAsphaltNoiseRoughnessStrength * roadMarkingsAsphaltNoiseSigned, 0.0, 1.0);',
                'roughnessFactor = mix(roughnessFactor, roadMarkingsRoughTarget, roadMarkingsMask);'
            ].join('\n')
        );

        mat.userData.roadMarkingsOverlayUniforms = shader.uniforms;
        mat.userData.roadMarkingsOverlayShaderPatched = shader.fragmentShader.includes('roadMarkingsMask =') || shader.fragmentShader.includes('roadMarkingsMask=');
        if (asphaltMarkingsCfg) asphaltMarkingsCfg.shaderUniforms = shader.uniforms;
    };

    const prevCacheKey = typeof mat.customProgramCacheKey === 'function' ? mat.customProgramCacheKey.bind(mat) : null;
    mat.customProgramCacheKey = () => {
        const prev = prevCacheKey ? prevCacheKey() : '';
        return `${prev}|AsphaltWithMarkings_v5`;
    };
    mat.needsUpdate = true;

    return mat;
}

function buildCombinedPolygonGeometry(polygonMeshData, y) {
    const list = Array.isArray(polygonMeshData) ? polygonMeshData : [];
    let totalVerts = 0;
    let totalIndices = 0;
    for (const mesh of list) {
        const vertices = Array.isArray(mesh?.vertices) ? mesh.vertices : [];
        const indices = Array.isArray(mesh?.indices) ? mesh.indices : [];
        if (vertices.length < 3 || indices.length < 3) continue;
        totalVerts += vertices.length;
        totalIndices += indices.length;
    }
    if (!totalVerts || !totalIndices) return null;

    const positions = new Float32Array(totalVerts * 3);
    const uvs = new Float32Array(totalVerts * 2);
    const use32 = totalVerts > 65535;
    const indices = use32 ? new Uint32Array(totalIndices) : new Uint16Array(totalIndices);

    let vOffset = 0;
    let iOffset = 0;
    for (const mesh of list) {
        const vertices = Array.isArray(mesh?.vertices) ? mesh.vertices : [];
        const inds = Array.isArray(mesh?.indices) ? mesh.indices : [];
        if (vertices.length < 3 || inds.length < 3) continue;

        for (let i = 0; i < vertices.length; i++) {
            const p = vertices[i];
            const base = (vOffset + i) * 3;
            const x = Number(p?.x) || 0;
            const z = Number(p?.z) || 0;
            positions[base] = x;
            positions[base + 1] = y;
            positions[base + 2] = z;

            const uvBase = (vOffset + i) * 2;
            uvs[uvBase] = x;
            uvs[uvBase + 1] = z;
        }

        for (let i = 0; i < inds.length; i++) {
            indices[iOffset + i] = vOffset + (inds[i] | 0);
        }

        vOffset += vertices.length;
        iOffset += inds.length;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
}

function buildDebugEdgesFromDerived(derived) {
    const edges = [];
    const segments = Array.isArray(derived?.segments) ? derived.segments : [];
    const roads = Array.isArray(derived?.roads) ? derived.roads : [];
    const roadNameById = new Map(roads.map((road) => [road?.id ?? null, road?.name ?? null]));

    for (const seg of segments) {
        const edgeId = seg?.id ?? null;
        const a = seg?.aPointId ?? null;
        const b = seg?.bPointId ?? null;
        if (!edgeId || !a || !b) continue;

        const pieces = Array.isArray(seg?.keptPieces) ? seg.keptPieces : [];
        if (!pieces.length) continue;

        let startPiece = null;
        let endPiece = null;
        for (const piece of pieces) {
            const t0 = Number(piece?.t0) || 0;
            const t1 = Number(piece?.t1) || 0;
            if (!startPiece || t0 < (Number(startPiece?.t0) || 0) - 1e-9) startPiece = piece;
            if (!endPiece || t1 > (Number(endPiece?.t1) || 0) + 1e-9) endPiece = piece;
        }

        const startCorners = Array.isArray(startPiece?.corners) ? startPiece.corners : [];
        const endCorners = Array.isArray(endPiece?.corners) ? endPiece.corners : [];
        if (startCorners.length !== 4 || endCorners.length !== 4) continue;

        const aWorld = seg?.aWorld ?? null;
        const bWorld = seg?.bWorld ?? null;
        if (!aWorld || !bWorld) continue;

        const halfLeft = Number(seg?.asphaltObb?.halfWidthLeft) || 0;
        const halfRight = Number(seg?.asphaltObb?.halfWidthRight) || 0;
        const width = Math.max(0, halfLeft + halfRight);
        const tag = roadNameById.get(seg?.roadId ?? null) ?? null;

        edges.push({
            edgeId,
            sourceId: seg?.roadId ?? null,
            a,
            b,
            tag: typeof tag === 'string' && tag.trim() ? tag.trim() : null,
            rendered: true,
            lanesF: seg?.lanesF ?? 0,
            lanesB: seg?.lanesB ?? 0,
            width,
            centerline: {
                a: { x: Number(aWorld.x) || 0, z: Number(aWorld.z) || 0 },
                b: { x: Number(bWorld.x) || 0, z: Number(bWorld.z) || 0 }
            },
            left: {
                a: { x: Number(startCorners[0]?.x) || 0, z: Number(startCorners[0]?.z) || 0 },
                b: { x: Number(endCorners[3]?.x) || 0, z: Number(endCorners[3]?.z) || 0 }
            },
            right: {
                a: { x: Number(startCorners[1]?.x) || 0, z: Number(startCorners[1]?.z) || 0 },
                b: { x: Number(endCorners[2]?.x) || 0, z: Number(endCorners[2]?.z) || 0 }
            }
        });
    }

    return edges;
}

function buildDebugIntersectionsFromDerived(derived) {
    const out = [];
    const junctions = Array.isArray(derived?.junctions) ? derived.junctions : [];
    for (const junction of junctions) {
        const surface = junction?.surface?.points ?? null;
        if (!Array.isArray(surface) || surface.length < 3) continue;
        out.push({
            id: junction?.id ?? null,
            points: surface.map((p) => ({ x: Number(p?.x) || 0, z: Number(p?.z) || 0 }))
        });
    }
    return out;
}

function buildDebugCornerJoinsFromDerived(derived) {
    const out = [];
    const segments = Array.isArray(derived?.segments) ? derived.segments : [];
    const segmentById = new Map(segments.map((seg) => [seg?.id ?? null, seg]));
    const junctions = Array.isArray(derived?.junctions) ? derived.junctions : [];

    for (const junction of junctions) {
        const endpoints = Array.isArray(junction?.endpoints) ? junction.endpoints : [];
        if (endpoints.length !== 2) continue;

        const nodeIds = [];
        for (const ep of endpoints) {
            const seg = segmentById.get(ep?.segmentId ?? null) ?? null;
            if (!seg) continue;
            if (ep?.end === 'a' && seg.aPointId) nodeIds.push(seg.aPointId);
            if (ep?.end === 'b' && seg.bPointId) nodeIds.push(seg.bPointId);
        }

        const uniq = Array.from(new Set(nodeIds));
        if (nodeIds.length !== 2 || uniq.length !== 1) continue;
        const nodeId = uniq[0];

        const endpointById = new Map(endpoints.map((ep) => [ep?.id ?? null, ep]));
        const connections = [];
        const tat = Array.isArray(junction?.tat) ? junction.tat : [];
        for (const entry of tat) {
            const aSide = entry?.aSide ?? null;
            const bSide = entry?.bSide ?? null;
            if (aSide !== 'left' && aSide !== 'right') continue;
            if (bSide !== 'left' && bSide !== 'right') continue;
            const aEp = endpointById.get(entry?.aEndpointId ?? null) ?? null;
            const bEp = endpointById.get(entry?.bEndpointId ?? null) ?? null;
            if (!aEp?.segmentId || !bEp?.segmentId) continue;
            connections.push({
                a: { edgeId: aEp.segmentId, side: aSide },
                b: { edgeId: bEp.segmentId, side: bSide }
            });
        }

        if (!connections.length) continue;

        out.push({
            nodeId,
            junctionId: junction?.id ?? null,
            connections
        });
    }

    out.sort((a, b) => String(a?.nodeId ?? '').localeCompare(String(b?.nodeId ?? '')));
    return out;
}

function buildCurbConnectorsFromDerived(derived) {
    const connectors = [];
    const junctions = Array.isArray(derived?.junctions) ? derived.junctions : [];
    for (const junction of junctions) {
        const endpointById = new Map();
        for (const ep of junction?.endpoints ?? []) {
            if (!ep?.id || !ep?.world || !ep?.dirOut) continue;
            endpointById.set(ep.id, ep);
        }
        for (const conn of junction?.connectors ?? []) {
            const a = endpointById.get(conn?.aEndpointId ?? null) ?? null;
            const b = endpointById.get(conn?.bEndpointId ?? null) ?? null;
            if (!a || !b) continue;

            const ax = Number(a.world.x) || 0;
            const az = Number(a.world.z) || 0;
            const bx = Number(b.world.x) || 0;
            const bz = Number(b.world.z) || 0;
            const dx = bx - ax;
            const dz = bz - az;
            const dist = Math.hypot(dx, dz);
            if (!(dist > 1e-6)) continue;
            const inv = 1 / dist;
            const dir2 = new THREE.Vector2(dx * inv, dz * inv);

            const connectorGeom = {
                segments: [
                    {
                        type: 'STRAIGHT',
                        startPoint: new THREE.Vector2(ax, az),
                        endPoint: new THREE.Vector2(bx, bz),
                        length: dist,
                        direction: dir2
                    }
                ]
            };

            connectors.push({
                id: conn?.id ?? null,
                tag: 'junction',
                p0: {
                    x: ax,
                    z: az,
                    arrowRole: 'p0',
                    arrowDir: { x: Number(a.dirOut.x) || 0, z: Number(a.dirOut.z) || 0 },
                    connector: connectorGeom
                },
                p1: {
                    x: bx,
                    z: bz,
                    arrowRole: 'p1',
                    arrowDir: { x: Number(b.dirOut.x) || 0, z: Number(b.dirOut.z) || 0 },
                    connector: connectorGeom
                },
                dir0: { x: Number(a.dirOut.x) || 0, z: Number(a.dirOut.z) || 0 },
                dir1: { x: Number(b.dirOut.x) || 0, z: Number(b.dirOut.z) || 0 },
                connector: connectorGeom
            });
        }
    }
    connectors.sort((a, b) => String(a?.id ?? '').localeCompare(String(b?.id ?? '')));
    return connectors;
}

export function createRoadEngineRoads({
    map = null,
    roads = null,
    config = null,
    materials = null,
    options = null
} = {}) {
    const opt = options && typeof options === 'object' ? options : {};

    const { road: roadCfg, ground: groundCfg, render } = resolveRoadConfig(config);
    const tileSize = Math.max(EPS, clampNumber(map?.tileSize, 1));
    const origin = map?.origin ?? { x: 0, z: 0 };

    const debugMode = (render?.roadMode ?? null) === 'debug';
    const mats = resolveMaterials(materials, { debugMode });

    const roadVisuals = (roadCfg?.visuals && typeof roadCfg.visuals === 'object') ? roadCfg.visuals : null;
    const asphaltVisuals = (roadVisuals?.asphalt && typeof roadVisuals.asphalt === 'object') ? roadVisuals.asphalt : null;
    const markingsVisuals = (roadVisuals?.markings && typeof roadVisuals.markings === 'object') ? roadVisuals.markings : null;
    const asphaltEnabled = !debugMode && asphaltVisuals?.enabled !== false;
    const markingsWhiteColorHex = Number.isFinite(markingsVisuals?.whiteColorHex)
        ? (Number(markingsVisuals.whiteColorHex) >>> 0) & 0xffffff
        : ROAD_MARKING_WHITE_TARGET_SUN_HEX;
    const markingsYellowColorHex = Number.isFinite(markingsVisuals?.yellowColorHex)
        ? (Number(markingsVisuals.yellowColorHex) >>> 0) & 0xffffff
        : ROAD_MARKING_YELLOW_TARGET_SUN_HEX;
    const markingsBaseRoughness = Math.max(0, Math.min(1, clampNumber(markingsVisuals?.baseRoughness, 0.55)));
    const roadSeed = map?.roadNetwork?.seed ?? null;
    const seedVec2 = hashStringToVec2(String(roadSeed ?? 'roads'));
    const asphaltNoise = opt.asphaltNoise ?? getResolvedAsphaltNoiseSettings();
    const sidewalkEdgeStrip = getSidewalkEdgeDirtStripConfig(asphaltNoise);
    const edgeWearMaxWidth = 2.5;

    if (!debugMode) {
        if (asphaltEnabled) {
            applyAsphaltRoadVisualsToMeshStandardMaterial(mats.road, {
                asphaltNoise,
                seed: roadSeed ?? 'roads',
                baseColorHex: 0x2b2b2b,
                baseRoughness: 0.95
            });
            applyAsphaltEdgeWearVisualsToMeshStandardMaterial(mats.roadEdgeWear, {
                asphaltNoise,
                seed: roadSeed ?? 'roads',
                maxWidth: edgeWearMaxWidth
            });
        }

        if (mats.laneWhite?.color?.setHex) mats.laneWhite.color.setHex(markingsWhiteColorHex);
        if (mats.laneYellow?.color?.setHex) mats.laneYellow.color.setHex(markingsYellowColorHex);
        if (mats.laneWhite?.isMeshStandardMaterial) mats.laneWhite.roughness = markingsBaseRoughness;
        if (mats.laneYellow?.isMeshStandardMaterial) mats.laneYellow.roughness = markingsBaseRoughness;
        applySidewalkEdgeDirtStripVisualsToMeshStandardMaterial(mats.sidewalkEdgeDirt, { asphaltNoise });

        const markingsEnabled = markingsVisuals?.enabled !== false;
        if (markingsEnabled) {
            const cfg = {
                scale: clampNumber(markingsVisuals?.scale, 1.4),
                colorStrength: clampNumber(markingsVisuals?.colorStrength, 0.12),
                dirtyStrength: clampNumber(markingsVisuals?.dirtyStrength, 0.35),
                roughnessStrength: clampNumber(markingsVisuals?.roughnessStrength, 0.26),
                seed: seedVec2
            };
            applyRoadSurfaceVariationToMeshStandardMaterial(mats.laneWhite, cfg);
            applyRoadSurfaceVariationToMeshStandardMaterial(mats.laneYellow, cfg);
        }

        const fineRoughnessMap = mats.road?.userData?.asphaltFineTextures?.roughnessMap ?? mats.road?.roughnessMap ?? null;
        const fineNormalMap = mats.road?.userData?.asphaltFineTextures?.normalMap ?? mats.road?.normalMap ?? null;
        applyAsphaltMarkingsNoiseVisualsToMeshStandardMaterial(mats.laneWhite, {
            asphaltNoise,
            asphaltFineRoughnessMap: fineRoughnessMap,
            asphaltFineNormalMap: fineNormalMap,
            asphaltFineScale: asphaltNoise?.fine?.scale,
            asphaltFineBaseRoughness: 0.95,
            asphaltFineRoughnessStrength: asphaltNoise?.fine?.roughnessStrength,
            asphaltFineNormalStrength: asphaltNoise?.fine?.normalStrength
        });
        applyAsphaltMarkingsNoiseVisualsToMeshStandardMaterial(mats.laneYellow, {
            asphaltNoise,
            asphaltFineRoughnessMap: fineRoughnessMap,
            asphaltFineNormalMap: fineNormalMap,
            asphaltFineScale: asphaltNoise?.fine?.scale,
            asphaltFineBaseRoughness: 0.95,
            asphaltFineRoughnessStrength: asphaltNoise?.fine?.roughnessStrength,
            asphaltFineNormalStrength: asphaltNoise?.fine?.normalStrength
        });
    }
    const includeCurbs = opt.includeCurbs !== false;
    const includeSidewalks = opt.includeSidewalks !== false;
    const includeMarkings = opt.includeMarkings !== false;
    const includeJunctions = opt.includeJunctions !== false;
    const includeDebug = opt.includeDebug !== false;
    const markingsMode = (opt.markingsMode === 'baked') ? 'baked' : 'meshes';

    const laneWidth = Math.max(EPS, clampNumber(roadCfg?.laneWidth, 4.8));
    const shoulder = Math.max(0, clampNumber(roadCfg?.shoulder, 0.525));
    const marginFactor = shoulder / laneWidth;

    const baseRoadY = clampNumber(roadCfg?.surfaceY, 0.02);
    const groundY = clampNumber(groundCfg?.surfaceY, baseRoadY);

    const asphaltY = groundY;
    const markingsLift = Math.max(0.01, clampNumber(roadCfg?.markings?.lift, 0.01));
    const markingY = asphaltY + markingsLift;
    const arrowY = markingY;
    const crosswalkY = markingY;

    const curbThickness = Math.max(0, clampNumber(roadCfg?.curb?.thickness, 0.48));
    const curbHeight = Math.max(0, clampNumber(roadCfg?.curb?.height, 0.17));
    const curbExtraHeight = Math.max(0, clampNumber(roadCfg?.curb?.extraHeight, 0));
    const curbSink = Math.max(0, clampNumber(roadCfg?.curb?.sink, 0));
    const sidewalkWidth = Math.max(0, clampNumber(roadCfg?.sidewalk?.extraWidth, 0));
    const sidewalkLift = Math.max(0, clampNumber(roadCfg?.sidewalk?.lift, 0));

    const junctionCfg = (roadCfg?.junctions && typeof roadCfg.junctions === 'object') ? roadCfg.junctions : null;
    const junctionSettings = includeJunctions ? { enabled: true, autoCreate: true } : { enabled: false };
    if (includeJunctions && junctionCfg) {
        if (Object.prototype.hasOwnProperty.call(junctionCfg, 'enabled')) {
            junctionSettings.enabled = junctionCfg.enabled !== false;
        }
        if (Object.prototype.hasOwnProperty.call(junctionCfg, 'autoCreate')) {
            junctionSettings.autoCreate = junctionCfg.autoCreate === true;
        }
        const thresholdFactor = Number(junctionCfg.thresholdFactor);
        if (Number.isFinite(thresholdFactor)) junctionSettings.thresholdFactor = thresholdFactor;
        const filletRadiusFactor = Number(junctionCfg.filletRadiusFactor);
        if (Number.isFinite(filletRadiusFactor)) junctionSettings.filletRadiusFactor = filletRadiusFactor;
        const minThreshold = Number(junctionCfg.minThreshold);
        if (Number.isFinite(minThreshold)) junctionSettings.minThreshold = minThreshold;
        const maxThreshold = Number(junctionCfg.maxThreshold);
        if (Number.isFinite(maxThreshold)) junctionSettings.maxThreshold = maxThreshold;
    }

    const trimCfg = (roadCfg?.trim && typeof roadCfg.trim === 'object') ? roadCfg.trim : null;
    let trimThresholdFactor = Number(trimCfg?.thresholdFactor);
    if (!Number.isFinite(trimThresholdFactor)) trimThresholdFactor = 0.1;
    trimThresholdFactor = Math.max(0, trimThresholdFactor);
    const trimSettings = { enabled: true, threshold: laneWidth * trimThresholdFactor };

    const roadSchema = Array.isArray(roads)
        ? roads
        : (map ? buildRoadEngineRoadsFromCityMap(map) : []);

    const derived = computeRoadEngineEdges({
        roads: roadSchema,
        settings: {
            tileSize,
            laneWidth,
            marginFactor,
            origin,
            flags: {
                centerline: false,
                directionCenterlines: false,
                laneEdges: false,
                asphaltEdges: false,
                markers: false,
                asphaltObb: false
            },
            junctions: junctionSettings,
            trim: trimSettings
        }
    });

    const group = new THREE.Group();
    group.name = 'Roads';

    const primitives = Array.isArray(derived?.primitives) ? derived.primitives : [];
    const asphaltPolys = primitives.filter((p) => p?.type === 'polygon' && (p.kind === 'asphalt_piece' || p.kind === 'junction_surface'));

    let markings = null;
    let markingsTexture = null;
    const useMarkingMeshes = includeMarkings && (markingsMode === 'meshes' || debugMode);
    const useMarkingTexture = includeMarkings && !useMarkingMeshes;

    if (includeMarkings) {
        markings = buildRoadMarkingsMeshDataFromRoadEngineDerived(derived, {
            laneWidth,
            markingY,
            arrowY,
            crosswalkY,
            boundaryEpsilon: 1e-4
        });

        if (useMarkingTexture && map) {
            const bounds = getMapBoundsXZ(map);
            const markingsCfg = (roadCfg?.markings && typeof roadCfg.markings === 'object') ? roadCfg.markings : null;
            const markingsLineWidth = clampNumber(markingsCfg?.lineWidth, null);
            const markingsPixelsPerMeter = Math.max(0.1, clampNumber(opt.markingsTexturePixelsPerMeter, 6));
            const markingsMaxSize = Math.max(256, Math.trunc(clampNumber(opt.markingsTextureMaxSize, 4096)));
            markingsTexture = createRoadMarkingsTexture(markings, {
                bounds,
                laneWidth,
                lineWidthMeters: markingsLineWidth,
                pixelsPerMeter: markingsPixelsPerMeter,
                maxSize: markingsMaxSize,
                whiteColorHex: markingsWhiteColorHex,
                yellowColorHex: markingsYellowColorHex
            });
            if (markingsTexture) {
                const markingsDebug = {
                    whiteLineSegments: markings?.whiteLineSegments?.length ?? 0,
                    yellowLineSegments: markings?.yellowLineSegments?.length ?? 0,
                    crosswalkPositions: markings?.crosswalkPositions?.length ?? 0,
                    arrowPositions: markings?.arrowPositions?.length ?? 0
                };
                mats.road = createAsphaltMaterialWithMarkings(mats.road, {
                    markingsTexture,
                    bounds,
                    markingsVisuals,
                    markingsSeed: seedVec2,
                    asphaltNoise,
                    markingsDebug
                });
            }
        }
    }

    const polygonMeshData = buildRoadEnginePolygonMeshData(asphaltPolys);
    const geo = buildCombinedPolygonGeometry(polygonMeshData, asphaltY);
    const asphaltMesh = geo ? new THREE.Mesh(geo, mats.road) : null;
    if (asphaltMesh) {
        asphaltMesh.name = 'Asphalt';
        asphaltMesh.receiveShadow = true;
        group.add(asphaltMesh);
    }

    let asphaltEdgeWearMesh = null;
    if (asphaltEnabled && asphaltPolys.length) {
        const edgeWearData = buildRoadAsphaltEdgeWearMeshDataFromRoadEnginePrimitives(asphaltPolys, {
            surfaceY: asphaltY,
            lift: 0.0009,
            maxWidth: edgeWearMaxWidth,
            boundaryEpsilon: 1e-4,
            miterLimit: 4
        });
        if (edgeWearData?.positions?.length) {
            const edgeGeo = new THREE.BufferGeometry();
            edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgeWearData.positions, 3));
            edgeGeo.setAttribute('uv', new THREE.BufferAttribute(edgeWearData.uvs, 2));
            edgeGeo.computeVertexNormals();
            edgeGeo.computeBoundingSphere();
            asphaltEdgeWearMesh = new THREE.Mesh(edgeGeo, mats.roadEdgeWear);
            asphaltEdgeWearMesh.name = 'AsphaltEdgeWear';
            asphaltEdgeWearMesh.renderOrder = 2;
            group.add(asphaltEdgeWearMesh);
        }
    }

    let curbMesh = null;
    if (includeCurbs && curbThickness > EPS && curbHeight > EPS && asphaltPolys.length) {
        const curbData = buildRoadCurbMeshDataFromRoadEnginePrimitives(asphaltPolys, {
            surfaceY: asphaltY,
            curbThickness,
            curbHeight,
            curbExtraHeight,
            curbSink,
            boundaryEpsilon: 1e-4,
            miterLimit: 4
        });
        if (curbData?.positions?.length) {
            const curbGeo = new THREE.BufferGeometry();
            curbGeo.setAttribute('position', new THREE.BufferAttribute(curbData.positions, 3));
            curbGeo.computeVertexNormals();
            curbGeo.computeBoundingSphere();
            curbMesh = new THREE.Mesh(curbGeo, mats.curb);
            curbMesh.name = 'CurbBlocks';
            curbMesh.receiveShadow = true;
            group.add(curbMesh);
        }
    }

    let sidewalkMesh = null;
    if (includeSidewalks && sidewalkWidth > EPS && asphaltPolys.length) {
        const sidewalkData = buildRoadSidewalkMeshDataFromRoadEnginePrimitives(asphaltPolys, {
            surfaceY: asphaltY,
            curbThickness,
            curbHeight: curbHeight + curbExtraHeight,
            sidewalkWidth,
            sidewalkLift,
            boundaryEpsilon: 1e-4,
            miterLimit: 4
        });
        if (sidewalkData?.positions?.length) {
            const sidewalkGeo = new THREE.BufferGeometry();
            sidewalkGeo.setAttribute('position', new THREE.BufferAttribute(sidewalkData.positions, 3));
            sidewalkGeo.computeVertexNormals();
            sidewalkGeo.computeBoundingSphere();
            sidewalkMesh = new THREE.Mesh(sidewalkGeo, mats.sidewalk);
            sidewalkMesh.name = 'Sidewalk';
            sidewalkMesh.receiveShadow = true;
            group.add(sidewalkMesh);
        }
    }

    let sidewalkEdgeDirtMesh = null;
    if (!debugMode && includeSidewalks && sidewalkWidth > EPS && sidewalkEdgeStrip.width > EPS && asphaltPolys.length) {
        const stripData = buildRoadSidewalkEdgeDirtStripMeshDataFromRoadEnginePrimitives(asphaltPolys, {
            surfaceY: asphaltY,
            curbThickness,
            sidewalkWidth,
            stripWidth: sidewalkEdgeStrip.width,
            lift: 0.0012,
            boundaryEpsilon: 1e-4,
            miterLimit: 4
        });
        if (stripData?.positions?.length) {
            const stripGeo = new THREE.BufferGeometry();
            stripGeo.setAttribute('position', new THREE.BufferAttribute(stripData.positions, 3));
            stripGeo.setAttribute('uv', new THREE.BufferAttribute(stripData.uvs, 2));
            stripGeo.computeVertexNormals();
            stripGeo.computeBoundingSphere();
            sidewalkEdgeDirtMesh = new THREE.Mesh(stripGeo, mats.sidewalkEdgeDirt);
            sidewalkEdgeDirtMesh.name = 'SidewalkGrassEdgeDirtStrip';
            sidewalkEdgeDirtMesh.visible = sidewalkEdgeStrip.enabled;
            sidewalkEdgeDirtMesh.renderOrder = 1;
            group.add(sidewalkEdgeDirtMesh);
        }
    }

    const markingsGroup = new THREE.Group();
    markingsGroup.name = 'Markings';
    group.add(markingsGroup);

    if (useMarkingMeshes && markings) {
        const getBaseOrder = () => Math.max(
            clampNumber(asphaltMesh?.renderOrder, 0),
            clampNumber(asphaltEdgeWearMesh?.renderOrder, 0)
        ) + 1;

    const syncDecalMaterial = (mat, { relativeTo } = {}) => {
            if (!mat) return;
            const rel = relativeTo ?? null;
            let factor = -3;
            let units = -16;
            if (rel?.polygonOffset) {
                const relFactor = clampNumber(rel?.polygonOffsetFactor, 0);
                const relUnits = clampNumber(rel?.polygonOffsetUnits, 0);
                factor = Math.min(factor, relFactor - 2);
                units = Math.min(units, relUnits - 4);
            }
            mat.transparent = true;
            mat.opacity = 1.0;
            mat.depthWrite = false;
            mat.blending = THREE.NoBlending;
            mat.polygonOffset = true;
            mat.polygonOffsetFactor = factor;
            mat.polygonOffsetUnits = units;
        };

        const syncMarkings = (meshesRef) => {
            const baseOrder = getBaseOrder();
            const markMeshes = [
                meshesRef?.markingsWhite ?? null,
                meshesRef?.markingsYellow ?? null,
                meshesRef?.crosswalks ?? null,
                meshesRef?.arrows ?? null
            ].filter(Boolean);
            for (const mesh of markMeshes) mesh.renderOrder = baseOrder;

            const roadMat = asphaltMesh?.material ?? null;
            syncDecalMaterial(mats.laneWhite, { relativeTo: roadMat });
            syncDecalMaterial(mats.laneYellow, { relativeTo: roadMat });
        };

        const baseOrder = getBaseOrder();
        const meshes = createRoadMarkingsMeshesFromData(markings, {
            laneWidth,
            materials: { white: mats.laneWhite, yellow: mats.laneYellow },
            renderOrder: { white: baseOrder, yellow: baseOrder, crosswalk: baseOrder, arrow: baseOrder }
        });

        if (meshes.markingsWhite) markingsGroup.add(meshes.markingsWhite);
        if (meshes.markingsYellow) markingsGroup.add(meshes.markingsYellow);
        if (meshes.crosswalks) markingsGroup.add(meshes.crosswalks);
        if (meshes.arrows) markingsGroup.add(meshes.arrows);

        syncMarkings(meshes);
        const driver = meshes.markingsWhite ?? meshes.markingsYellow ?? meshes.crosswalks ?? meshes.arrows ?? null;
        if (driver) {
            const prev = typeof driver.onBeforeRender === 'function' ? driver.onBeforeRender.bind(driver) : null;
            driver.onBeforeRender = (...args) => {
                if (prev) prev(...args);
                syncMarkings(meshes);
            };
        }
    }

    const debug = includeDebug ? {
        source: 'road_engine',
        derived,
        edges: buildDebugEdgesFromDerived(derived),
        cornerJoins: buildDebugCornerJoinsFromDerived(derived),
        intersections: buildDebugIntersectionsFromDerived(derived),
        groundY,
        asphaltY
    } : null;

    const curbConnectors = includeDebug ? buildCurbConnectorsFromDerived(derived) : [];

    return {
        group,
        asphalt: asphaltMesh,
        asphaltEdgeWear: asphaltEdgeWearMesh,
        curbBlocks: curbMesh,
        sidewalk: sidewalkMesh,
        sidewalkEdgeDirt: sidewalkEdgeDirtMesh,
        markingsWhite: markingsGroup.getObjectByName('MarkingsWhite') ?? null,
        markingsYellow: markingsGroup.getObjectByName('MarkingsYellow') ?? null,
        curbConnectors,
        debug
    };
}
