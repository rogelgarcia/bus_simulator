// Selects abrupt grass LOD bands only when horizontal camera movement warrants a scan.
// @ts-check
// Cell-center distances keep circular helpers honest; a one-meter cell has at most 0.71 m of spatial quantization.

export const DEFAULT_TRANSITION_DISTANCES = Object.freeze([1, 3, 6, 25]);
export const TRANSITION_LEVELS = Object.freeze(['LOD0', 'LOD1', 'LOD2', 'LOD3', 'LOD4']);

/** @typedef {{centerX:number, centerZ:number, edge?:number, minX?:number, maxX?:number, minZ?:number, maxZ?:number}} TransitionCell */
/** @typedef {{distances?:readonly number[], scale?:number, movementThreshold?:number, intervalMs?:number, sideLeafDistance?:number}} TransitionSettings */

/** @param {number} value @param {string} name @param {boolean} allowZero */
function assertPositive(value, name, allowZero = false) {
    if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
        throw new RangeError(`${name} must be finite and ${allowZero ? 'nonnegative' : 'positive'}.`);
    }
}

/** @param {TransitionSettings} options */
function validateSettings(options) {
    const distances = options.distances ?? DEFAULT_TRANSITION_DISTANCES;
    if (distances.length !== 4) throw new RangeError('Grass transitions require four distance limits.');
    for (let i = 0; i < distances.length; i++) {
        assertPositive(distances[i], `distances[${i}]`);
        if (i && distances[i] <= distances[i - 1]) throw new RangeError('Grass distance limits must increase strictly.');
    }
    const scale = options.scale ?? 1;
    const movementThreshold = options.movementThreshold ?? 0.25;
    const intervalMs = options.intervalMs ?? 100;
    const sideLeafDistance = options.sideLeafDistance ?? 35;
    assertPositive(scale, 'scale');
    assertPositive(movementThreshold, 'movementThreshold', true);
    assertPositive(intervalMs, 'intervalMs', true);
    assertPositive(sideLeafDistance, 'sideLeafDistance', true);
    return { distances: Array.from(distances), scale, movementThreshold, intervalMs, sideLeafDistance };
}

export class GrassDebugV2TransitionSelection {
    #centerX;
    #centerZ;
    #levels;
    #edges;
    #sideLeaves;
    #sideLeafDistanceSquared = 0;
    #sideLeavesChangedCount = 0;
    #changedIndices;
    #counts = new Uint32Array(TRANSITION_LEVELS.length);
    #limitsSquared = new Float64Array(4);
    #settings;
    #movementSquared = 0;
    #dirty = true;
    #lastX = 0;
    #lastZ = 0;
    #lastScanMs = -Infinity;
    #changedCount = 0;
    #scanned = false;
    #cpuMs = 0;
    #result;
    #metrics = { updates: 0, scans: 0, visitedCells: 0, changedCells: 0, skippedStationary: 0, skippedInterval: 0, totalCpuMs: 0, maxCpuMs: 0 };

    /** @param {TransitionSettings & {cells:readonly TransitionCell[]}} options */
    constructor(options) {
        const { cells } = options;
        this.#settings = validateSettings(options);
        this.#centerX = new Float64Array(cells.length);
        this.#centerZ = new Float64Array(cells.length);
        this.#levels = new Uint8Array(cells.length).fill(255);
        this.#edges = new Uint8Array(cells.map(cell => Number(!!cell.edge)));
        this.#sideLeaves = new Uint8Array(cells.length);
        this.#changedIndices = new Int32Array(cells.length);
        for (let i = 0; i < cells.length; i++) {
            const cell = cells[i];
            if (!Number.isFinite(cell.centerX) || !Number.isFinite(cell.centerZ)) {
                throw new RangeError(`Grass cell ${i} must have finite centerX and centerZ.`);
            }
            for (const axis of ['X', 'Z']) {
                const minimum = cell[`min${axis}`];
                const maximum = cell[`max${axis}`];
                const center = cell[`center${axis}`];
                if (minimum === undefined && maximum === undefined) continue;
                if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > center || maximum < center) {
                    throw new RangeError(`Grass cell ${i} has invalid ${axis} bounds.`);
                }
            }
            this.#centerX[i] = cell.centerX;
            this.#centerZ[i] = cell.centerZ;
        }
        this.#applySettings();
        const selection = this;
        this.#result = Object.freeze({
            get scanned() { return selection.#scanned; },
            get changedCount() { return selection.#changedCount; },
            get sideLeavesChangedCount() { return selection.#sideLeavesChangedCount; },
            get cpuMs() { return selection.#cpuMs; },
            changedIndices: this.#changedIndices,
            levels: this.#levels,
            sideLeaves: this.#sideLeaves,
            counts: this.#counts
        });
    }

    #applySettings() {
        const { distances, scale, movementThreshold } = this.#settings;
        for (let i = 0; i < 4; i++) this.#limitsSquared[i] = (distances[i] * scale) ** 2;
        this.#movementSquared = movementThreshold ** 2;
        this.#sideLeafDistanceSquared = this.#settings.sideLeafDistance ** 2;
        this.#dirty = true;
    }

