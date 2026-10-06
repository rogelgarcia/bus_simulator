// Cache candidate LODs for continuous GPU blending, with the previous patch-switch mode retained for comparison.
// @ts-check
// Cell-center distances keep circular helpers honest; a one-meter cell has at most 0.71 m of spatial quantization.

export const DEFAULT_TRANSITION_DISTANCES = Object.freeze([0.6, 0.8, 1, 16, 32]);
export const TRANSITION_LEVELS = Object.freeze(['LOD0', 'LOD1', 'LOD2', 'LOD3', 'LOD4', 'LOD5']);
// Half-cell diagonal plus the widest expanded card, including its size variation.
const GEOMETRY_SUPPORT_METERS = 1.4;

/** @typedef {{centerX:number, centerZ:number, edge?:number, minX?:number, maxX?:number, minZ?:number, maxZ?:number}} TransitionCell */
/** @typedef {{distances?:readonly number[], scale?:number, movementThreshold?:number, intervalMs?:number, sideLeafDistance?:number, transitionFraction?:number, transitionMode?:'blend'|'patches', bridgeEnabled?:boolean}} TransitionSettings */

/** @param {number} value @param {string} name @param {boolean} allowZero */
function assertPositive(value, name, allowZero = false) {
    if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
        throw new RangeError(`${name} must be finite and ${allowZero ? 'nonnegative' : 'positive'}.`);
    }
}

/** @param {TransitionSettings} options */
function validateSettings(options) {
    const distances = options.distances ?? DEFAULT_TRANSITION_DISTANCES;
    if (distances.length !== 5) throw new RangeError('Grass transitions require five distance limits.');
    for (let i = 0; i < distances.length; i++) {
        assertPositive(distances[i], `distances[${i}]`);
        if (i && distances[i] <= distances[i - 1]) throw new RangeError('Grass distance limits must increase strictly.');
    }
    const scale = options.scale ?? 1;
    const movementThreshold = options.movementThreshold ?? 0.2;
    const intervalMs = options.intervalMs ?? 50;
    const sideLeafDistance = options.sideLeafDistance ?? 35;
    const transitionFraction = options.transitionFraction ?? .5;
    const transitionMode = options.transitionMode ?? 'blend';
    const bridgeEnabled = options.bridgeEnabled ?? true;
    if (typeof bridgeEnabled !== 'boolean') throw new RangeError('Bridge selection must be boolean.');
    if (!['blend', 'patches'].includes(transitionMode)) throw new RangeError('Unknown grass transition mode.');
    if (!Number.isFinite(transitionFraction) || transitionFraction < 0 || transitionFraction > 1)
        throw new RangeError('Transition fraction must be between zero and one.');
    assertPositive(scale, 'scale');
    assertPositive(movementThreshold, 'movementThreshold', true);
    assertPositive(intervalMs, 'intervalMs', true);
    assertPositive(sideLeafDistance, 'sideLeafDistance', true);
    return { distances: Array.from(distances), scale, movementThreshold, intervalMs, sideLeafDistance, transitionFraction, transitionMode, bridgeEnabled };
}

function transitionBands({ distances, scale, transitionFraction, bridgeEnabled }) {
    const bands = distances.map((end, i) => ({ from: i, to: i + 1,
        start: (end - (end - (i ? distances[i - 1] : 0)) * transitionFraction) * scale, end: end * scale }));
    // Both material slots share the same range when comparing the previous direct
    // LOD3→canopy path. The unused LOD4 has no render candidates or geometry work.
    if (!bridgeEnabled) bands[4] = { ...bands[3], to: 5 };
    return bands;
}

/** Stable world-space ranks avoid reshuffling when the camera, cell order or batch membership changes.
 * @param {number} x @param {number} z */
