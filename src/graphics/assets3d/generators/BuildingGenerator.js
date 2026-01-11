// src/graphics/assets3d/generators/BuildingGenerator.js
// Generates building meshes from city building footprints
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { BUILDING_STYLE, isBuildingStyle } from '../../../app/city/BuildingStyle.js';

const EPS = 1e-6;
const QUANT = 1000;
let _windowTexture = null;
const BUILDING_TEXTURE_BASE_URL = new URL('../../../../assets/public/textures/buildings/', import.meta.url);

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
    return Math.round(value * QUANT);
}

function uq(value) {
    return value / QUANT;
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

function applyTextureColorSpace(tex, { srgb = true } = {}) {
    if (!tex) return;
    if ('colorSpace' in tex) {
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        return;
    }
    if ('encoding' in tex) tex.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
}

function makeDeterministicColor(seed) {
    const s = Math.sin(seed * 999.123) * 43758.5453;
    const r = s - Math.floor(s);
    const color = new THREE.Color();
    color.setHSL(r, 0.55, 0.58);
    return color;
}

function tileKey(x, y) {
    return `${x},${y}`;
}

function makeCanvas(size) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
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
    return tex;
}

export function getBuildingWindowTexture() {
    if (_windowTexture) return _windowTexture;

    const size = 256;
    const { c, ctx } = makeCanvas(size);
    const w = size;
    const h = size;

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#10395a');
    grad.addColorStop(1, '#061a2c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const frame = 16;
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

    _windowTexture = canvasToTexture(c, { srgb: true });
    _windowTexture.userData = _windowTexture.userData ?? {};
    _windowTexture.userData.buildingShared = true;
    return _windowTexture;
}

export function computeEvenWindowLayout({
    length,
    windowWidth,
    desiredGap,
    cornerEps = 0.05
} = {}) {
    const L = Number(length);
    const w = clamp(windowWidth, 0.2, 50);
    const g = clamp(desiredGap, 0, 50);
    if (!Number.isFinite(L) || !(L > 0) || !(w > 0)) return { count: 0, gap: 0, starts: [] };

    let count = Math.floor((L + g) / (w + g));
    if (!Number.isFinite(count) || count < 0) count = 0;
    if (count === 0) return { count: 0, gap: 0, starts: [] };

    const eps = Math.max(0.001, Number(cornerEps) || 0);

    let gap = 0;
    while (count > 0) {
        gap = (L - count * w) / (count + 1);
        if (gap > eps) break;
        count -= 1;
    }

    if (count <= 0) return { count: 0, gap: 0, starts: [] };
    gap = (L - count * w) / (count + 1);

    const starts = [];
    for (let i = 0; i < count; i++) starts.push(gap + i * (w + gap));
    return { count, gap, starts };
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

function buildingFootprintMargins({ tileSize, occupyRatio, generatorConfig }) {
    const baseMargin = tileSize * (1 - occupyRatio) * 0.5;

    const roadCfg = generatorConfig?.road ?? {};
    const sidewalkWidth = Number.isFinite(roadCfg?.sidewalk?.extraWidth) ? roadCfg.sidewalk.extraWidth : 0;
    const curbT = Number.isFinite(roadCfg?.curb?.thickness) ? roadCfg.curb.thickness : 0;
    const roadMargin = baseMargin + Math.max(0, sidewalkWidth + curbT * 0.5);

    return { baseMargin, roadMargin };
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

    const planBase = (hasSidewalk && Number.isFinite(sidewalkSurfaceY)) ? sidewalkSurfaceY : (Number.isFinite(baseRoadY) ? baseRoadY : (Number.isFinite(groundY) ? groundY : 0));
    const planY = planBase + 0.07;

    return { baseY, extraFirstFloor: extra, planY };
}

function normalizeTileList(tiles) {
    const out = [];
    if (!Array.isArray(tiles)) return out;
    for (const tile of tiles) {
        if (Array.isArray(tile) && tile.length >= 2) {
            out.push({ x: tile[0] | 0, y: tile[1] | 0 });
            continue;
        }
        if (tile && Number.isFinite(tile.x) && Number.isFinite(tile.y)) {
            out.push({ x: tile.x | 0, y: tile.y | 0 });
        }
    }
    return out;
}

export class BuildingWallTextureCache {
    constructor({ renderer = null, textureLoader = null } = {}) {
        this._renderer = renderer ?? null;
        this._loader = textureLoader ?? new THREE.TextureLoader();
        this._cache = new Map();
    }

    dispose() {
        for (const entry of this._cache.values()) {
            entry?.texture?.dispose?.();
        }
        this._cache.clear();
    }

    _configureTexture(tex) {
        if (!tex) return;
        tex.userData = tex.userData ?? {};
        tex.userData.buildingShared = true;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;

        const renderer = this._renderer;
        if (renderer?.capabilities?.getMaxAnisotropy) {
            tex.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
        } else {
            tex.anisotropy = 16;
        }

        applyTextureColorSpace(tex, { srgb: true });
        tex.needsUpdate = true;
    }

    trackMaterial(url, material) {
        const safeUrl = typeof url === 'string' && url ? url : null;
        if (!safeUrl || !material) return null;

        let entry = this._cache.get(safeUrl);
        if (!entry) {
            entry = { texture: null, promise: null, materials: new Set() };
            this._cache.set(safeUrl, entry);
        }

        entry.materials.add(material);

        if (entry.texture) {
            material.map = entry.texture;
            material.needsUpdate = true;
            return entry.texture;
        }

        if (!entry.promise) {
            const promise = new Promise((resolve, reject) => {
                this._loader.load(
                    safeUrl,
                    (tex) => resolve(tex),
                    undefined,
                    (err) => reject(err)
                );
            });
            entry.promise = promise;

            promise.then((tex) => {
                const next = this._cache.get(safeUrl);
                if (!next || next.promise !== promise) {
                    tex.dispose?.();
                    return;
                }

                this._configureTexture(tex);
                next.texture = tex;
                next.promise = null;

                for (const mat of next.materials) {
                    if (!mat) continue;
                    mat.map = tex;
                    mat.needsUpdate = true;
                }
            }).catch(() => {
                const next = this._cache.get(safeUrl);
                if (next?.promise === promise) {
                    next.promise = null;
                    next.materials.clear();
                    this._cache.delete(safeUrl);
                }
            });
        }

        return null;
    }
}

export function resolveBuildingStyleWallTextureUrl(styleId) {
    const id = isBuildingStyle(styleId) ? styleId : BUILDING_STYLE.DEFAULT;
    if (id === BUILDING_STYLE.BRICK) return new URL('brick_wall.png', BUILDING_TEXTURE_BASE_URL).toString();
    if (id === BUILDING_STYLE.CEMENT) return new URL('cement.png', BUILDING_TEXTURE_BASE_URL).toString();
    if (id === BUILDING_STYLE.STONE_1) return new URL('stonewall_1.png', BUILDING_TEXTURE_BASE_URL).toString();
    if (id === BUILDING_STYLE.STONE_2) return new URL('stonewall_2.png', BUILDING_TEXTURE_BASE_URL).toString();
    return null;
}

export function resolveBuildingStyleLabel(styleId) {
    const id = isBuildingStyle(styleId) ? styleId : BUILDING_STYLE.DEFAULT;
    if (id === BUILDING_STYLE.DEFAULT) return 'Default';
    if (id === BUILDING_STYLE.BRICK) return 'Brick';
    if (id === BUILDING_STYLE.CEMENT) return 'Cement';
    if (id === BUILDING_STYLE.STONE_1) return 'Stone 1';
    if (id === BUILDING_STYLE.STONE_2) return 'Stone 2';
    if (id === BUILDING_STYLE.LEGACY_TEXTURE) return 'Legacy texture';
    return 'Default';
}

export function getBuildingStyleOptions() {
    const ids = [
        BUILDING_STYLE.DEFAULT,
        BUILDING_STYLE.BRICK,
        BUILDING_STYLE.CEMENT,
        BUILDING_STYLE.STONE_1,
        BUILDING_STYLE.STONE_2
    ];
    return ids.map((id) => ({
        id,
        label: resolveBuildingStyleLabel(id),
        wallTextureUrl: resolveBuildingStyleWallTextureUrl(id)
    }));
}

export function computeBuildingLoopsFromTiles({
    map,
    tiles,
    generatorConfig = null,
    tileSize = null,
    occupyRatio = 1.0
} = {}) {
    if (!map) return [];
    const size = Number.isFinite(tileSize) ? tileSize : map.tileSize;
    if (!(size > EPS)) return [];

    const tileList = normalizeTileList(tiles);
    if (!tileList.length) return [];

    const tileSet = new Set();
    for (const t of tileList) tileSet.add(tileKey(t.x, t.y));

    const { baseMargin, roadMargin } = buildingFootprintMargins({
        tileSize: size,
        occupyRatio: clamp(occupyRatio, 0.5, 1.0),
        generatorConfig
    });

    const halfTile = size * 0.5;
    const maxMargin = halfTile * 0.85;

    const rects = [];
    const isRoad = (x, y) => {
        if (!map?.inBounds?.(x, y)) return false;
        const idx = map.index(x, y);
        return map.kind?.[idx] === 1;
    };

    const getMargin = (internal, neighborRoad) => {
        if (internal) return 0;
        if (neighborRoad) return roadMargin;
        return baseMargin;
    };

    for (const { x, y } of tileList) {
        if (!map.inBounds(x, y)) continue;
        const idx = map.index(x, y);
        if (map.kind?.[idx] === 1) continue;

        const westKey = tileKey(x - 1, y);
        const eastKey = tileKey(x + 1, y);
        const southKey = tileKey(x, y - 1);
        const northKey = tileKey(x, y + 1);

        const wMargin = clamp(getMargin(tileSet.has(westKey), isRoad(x - 1, y)), 0, maxMargin);
        const eMargin = clamp(getMargin(tileSet.has(eastKey), isRoad(x + 1, y)), 0, maxMargin);
        const sMargin = clamp(getMargin(tileSet.has(southKey), isRoad(x, y - 1)), 0, maxMargin);
        const nMargin = clamp(getMargin(tileSet.has(northKey), isRoad(x, y + 1)), 0, maxMargin);

        const center = map.tileToWorldCenter(x, y);
        if (!center) continue;

        const x0 = center.x - halfTile + wMargin;
        const x1 = center.x + halfTile - eMargin;
        const z0 = center.z - halfTile + sMargin;
        const z1 = center.z + halfTile - nMargin;

        if (x1 - x0 <= 0.01 || z1 - z0 <= 0.01) continue;

        rects.push({ x0: q(x0), x1: q(x1), z0: q(z0), z1: q(z1) });
    }

    if (!rects.length) return [];

    const xs = [];
    const zs = [];
    for (const r of rects) {
        xs.push(r.x0, r.x1);
        zs.push(r.z0, r.z1);
    }

    xs.sort((a, b) => a - b);
    zs.sort((a, b) => a - b);

    const uniq = (arr) => {
        const out = [];
        let last = null;
        for (const v of arr) {
            if (last === null || v !== last) out.push(v);
            last = v;
        }
        return out;
    };

    const ux = uniq(xs);
    const uz = uniq(zs);
    if (ux.length < 2 || uz.length < 2) return [];

    const nx = ux.length - 1;
    const nz = uz.length - 1;
    const filled = new Uint8Array(nx * nz);

    const cellIndex = (ix, iz) => ix + iz * nx;

    for (let iz = 0; iz < nz; iz++) {
        const zc = (uz[iz] + uz[iz + 1]) * 0.5;
        for (let ix = 0; ix < nx; ix++) {
            const xc = (ux[ix] + ux[ix + 1]) * 0.5;
            let inside = false;
            for (const r of rects) {
                if (xc > r.x0 && xc < r.x1 && zc > r.z0 && zc < r.z1) {
                    inside = true;
                    break;
                }
            }
            if (inside) filled[cellIndex(ix, iz)] = 1;
        }
    }

    const segments = [];
    const addSegment = (ax, az, bx, bz) => {
        segments.push({ ax, az, bx, bz });
    };

    for (let iz = 0; iz < nz; iz++) {
        for (let ix = 0; ix < nx; ix++) {
            if (!filled[cellIndex(ix, iz)]) continue;

            const x0 = ux[ix];
            const x1 = ux[ix + 1];
            const z0 = uz[iz];
            const z1 = uz[iz + 1];

            const westEmpty = ix === 0 || !filled[cellIndex(ix - 1, iz)];
            const eastEmpty = ix === nx - 1 || !filled[cellIndex(ix + 1, iz)];
            const southEmpty = iz === 0 || !filled[cellIndex(ix, iz - 1)];
            const northEmpty = iz === nz - 1 || !filled[cellIndex(ix, iz + 1)];

            if (westEmpty) addSegment(x0, z1, x0, z0);
            if (eastEmpty) addSegment(x1, z0, x1, z1);
            if (southEmpty) addSegment(x0, z0, x1, z0);
            if (northEmpty) addSegment(x1, z1, x0, z1);
        }
    }

    const nextByKey = new Map();
    const pointByKey = new Map();
    const keyFor = (x, z) => `${x},${z}`;

    for (const s of segments) {
        const aKey = keyFor(s.ax, s.az);
        const bKey = keyFor(s.bx, s.bz);
        nextByKey.set(aKey, bKey);
        pointByKey.set(aKey, { x: uq(s.ax), z: uq(s.az) });
        pointByKey.set(bKey, { x: uq(s.bx), z: uq(s.bz) });
    }

    const visited = new Set();
    const loops = [];

    for (const [startKey] of nextByKey) {
        if (visited.has(startKey)) continue;
        const loop = [];
        let cur = startKey;
        let guard = 0;
        while (cur && !visited.has(cur) && guard++ < 100000) {
            visited.add(cur);
            const p = pointByKey.get(cur);
            if (p) loop.push(p);
            const next = nextByKey.get(cur);
            if (!next) break;
            cur = next;
            if (cur === startKey) break;
        }
        if (loop.length >= 3) loops.push(loop);
    }

    return loops;
}

export function applyWallTextureToGroup({
    solidGroup,
    wallTextureUrl = null,
    baseColorHex = 0xffffff,
    textureCache = null
} = {}) {
    if (!solidGroup) return;

    const safeUrl = typeof wallTextureUrl === 'string' && wallTextureUrl ? wallTextureUrl : null;
    const useTexture = !!safeUrl && !!textureCache;
    const color = Number.isFinite(baseColorHex) ? baseColorHex : 0xffffff;

    solidGroup.traverse((obj) => {
        if (!obj?.isMesh) return;
        const mats = obj.material;
        if (!Array.isArray(mats) || mats.length < 2) return;
        const wallMat = mats[1];
        if (!wallMat) return;

        if (!useTexture) {
            wallMat.map = null;
            wallMat.color.setHex(color);
            wallMat.needsUpdate = true;
            return;
        }

        wallMat.color.setHex(0xffffff);
        const tex = textureCache.trackMaterial(safeUrl, wallMat);
        if (tex) wallMat.map = tex;
        wallMat.needsUpdate = true;
    });
}

export function applyBuildingStyleToGroup({
    solidGroup,
    style = BUILDING_STYLE.DEFAULT,
    baseColorHex = 0xffffff,
    textureCache = null
} = {}) {
    const url = resolveBuildingStyleWallTextureUrl(style);
    applyWallTextureToGroup({ solidGroup, wallTextureUrl: url, baseColorHex, textureCache });
}

export function buildBuildingVisualParts({
    map,
    tiles,
    generatorConfig = null,
    tileSize = null,
    occupyRatio = 1.0,
    floors = 1,
    floorHeight = 3,
    style = BUILDING_STYLE.DEFAULT,
    legacyWallTextureUrl = null,
    textureCache = null,
    renderer = null,
    colors = null,
    overlays = null,
    windows = null
} = {}) {
    const loops = computeBuildingLoopsFromTiles({ map, tiles, generatorConfig, tileSize, occupyRatio });
    if (!loops.length) return null;

    const tileCount = normalizeTileList(tiles).length;
    const floorCount = clampInt(floors, 0, 30);
    const fh = clamp(floorHeight, 1.0, 12.0);
    const { baseY, extraFirstFloor, planY } = computeBuildingBaseAndSidewalk({ generatorConfig, floorHeight: fh });
    const height = Math.max(0, floorCount) * fh + extraFirstFloor;

    const outerLoops = [];
    const holeLoops = [];
    for (const loop of loops) {
        if (signedArea(loop) >= 0) outerLoops.push(loop);
        else holeLoops.push(loop);
    }

    const baseColorHex = makeDeterministicColor(tileCount * 97 + floorCount * 31).getHex();

    const solidMeshes = [];
    const wirePositions = [];

    const appendPositions = (dst, src) => {
        for (let i = 0; i < src.length; i++) dst.push(src[i]);
    };

    const roofMatTemplate = new THREE.MeshStandardMaterial({
        color: baseColorHex,
        roughness: 0.85,
        metalness: 0.05
    });

    const wallMatTemplate = new THREE.MeshStandardMaterial({
        color: baseColorHex,
        roughness: 0.85,
        metalness: 0.05
    });

    const wallUrl = resolveBuildingStyleWallTextureUrl(style)
        ?? (typeof legacyWallTextureUrl === 'string' && legacyWallTextureUrl ? legacyWallTextureUrl : null);
    if (wallUrl && textureCache) wallMatTemplate.color.setHex(0xffffff);

    for (const outer of outerLoops) {
        const shapePts = outer.map((p) => new THREE.Vector2(p.x, -p.z));
        shapePts.reverse();
        const shape = new THREE.Shape(shapePts);

        for (const hole of holeLoops) {
            const holePts = hole.map((p) => new THREE.Vector2(p.x, -p.z));
            holePts.reverse();
            shape.holes.push(new THREE.Path(holePts));
        }

        const geo = new THREE.ExtrudeGeometry(shape, {
            depth: height,
            bevelEnabled: false,
            steps: 1
        });
        geo.rotateX(-Math.PI / 2);
        geo.computeVertexNormals();

        const roofMat = roofMatTemplate.clone();
        const wallMat = wallMatTemplate.clone();

        const mesh = new THREE.Mesh(geo, [roofMat, wallMat]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.position.y = baseY;
        solidMeshes.push(mesh);

        if (wallUrl && textureCache) {
            const tex = textureCache.trackMaterial(wallUrl, wallMat);
            if (tex) wallMat.map = tex;
            wallMat.needsUpdate = true;
        }

        const edgeGeo = new THREE.EdgesGeometry(geo, 1);
        appendPositions(wirePositions, edgeGeo.attributes.position.array);
        edgeGeo.dispose();
    }

    const lineColor = colors?.line ?? 0xff3b30;
    const borderColor = colors?.border ?? 0x64d2ff;

    const enabled = overlays ?? {};
    const showWire = enabled.wire ?? true;
    const showPlan = enabled.floorplan ?? true;
    const showBorder = enabled.border ?? true;
    const showFloors = enabled.floorDivisions ?? true;

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
        wire.position.y = baseY;
        wire.renderOrder = 120;
        wire.frustumCulled = false;
    }

    let plan = null;
    if (showPlan) {
        const planPositions = [];
        for (const loop of loops) {
            if (!loop || loop.length < 2) continue;
            for (let i = 0; i < loop.length; i++) {
                const a = loop[i];
                const b = loop[(i + 1) % loop.length];
                planPositions.push(a.x, planY, a.z, b.x, planY, b.z);
            }
        }

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
        const borderY = planY + 0.02;
        const borderPositions = [];
        for (const loop of loops) {
            if (!loop || loop.length < 2) continue;
            for (let i = 0; i < loop.length; i++) {
                const a = loop[i];
                const b = loop[(i + 1) % loop.length];
                borderPositions.push(a.x, borderY, a.z, b.x, borderY, b.z);
            }
        }

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
    if (showFloors) {
        const divisions = Math.max(0, floorCount - 1);
        if (divisions) {
            const floorPositions = [];
            for (let i = 1; i <= divisions; i++) {
                const y = baseY + extraFirstFloor + i * fh;
                for (const loop of loops) {
                    if (!loop || loop.length < 2) continue;
                    for (let k = 0; k < loop.length; k++) {
                        const a = loop[k];
                        const b = loop[(k + 1) % loop.length];
                        floorPositions.push(a.x, y, a.z, b.x, y, b.z);
                    }
                }
            }

            if (floorPositions.length) {
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
        }
    }

    let windowsGroup = null;
    const win = windows ?? {};
    const winEnabled = win.enabled ?? false;
    if (winEnabled && floorCount > 0 && outerLoops.length) {
        const windowWidth = clamp(win.width, 0.3, 12);
        const windowGap = clamp(win.gap, 0, 24);
        const windowHeight = clamp(win.height, 0.3, fh * 0.95);
        const windowYOffset = clamp(win.y, 0, Math.max(0, fh - windowHeight));

        const cornerEps = clamp(win.cornerEps, 0.01, 2.0);
        const offset = clamp(win.offset, 0.01, 0.2);

        const tex = getBuildingWindowTexture();
        const windowMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: tex,
            roughness: 0.4,
            metalness: 0.0,
            emissive: new THREE.Color(0x0b1f34),
            emissiveIntensity: 0.35
        });

        windowsGroup = new THREE.Group();
        windowsGroup.name = 'windows';

        for (const loop of outerLoops) {
            if (!loop || loop.length < 2) continue;
            const n = loop.length;
            for (let i = 0; i < n; i++) {
                const a = loop[i];
                const b = loop[(i + 1) % n];
                const dx = b.x - a.x;
                const dz = b.z - a.z;
                const L = Math.hypot(dx, dz);
                if (!(L > windowWidth + cornerEps * 2)) continue;

                const { starts, count } = computeEvenWindowLayout({
                    length: L,
                    windowWidth,
                    desiredGap: windowGap,
                    cornerEps
                });
                if (!count) continue;

                const inv = 1 / L;
                const tx = dx * inv;
                const tz = dz * inv;
                const nx = tz;
                const nz = -tx;
                const yaw = Math.atan2(nx, nz);

                for (let floor = 0; floor < floorCount; floor++) {
                    const floorBase = floor === 0 ? baseY : (baseY + extraFirstFloor + floor * fh);
                    const y = floorBase + windowYOffset + windowHeight * 0.5;
                    for (const start of starts) {
                        const centerDist = start + windowWidth * 0.5;
                        const cx = a.x + tx * centerDist + nx * offset;
                        const cz = a.z + tz * centerDist + nz * offset;

                        const geo = new THREE.PlaneGeometry(windowWidth, windowHeight);
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
    }

    return { baseColorHex, solidMeshes, wire, plan, border, floorDivisions, windows: windowsGroup };
}
