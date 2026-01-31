// src/app/city/CityMap.js
// Stores tile/grid map data and builds a centerline RoadNetwork for rendering and gameplay.
import { BUILDING_STYLE, isBuildingStyle } from '../buildings/BuildingStyle.js';
import { getBuildingConfigById } from './buildings/index.js';
import { createDemoCitySpec } from './specs/DemoCitySpec.js';
import { createRoadNetworkFromWorldSegments } from './roads/RoadNetwork.js';
import { generateCenterlineFromPolyline } from '../geometry/PolylineTAT.js';
export const DIR = { N: 1, E: 2, S: 4, W: 8 };
export const TILE = { EMPTY: 0, ROAD: 1 };

export const AXIS = {
    NONE: 0,
    EW: 1,
    NS: 2,
    INTERSECTION: 3,
    CORNER: 4
};

const DEG_TO_RAD = Math.PI / 180;
const HALF_TURN_RAD = Math.PI;
const ANGLE_SNAP_DEG = 15;
const ANGLE_SNAP_RAD = ANGLE_SNAP_DEG * DEG_TO_RAD;
const ANGLE_SNAP_EPS = 1e-6;

const BRICK_MIDRISE_CONFIG_ID = 'brick_midrise';
const BRICK_MIDRISE_2_CONFIG_ID = 'brick_midrise_2';

const BRICK_MIDRISE_VARIANT_OVERRIDE = (() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('brickMidriseVariant');
    const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (!v || v === 'auto') return null;
    if (v === '1' || v === 'brick_midrise') return BRICK_MIDRISE_CONFIG_ID;
    if (v === '2' || v === 'brick_midrise_2') return BRICK_MIDRISE_2_CONFIG_ID;
    return null;
})();

function clampInt(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v | 0));
}

function bitCount4(m) {
    m = m & 0x0f;
    m = (m & 0x05) + ((m >> 1) & 0x05);
    m = (m & 0x03) + ((m >> 2) & 0x03);
    return m;
}

function isCornerConn(m) {
    const ne = (m & (DIR.N | DIR.E)) === (DIR.N | DIR.E);
    const nw = (m & (DIR.N | DIR.W)) === (DIR.N | DIR.W);
    const se = (m & (DIR.S | DIR.E)) === (DIR.S | DIR.E);
    const sw = (m & (DIR.S | DIR.W)) === (DIR.S | DIR.W);
    return ne || nw || se || sw;
}

function normalizeHalfTurn(angle) {
    let a = angle % HALF_TURN_RAD;
    if (a < 0) a += HALF_TURN_RAD;
    if (Math.abs(a - HALF_TURN_RAD) <= ANGLE_SNAP_EPS) return 0;
    return a;
}

function snapAngle(angle) {
    const base = normalizeHalfTurn(angle);
    const snapped = Math.round(base / ANGLE_SNAP_RAD) * ANGLE_SNAP_RAD;
    return normalizeHalfTurn(snapped);
}

function rasterizeLine(x0, y0, x1, y1) {
    const tiles = [];
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
        tiles.push({ x, y });
        if (x === x1 && y === y1) break;
        const e2 = err * 2;
        if (e2 > -dy) {
            err -= dy;
            x += sx;
        }
        if (e2 < dx) {
            err += dx;
            y += sy;
        }
    }

    return tiles;
}

function fnv1a32FromString(text, seed = 0x811c9dc5) {
    const str = String(text ?? '');
    let h = (Number(seed) >>> 0) || 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}

