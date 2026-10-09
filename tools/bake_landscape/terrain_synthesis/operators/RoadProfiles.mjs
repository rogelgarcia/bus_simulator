// Derives grade-limited road centerline profiles over the whole plan network: stations, smoothing, junction leveling and the coupled envelope fit.
// @ts-check
// A profile is fitted to the sampled heights t along the network as the average of the largest g-Lipschitz minorant
// U = min_j (t_j + g d(., j)) and the smallest g-Lipschitz majorant V = max_j (t_j - g d(., j)), with d the distance along the
// roads: (U + V) / 2 is the L-infinity-optimal profile whose grade never exceeds g, and it is g-Lipschitz on the graph because U and
// V are. Stations of different roads within the coupling distance (junction nodes, roads merging onto one corridor, the two ends of a
// loop) are one node of that graph, so coupled roads always carry the same height where they share the ground. Anchored stations
// (district interiors, the level end sections) hold their targets exactly: the free fit is clamped into the band those anchors allow
// at the grade, and a road whose anchors conflict or whose ends leave the ground beyond the tolerance is reported infeasible.

/** Cumulative XZ stations of a centerline. @param {ReadonlyArray<ReadonlyArray<number>>} points [x, y, z] @returns {Float64Array} */
export function centerlineStations(points) {
    const stations = new Float64Array(points.length);
    for (let i = 1; i < points.length; i++) stations[i] = stations[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][2] - points[i - 1][2]);
    return stations;
}

/** Moving average over the window (meters) along the stations; a zero window returns a copy. @param {Float64Array} stations @param {Float64Array} values @param {number} windowMeters */
export function smoothProfile(stations, values, windowMeters) {
    const out = new Float64Array(values.length), half = windowMeters / 2;
    for (let i = 0; i < values.length; i++) {
        let sum = 0, count = 0;
        for (let j = 0; j < values.length; j++) if (Math.abs(stations[j] - stations[i]) <= half) { sum += values[j]; count++; }
        out[i] = sum / count;
    }
    return out;
}

/** Maximum absolute grade (percent) between consecutive stations. @param {Float64Array} stations @param {Float64Array} values */
export function maxGradePercent(stations, values) {
    let worst = 0;
    for (let i = 1; i < values.length; i++) {
        const run = stations[i] - stations[i - 1];
        if (run > 0) worst = Math.max(worst, Math.abs(values[i] - values[i - 1]) / run * 100);
    }
    return worst;
}

/**
 * Holds the target at its end heights over the first and last `levelMeters` of the centerline, so a road arrives level at its nodes;
 * returns the same array.
 * @param {Float64Array} stations @param {Float64Array} values @param {Float64Array} raw @param {number} levelMeters
 */
export function levelJunctions(stations, values, raw, levelMeters) {
    const last = stations.length - 1;
    if (!(levelMeters > 0) || last < 1) return values;
    for (let i = 0; i <= last; i++) {
        if (stations[i] <= levelMeters) values[i] = raw[0];
        if (stations[last] - stations[i] <= levelMeters) values[i] = raw[last];
    }
    return values;
}

/**
 * Grade-limited profiles of every road at once. Stations of different roads, or non-consecutive stations of one road, within
 * `couplingMeters` of each other form one node; consecutive stations are graph edges of their station spacing. The envelope is
 * relaxed over the graph (Bellman-Ford sweeps until nothing changes) and every station takes its node's fit, clamped into the band
 * the anchored stations allow (an anchored station holds its target exactly: district interiors, level end sections). Where anchors
 * conflict at the grade the node takes the middle of its anchor band and is counted as a conflict.
 * @param {{stations:Float64Array,target:Float64Array,anchor:Uint8Array,x:Float64Array,z:Float64Array}[]} roads
 * @param {{maxGradePercent:number,couplingMeters:number}} options
 * @returns {{profiles:Float64Array[],conflicts:Uint8Array[],nodes:number,anchoredNodes:number,conflictNodes:number,coupledStations:number,edges:number,sweeps:number}}
 */