function patchThreshold(x, z) {
    let hash = Math.imul(Math.round(x * 1024), 0x1f123bb5) ^ Math.imul(Math.round(z * 1024), 0x5f356495);
    hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
    hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
    const rank = ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
    // Inverse smoothstep distributes switches gently at both ends of the band; never evaluated during a scan.
    return .5 - Math.sin(Math.asin(1 - 2 * (.001 + .998 * rank)) / 3);
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
    #patchThresholds;
    #patchLimitsSquared;
    #renderMasks;
    #renderChangedCount = 0;
    #supportMinSquared = new Float64Array(6);
    #supportMaxSquared = new Float64Array(6);
    #midpointsSquared = new Float64Array(5);
    #guardMeters = 0;
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
        this.#patchThresholds = new Float64Array(cells.length);
        this.#patchLimitsSquared = new Float64Array(cells.length * 5);
        this.#renderMasks = new Uint8Array(cells.length);
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
            this.#patchThresholds[i] = patchThreshold(cell.centerX, cell.centerZ);
        }
        this.#applySettings();
        const selection = this;
        this.#result = Object.freeze({
            get scanned() { return selection.#scanned; },
            get changedCount() { return selection.#changedCount; },
            get sideLeavesChangedCount() { return selection.#sideLeavesChangedCount; },
            get renderChangedCount() { return selection.#renderChangedCount; },
            get cpuMs() { return selection.#cpuMs; },
            changedIndices: this.#changedIndices,
            levels: this.#levels,
            sideLeaves: this.#sideLeaves,
            renderMasks: this.#renderMasks,
            counts: this.#counts
        });
    }

    #applySettings() {
        const { movementThreshold } = this.#settings;
        // Cover the largest lab speed (5 m/s × Shift 5) between scans, plus accumulated sub-threshold motion.
        this.#guardMeters = movementThreshold + this.#settings.intervalMs * .025;
        const bands = transitionBands(this.#settings), starts = bands.map(band => band.start);
        for (let level = 0; level < 5; level++) {
            const { start, end } = bands[level], width = end - start;
            this.#midpointsSquared[level] = (end - width / 2) ** 2;
            for (let cell = 0; cell < this.#levels.length; cell++)
                this.#patchLimitsSquared[cell * 5 + level] = (end - width + width * this.#patchThresholds[cell]) ** 2;
        }
        for (let level = 0; level < 6; level++) {
            this.#supportMinSquared[level] = level ? Math.max(0, starts[level - 1] - this.#guardMeters - GEOMETRY_SUPPORT_METERS) ** 2 : 0;
            this.#supportMaxSquared[level] = level < 5 ? (bands[level].end + this.#guardMeters + GEOMETRY_SUPPORT_METERS) ** 2 : Infinity;
        }
        if (!this.#settings.bridgeEnabled) this.#supportMinSquared[4] = Infinity;
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
     * @returns {{readonly scanned:boolean,readonly changedCount:number,readonly renderChangedCount:number,readonly renderMasks:Uint8Array,readonly sideLeavesChangedCount:number,readonly sideLeaves:Uint8Array,readonly cpuMs:number,readonly changedIndices:Int32Array,readonly levels:Uint8Array,readonly counts:Uint32Array}} Borrowed arrays are read-only to callers and remain valid until the next update; only changedCount indices are valid.
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
        this.#renderChangedCount = 0;
        this.#cpuMs = 0;
        if (!this.#dirty && !options?.force) {
            const dx = x - this.#lastX;
            const dz = z - this.#lastZ;
            const movementSquared = dx * dx + dz * dz;
            if (movementSquared === 0 || movementSquared < this.#movementSquared) {
                this.#metrics.skippedStationary++;
                return this.#result;
            }
            // A jump beyond the cached support must refresh immediately, even inside the normal interval.
            if (nowMs - this.#lastScanMs < this.#settings.intervalMs && movementSquared <= this.#guardMeters ** 2) {
                this.#metrics.skippedInterval++;
                return this.#result;
            }
        }
        const startMs = performance.now();
        const blend = this.#settings.transitionMode === 'blend' && this.#settings.transitionFraction > 0;
        this.#counts.fill(0);
        for (let i = 0; i < this.#levels.length; i++) {
            const dx = this.#centerX[i] - x;
            const dz = this.#centerZ[i] - z;
            const distanceSquared = dx * dx + dz * dz;
            let level = 0;
            while (level < 5 && distanceSquared >= (blend ? this.#midpointsSquared[level] : this.#patchLimitsSquared[i * 5 + level])) level++;
            let mask = 1 << level;
            if (blend) {
                mask = 0;
                for (let candidate = 0; candidate < 6; candidate++)
                    if (distanceSquared >= this.#supportMinSquared[candidate] && distanceSquared <= this.#supportMaxSquared[candidate]) mask |= 1 << candidate;
            }
            if (mask !== this.#renderMasks[i]) { this.#renderMasks[i] = mask; this.#renderChangedCount++; }
            this.#counts[level]++;
            const sideLeaves = Number((mask & 32) && this.#edges[i] && distanceSquared <= this.#sideLeafDistanceSquared);
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
            transitionFraction: this.#settings.transitionFraction,
            transitionMode: this.#settings.transitionMode,
            bridgeEnabled: this.#settings.bridgeEnabled,
            blendGuardMeters: this.#guardMeters,
            geometrySupportMeters: GEOMETRY_SUPPORT_METERS,
            blendCandidateCells: this.#renderMasks.reduce((sum, mask) => sum + Number((mask & (mask - 1)) !== 0), 0),
            transitionBands: transitionBands(this.#settings),
            transitionMethod: !this.#settings.transitionFraction ? 'abrupt' : this.#settings.transitionMode === 'blend' ? 'complementary-screen-door' : 'stable-spatial-patches',
            counts: Array.from(this.#counts),
            lastScanMs: Number.isFinite(this.#lastScanMs) ? this.#lastScanMs : null,
            ...this.#metrics,
            averageCpuMs: this.#metrics.scans ? this.#metrics.totalCpuMs / this.#metrics.scans : 0
        };
    }
}
