// src/graphics/assets3d/generators/BuildingGenerator.js
// Generates building meshes from city building footprints
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

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

export function buildBuildingVisualParts({
    map,
    tiles,
    generatorConfig = null,
    tileSize = null,
    occupyRatio = 1.0,
    floors = 1,
    floorHeight = 3,
    wallTextureUrl = null,
    textureCache = null,
    renderer = null,
    colors = null,
    overlays = null
} = {}) {
    const loops = computeBuildingLoopsFromTiles({ map, tiles, generatorConfig, tileSize, occupyRatio });
    if (!loops.length) return null;

    const tileCount = normalizeTileList(tiles).length;
    const floorCount = clampInt(floors, 0, 30);
    const height = Math.max(0, floorCount) * clamp(floorHeight, 1.0, 12.0);

    const groundY = generatorConfig?.ground?.surfaceY ?? generatorConfig?.road?.surfaceY ?? 0;
    const baseY = groundY + 0.01;

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

    const wallUrl = typeof wallTextureUrl === 'string' && wallTextureUrl ? wallTextureUrl : null;
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

    const planY = (generatorConfig?.road?.surfaceY ?? groundY) + 0.07;

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
            const fh = clamp(floorHeight, 1.0, 12.0);
            for (let i = 1; i <= divisions; i++) {
                const y = baseY + i * fh;
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

    return { baseColorHex, solidMeshes, wire, plan, border, floorDivisions };
}
