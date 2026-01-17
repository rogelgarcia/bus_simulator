// src/graphics/assets3d/generators/building_fabrication/BuildingFabricationGenerator.js
// Generates building fabrication meshes from layer definitions.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

import { ROOF_COLOR, resolveRoofColorHex } from '../../../../app/buildings/RoofColor.js';
import { resolveBeltCourseColorHex } from '../../../../app/buildings/BeltCourseColor.js';
import { BUILDING_STYLE } from '../../../../app/buildings/BuildingStyle.js';
import { WINDOW_TYPE, getDefaultWindowParams, getWindowTexture, isWindowTypeId } from '../buildings/WindowTextureGenerator.js';
import { computeBuildingLoopsFromTiles, offsetOrthogonalLoopXZ, resolveBuildingStyleWallMaterialUrls } from '../buildings/BuildingGenerator.js';
import { LAYER_TYPE, normalizeBuildingLayers } from './BuildingFabricationTypes.js';
import { applyMaterialVariationToMeshStandardMaterial, computeMaterialVariationSeedFromTiles, MATERIAL_VARIATION_ROOT } from '../../materials/MaterialVariationSystem.js';

const EPS = 1e-6;

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

    mat.needsUpdate = true;
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

    mat.needsUpdate = true;
    return mat;
}

function makeWallMaterialFromSpec({ material, baseColorHex, textureCache }) {
    if (material?.kind === 'color') {
        return new THREE.MeshStandardMaterial({
            color: resolveBeltCourseColorHex(material.id),
            roughness: 0.85,
            metalness: 0.05
        });
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

    return new THREE.MeshStandardMaterial({
        color: resolveBeltCourseColorHex(material?.id),
        roughness: 0.9,
        metalness: 0.0
    });
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

    return new THREE.MeshStandardMaterial({
        color: resolveRoofColorHex(material?.id, baseColorHex),
        roughness: 0.85,
        metalness: 0.05,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
    });
}

function makeWindowMaterial({ typeId, params, windowWidth, windowHeight } = {}) {
    const safeTypeId = isWindowTypeId(typeId) ? typeId : WINDOW_TYPE.STYLE_DEFAULT;
    const safeParams = { ...getDefaultWindowParams(safeTypeId), ...(params ?? {}) };
    const wantsAlpha = safeTypeId === WINDOW_TYPE.ARCH_V1;
    return new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: getWindowTexture({ typeId: safeTypeId, params: safeParams, windowWidth, windowHeight }),
        roughness: 0.4,
        metalness: 0.0,
        emissive: new THREE.Color(0x0b1f34),
        emissiveIntensity: 0.35,
        transparent: wantsAlpha,
        alphaTest: wantsAlpha ? 0.01 : 0.0
    });
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
    textureCache = null,
    renderer = null,
    colors = null,
    overlays = null,
    walls = null
} = {}) {
    const footprintLoops = computeBuildingLoopsFromTiles({ map, tiles, generatorConfig, tileSize, occupyRatio });
    if (!footprintLoops.length) return null;

    const safeLayers = normalizeBuildingLayers(layers);
    const tileCount = Array.isArray(tiles) ? tiles.length : 0;
    const baseColorHex = makeDeterministicColor(tileCount * 97 + safeLayers.length * 31).getHex();
    const matVarSeed = computeMaterialVariationSeedFromTiles(tiles, { salt: 'building' });

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

    const beltsGroup = new THREE.Group();
    beltsGroup.name = 'belts';

    const roofRingGroup = new THREE.Group();
    roofRingGroup.name = 'roof_rings';

    const roofMatTemplate = new THREE.MeshStandardMaterial({
        color: resolveRoofColorHex(ROOF_COLOR.DEFAULT, baseColorHex),
        roughness: 0.85,
        metalness: 0.05
    });

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
            const wallIsPbr = !!wallUrls?.ormUrl;
            if (wallIsPbr) {
                applyMaterialVariationToMeshStandardMaterial(wallMat, {
                    seed: matVarSeed,
                    seedOffset: layerIndex,
                    heightMin: baseY,
                    heightMax: matVarHeightMax,
                    root: MATERIAL_VARIATION_ROOT.WALL
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

            const windowOffset = 0.05;
            const cornerEps = 0.12;

            const windowMat = winEnabled ? makeWindowMaterial({
                typeId: winTypeId,
                params: winParams,
                windowWidth: winWidth,
                windowHeight: winDesiredHeight
            }) : null;

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

            const layerStartY = yCursor;
            for (let floor = 0; floor < floors; floor++) {
                if (showFloors && (solidMeshes.length || floor > 0 || Math.abs(yCursor - baseY) > EPS)) {
                    appendLoopLinePositions(floorPositions, planLoops, yCursor);
                }

                const floorExtra = firstFloorPendingExtra;
                const segHeight = floorHeight + (floor === 0 ? floorExtra : 0);
                if (floor === 0) firstFloorPendingExtra = 0;

                for (const outerLoop of wallOuter) {
                    if (!outerLoop || outerLoop.length < 3) continue;
                    const shape = buildShapeFromLoops({ outerLoop, holeLoops: wallHoles });
                    const geo = new THREE.ExtrudeGeometry(shape, {
                        depth: segHeight,
                        bevelEnabled: false,
                        steps: 1
                    });
                    geo.rotateX(-Math.PI / 2);
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

                                const geo = new THREE.PlaneGeometry(winWidth, windowHeight);
                                const mesh = new THREE.Mesh(geo, windowMat);
                                mesh.position.set(cx, y, cz);
                                mesh.rotation.set(0, yaw, 0);
                                mesh.castShadow = false;
                                mesh.receiveShadow = false;
                                windowsGroup.add(mesh);
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
            const roofIsPbr = !!roofUrls?.ormUrl;
            if (roofIsPbr) {
                applyMaterialVariationToMeshStandardMaterial(roofMat, {
                    seed: matVarSeed,
                    seedOffset: 100 + layerIndex,
                    heightMin: baseY,
                    heightMax: matVarHeightMax,
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
