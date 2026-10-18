// Measures the spatial statistics of one ecosystem layer's instances: nearest-neighbour distances, close pairs, pair correlation and the anisotropy of nearest-neighbour directions.
// @ts-check
// Design: the gate distinguishes a blue-noise selection from a jittered lattice and from white noise without rendering anything. Nearest neighbours
// come from a uniform grid hash (rings of cells until the best distance is proven), so a whole layer of tens of thousands of instances measures in
// well under a second; pair correlation g(r) is normalized against a homogeneous Poisson process of the same intensity over the measured area, and
// the anisotropy test is a chi-square of the eight 45-degree sectors of the nearest-neighbour directions against uniformity (7 degrees of freedom).
import { requireCondition, requireFinite, requireInteger } from '../internal/LandscapeValidation.js';
import { ECOSYSTEM_RECORD } from './EcosystemTiles.js';

export const ECOSYSTEM_ANISOTROPY = Object.freeze({ sectors: 8, degreesOfFreedom: 7, chiSquare99: 18.48 });
export const ECOSYSTEM_CORRELATION_SPACINGS = 3;

/**
 * @param {Float32Array|Float64Array} records ecosystem records (12 floats per instance) @param {number} count
 * @param {{spacing:number,minimumSpacing?:number,area?:number|null,correlationBins?:number}} options spacing: the layer's site spacing (grid cell and g(r) reach); minimumSpacing: declared lower bound of inter-instance distance (0 skips the close-pair check); area: measured area in m² (default: bounding box)
 */