export function networkGradeLimitedProfiles(roads, { maxGradePercent: limit, couplingMeters }) {
    const g = limit / 100, offsets = [];
    let total = 0;
    for (const road of roads) { offsets.push(total); total += road.stations.length; }
    const parent = new Int32Array(total), stationRoad = new Int32Array(total), stationIndex = new Int32Array(total);
    roads.forEach((road, r) => { for (let i = 0; i < road.stations.length; i++) { const id = offsets[r] + i; parent[id] = id; stationRoad[id] = r; stationIndex[id] = i; } });
    const find = id => { while (parent[id] !== id) { parent[id] = parent[parent[id]]; id = parent[id]; } return id; };
    const cell = Math.max(couplingMeters, 1e-6), buckets = new Map(), key = (cx, cz) => `${cx},${cz}`;
    for (let id = 0; id < total; id++) {
        const road = roads[stationRoad[id]], i = stationIndex[id], k = key(Math.floor(road.x[i] / cell), Math.floor(road.z[i] / cell));
        let list = buckets.get(k);
        if (!list) buckets.set(k, list = []);
        list.push(id);
    }
    let coupled = 0;
    for (let id = 0; id < total; id++) {
        const road = roads[stationRoad[id]], i = stationIndex[id], cx = Math.floor(road.x[i] / cell), cz = Math.floor(road.z[i] / cell);
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
            const list = buckets.get(key(cx + dx, cz + dz));
            if (!list) continue;
            for (const other of list) {
                if (other <= id) continue;
                const otherRoad = roads[stationRoad[other]], j = stationIndex[other];
                // along one road only a return to the same ground (a loop closing on itself) couples, never neighbouring stations
                if (otherRoad === road && Math.abs(road.stations[j] - road.stations[i]) <= 4 * couplingMeters) continue;
                if (Math.hypot(otherRoad.x[j] - road.x[i], otherRoad.z[j] - road.z[i]) > couplingMeters) continue;
                const a = find(id), b = find(other);
                if (a !== b) { parent[Math.max(a, b)] = Math.min(a, b); coupled++; }
            }
        }
    }
    const node = new Int32Array(total), nodeOf = new Map();
    for (let id = 0; id < total; id++) {
        const representative = find(id);
        let index = nodeOf.get(representative);
        if (index === undefined) { index = nodeOf.size; nodeOf.set(representative, index); }
        node[id] = index;
    }
    const nodes = nodeOf.size, target = new Float64Array(nodes), members = new Int32Array(nodes);
    for (let id = 0; id < total; id++) { target[node[id]] += roads[stationRoad[id]].target[stationIndex[id]]; members[node[id]]++; }
    for (let k = 0; k < nodes; k++) target[k] /= members[k];
    const edgeA = [], edgeB = [], edgeReach = [];
    roads.forEach((road, r) => {
        for (let i = 1; i < road.stations.length; i++) {
            const a = node[offsets[r] + i - 1], b = node[offsets[r] + i];
            if (a !== b) { edgeA.push(a); edgeB.push(b); edgeReach.push(g * (road.stations[i] - road.stations[i - 1])); }
        }
    });
    const anchored = new Uint8Array(nodes), anchorTarget = new Float64Array(nodes), anchorMembers = new Int32Array(nodes);
    for (let id = 0; id < total; id++) {
        const road = roads[stationRoad[id]], i = stationIndex[id];
        if (!road.anchor[i]) continue;
        anchored[node[id]] = 1; anchorTarget[node[id]] += road.target[i]; anchorMembers[node[id]]++;
    }
    let anchoredNodes = 0;
    for (let k = 0; k < nodes; k++) if (anchored[k]) { anchorTarget[k] /= anchorMembers[k]; anchoredNodes++; }
    const relax = (lower, upper) => {
        let changed = true, sweeps = 0;
        while (changed) {
            changed = false; sweeps++;
            if (sweeps > total + 1) throw new Error('[Synthesis] road network envelope did not converge');
            for (let e = 0; e < edgeA.length; e++) {
                const a = edgeA[e], b = edgeB[e], reach = edgeReach[e];
                if (lower[b] + reach < lower[a]) { lower[a] = lower[b] + reach; changed = true; }
                if (lower[a] + reach < lower[b]) { lower[b] = lower[a] + reach; changed = true; }
                if (upper[b] - reach > upper[a]) { upper[a] = upper[b] - reach; changed = true; }
                if (upper[a] - reach > upper[b]) { upper[b] = upper[a] - reach; changed = true; }
            }
        }
        return sweeps;
    };
    const lower = Float64Array.from(target), upper = Float64Array.from(target), sweeps = relax(lower, upper);
    const lowerBand = Float64Array.from(anchored, (flag, k) => flag ? anchorTarget[k] : Infinity), upperBand = Float64Array.from(anchored, (flag, k) => flag ? anchorTarget[k] : -Infinity);
    const bandSweeps = relax(lowerBand, upperBand), value = new Float64Array(nodes), conflict = new Uint8Array(nodes);
    let conflictNodes = 0;
    for (let k = 0; k < nodes; k++) {
        const fit = (lower[k] + upper[k]) / 2;
        if (lowerBand[k] === Infinity) value[k] = fit;
        else if (lowerBand[k] >= upperBand[k] - 1e-9) value[k] = Math.min(lowerBand[k], Math.max(upperBand[k], fit));
        else { value[k] = (lowerBand[k] + upperBand[k]) / 2; conflict[k] = 1; conflictNodes++; }
    }
    const profiles = roads.map((road, r) => Float64Array.from(road.stations, (_, i) => value[node[offsets[r] + i]]));
    const conflicts = roads.map((road, r) => Uint8Array.from(road.stations, (_, i) => conflict[node[offsets[r] + i]]));
    return { profiles, conflicts, nodes, anchoredNodes, conflictNodes, coupledStations: coupled, edges: edgeA.length, sweeps: sweeps + bandSweeps };
}
