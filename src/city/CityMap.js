// src/city/CityMap.js
export const DIR = { N: 1, E: 2, S: 4, W: 8 };
export const TILE = { EMPTY: 0, ROAD: 1 };

export const AXIS = {
    NONE: 0,
    EW: 1,
    NS: 2,
    INTERSECTION: 3,
    CORNER: 4
};

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

    _markRoad(x, y) {
        if (!this.inBounds(x, y)) return -1;
        const idx = this.index(x, y);
        this.kind[idx] = TILE.ROAD;
        return idx;
    }

    _maxLane(arr, idx, v) {
        const nv = clampInt(v, 0, 255);
        if (nv > arr[idx]) arr[idx] = nv;
    }

    addRoadSegment({ a, b, lanesF = 1, lanesB = 1 } = {}) {
        if (!a || !b) return;

        const x0 = a[0] | 0, y0 = a[1] | 0;
        const x1 = b[0] | 0, y1 = b[1] | 0;

        const dx = Math.sign(x1 - x0);
        const dy = Math.sign(y1 - y0);

        if (dx !== 0 && dy !== 0) {
            console.warn('[CityMap] RoadSegment must be axis-aligned:', { a, b });
            return;
        }

        if (dy === 0) {
            const steps = Math.abs(x1 - x0);
            for (let i = 0; i <= steps; i++) {
                const x = x0 + dx * i;
                const idx = this._markRoad(x, y0);
                if (idx < 0) continue;

                if (dx >= 0) {
                    this._maxLane(this.lanesE, idx, lanesF);
                    this._maxLane(this.lanesW, idx, lanesB);
                } else {
                    this._maxLane(this.lanesW, idx, lanesF);
                    this._maxLane(this.lanesE, idx, lanesB);
                }
            }
            return;
        }

        if (dx === 0) {
            const steps = Math.abs(y1 - y0);
            for (let i = 0; i <= steps; i++) {
                const y = y0 + dy * i;
                const idx = this._markRoad(x0, y);
                if (idx < 0) continue;

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

    finalize() {
        const w = this.width, h = this.height;

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const idx = this.index(x, y);
                if (this.kind[idx] !== TILE.ROAD) {
                    this.conn[idx] = 0;
                    this.axis[idx] = AXIS.NONE;
                    continue;
                }

                let m = 0;
                if (y + 1 < h && this.kind[idx + w] === TILE.ROAD) m |= DIR.N;
                if (x + 1 < w && this.kind[idx + 1] === TILE.ROAD) m |= DIR.E;
                if (y - 1 >= 0 && this.kind[idx - w] === TILE.ROAD) m |= DIR.S;
                if (x - 1 >= 0 && this.kind[idx - 1] === TILE.ROAD) m |= DIR.W;

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

        for (const seg of (spec.roads ?? [])) map.addRoadSegment(seg);
        map.finalize();
        return map;
    }

    static demoSpec(config) {
        const w = config.map.width;
        const h = config.map.height;
        const cx = Math.floor(w / 2);
        const cy = Math.floor(h / 2);
        const minDim = Math.min(w, h);
        const edgeInset = Math.max(2, Math.floor(minDim * 0.08));
        const ringInset = Math.max(edgeInset + 2, Math.floor(minDim * 0.16));
        const branchOffset = Math.max(3, Math.floor(minDim * 0.12));
        const branchPad = Math.max(2, Math.floor(minDim * 0.08));
        const branchRise = Math.max(2, Math.floor(minDim * 0.06));

        const xOuter = CityMap._insetRange(edgeInset, 0, w - 1);
        const zOuter = CityMap._insetRange(edgeInset, 0, h - 1);
        const xInner = CityMap._insetRange(ringInset, 0, w - 1);
        const zInner = CityMap._insetRange(ringInset, 0, h - 1);

        const branchY = Math.min(zOuter.b - 1, cy + branchOffset);
        const branchXStart = Math.min(xOuter.b - 1, xOuter.a + branchOffset);
        const branchXEnd = Math.min(xOuter.b - 1, Math.max(branchXStart, cx - branchPad));
        const branchYEnd = Math.max(branchY, zOuter.b - branchRise);

        return {
            version: 1,
            seed: config.seed,
            width: w,
            height: h,
            tileSize: config.map.tileSize,
            origin: config.map.origin,
            roads: [
                { a: [xOuter.a, cy], b: [xOuter.b, cy], lanesF: 2, lanesB: 2, tag: 'arterial' },
                { a: [cx, zOuter.a], b: [cx, zOuter.b], lanesF: 2, lanesB: 2, tag: 'arterial' },

                { a: [xInner.a, zInner.a], b: [xInner.b, zInner.a], lanesF: 1, lanesB: 1, tag: 'collector' },
                { a: [xInner.a, zInner.a], b: [xInner.a, zInner.b], lanesF: 1, lanesB: 1, tag: 'collector' },
                { a: [xInner.a, zInner.b], b: [xInner.b, zInner.b], lanesF: 1, lanesB: 1, tag: 'collector' },
                { a: [xInner.b, zInner.a], b: [xInner.b, zInner.b], lanesF: 1, lanesB: 1, tag: 'collector' },

                { a: [branchXStart, branchY], b: [branchXEnd, branchY], lanesF: 2, lanesB: 0, tag: 'oneway-east' },
                { a: [branchXEnd, branchY], b: [branchXEnd, branchYEnd], lanesF: 2, lanesB: 0, tag: 'oneway-north' }
            ]
        };
    }
}
