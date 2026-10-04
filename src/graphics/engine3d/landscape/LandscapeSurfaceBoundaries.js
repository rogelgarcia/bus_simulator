// Extracts smoothed vector soil boundaries from a canonical native display-label window and answers face queries.
// @ts-check
// Multi-label marching squares places vertices at differing-label edge midpoints and junction vertices at the centers of
// cells with three or more labels; two-label saddles connect the minority label of the surrounding 4x4 block (ties: lower
// soil index) so thin diagonal features stay connected. Chains between fixed vertices (junctions and window terminals)
// are smoothed by one turning-limited local quadratic fit per vertex (triweight kernel in arc length). It straightens
// long digitized stair runs without collapsing hairpins, and a gap guard caps each displacement at a fraction of the
// distance to other boundaries so thin features cannot cross. Closed loops shorter than a threshold are subdivided,
// Taubin-smoothed and rescaled to their original area, so single-sample islands become rounded blobs. Windows whose
// crossing edges exceed maxCrossingFraction are rejected explicitly, which bounds scratch. Only basic IEEE operations
// and sqrt on canonical world coordinates are used, in fixed orders, so windows sharing a dependency neighbourhood
// produce bit-identical geometry in any JavaScript engine.

export const LANDSCAPE_SURFACE_BOUNDARY = Object.freeze({
    id: 'smoothed-native-marching-squares-v1',
    saddle: 'minority-4x4-lower-index',
    smoothing: 'turning-limited-local-quadratic',
    kernel: 'triweight',
    loops: 'subdivided-taubin-area-preserving',
    maxCrossingFraction: .125
});

/**
 * Upper bound of the typed-array bytes of one boundary build over a width x height label window. Windows whose crossing
 * edges exceed maxCrossingFraction are rejected, which bounds vertices (crossings plus at most 2/3 as many junctions),
 * segments (two per crossing), small-loop points and final segments (two per crossing plus subdivided loop points).
 * @param {number} width @param {number} height @param {{maxDisplacementCells:number,loops:{subdivisions:number}}} parameters
 */
export function landscapeSurfaceBoundaryScratchBytes(width, height, parameters) {
    const cells = (width - 1) * (height - 1), edges = (width - 1) * height + width * (height - 1), subdivisions = parameters.loops.subdivisions;
    const crossings = Math.floor(edges * LANDSCAPE_SURFACE_BOUNDARY.maxCrossingFraction), vertices = crossings + Math.min(cells, Math.floor(2 * crossings / 3));
    const segments = 2 * crossings, finals = segments + (subdivisions - 1) * crossings, references = vertices + subdivisions * crossings;
    const span = Math.ceil(1 + 2 * parameters.maxDisplacementCells) + 1;
    return 4 * edges + 45 * vertices + 130 * segments + 32 * subdivisions * crossings + (66 + 4 * span * span) * finals + 8 * references + 17 * cells + 256;
}

const JUNCTION = 1;

function fail(message) { throw new Error(`[LandscapeSurfaceBoundaries] ${message}`); }

function validate(input) {
    const value = { ...input }, parameters = value.parameters;
    if (!['width', 'height', 'originColumn', 'originRow', 'soilCount'].every(key => Number.isSafeInteger(value[key])) || value.width < 2 || value.height < 2
        || value.soilCount < 1 || value.soilCount > 16 || !(value.labels instanceof Uint8Array) || value.labels.length !== value.width * value.height
        || ![value.minX, value.maxZ].every(Number.isFinite) || ![value.spacingX, value.spacingZ, value.farDistance].every(entry => Number.isFinite(entry) && entry > 0)) fail('boundaries need a complete label window, positive spacing and a far distance');
    for (let i = 0; i < value.labels.length; i++) if (value.labels[i] >= value.soilCount) fail('label window contains an unknown display soil');
    if (!parameters || ![parameters.sigmaCells, parameters.windowSigmas, parameters.maxDisplacementCells, parameters.gapFraction].every(entry => Number.isFinite(entry) && entry > 0)
        || !Number.isFinite(parameters.turningCosine) || parameters.turningCosine < -1 || parameters.turningCosine > 1 || !Number.isSafeInteger(parameters.gapSegments) || parameters.gapSegments < 1
        || !parameters.loops || !Number.isFinite(parameters.loops.maxPerimeterCells) || parameters.loops.maxPerimeterCells < 0 || !Number.isSafeInteger(parameters.loops.subdivisions)
        || parameters.loops.subdivisions < 1 || !Number.isSafeInteger(parameters.loops.iterations) || parameters.loops.iterations < 0
        || !(parameters.loops.lambda > 0) || !(parameters.loops.mu < -parameters.loops.lambda)) fail('boundary smoothing parameters are invalid');
    return value;
}

function pseudoAngle(dx, dz) {
    const sum = Math.abs(dx) + Math.abs(dz), t = dx / sum;
    return dz >= 0 ? 1 - t : 3 + t;
}

/**
 * @param {{labels:Uint8Array,width:number,height:number,originColumn:number,originRow:number,minX:number,maxZ:number,spacingX:number,spacingZ:number,soilCount:number,farDistance:number,
 *   parameters:{sigmaCells:number,windowSigmas:number,turningCosine:number,maxDisplacementCells:number,gapFraction:number,gapSegments:number,loops:{maxPerimeterCells:number,subdivisions:number,lambda:number,mu:number,iterations:number}}}} input
 */
