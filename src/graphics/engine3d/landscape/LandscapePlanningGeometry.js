// Builds bounded read-only planning guides draped onto the retained overview, without querying soil or allocating rasters.
// @ts-check
export function landscapePlanningHeight(chunk, x, z) {
    const descriptor = chunk.descriptor, bounds = descriptor.bounds;
    const column = Math.max(0, Math.min(descriptor.columns - 1, (x - bounds.minX) / (bounds.maxX - bounds.minX) * (descriptor.columns - 1)));
    const row = Math.max(0, Math.min(descriptor.rows - 1, (bounds.maxZ - z) / (bounds.maxZ - bounds.minZ) * (descriptor.rows - 1)));
    const c = Math.min(descriptor.columns - 2, Math.floor(column)), r = Math.min(descriptor.rows - 2, Math.floor(row));
    const u = column - c, v = row - r, i = r * descriptor.columns + c;
    const a = chunk.heights[i], b = chunk.heights[i + 1], sw = chunk.heights[i + descriptor.columns], d = chunk.heights[i + descriptor.columns + 1];
    return u >= v ? a + (b - a) * u + (d - b) * v : a + (d - sw) * u + (sw - a) * v;
}

export function landscapePlanningVertexCount(features) {
    return features.reduce((count, feature) => count + (feature.geometry.type === 'point' ? 4
        : (feature.geometry.points.length - (feature.geometry.type === 'polygon' ? 0 : 1)) * 2), 0);
}

export function buildLandscapePlanningPositions(features, chunk) {
    const positions = new Float32Array(landscapePlanningVertexCount(features) * 3);
    let index = 0;
    function vertex(point) {
        positions[index++] = point.x; positions[index++] = landscapePlanningHeight(chunk, point.x, point.z) + 1.5; positions[index++] = point.z;
    }
    for (const feature of features) {
        const points = feature.geometry.points;
        if (feature.geometry.type === 'point') {
            const point = points[0];
            for (const delta of [[-8, 0], [8, 0], [0, -8], [0, 8]]) vertex({ x: point.x + delta[0], z: point.z + delta[1] });
        } else {
            const segments = points.length - (feature.geometry.type === 'polygon' ? 0 : 1);
            for (let i = 0; i < segments; i++) { vertex(points[i]); vertex(points[(i + 1) % points.length]); }
        }
    }
    return positions;
}
