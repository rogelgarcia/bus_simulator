// src/app/city/CityMap.js
import { BUILDING_STYLE, isBuildingStyle } from '../buildings/BuildingStyle.js';
import { getBuildingConfigById } from './buildings/index.js';
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

    addRoadSegment({ a, b, lanesF = 1, lanesB = 1, id = null } = {}) {
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

    finalize() {
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
    }

    countRoadTiles() {
        let c = 0;
        for (let i = 0; i < this.kind.length; i++) if (this.kind[i] === TILE.ROAD) c++;
        return c;
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

        (spec.roads ?? []).forEach((seg, index) => {
            map.addRoadSegment({ ...seg, id: index });
        });
        map.finalize();

        map.buildings = CityMap._buildingsFromSpec(spec.buildings, map);
        return map;
    }

    static _buildingsFromSpec(buildingsSpec, map) {
        const list = Array.isArray(buildingsSpec) ? buildingsSpec : [];
        const out = [];

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
            const configId = typeof raw.configId === 'string' ? raw.configId : null;
            const config = configId ? getBuildingConfigById(configId) : null;
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
	                const file = (s.split(/[?#]/)[0].split('/').pop() ?? '').toLowerCase();
	                if (file === 'brick_wall.png') return BUILDING_STYLE.BRICK;
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
            out.push({
                id,
                configId: config?.id ?? null,
                tiles: accepted,
                layers: hasLayers ? designLayers : null,
                wallInset: clampFiniteLocal(design.wallInset, 0.0, 4.0, 0.0),
                floorHeight,
                floors,
                style,
                windows: windowsEnabled ? { width: windowWidth, gap: windowGap, height: windowHeight, y: windowY } : null
            });
        }

        return out;
    }

    static demoSpec(config) {
        return {
            version: 1,
            seed: config.seed,
            width: config.map.width,
            height: config.map.height,
            tileSize: config.map.tileSize,
            origin: config.map.origin,
            roads: [
                { a: [0, 0], b: [4, 4], lanesF: 1, lanesB: 1, tag: 'diag-test' },
                { a: [0, 0], b: [8, 2], lanesF: 2, lanesB: 2, tag: 'diag-shallow' },
                { a: [2, 8], b: [13, 8], lanesF: 2, lanesB: 2, tag: 'arterial' },
                { a: [8, 2], b: [8, 13], lanesF: 2, lanesB: 2, tag: 'arterial' },

                { a: [4, 4], b: [11, 4], lanesF: 1, lanesB: 1, tag: 'collector' },
                { a: [4, 4], b: [4, 11], lanesF: 1, lanesB: 1, tag: 'collector' },
                { a: [4, 11], b: [11, 11], lanesF: 1, lanesB: 1, tag: 'collector' },
                { a: [11, 4], b: [11, 11], lanesF: 1, lanesB: 1, tag: 'collector' },

                { a: [5, 10], b: [6, 10], lanesF: 2, lanesB: 0, tag: 'oneway-east' },
                { a: [6, 10], b: [6, 11], lanesF: 2, lanesB: 0, tag: 'oneway-north' },
                { a: [12, 0], b: [14, 0], lanesF: 1, lanesB: 1, tag: 'test-east-0' },
                { a: [14, 1], b: [12, 1], lanesF: 1, lanesB: 1, tag: 'test-west-1' }
            ],
            buildings: [
                {
                    id: 'building_1',
                    configId: 'brick_midrise',
                    tiles: [[14, 14], [15, 14], [15, 15], [14, 15]]
                },
                {
                    id: 'building_2',
                    configId: 'stone_lowrise',
                    tiles: [[6, 7], [7, 7]]
                }
            ]
	        };
	    }
}
