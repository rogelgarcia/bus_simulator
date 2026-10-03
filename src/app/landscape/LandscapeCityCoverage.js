// Clips city-center grid tiles to the explicit landscape binding extent without recentering.
// @ts-check
import { landscapeCityTileToWorld } from './LandscapeCoordinates.js';
import { cityRegionToLandscape, validateLandscapeCityBinding } from './LandscapeCityBinding.js';

function clip(points, axis, value, minimum) {
    const output = [];
    for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        const insideA = minimum ? a[axis] >= value : a[axis] <= value;
        const insideB = minimum ? b[axis] >= value : b[axis] <= value;
        if (insideA) output.push(a);
        if (insideA !== insideB) {
            const t = (value - a[axis]) / (b[axis] - a[axis]);
            output.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, [axis]: value });
        }
    }
    return output;
}

/** @param {import('./LandscapeCityBinding.js').LandscapeCityBinding} input @param {import('./LandscapeCoordinates.js').LandscapeCityGrid} grid @param {number} column @param {number} row */
export function cityTileLandscapeCoverage(input, grid, column, row) {
    const binding = validateLandscapeCityBinding(input), center = landscapeCityTileToWorld(grid, column, row), half = grid.tileSize / 2;
    const polygon = cityRegionToLandscape(binding, { type: 'rectangle', minX: center.x - half, maxX: center.x + half, minZ: center.z - half, maxZ: center.z + half });
    const b = binding.extent;
    let covered = polygon.points;
    for (const [axis, value, minimum] of [['x', b.minX, true], ['x', b.maxX, false], ['z', b.minZ, true], ['z', b.maxZ, false]]) covered = clip(covered, axis, value, minimum);
    const area = covered.reduce((sum, point, i) => { const next = covered[(i + 1) % covered.length]; return sum + point.x * next.z - point.z * next.x; }, 0) / 2;
    const inside = polygon.points.every(point => point.x >= b.minX && point.x <= b.maxX && point.z >= b.minZ && point.z <= b.maxZ);
    return Object.freeze({ status: Math.abs(area) <= 1e-10 ? 'outside' : inside ? 'inside' : 'partial', polygon, coveredPolygon: Object.freeze(covered.map(point => Object.freeze({ ...point }))), coveredArea: Math.abs(area) });
}