    /** @param {TransitionSettings} options Forces the next update, including while stationary. */
    setSettings(options) {
        this.#settings = validateSettings({ ...this.#settings, ...options });
        this.#applySettings();
    }

    /**
     * @param {{x:number,z:number}} position Camera world position; height and rotation do not affect these bands.
     * @param {number} nowMs Monotonic elapsed milliseconds, matching performance.now().
     * @param {{force?:boolean}} [options]
     * @returns {{readonly scanned:boolean,readonly changedCount:number,readonly sideLeavesChangedCount:number,readonly sideLeaves:Uint8Array,readonly cpuMs:number,readonly changedIndices:Int32Array,readonly levels:Uint8Array,readonly counts:Uint32Array}} Borrowed arrays are read-only to callers and remain valid until the next update; only changedCount indices are valid.
     */
    update(position, nowMs, options) {
        const { x, z } = position;
        if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(nowMs)) {
            throw new RangeError('Grass LOD selection requires finite camera X/Z and time.');
        }
        this.#metrics.updates++;
        this.#scanned = false;
        this.#changedCount = 0;
        this.#sideLeavesChangedCount = 0;
        this.#cpuMs = 0;
        if (!this.#dirty && !options?.force) {
            const dx = x - this.#lastX;
            const dz = z - this.#lastZ;
            const movementSquared = dx * dx + dz * dz;
            if (movementSquared === 0 || movementSquared < this.#movementSquared) {
                this.#metrics.skippedStationary++;
                return this.#result;
            }
            if (nowMs - this.#lastScanMs < this.#settings.intervalMs) {
                this.#metrics.skippedInterval++;
                return this.#result;
            }
        }
        const startMs = performance.now();
        this.#counts.fill(0);
        for (let i = 0; i < this.#levels.length; i++) {
            const dx = this.#centerX[i] - x;
            const dz = this.#centerZ[i] - z;
            const distanceSquared = dx * dx + dz * dz;
            let level = 0;
            while (level < 4 && distanceSquared >= this.#limitsSquared[level]) level++;
            this.#counts[level]++;
            const sideLeaves = Number(level === 4 && this.#edges[i] && distanceSquared <= this.#sideLeafDistanceSquared);
            if (this.#sideLeaves[i] !== sideLeaves) { this.#sideLeaves[i] = sideLeaves; this.#sideLeavesChangedCount++; }
            if (this.#levels[i] === level) continue;
            this.#levels[i] = level;
            this.#changedIndices[this.#changedCount++] = i;
        }
        this.#cpuMs = performance.now() - startMs;
        this.#metrics.scans++;
        this.#metrics.visitedCells += this.#levels.length;
        this.#metrics.changedCells += this.#changedCount;
        this.#metrics.totalCpuMs += this.#cpuMs;
        this.#metrics.maxCpuMs = Math.max(this.#metrics.maxCpuMs, this.#cpuMs);
        this.#scanned = true;
        this.#dirty = false;
        this.#lastX = x;
        this.#lastZ = z;
        this.#lastScanMs = nowMs;
        return this.#result;
    }

    resetMetrics() {
        for (const key of Object.keys(this.#metrics)) this.#metrics[key] = 0;
    }

    getSnapshot() {
        return {
            cellCount: this.#levels.length,
            distanceMetric: 'horizontal-cell-center',
            distances: [...this.#settings.distances],
            effectiveDistances: this.#settings.distances.map((distance) => distance * this.#settings.scale),
            scale: this.#settings.scale,
            movementThreshold: this.#settings.movementThreshold,
            intervalMs: this.#settings.intervalMs,
            sideLeafDistance: this.#settings.sideLeafDistance,
            counts: Array.from(this.#counts),
            lastScanMs: Number.isFinite(this.#lastScanMs) ? this.#lastScanMs : null,
            ...this.#metrics,
            averageCpuMs: this.#metrics.scans ? this.#metrics.totalCpuMs / this.#metrics.scans : 0
        };
    }
}