function getFootprintHashKeyFromTiles(tiles) {
    const list = Array.isArray(tiles) ? tiles : [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let sumX = 0;
    let sumY = 0;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
        const entry = list[i];
        if (!Array.isArray(entry) || entry.length < 2) continue;
        const x = entry[0] | 0;
        const y = entry[1] | 0;
        n++;
        sumX += x;
        sumY += y;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
    }
    if (!n || !Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return 'tiles:none';
    return `tiles:n=${n}|bb=${minX},${minY},${maxX},${maxY}|sum=${sumX},${sumY}`;
}

function resolveBrickMidriseVariantConfigId(configId, { mapSeed, buildingId, tiles } = {}) {
    if (configId !== BRICK_MIDRISE_CONFIG_ID) return configId;
    if (BRICK_MIDRISE_VARIANT_OVERRIDE === BRICK_MIDRISE_CONFIG_ID) return BRICK_MIDRISE_CONFIG_ID;
    if (BRICK_MIDRISE_VARIANT_OVERRIDE === BRICK_MIDRISE_2_CONFIG_ID) return BRICK_MIDRISE_2_CONFIG_ID;
    if (!getBuildingConfigById(BRICK_MIDRISE_2_CONFIG_ID)) return BRICK_MIDRISE_CONFIG_ID;

    const seed = String(mapSeed ?? '');
    const id = typeof buildingId === 'string' ? buildingId : '';
    const tilesKey = getFootprintHashKeyFromTiles(tiles);
    const h = fnv1a32FromString(`${seed}|${BRICK_MIDRISE_CONFIG_ID}|${id}|${tilesKey}`);
    return (h & 1) ? BRICK_MIDRISE_2_CONFIG_ID : BRICK_MIDRISE_CONFIG_ID;
}

export class CityMap {
    constructor({ width, height, tileSize, origin }) {
        this.width = width | 0;
        this.height = height | 0;
        this.tileSize = tileSize;
        this.origin = { x: origin.x, z: origin.z };

        const n = this.width * this.height;

        this.kind = new Uint8Array(n);
        this.axis = new Uint8Array(n);
        this.conn = new Uint8Array(n);

        this.lanesN = new Uint8Array(n);
        this.lanesE = new Uint8Array(n);
        this.lanesS = new Uint8Array(n);
        this.lanesW = new Uint8Array(n);

        this.roadIds = new Array(n);
        this._roadCounter = 0;

        this.roadSegments = [];
        this.roadNetwork = null;
        this.roadAngles = new Float32Array(n);
        this.roadAngles.fill(Number.NaN);
        this.roadPrimary = new Int32Array(n);
        this.roadPrimary.fill(-1);
        this.roadIntersections = new Uint8Array(n);

        this.buildings = [];
    }

    index(x, y) { return (x | 0) + (y | 0) * this.width; }
    inBounds(x, y) { return x >= 0 && y >= 0 && x < this.width && y < this.height; }

    tileToWorldCenter(x, y) {
        return { x: this.origin.x + x * this.tileSize, z: this.origin.z + y * this.tileSize };
    }

    worldToTile(x, z) {
        const tx = Math.round((x - this.origin.x) / this.tileSize);
        const ty = Math.round((z - this.origin.z) / this.tileSize);
        return { x: tx, y: ty };
    }

    _markRoad(x, y, roadId = null) {
        if (!this.inBounds(x, y)) return -1;
        const idx = this.index(x, y);
        this.kind[idx] = TILE.ROAD;
        if (roadId !== null && roadId !== undefined) {
            let bucket = this.roadIds[idx];
            if (!bucket) {
                bucket = new Set();
                this.roadIds[idx] = bucket;
            }
            bucket.add(roadId);
        }
        return idx;
    }

    _maxLane(arr, idx, v) {
        const nv = clampInt(v, 0, 255);
        if (nv > arr[idx]) arr[idx] = nv;
    }

    addRoadSegment({ a, b, lanesF = 1, lanesB = 1, id = null, tag = 'road', rendered = true } = {}) {
        if (!a || !b) return;

        let roadId = id;
        if (roadId === null || roadId === undefined) {
            roadId = this._roadCounter;
            this._roadCounter += 1;
        } else if (roadId >= this._roadCounter) {
            this._roadCounter = roadId + 1;
        }

        const x0 = a[0] | 0, y0 = a[1] | 0;
        const x1 = b[0] | 0, y1 = b[1] | 0;

        const dxRaw = x1 - x0;
        const dyRaw = y1 - y0;
        const angle = snapAngle(Math.atan2(dyRaw, dxRaw));
        const tiles = rasterizeLine(x0, y0, x1, y1);
        const meta = {
            id: roadId,
            a: { x: x0, y: y0 },
            b: { x: x1, y: y1 },
            lanesF,
            lanesB,
            tag: typeof tag === 'string' ? tag : 'road',
            rendered: rendered !== false,
            angle,
            tiles: []
        };

        const axisAligned = dxRaw === 0 || dyRaw === 0;
        const dx = Math.sign(dxRaw);
        const dy = Math.sign(dyRaw);

        for (const tile of tiles) {
            const idx = this._markRoad(tile.x, tile.y, roadId);
            if (idx < 0) continue;
            meta.tiles.push({ x: tile.x, y: tile.y, idx });

            if (!axisAligned) continue;

            if (dyRaw === 0) {
                if (dx >= 0) {
                    this._maxLane(this.lanesE, idx, lanesF);
                    this._maxLane(this.lanesW, idx, lanesB);
                } else {
                    this._maxLane(this.lanesW, idx, lanesF);
                    this._maxLane(this.lanesE, idx, lanesB);
                }
            } else if (dxRaw === 0) {
                if (dy >= 0) {
                    this._maxLane(this.lanesN, idx, lanesF);
                    this._maxLane(this.lanesS, idx, lanesB);
                } else {
                    this._maxLane(this.lanesS, idx, lanesF);
                    this._maxLane(this.lanesN, idx, lanesB);
                }
            }
        }

        this.roadSegments[roadId] = meta;
    }

    addRoadPolyline({ points, lanesF = 1, lanesB = 1, id = null, tag = 'road', rendered = true, defaultRadius = 0 } = {}) {
        const list = Array.isArray(points) ? points : [];
        if (list.length < 2) return;

        let roadId = id;
        if (roadId === null || roadId === undefined) {
            roadId = this._roadCounter;
            this._roadCounter += 1;
        } else if (roadId >= this._roadCounter) {
            this._roadCounter = roadId + 1;
        }

        const pointsWorld = [];
        const pointsTile = [];
        for (const raw of list) {
            let wx = null;
            let wz = null;
            let radius = null;
            if (Array.isArray(raw) && raw.length >= 2) {
                wx = raw[0];
                wz = raw[1];
            } else if (raw && Number.isFinite(raw.x) && (Number.isFinite(raw.z) || Number.isFinite(raw.y))) {
                wx = raw.x;
                wz = Number.isFinite(raw.z) ? raw.z : raw.y;
                if (Number.isFinite(raw.radius)) radius = raw.radius;
                else if (Number.isFinite(raw.r)) radius = raw.r;
            }
            if (!Number.isFinite(wx) || !Number.isFinite(wz)) continue;
            const tile = this.worldToTile(wx, wz);
            if (!tile || !this.inBounds(tile.x, tile.y)) continue;

            const lastTile = pointsTile[pointsTile.length - 1] ?? null;
            if (lastTile && lastTile.x === (tile.x | 0) && lastTile.y === (tile.y | 0)) {
                const lastWorld = pointsWorld[pointsWorld.length - 1] ?? null;
                if (lastWorld && Number.isFinite(radius)) lastWorld.radius = radius;
                continue;
            }

            pointsTile.push({ x: tile.x | 0, y: tile.y | 0 });
            pointsWorld.push({ x: wx, z: wz, radius: Number.isFinite(radius) ? radius : null });
        }

        if (pointsTile.length < 2) return;

        const dx0 = pointsTile[1].x - pointsTile[0].x;
        const dy0 = pointsTile[1].y - pointsTile[0].y;
        const angle = snapAngle(Math.atan2(dy0, dx0));

        const meta = {
            id: roadId,
            kind: 'polyline',
            points: pointsWorld,
            defaultRadius: Number.isFinite(defaultRadius) ? defaultRadius : 0,
            lanesF,
            lanesB,
            tag: typeof tag === 'string' ? tag : 'road',
            rendered: rendered !== false,
            angle,
            tiles: []
        };

        const visited = new Set();
        for (let i = 0; i + 1 < pointsTile.length; i++) {
            const a = pointsTile[i];
            const b = pointsTile[i + 1];
            const x0 = a.x | 0;
            const y0 = a.y | 0;
            const x1 = b.x | 0;
            const y1 = b.y | 0;
            const tiles = rasterizeLine(x0, y0, x1, y1);

            const dxRaw = x1 - x0;
            const dyRaw = y1 - y0;
            const axisAligned = dxRaw === 0 || dyRaw === 0;
            const dx = Math.sign(dxRaw);
            const dy = Math.sign(dyRaw);

            for (const tile of tiles) {
                const idx = this._markRoad(tile.x, tile.y, roadId);
                if (idx < 0) continue;
                if (!visited.has(idx)) {
                    visited.add(idx);
                    meta.tiles.push({ x: tile.x, y: tile.y, idx });
                }

                if (!axisAligned) continue;
                if (dyRaw === 0) {
                    if (dx >= 0) {
                        this._maxLane(this.lanesE, idx, lanesF);
                        this._maxLane(this.lanesW, idx, lanesB);
                    } else {
                        this._maxLane(this.lanesW, idx, lanesF);
                        this._maxLane(this.lanesE, idx, lanesB);
                    }
                } else if (dxRaw === 0) {
                    if (dy >= 0) {
                        this._maxLane(this.lanesN, idx, lanesF);
                        this._maxLane(this.lanesS, idx, lanesB);
                    } else {
                        this._maxLane(this.lanesS, idx, lanesF);
                        this._maxLane(this.lanesN, idx, lanesB);
                    }
                }
            }
        }

        this.roadSegments[roadId] = meta;
    }

    finalize({ seed = null } = {}) {
        const w = this.width, h = this.height;
        const sharesRoad = (aIdx, bIdx) => {
            let aSet = this.roadIds[aIdx];
            let bSet = this.roadIds[bIdx];
            if (!aSet || !bSet) return false;
            if (aSet.size > bSet.size) {
                const tmp = aSet;
                aSet = bSet;
                bSet = tmp;
            }
            for (const id of aSet) if (bSet.has(id)) return true;
            return false;
        };

        this.roadAngles.fill(Number.NaN);
        this.roadPrimary.fill(-1);
        this.roadIntersections.fill(0);

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const idx = this.index(x, y);
                if (this.kind[idx] !== TILE.ROAD) {
                    this.conn[idx] = 0;
                    this.axis[idx] = AXIS.NONE;
                    continue;
                }

                const ids = this.roadIds[idx];
                if (ids && ids.size > 1) {
                    this.roadIntersections[idx] = 1;
                } else if (ids && ids.size === 1) {
                    const id = ids.values().next().value;
                    this.roadPrimary[idx] = id ?? -1;
                    const meta = (id !== undefined && id !== null) ? this.roadSegments[id] : null;
                    if (meta) this.roadAngles[idx] = meta.angle;
                }

                let m = 0;
                if (y + 1 < h && sharesRoad(idx, idx + w)) m |= DIR.N;
                if (x + 1 < w && sharesRoad(idx, idx + 1)) m |= DIR.E;
                if (y - 1 >= 0 && sharesRoad(idx, idx - w)) m |= DIR.S;
                if (x - 1 >= 0 && sharesRoad(idx, idx - 1)) m |= DIR.W;

                this.conn[idx] = m;

                const hasNS = (m & (DIR.N | DIR.S)) !== 0;
                const hasEW = (m & (DIR.E | DIR.W)) !== 0;

                const degree = bitCount4(m);

                if (hasNS && hasEW) {
                    if (degree === 2 && isCornerConn(m)) this.axis[idx] = AXIS.CORNER;
                    else this.axis[idx] = AXIS.INTERSECTION;
                    continue;
                }

                if (hasEW) {
                    this.axis[idx] = AXIS.EW;
                    continue;
                }

                if (hasNS) {
                    this.axis[idx] = AXIS.NS;
                    continue;
                }

                const ew = this.lanesE[idx] + this.lanesW[idx];
                const ns = this.lanesN[idx] + this.lanesS[idx];
                this.axis[idx] = ew >= ns ? AXIS.EW : AXIS.NS;
            }
        }

        const resolvedSeed = seed ?? this.roadNetwork?.seed ?? null;
        const chord = Math.max(0.25, this.tileSize * 0.02);
        const worldSegments = [];

        const roads = Array.isArray(this.roadSegments) ? this.roadSegments : [];
        for (const road of roads) {
            if (!road) continue;
            const tag = typeof road.tag === 'string' ? road.tag : 'road';
            const rendered = road.rendered !== false;
            const lanesF = road.lanesF ?? 0;
            const lanesB = road.lanesB ?? 0;

            if (road.kind === 'polyline' && Array.isArray(road.points) && road.points.length >= 2) {
                const centerline = generateCenterlineFromPolyline({
                    points: road.points,
                    defaultRadius: road.defaultRadius ?? 0,
                    chord
                });
                const pts = Array.isArray(centerline?.points) && centerline.points.length >= 2
                    ? centerline.points
                    : road.points.map((p) => ({ x: p.x, z: Number.isFinite(p.z) ? p.z : p.y }));

                for (let i = 0; i + 1 < pts.length; i++) {
                    const a = pts[i];
                    const b = pts[i + 1];
                    worldSegments.push({
                        sourceId: `r:${road.id}:${i}`,
                        tag,
                        rendered,
                        lanesF,
                        lanesB,
                        a: { x: a.x, z: a.z },
                        b: { x: b.x, z: b.z }
                    });
                }
                continue;
            }

            if (road?.a && road?.b) {
                const a = road.a;
                const b = road.b;
                const p0 = this.tileToWorldCenter(a.x, a.y);
                const p1 = this.tileToWorldCenter(b.x, b.y);
                worldSegments.push({
                    sourceId: `r:${road.id}`,
                    tag,
                    rendered,
                    lanesF,
                    lanesB,
                    a: { x: p0.x, z: p0.z },
                    b: { x: p1.x, z: p1.z }
                });
            }
        }

        this.roadNetwork = createRoadNetworkFromWorldSegments(worldSegments, { origin: this.origin, tileSize: this.tileSize, seed: resolvedSeed });
    }

    countRoadTiles() {
        let c = 0;
        for (let i = 0; i < this.kind.length; i++) if (this.kind[i] === TILE.ROAD) c++;
        return c;
    }

    exportSpec({ seed = null, version = 1 } = {}) {
        const spec = {
            version: Number.isFinite(version) ? (version | 0) : 1,
            seed,
            width: this.width,
            height: this.height,
            tileSize: this.tileSize,
            origin: { x: this.origin.x, z: this.origin.z },
            roads: [],
            buildings: []
        };

        const roads = Array.isArray(this.roadSegments) ? this.roadSegments : [];
        for (const road of roads) {
            if (!road) continue;
            const tag = typeof road.tag === 'string' ? road.tag : 'road';
            const lanesF = road.lanesF ?? 0;
            const lanesB = road.lanesB ?? 0;
            const rendered = road.rendered !== false;

            if (road.kind === 'polyline' && Array.isArray(road.points) && road.points.length >= 2) {
                spec.roads.push({
                    points: road.points.map((p) => {
                        const entry = { x: p?.x ?? 0, z: (Number.isFinite(p?.z) ? p.z : p?.y) ?? 0 };
                        if (Number.isFinite(p?.radius)) entry.radius = p.radius;
                        return entry;
                    }),
                    defaultRadius: Number.isFinite(road.defaultRadius) ? road.defaultRadius : 0,
                    lanesF,
                    lanesB,
                    tag,
                    rendered
                });
                continue;
            }

            if (!road?.a || !road?.b) continue;
            spec.roads.push({
                a: [road.a.x | 0, road.a.y | 0],
                b: [road.b.x | 0, road.b.y | 0],
                lanesF,
                lanesB,
                tag,
                rendered
            });
        }

        const buildings = Array.isArray(this.buildings) ? this.buildings : [];
        for (const building of buildings) {
            const tiles = Array.isArray(building?.tiles) ? building.tiles : [];
            if (!tiles.length) continue;

            const record = {
                id: typeof building.id === 'string' ? building.id : null,
                configId: typeof building.configId === 'string' ? building.configId : null,
                tiles: tiles.map((tile) => [tile?.[0] | 0, tile?.[1] | 0])
            };

            if (!record.configId) {
                if (Array.isArray(building?.layers) && building.layers.length) record.layers = building.layers;
                if (Number.isFinite(building?.wallInset)) record.wallInset = building.wallInset;
                if (Number.isFinite(building?.materialVariationSeed)) record.materialVariationSeed = building.materialVariationSeed;
                if (Number.isFinite(building?.floorHeight)) record.floorHeight = building.floorHeight;
                if (Number.isFinite(building?.floors)) record.floors = building.floors;
                if (typeof building?.style === 'string') record.style = building.style;
                if (building?.windows && typeof building.windows === 'object') record.windows = building.windows;
            }

            spec.buildings.push(record);
        }

        return spec;
    }

    getLanesAtIndex(idx) {
        return { n: this.lanesN[idx], e: this.lanesE[idx], s: this.lanesS[idx], w: this.lanesW[idx] };
    }

    static _insetRange(inset, min, max) {
        const a = min + inset;
        const b = max - inset;
        if (b <= a) return { a: min, b: max };
        return { a, b };
    }

    static fromSpec(spec = {}, config) {
        const width = spec.width ?? config.map.width;
        const height = spec.height ?? config.map.height;
        const tileSize = spec.tileSize ?? config.map.tileSize;
        const origin = spec.origin ?? config.map.origin;

        const map = new CityMap({ width, height, tileSize, origin });

        const roads = Array.isArray(spec.roads) ? spec.roads : [];
        roads.forEach((road, index) => {
            if (Array.isArray(road?.points) && road.points.length >= 2) {
                map.addRoadPolyline({ ...road, id: index });
            } else {
                map.addRoadSegment({ ...road, id: index });
            }
        });
        map.finalize({ seed: spec.seed ?? config.seed ?? null });

        map.buildings = CityMap._buildingsFromSpec(spec.buildings, map);
        return map;
    }

    static _buildingsFromSpec(buildingsSpec, map) {
        const list = Array.isArray(buildingsSpec) ? buildingsSpec : [];
        const out = [];
        const mapSeed = map?.roadNetwork?.seed ?? null;

        const clampIntLocal = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) | 0));
        const clampLocal = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || lo));
        const clampFiniteLocal = (v, lo, hi, fallback) => Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;

        const isAdjacentToSet = (x, y, set) => (
            set.has(`${x - 1},${y}`)
            || set.has(`${x + 1},${y}`)
            || set.has(`${x},${y - 1}`)
            || set.has(`${x},${y + 1}`)
        );

        for (let i = 0; i < list.length; i++) {
            const raw = list[i];
            if (!raw) continue;

            const id = (typeof raw.id === 'string' && raw.id) ? raw.id : `building_${i + 1}`;

            const tilesIn = Array.isArray(raw.tiles ?? raw.footprintTiles) ? (raw.tiles ?? raw.footprintTiles) : [];
            const accepted = [];
            const acceptedSet = new Set();

            for (let t = 0; t < tilesIn.length; t++) {
                const entry = tilesIn[t];
                let x = null;
                let y = null;
                if (Array.isArray(entry) && entry.length >= 2) {
                    x = entry[0];
                    y = entry[1];
                } else if (entry && Number.isFinite(entry.x) && Number.isFinite(entry.y)) {
                    x = entry.x;
                    y = entry.y;
                }

                if (!Number.isFinite(x) || !Number.isFinite(y)) break;
                const tx = x | 0;
                const ty = y | 0;

                if (!map.inBounds(tx, ty)) break;
                if (map.kind[map.index(tx, ty)] === TILE.ROAD) break;

                const key = `${tx},${ty}`;
                if (acceptedSet.has(key)) continue;
                if (accepted.length > 0 && !isAdjacentToSet(tx, ty, acceptedSet)) break;

                acceptedSet.add(key);
                accepted.push([tx, ty]);
            }

            if (!accepted.length) continue;

            const rawConfigId = typeof raw.configId === 'string' ? raw.configId : null;
            const resolvedConfigId = resolveBrickMidriseVariantConfigId(rawConfigId, { mapSeed, buildingId: id, tiles: accepted });
            const config = resolvedConfigId ? getBuildingConfigById(resolvedConfigId) : null;
            const design = config && typeof config === 'object' ? config : raw;

            const designLayers = Array.isArray(design.layers) ? design.layers : null;
            const hasLayers = !!designLayers?.length;

            const deriveLegacyFromLayers = (layers) => {
                const list = Array.isArray(layers) ? layers : [];
                const floorLayers = list.filter((layer) => layer?.type === 'floor');
                const firstFloor = floorLayers[0] ?? null;
                const totalFloors = floorLayers.reduce((sum, layer) => sum + clampIntLocal(layer?.floors ?? 0, 0, 99), 0);
                const floors = clampIntLocal(totalFloors || 1, 1, 30);
                const floorHeight = clampFiniteLocal(firstFloor?.floorHeight, 1.0, 12.0, 3.0);
                const styleRaw = firstFloor?.style;
                const style = isBuildingStyle(styleRaw) ? styleRaw : BUILDING_STYLE.DEFAULT;
                const win = firstFloor?.windows ?? null;
                const windows = win?.enabled ? {
                    width: clampFiniteLocal(win?.width, 0.3, 12.0, 2.2),
                    gap: clampFiniteLocal(win?.spacing, 0.0, 24.0, 1.6),
                    height: clampFiniteLocal(win?.height, 0.3, 10.0, 1.4),
                    y: clampFiniteLocal(win?.sillHeight, 0.0, 12.0, 1.0)
                } : null;
                return { floors, floorHeight, style, windows };
            };

            const derivedLegacy = hasLayers ? deriveLegacyFromLayers(designLayers) : null;

            const floors = Number.isFinite(design.floors ?? design.numFloors)
                ? clampIntLocal(design.floors ?? design.numFloors, 1, 30)
                : (derivedLegacy?.floors ?? 1);
            const floorHeight = Number.isFinite(design.floorHeight)
                ? clampLocal(design.floorHeight, 1.0, 12.0)
                : (derivedLegacy?.floorHeight ?? 3.0);

	            const mapStyleFromTextureUrl = (url) => {
	                const s = typeof url === 'string' ? url : '';
	                const clean = s.split(/[?#]/)[0].toLowerCase();
	                const file = (clean.split('/').pop() ?? '').toLowerCase();
	                if (clean.includes('/pbr/red_brick/basecolor.jpg')) return BUILDING_STYLE.BRICK;
	                if (file === 'brick_wall.png' || file === 'brick_wall_deprecated.png') return BUILDING_STYLE.BRICK;
	                if (file === 'cement.png') return BUILDING_STYLE.CEMENT;
	                if (file === 'stonewall_1.png') return BUILDING_STYLE.STONE_1;
	                if (file === 'stonewall_2.png') return BUILDING_STYLE.STONE_2;
	                return BUILDING_STYLE.DEFAULT;
	            };

            const style = isBuildingStyle(design.style)
                ? design.style
                : (derivedLegacy?.style ?? mapStyleFromTextureUrl(design.wallTextureUrl));

            const windowsRaw = design.windows ?? derivedLegacy?.windows ?? null;
            const windowsEnabled = windowsRaw && typeof windowsRaw === 'object';
            const windowWidth = windowsEnabled ? clampLocal(windowsRaw.width, 0.3, 12.0) : null;
            const windowGap = windowsEnabled ? clampLocal(windowsRaw.gap, 0.0, 24.0) : null;
            const windowHeight = windowsEnabled ? clampLocal(windowsRaw.height, 0.3, Math.max(0.3, floorHeight * 0.95)) : null;
            const windowY = windowsEnabled
                ? clampLocal(windowsRaw.y, 0.0, Math.max(0.0, floorHeight - (windowHeight ?? 0.3)))
                : null;

            out.push({
                id,
                configId: config?.id ?? null,
                tiles: accepted,
                layers: hasLayers ? designLayers : null,
                wallInset: clampFiniteLocal(design.wallInset, 0.0, 4.0, 0.0),
                materialVariationSeed: Number.isFinite(design.materialVariationSeed)
                    ? clampIntLocal(design.materialVariationSeed, 0, 4294967295)
                    : null,
                floorHeight,
                floors,
                style,
                windows: windowsEnabled ? { width: windowWidth, gap: windowGap, height: windowHeight, y: windowY } : null
            });
        }

        return out;
    }

    static demoSpec(config) {
        return createDemoCitySpec(config);
	    }
}