export function createLandscapeSurfaceBoundaries(input) {
    const { labels, width, height, originColumn, originRow, minX, maxZ, spacingX, spacingZ, farDistance, parameters } = validate(input);
    const cellsW = width - 1, cellsH = height - 1, cell = Math.max(spacingX, spacingZ), minimumSpacing = Math.min(spacingX, spacingZ);
    const gridMinX = minX + originColumn * spacingX, gridMaxZ = maxZ - originRow * spacingZ;
    const label = (c, r) => labels[r * width + c];
    let scratchBytes = 0;
    const track = array => { scratchBytes += array.byteLength; return array; };

    // marching squares: count, then build canonical vertices and labelled segments in row-major cell order
    let horizontalCount = 0, verticalCount = 0, junctionCount = 0, segmentCount = 0;
    for (let r = 0; r < height; r++) for (let c = 0; c < cellsW; c++) if (label(c, r) !== label(c + 1, r)) horizontalCount++;
    for (let r = 0; r < cellsH; r++) for (let c = 0; c < width; c++) if (label(c, r) !== label(c, r + 1)) verticalCount++;
    for (let r = 0; r < cellsH; r++) for (let c = 0; c < cellsW; c++) {
        const tl = label(c, r), tr = label(c + 1, r), bl = label(c, r + 1), br = label(c + 1, r + 1);
        const crossings = (tl !== tr) + (tr !== br) + (bl !== br) + (tl !== bl);
        if (!crossings) continue;
        const distinct = 1 + (tr !== tl) + (bl !== tl && bl !== tr) + (br !== tl && br !== tr && br !== bl);
        if (distinct >= 3) { junctionCount++; segmentCount += crossings; } else segmentCount += crossings === 4 ? 2 : 1;
    }
    const vertexCount = horizontalCount + verticalCount + junctionCount, edgeCount = cellsW * height + width * cellsH;
    if (horizontalCount + verticalCount > edgeCount * LANDSCAPE_SURFACE_BOUNDARY.maxCrossingFraction) fail(`label window is too fragmented for vector boundaries (${horizontalCount + verticalCount} of ${edgeCount} edges cross)`);
    const horizontalVertex = track(new Int32Array(cellsW * height).fill(-1)), verticalVertex = track(new Int32Array(width * cellsH).fill(-1));
    const vertexX = track(new Float64Array(vertexCount)), vertexZ = track(new Float64Array(vertexCount)), vertexKind = track(new Uint8Array(vertexCount));
    const segmentA = track(new Int32Array(segmentCount)), segmentB = track(new Int32Array(segmentCount)), segmentLeft = track(new Uint8Array(segmentCount)), segmentRight = track(new Uint8Array(segmentCount));
    let nextVertex = 0, nextSegment = 0;
    const horizontal = (c, r) => {
        let id = horizontalVertex[r * cellsW + c];
        if (id < 0) { id = nextVertex++; horizontalVertex[r * cellsW + c] = id; vertexX[id] = minX + (originColumn + c + .5) * spacingX; vertexZ[id] = maxZ - (originRow + r) * spacingZ; }
        return id;
    };
    const vertical = (c, r) => {
        let id = verticalVertex[r * width + c];
        if (id < 0) { id = nextVertex++; verticalVertex[r * width + c] = id; vertexX[id] = minX + (originColumn + c) * spacingX; vertexZ[id] = maxZ - (originRow + r + .5) * spacingZ; }
        return id;
    };
    const addSegment = (a, ax, az, b, bx, bz, kx, kz, cornerLabel, otherLabel) => {
        const left = (bx - ax) * (kz - az) - (bz - az) * (kx - ax) > 0;
        segmentA[nextSegment] = a; segmentB[nextSegment] = b;
        segmentLeft[nextSegment] = left ? cornerLabel : otherLabel; segmentRight[nextSegment] = left ? otherLabel : cornerLabel;
        nextSegment++;
    };
    const edgeId = new Int32Array(4), edgeX = new Int32Array(4), edgeZ = new Int32Array(4), edgeP = new Int32Array(8), edgeLabels = new Uint8Array(8);
    for (let r = 0; r < cellsH; r++) for (let c = 0; c < cellsW; c++) {
        const tl = label(c, r), tr = label(c + 1, r), bl = label(c, r + 1), br = label(c + 1, r + 1);
        if (tl === tr && tr === br && br === bl) continue;
        const x0 = 2 * c, z0 = -2 * r;
        let count = 0;
        const edge = (id, mx, mz, px, pz, pl, ql) => { edgeId[count] = id; edgeX[count] = mx; edgeZ[count] = mz; edgeP[count * 2] = px; edgeP[count * 2 + 1] = pz; edgeLabels[count * 2] = pl; edgeLabels[count * 2 + 1] = ql; count++; };
        if (tl !== tr) edge(horizontal(c, r), x0 + 1, z0, x0, z0, tl, tr);
        if (tr !== br) edge(vertical(c + 1, r), x0 + 2, z0 - 1, x0 + 2, z0, tr, br);
        if (bl !== br) edge(horizontal(c, r + 1), x0 + 1, z0 - 2, x0, z0 - 2, bl, br);
        if (tl !== bl) edge(vertical(c, r), x0, z0 - 1, x0, z0, tl, bl);
        const distinct = 1 + (tr !== tl) + (bl !== tl && bl !== tr) + (br !== tl && br !== tr && br !== bl);
        if (distinct >= 3) {
            const junction = nextVertex++;
            vertexX[junction] = minX + (originColumn + c + .5) * spacingX; vertexZ[junction] = maxZ - (originRow + r + .5) * spacingZ; vertexKind[junction] = JUNCTION;
            for (let k = 0; k < count; k++) addSegment(junction, x0 + 1, z0 - 1, edgeId[k], edgeX[k], edgeZ[k], edgeP[k * 2], edgeP[k * 2 + 1], edgeLabels[k * 2], edgeLabels[k * 2 + 1]);
        } else if (count === 2) {
            addSegment(edgeId[0], edgeX[0], edgeZ[0], edgeId[1], edgeX[1], edgeZ[1], x0, z0, tl, tr !== tl ? tr : br !== tl ? br : bl);
        } else {
            let minority = 0, majority = 0;
            for (let rr = Math.max(0, r - 1); rr <= Math.min(height - 1, r + 2); rr++) for (let cc = Math.max(0, c - 1); cc <= Math.min(width - 1, c + 2); cc++) {
                if (label(cc, rr) === tl) minority++; else if (label(cc, rr) === tr) majority++;
            }
            if (minority < majority || minority === majority && tl < tr) {
                addSegment(edgeId[0], edgeX[0], edgeZ[0], edgeId[1], edgeX[1], edgeZ[1], x0 + 2, z0, tr, tl);
                addSegment(edgeId[3], edgeX[3], edgeZ[3], edgeId[2], edgeX[2], edgeZ[2], x0, z0 - 2, bl, tl);
            } else {
                addSegment(edgeId[3], edgeX[3], edgeZ[3], edgeId[0], edgeX[0], edgeZ[0], x0, z0, tl, tr);
                addSegment(edgeId[1], edgeX[1], edgeZ[1], edgeId[2], edgeX[2], edgeZ[2], x0 + 2, z0 - 2, br, tr);
            }
        }
    }
    if (nextVertex !== vertexCount || nextSegment !== segmentCount) fail('marching squares counts diverged');

    // vertex incidence and chains between fixed vertices, oriented with the lower soil index on the left
    const degree = track(new Int32Array(vertexCount)), incidenceStart = track(new Int32Array(vertexCount + 1)), incidence = track(new Int32Array(segmentCount * 2));
    for (let s = 0; s < segmentCount; s++) { degree[segmentA[s]]++; degree[segmentB[s]]++; }
    for (let v = 0; v < vertexCount; v++) incidenceStart[v + 1] = incidenceStart[v] + degree[v];
    const fill = track(new Int32Array(vertexCount));
    for (let s = 0; s < segmentCount; s++) {
        incidence[incidenceStart[segmentA[s]] + fill[segmentA[s]]++] = s;
        incidence[incidenceStart[segmentB[s]] + fill[segmentB[s]]++] = s;
    }
    const fixed = v => vertexKind[v] === JUNCTION || degree[v] !== 2;
    const used = track(new Uint8Array(segmentCount)), chainVertex = track(new Int32Array(segmentCount * 2 + 1)), chainSegment = track(new Int32Array(segmentCount));
    const chainVertexStart = track(new Int32Array(segmentCount + 1)), chainSegmentStart = track(new Int32Array(segmentCount + 1)), chainClosed = track(new Uint8Array(segmentCount));
    const chainLeft = track(new Uint8Array(segmentCount)), chainRight = track(new Uint8Array(segmentCount));
    const segmentChain = track(new Int32Array(segmentCount)), segmentIndex = track(new Int32Array(segmentCount));
    let chainCount = 0, vertexCursor = 0, segmentCursor = 0;
    const walk = (start, first, closed) => {
        chainVertexStart[chainCount] = vertexCursor; chainSegmentStart[chainCount] = segmentCursor; chainClosed[chainCount] = closed ? 1 : 0;
        chainVertex[vertexCursor++] = start;
        let vertex = start, segment = first;
        while (true) {
            used[segment] = 1; chainSegment[segmentCursor++] = segment;
            const next = segmentA[segment] === vertex ? segmentB[segment] : segmentA[segment];
            if (closed && next === start) break;
            chainVertex[vertexCursor++] = next; vertex = next;
            if (fixed(vertex)) break;
            const following = incidence[incidenceStart[vertex]] === segment ? incidence[incidenceStart[vertex] + 1] : incidence[incidenceStart[vertex]];
            if (used[following]) fail('open chain revisits a segment');
            segment = following;
        }
        const firstSegment = chainSegment[chainSegmentStart[chainCount]], forward = segmentA[firstSegment] === start;
        chainLeft[chainCount] = forward ? segmentLeft[firstSegment] : segmentRight[firstSegment];
        chainRight[chainCount] = forward ? segmentRight[firstSegment] : segmentLeft[firstSegment];
        chainCount++;
        chainVertexStart[chainCount] = vertexCursor; chainSegmentStart[chainCount] = segmentCursor;
    };
    for (let v = 0; v < vertexCount; v++) if (fixed(v)) for (let k = incidenceStart[v]; k < incidenceStart[v + 1]; k++) if (!used[incidence[k]]) walk(v, incidence[k], false);
    for (let s = 0; s < segmentCount; s++) if (!used[s]) walk(segmentA[s], s, true);
    for (let chain = 0; chain < chainCount; chain++) {
        const v0 = chainVertexStart[chain], v1 = chainVertexStart[chain + 1], s0 = chainSegmentStart[chain], s1 = chainSegmentStart[chain + 1];
        if (chainLeft[chain] > chainRight[chain]) {
            if (chainClosed[chain]) { chainVertex.subarray(v0 + 1, v1).reverse(); chainSegment.subarray(s0, s1).reverse(); }
            else { chainVertex.subarray(v0, v1).reverse(); chainSegment.subarray(s0, s1).reverse(); }
            const swap = chainLeft[chain]; chainLeft[chain] = chainRight[chain]; chainRight[chain] = swap;
        }
        for (let s = s0; s < s1; s++) { segmentChain[chainSegment[s]] = chain; segmentIndex[chainSegment[s]] = s - s0; }
    }

    // raw segment buckets for the gap guard
    const bucketOf = (x, z) => [Math.min(cellsW - 1, Math.max(0, Math.floor((x - gridMinX) / spacingX))), Math.min(cellsH - 1, Math.max(0, Math.floor((gridMaxZ - z) / spacingZ)))];
    function buildBuckets(count, ax, az, bx, bz, expand) {
        const counts = new Int32Array(cellsW * cellsH + 1), ranges = new Int32Array(count * 4);
        for (let s = 0; s < count; s++) {
            const lowX = Math.min(ax(s), bx(s)) - expand, highX = Math.max(ax(s), bx(s)) + expand, lowZ = Math.min(az(s), bz(s)) - expand, highZ = Math.max(az(s), bz(s)) + expand;
            const [c0, r1] = bucketOf(lowX, lowZ), [c1, r0] = bucketOf(highX, highZ);
            ranges[s * 4] = c0; ranges[s * 4 + 1] = c1; ranges[s * 4 + 2] = r0; ranges[s * 4 + 3] = r1;
            for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) counts[r * cellsW + c + 1]++;
        }
        for (let i = 0; i < cellsW * cellsH; i++) counts[i + 1] += counts[i];
        const entries = new Int32Array(counts[cellsW * cellsH]), cursor = counts.slice(0, cellsW * cellsH);
        for (let s = 0; s < count; s++) for (let r = ranges[s * 4 + 2]; r <= ranges[s * 4 + 3]; r++) for (let c = ranges[s * 4]; c <= ranges[s * 4 + 1]; c++) entries[cursor[r * cellsW + c]++] = s;
        scratchBytes += counts.byteLength + ranges.byteLength + entries.byteLength + cursor.byteLength;
        return { counts, entries };
    }
    const segmentDistance = (px, pz, ax, az, bx, bz) => {
        const ex = bx - ax, ez = bz - az, length = ex * ex + ez * ez;
        let t = length > 0 ? ((px - ax) * ex + (pz - az) * ez) / length : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = px - ax - t * ex, dz = pz - az - t * ez;
        return dx * dx + dz * dz;
    };
    const gapReach = parameters.maxDisplacementCells / parameters.gapFraction * cell + cell;
    const raw = buildBuckets(segmentCount, s => vertexX[segmentA[s]], s => vertexZ[segmentA[s]], s => vertexX[segmentB[s]], s => vertexZ[segmentB[s]], 0);

    // turning-limited local quadratic smoothing of chain vertices; small closed loops round with preserved area
    const smoothX = track(Float64Array.from(vertexX)), smoothZ = track(Float64Array.from(vertexZ));
    const sigma = parameters.sigmaCells * cell, reach = parameters.windowSigmas * sigma, maxDisplacement = parameters.maxDisplacementCells * cell;
    const loopLimit = parameters.loops.maxPerimeterCells * cell, loops = [];
    let loopPointCount = 0, longestChain = 0;
    for (let chain = 0; chain < chainCount; chain++) longestChain = Math.max(longestChain, chainVertexStart[chain + 1] - chainVertexStart[chain]);
    const sideX = track(new Float64Array(longestChain + 1)), sideZ = track(new Float64Array(longestChain + 1)), sideS = track(new Float64Array(longestChain + 1));
    const otherX = track(new Float64Array(longestChain + 1)), otherZ = track(new Float64Array(longestChain + 1)), otherS = track(new Float64Array(longestChain + 1));
    for (let chain = 0; chain < chainCount; chain++) {
        const v0 = chainVertexStart[chain], n = chainVertexStart[chain + 1] - v0, closed = chainClosed[chain] === 1;
        const px = k => vertexX[chainVertex[v0 + (closed ? (k % n + n) % n : k)]], pz = k => vertexZ[chainVertex[v0 + (closed ? (k % n + n) % n : k)]];
        if (closed) {
            let perimeter = 0;
            for (let k = 0; k < n; k++) { const dx = px(k + 1) - px(k), dz = pz(k + 1) - pz(k); perimeter += Math.sqrt(dx * dx + dz * dz); }
            if (perimeter < loopLimit) { loops.push(roundLoop(chain, n, px, pz)); loopPointCount += loops[loops.length - 1].x.length; continue; }
        }
        for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) {
            let tx = px(i + 1) - px(i - 1), tz = pz(i + 1) - pz(i - 1);
            const tangentLength = Math.sqrt(tx * tx + tz * tz);
            tx /= tangentLength; tz /= tangentLength;
            const half = closed ? Math.floor((n - 1) / 2) : n, forward = gather(i, 1, half, closed, n, px, pz, tx, tz, sideX, sideZ, sideS), backward = gather(i, -1, half, closed, n, px, pz, tx, tz, otherX, otherZ, otherS);
            const position = fit(px(i), pz(i), tx, tz, forward, backward);
            let dx = position[0] - px(i), dz = position[1] - pz(i);
            const limit = Math.min(maxDisplacement, parameters.gapFraction * gap(chain, i, n, closed, px(i), pz(i))), length = Math.sqrt(dx * dx + dz * dz);
            if (length > limit) { dx *= limit / length; dz *= limit / length; }
            const vertex = chainVertex[v0 + i];
            smoothX[vertex] = px(i) + dx; smoothZ[vertex] = pz(i) + dz;
        }
    }

    function gather(i, step, half, closed, n, px, pz, tx, tz, outX, outZ, outS) {
        let count = 0, s = 0;
        for (let k = 1; k <= half; k++) {
            const j = i + step * (k - 1), next = i + step * k;
            if (!closed && (next < 0 || next >= n)) break;
            let dx = step > 0 ? px(next) - px(j) : px(j) - px(next), dz = step > 0 ? pz(next) - pz(j) : pz(j) - pz(next);
            const length = Math.sqrt(dx * dx + dz * dz);
            if (length <= 0) break;
            if ((dx * tx + dz * tz) / length < parameters.turningCosine) break;
            s += length;
            if (s >= reach) break;
            outX[count] = px(next); outZ[count] = pz(next); outS[count] = s; count++;
            if (!closed && (next === 0 || next === n - 1)) break;
        }
        return count;
    }

    function fit(x, z, tx, tz, forward, backward) {
        let weightSum = 0, cx = 0, cz = 0;
        const each = callback => {
            callback(x, z, 0);
            for (let k = 0; k < Math.max(forward, backward); k++) {
                if (k < forward) callback(sideX[k], sideZ[k], sideS[k]);
                if (k < backward) callback(otherX[k], otherZ[k], otherS[k]);
            }
        };
        const weight = s => { const u = s / reach, v = 1 - u * u; return v * v * v; };
        each((qx, qz, s) => { const w = weight(s); weightSum += w; cx += w * qx; cz += w * qz; });
        cx /= weightSum; cz /= weightSum;
        let a = 0, b = 0, d = 0;
        each((qx, qz, s) => { const w = weight(s), dx = qx - cx, dz = qz - cz; a += w * dx * dx; b += w * dx * dz; d += w * dz * dz; });
        let ex = tx, ez = tz;
        const trace = a + d, root = Math.sqrt((a - d) * (a - d) / 4 + b * b);
        if (trace > 0 && root > 1e-9 * trace) {
            const major = trace / 2 + root;
            if (Math.abs(b) > 1e-12 * trace) { ex = b; ez = major - a; } else if (a >= d) { ex = 1; ez = 0; } else { ex = 0; ez = 1; }
            const length = Math.sqrt(ex * ex + ez * ez);
            ex /= length; ez /= length;
            if (ex * tx + ez * tz < 0) { ex = -ex; ez = -ez; }
        }
        const nx = -ez, nz = ex;
        let m00 = 0, m01 = 0, m02 = 0, m11 = 0, m12 = 0, m22 = 0, r0 = 0, r1 = 0, r2 = 0;
        each((qx, qz, s) => {
            const w = weight(s), u = (qx - cx) * ex + (qz - cz) * ez, y = (qx - cx) * nx + (qz - cz) * nz, uu = u * u;
            m00 += w; m01 += w * u; m02 += w * uu; m11 += w * uu; m12 += w * uu * u; m22 += w * uu * uu; r0 += w * y; r1 += w * u * y; r2 += w * uu * y;
        });
        const ui = (x - cx) * ex + (z - cz) * ez, det = m00 * (m11 * m22 - m12 * m12) - m01 * (m01 * m22 - m12 * m02) + m02 * (m01 * m12 - m11 * m02);
        let yi;
        if (Math.abs(det) > 1e-10 * m00 * m11 * m22 && m11 > 0 && m22 > 0) {
            const c0 = (r0 * (m11 * m22 - m12 * m12) - m01 * (r1 * m22 - m12 * r2) + m02 * (r1 * m12 - m11 * r2)) / det;
            const c1 = (m00 * (r1 * m22 - m12 * r2) - r0 * (m01 * m22 - m12 * m02) + m02 * (m01 * r2 - r1 * m02)) / det;
            const c2 = (m00 * (m11 * r2 - r1 * m12) - m01 * (m01 * r2 - r1 * m02) + r0 * (m01 * m12 - m11 * m02)) / det;
            yi = c0 + c1 * ui + c2 * ui * ui;
        } else {
            const det2 = m00 * m11 - m01 * m01;
            yi = Math.abs(det2) > 1e-10 * m00 * m11 && m11 > 0 ? ((r0 * m11 - m01 * r1) + ui * (m00 * r1 - m01 * r0)) / det2 : r0 / m00;
        }
        return [cx + ui * ex + yi * nx, cz + ui * ez + yi * nz];
    }

    function gap(chain, i, n, closed, x, z) {
        const [bc, br] = bucketOf(x, z), span = Math.ceil(gapReach / minimumSpacing);
        let best = Infinity;
        for (let r = Math.max(0, br - span); r <= Math.min(cellsH - 1, br + span); r++) for (let c = Math.max(0, bc - span); c <= Math.min(cellsW - 1, bc + span); c++) {
            for (let e = raw.counts[r * cellsW + c]; e < raw.counts[r * cellsW + c + 1]; e++) {
                const s = raw.entries[e];
                if (segmentChain[s] === chain) {
                    const k = segmentIndex[s], segments = chainSegmentStart[chain + 1] - chainSegmentStart[chain];
                    if (closed) { const offset = ((k - i) % segments + segments) % segments; if (offset <= parameters.gapSegments || offset >= segments - parameters.gapSegments - 1) continue; }
                    else if (k >= i - parameters.gapSegments - 1 && k <= i + parameters.gapSegments) continue;
                }
                best = Math.min(best, segmentDistance(x, z, vertexX[segmentA[s]], vertexZ[segmentA[s]], vertexX[segmentB[s]], vertexZ[segmentB[s]]));
            }
        }
        return Math.sqrt(best);
    }

    function roundLoop(chain, n, px, pz) {
        const m = parameters.loops.subdivisions, count = n * m;
        let x = new Float64Array(count), z = new Float64Array(count), nextX = new Float64Array(count), nextZ = new Float64Array(count), area = 0;
        for (let k = 0; k < n; k++) {
            area += px(k) * pz(k + 1) - px(k + 1) * pz(k);
            for (let q = 0; q < m; q++) { x[k * m + q] = px(k) + (px(k + 1) - px(k)) * q / m; z[k * m + q] = pz(k) + (pz(k + 1) - pz(k)) * q / m; }
        }
        for (let iteration = 0; iteration < parameters.loops.iterations; iteration++) for (const factor of [parameters.loops.lambda, parameters.loops.mu]) {
            for (let k = 0; k < count; k++) {
                const a = (k + count - 1) % count, b = (k + 1) % count;
                nextX[k] = x[k] + factor * ((x[a] + x[b]) / 2 - x[k]); nextZ[k] = z[k] + factor * ((z[a] + z[b]) / 2 - z[k]);
            }
            [x, nextX] = [nextX, x]; [z, nextZ] = [nextZ, z];
        }
        let cx = 0, cz = 0, smoothed = 0;
        for (let k = 0; k < count; k++) { cx += x[k]; cz += z[k]; smoothed += x[k] * z[(k + 1) % count] - x[(k + 1) % count] * z[k]; }
        cx /= count; cz /= count;
        const scale = smoothed !== 0 ? Math.sqrt(Math.abs(area / smoothed)) : 1;
        for (let k = 0; k < count; k++) { x[k] = cx + (x[k] - cx) * scale; z[k] = cz + (z[k] - cz) * scale; }
        scratchBytes += count * 32;
        return { chain, x, z };
    }

    // final smoothed segments with vertex references, incidence and buckets
    const loopOfChain = new Map(loops.map((loop, index) => [loop.chain, index]));
    let finalCount = 0;
    for (let chain = 0; chain < chainCount; chain++) {
        const n = chainVertexStart[chain + 1] - chainVertexStart[chain];
        finalCount += loopOfChain.has(chain) ? loops[loopOfChain.get(chain)].x.length : chainClosed[chain] ? n : n - 1;
    }
    const referenceCount = vertexCount + loopPointCount;
    const finalAx = track(new Float64Array(finalCount)), finalAz = track(new Float64Array(finalCount)), finalBx = track(new Float64Array(finalCount)), finalBz = track(new Float64Array(finalCount));
    const finalA = track(new Int32Array(finalCount)), finalB = track(new Int32Array(finalCount)), finalLeft = track(new Uint8Array(finalCount)), finalRight = track(new Uint8Array(finalCount));
    let cursor = 0, loopBase = vertexCount;
    for (let chain = 0; chain < chainCount; chain++) {
        const v0 = chainVertexStart[chain], n = chainVertexStart[chain + 1] - v0;
        if (loopOfChain.has(chain)) {
            const loop = loops[loopOfChain.get(chain)], count = loop.x.length;
            for (let k = 0; k < count; k++) {
                const next = (k + 1) % count;
                finalAx[cursor] = loop.x[k]; finalAz[cursor] = loop.z[k]; finalBx[cursor] = loop.x[next]; finalBz[cursor] = loop.z[next];
                finalA[cursor] = loopBase + k; finalB[cursor] = loopBase + next; finalLeft[cursor] = chainLeft[chain]; finalRight[cursor] = chainRight[chain]; cursor++;
            }
            loopBase += count;
            continue;
        }
        const segments = chainClosed[chain] ? n : n - 1;
        for (let k = 0; k < segments; k++) {
            const a = chainVertex[v0 + k], b = chainVertex[v0 + (k + 1) % n];
            finalAx[cursor] = smoothX[a]; finalAz[cursor] = smoothZ[a]; finalBx[cursor] = smoothX[b]; finalBz[cursor] = smoothZ[b];
            finalA[cursor] = a; finalB[cursor] = b; finalLeft[cursor] = chainLeft[chain]; finalRight[cursor] = chainRight[chain]; cursor++;
        }
    }
    const finalDegree = track(new Int32Array(referenceCount + 1)), finalIncidence = track(new Int32Array(finalCount * 2));
    for (let s = 0; s < finalCount; s++) { finalDegree[finalA[s] + 1]++; finalDegree[finalB[s] + 1]++; }
    for (let v = 0; v < referenceCount; v++) finalDegree[v + 1] += finalDegree[v];
    const finalFill = finalDegree.slice(0, referenceCount);
    scratchBytes += finalFill.byteLength;
    for (let s = 0; s < finalCount; s++) { finalIncidence[finalFill[finalA[s]]++] = s; finalIncidence[finalFill[finalB[s]]++] = s; }
    const buckets = buildBuckets(finalCount, s => finalAx[s], s => finalAz[s], s => finalBx[s], s => finalBz[s], 0);
    const near = track(new Uint8Array(cellsW * cellsH));
    for (let s = 0; s < finalCount; s++) {
        const [c0, r1] = bucketOf(Math.min(finalAx[s], finalBx[s]) - farDistance, Math.min(finalAz[s], finalBz[s]) - farDistance);
        const [c1, r0] = bucketOf(Math.max(finalAx[s], finalBx[s]) + farDistance, Math.max(finalAz[s], finalBz[s]) + farDistance);
        for (let r = r0; r <= r1; r++) near.fill(1, r * cellsW + c0, r * cellsW + c1 + 1);
    }

    const precedes = (s, t) => finalAx[s] < finalAx[t] || finalAx[s] === finalAx[t] && (finalAz[s] < finalAz[t] || finalAz[s] === finalAz[t]
        && (finalBx[s] < finalBx[t] || finalBx[s] === finalBx[t] && finalBz[s] < finalBz[t]));

    function vertexFace(vertex, px, pz, out) {
        const start = finalDegree[vertex], end = finalDegree[vertex + 1], count = end - start;
        let vx, vz, first = finalIncidence[start];
        if (finalA[first] === vertex) { vx = finalAx[first]; vz = finalAz[first]; } else { vx = finalBx[first]; vz = finalBz[first]; }
        const dx = px - vx, dz = pz - vz;
        let bestRay = -1, bestAngle = Infinity, nextRay = -1, nextAngle = Infinity;
        if (dx === 0 && dz === 0) {
            for (let k = start + 1; k < end; k++) if (precedes(finalIncidence[k], first)) first = finalIncidence[k];
            out[0] = finalA[first] === vertex ? finalLeft[first] : finalRight[first]; out[1] = finalA[first] === vertex ? finalRight[first] : finalLeft[first];
            return;
        }
        const query = pseudoAngle(dx, dz);
        if (count === 1) {
            const s = first, outward = finalA[s] === vertex, ex = (outward ? finalBx[s] - vx : finalAx[s] - vx), ez = (outward ? finalBz[s] - vz : finalAz[s] - vz);
            const left = outward ? finalLeft[s] : finalRight[s], right = outward ? finalRight[s] : finalLeft[s];
            const side = ex * dz - ez * dx > 0;
            out[0] = side ? left : right; out[1] = side ? right : left;
            return;
        }
        for (let k = start; k < end; k++) {
            const s = finalIncidence[k], outward = finalA[s] === vertex, ex = outward ? finalBx[s] - vx : finalAx[s] - vx, ez = outward ? finalBz[s] - vz : finalAz[s] - vz;
            const angle = pseudoAngle(ex, ez), before = (query - angle + 4) % 4, after = (angle - query + 4) % 4;
            if (before < bestAngle) { bestAngle = before; bestRay = k; }
            if (after < nextAngle || after === 0 && nextAngle !== 0) { nextAngle = after; nextRay = k; }
        }
        const rayLabel = (k, leftSide) => { const s = finalIncidence[k], outward = finalA[s] === vertex; return leftSide === outward ? finalLeft[s] : finalRight[s]; };
        out[0] = rayLabel(bestRay, true);
        out[1] = bestAngle <= nextAngle ? rayLabel(bestRay, false) : rayLabel(nextRay, true);
    }

    const face = new Int32Array(2), pairBest = new Float64Array(256).fill(Infinity), touched = new Uint8Array(256);
    const pairKey = (a, b) => a < b ? a * 16 + b : b * 16 + a;
    /**
     * Nearest smoothed boundary within maxDistance: writes [label, other] into labelsOut and, when given, the nearest boundary
     * point into pointOut; returns the distance (Infinity, the nearest sample label and other -1 when none). Exact distance
     * ties resolve to the lexicographically smallest segment coordinates so the answer never depends on window layout.
     * With secondOut, also writes the distance to the nearest segment whose soil pair differs from the answer's pair, exact
     * up to min(distance + secondReach, maxDistance) and Infinity beyond.
     * @param {number} px @param {number} pz @param {number} maxDistance @param {Int32Array} labelsOut @param {Float64Array} [pointOut] @param {Float64Array} [secondOut] @param {number} [secondReach]
     */
    function query(px, pz, maxDistance, labelsOut, pointOut, secondOut, secondReach = 0) {
        let best = maxDistance * maxDistance, bestSegment = -1, bestT = 0, touchedCount = 0;
        const limit = best, extra = secondOut ? secondReach : 0, rings = Math.ceil(maxDistance / minimumSpacing) + 1;
        const bc = Math.min(cellsW - 1, Math.max(0, Math.floor((px - gridMinX) / spacingX))), br = Math.min(cellsH - 1, Math.max(0, Math.floor((gridMaxZ - pz) / spacingZ)));
        for (let ring = 0; ring <= rings; ring++) {
            if (bestSegment >= 0 && (ring - 1) * minimumSpacing > Math.min(Math.sqrt(best) + extra, maxDistance)) break;
            for (let r = br - ring; r <= br + ring; r++) {
                if (r < 0 || r >= cellsH) continue;
                const edgeRow = r === br - ring || r === br + ring;
                for (let c = bc - ring; c <= bc + ring; c += edgeRow ? 1 : 2 * ring || 1) {
                    if (c < 0 || c >= cellsW) continue;
                    for (let e = buckets.counts[r * cellsW + c]; e < buckets.counts[r * cellsW + c + 1]; e++) {
                        const s = buckets.entries[e], ex = finalBx[s] - finalAx[s], ez = finalBz[s] - finalAz[s], length = ex * ex + ez * ez;
                        let t = length > 0 ? ((px - finalAx[s]) * ex + (pz - finalAz[s]) * ez) / length : 0;
                        t = t < 0 ? 0 : t > 1 ? 1 : t;
                        const dx = px - finalAx[s] - t * ex, dz = pz - finalAz[s] - t * ez, distance = dx * dx + dz * dz;
                        if (distance < best || distance === best && bestSegment >= 0 && s !== bestSegment && precedes(s, bestSegment)) { best = distance; bestSegment = s; bestT = t; }
                        if (secondOut && distance < limit) {
                            const key = pairKey(finalLeft[s], finalRight[s]);
                            if (pairBest[key] === Infinity) touched[touchedCount++] = key;
                            if (distance < pairBest[key]) pairBest[key] = distance;
                        }
                    }
                }
            }
        }
        if (bestSegment < 0) {
            labelsOut[0] = rawLabel(px, pz); labelsOut[1] = -1;
            if (secondOut) { secondOut[0] = Infinity; for (let k = 0; k < touchedCount; k++) pairBest[touched[k]] = Infinity; }
            return Infinity;
        }
        if (pointOut) {
            pointOut[0] = finalAx[bestSegment] + bestT * (finalBx[bestSegment] - finalAx[bestSegment]);
            pointOut[1] = finalAz[bestSegment] + bestT * (finalBz[bestSegment] - finalAz[bestSegment]);
        }
        if (bestT > 0 && bestT < 1) {
            const ex = finalBx[bestSegment] - finalAx[bestSegment], ez = finalBz[bestSegment] - finalAz[bestSegment];
            const left = ex * (pz - finalAz[bestSegment]) - ez * (px - finalAx[bestSegment]) > 0;
            labelsOut[0] = left ? finalLeft[bestSegment] : finalRight[bestSegment]; labelsOut[1] = left ? finalRight[bestSegment] : finalLeft[bestSegment];
        } else {
            vertexFace(bestT <= 0 ? finalA[bestSegment] : finalB[bestSegment], px, pz, face);
            labelsOut[0] = face[0]; labelsOut[1] = face[1];
        }
        if (secondOut) {
            const winner = pairKey(labelsOut[0], labelsOut[1]);
            let second = Infinity;
            for (let k = 0; k < touchedCount; k++) { const key = touched[k]; if (key !== winner && pairBest[key] < second) second = pairBest[key]; pairBest[key] = Infinity; }
            secondOut[0] = Math.sqrt(second);
        }
        return Math.sqrt(best);
    }

    function rawLabel(px, pz) {
        const c = Math.min(width - 1, Math.max(0, Math.floor((px - minX) / spacingX + .5) - originColumn)), r = Math.min(height - 1, Math.max(0, Math.floor((maxZ - pz) / spacingZ + .5) - originRow));
        return labels[r * width + c];
    }

    /** Exact label of every point in an axis-aligned box when all overlapped cells are far from boundaries and agree, else -1. */
    function settledLabel(boxMinX, boxMaxX, boxMinZ, boxMaxZ) {
        const [c0, r1] = bucketOf(boxMinX, boxMinZ), [c1, r0] = bucketOf(boxMaxX, boxMaxZ);
        let soil = -1;
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
            if (near[r * cellsW + c]) return -1;
            const value = labels[r * width + c];
            if (soil >= 0 && value !== soil) return -1;
            soil = value;
        }
        return soil;
    }

    function chainPolylines() {
        const result = [];
        let loopIndex = 0;
        for (let chain = 0; chain < chainCount; chain++) {
            const v0 = chainVertexStart[chain], n = chainVertexStart[chain + 1] - v0;
            if (loopOfChain.has(chain)) { const loop = loops[loopIndex++]; result.push(Object.freeze({ closed: true, rounded: true, labels: Object.freeze([chainLeft[chain], chainRight[chain]]), x: Float64Array.from(loop.x), z: Float64Array.from(loop.z) })); continue; }
            const x = new Float64Array(n), z = new Float64Array(n);
            for (let k = 0; k < n; k++) { x[k] = smoothX[chainVertex[v0 + k]]; z[k] = smoothZ[chainVertex[v0 + k]]; }
            result.push(Object.freeze({ closed: chainClosed[chain] === 1, rounded: false, labels: Object.freeze([chainLeft[chain], chainRight[chain]]), x, z }));
        }
        return Object.freeze(result);
    }

    return Object.freeze({ vertexCount, segmentCount: finalCount, rawSegmentCount: segmentCount, chainCount, loopCount: loops.length, scratchBytes,
        query, rawLabel, settledLabel, chainPolylines });
}