export function ecosystemSpatialStatistics(records, count, { spacing, minimumSpacing = 0, area = null, correlationBins = 12 }) {
    requireInteger(count, 0, ECOSYSTEM_RECORD.maxInstances, 'instance count'); requireFinite(spacing, 'spacing'); requireCondition(spacing > 0, 'spacing must be positive');
    requireFinite(minimumSpacing, 'minimumSpacing'); requireInteger(correlationBins, 1, 256, 'correlationBins');
    requireCondition(records.length >= count * ECOSYSTEM_RECORD.floats, 'records are shorter than the instance count');
    const F = ECOSYSTEM_RECORD.floats, xs = new Float64Array(count), zs = new Float64Array(count);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < count; i++) {
        xs[i] = records[i * F + ECOSYSTEM_RECORD.x]; zs[i] = records[i * F + ECOSYSTEM_RECORD.z];
        if (xs[i] < minX) minX = xs[i]; if (xs[i] > maxX) maxX = xs[i]; if (zs[i] < minZ) minZ = zs[i]; if (zs[i] > maxZ) maxZ = zs[i];
    }
    const measuredArea = area ?? (count ? Math.max(spacing * spacing, (maxX - minX) * (maxZ - minZ)) : 0);
    if (area !== null) { requireFinite(area, 'area'); requireCondition(area > 0, 'area must be positive'); }
    const reach = ECOSYSTEM_CORRELATION_SPACINGS * spacing, binWidth = reach / correlationBins, bins = new Float64Array(correlationBins), sectors = new Uint32Array(ECOSYSTEM_ANISOTROPY.sectors);
    if (count < 2) {
        return Object.freeze({ count, area: measuredArea, intensityPerSquareMeter: count / Math.max(measuredArea, 1e-9), nearest: null, closePairs: 0, closePairFraction: 0, minimumSpacing,
            pairCorrelation: Object.freeze({ binMeters: binWidth, reachMeters: reach, values: Object.freeze([...bins]) }), anisotropy: Object.freeze({ sectors: Object.freeze([...sectors]), chiSquare: 0, passes: true, threshold: ECOSYSTEM_ANISOTROPY.chiSquare99 }) });
    }
    const columns = Math.max(1, Math.ceil((maxX - minX) / spacing) + 1), rows = Math.max(1, Math.ceil((maxZ - minZ) / spacing) + 1);
    const cellOf = i => Math.min(rows - 1, Math.floor((zs[i] - minZ) / spacing)) * columns + Math.min(columns - 1, Math.floor((xs[i] - minX) / spacing));
    const starts = new Uint32Array(columns * rows + 1), order = new Uint32Array(count);
    for (let i = 0; i < count; i++) starts[cellOf(i) + 1]++;
    for (let c = 0; c < columns * rows; c++) starts[c + 1] += starts[c];
    const fill = Uint32Array.from(starts);
    for (let i = 0; i < count; i++) order[fill[cellOf(i)]++] = i;
    const nearest = new Float64Array(count), nearestIndex = new Int32Array(count).fill(-1), maxRing = Math.max(columns, rows), correlationRing = Math.ceil(reach / spacing);
    let closePairs = 0;
    for (let i = 0; i < count; i++) {
        const cx = Math.min(columns - 1, Math.floor((xs[i] - minX) / spacing)), cz = Math.min(rows - 1, Math.floor((zs[i] - minZ) / spacing));
        let best = Infinity, bestIndex = -1;
        for (let ring = 0; ring <= maxRing; ring++) {
            if (best <= ring * spacing) break;
            for (let dz = -ring; dz <= ring; dz++) {
                const row = cz + dz;
                if (row < 0 || row >= rows) continue;
                for (let dx = -ring; dx <= ring; dx++) {
                    if (Math.abs(dz) !== ring && Math.abs(dx) !== ring) continue;
                    const column = cx + dx;
                    if (column < 0 || column >= columns) continue;
                    const cell = row * columns + column;
                    for (let k = starts[cell]; k < starts[cell + 1]; k++) {
                        const j = order[k];
                        if (j === i) continue;
                        const distance = Math.hypot(xs[j] - xs[i], zs[j] - zs[i]);
                        if (distance < best || (distance === best && j < bestIndex)) { best = distance; bestIndex = j; }
                        if (j > i && ring <= correlationRing && distance < reach) {
                            bins[Math.min(correlationBins - 1, Math.floor(distance / binWidth))]++;
                            if (distance < minimumSpacing) closePairs++;
                        }
                    }
                }
            }
        }
        nearest[i] = best; nearestIndex[i] = bestIndex;
    }
    let sum = 0, squares = 0, minimum = Infinity;
    for (let i = 0; i < count; i++) {
        sum += nearest[i]; squares += nearest[i] * nearest[i]; if (nearest[i] < minimum) minimum = nearest[i];
        const j = nearestIndex[i], angle = Math.atan2(zs[j] - zs[i], xs[j] - xs[i]), turns = angle / (2 * Math.PI) + 1;
        sectors[Math.min(ECOSYSTEM_ANISOTROPY.sectors - 1, Math.floor((turns - Math.floor(turns)) * ECOSYSTEM_ANISOTROPY.sectors))]++;
    }
    const mean = sum / count, variance = Math.max(0, squares / count - mean * mean), expected = count / ECOSYSTEM_ANISOTROPY.sectors;
    let chiSquare = 0;
    for (const observed of sectors) chiSquare += (observed - expected) * (observed - expected) / expected;
    const intensity = count / measuredArea, pairs = count * (count - 1) / 2, values = [...bins].map((pairsInBin, k) => {
        const annulus = Math.PI * ((k + 1) * binWidth) ** 2 - Math.PI * (k * binWidth) ** 2, expectedPairs = pairs * annulus / measuredArea;
        return expectedPairs > 0 ? pairsInBin / expectedPairs : 0;
    });
    return Object.freeze({
        count, area: measuredArea, intensityPerSquareMeter: intensity,
        nearest: Object.freeze({ mean, minimum, standardDeviation: Math.sqrt(variance), coefficientOfVariation: mean > 0 ? Math.sqrt(variance) / mean : 0 }),
        closePairs, closePairFraction: closePairs / count, minimumSpacing,
        pairCorrelation: Object.freeze({ binMeters: binWidth, reachMeters: reach, values: Object.freeze(values) }),
        anisotropy: Object.freeze({ sectors: Object.freeze([...sectors]), chiSquare, passes: chiSquare <= ECOSYSTEM_ANISOTROPY.chiSquare99, threshold: ECOSYSTEM_ANISOTROPY.chiSquare99 })
    });
}
