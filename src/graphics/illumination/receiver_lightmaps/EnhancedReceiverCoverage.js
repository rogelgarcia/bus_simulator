// Keeps incomplete coplanar surfaces on live lighting instead of exposing atlas-budget seams.
// @ts-check

/** @param {any} geometry @param {Float32Array} coordinates */
export function omitPartialReceiverSurfaces(geometry, coordinates) {
    const position = geometry.attributes.position, index = geometry.index;
    const count = coordinates.length / 12;
    const parent = Int32Array.from({ length: count }, (_, i) => i);
    const normals = [], edges = new Map(), materials = new Int32Array(count);
    const first = Math.ceil((geometry.drawRange?.start ?? 0) / 3);
    const end = Math.min(count, Math.floor(((geometry.drawRange?.start ?? 0) + (geometry.drawRange?.count ?? Infinity)) / 3));
    for (const group of geometry.groups ?? []) {
        for (let i = group.start / 3; i < Math.min(count, (group.start + group.count) / 3); i++) materials[i] = group.materialIndex;
    }
    const root = (i) => {
        while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
        return i;
    };
    for (let triangle = first; triangle < end; triangle++) {
        const points = [0, 1, 2].map((corner) => {
            const vertex = index ? index.getX(triangle * 3 + corner) : triangle * 3 + corner;
            return [position.getX(vertex), position.getY(vertex), position.getZ(vertex)];
        });
        const a = points[1].map((value, i) => value - points[0][i]), b = points[2].map((value, i) => value - points[0][i]);
        const normal = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
        const length = Math.hypot(...normal);
        normals[triangle] = normal.map((value) => value / (length || 1));
        const vertices = points.map((point) => point.map((value) => Math.round(value * 1e5)).join(','));
        for (let corner = 0; corner < 3; corner++) {
            const from = vertices[corner], to = vertices[(corner + 1) % 3];
            const key = from < to ? from + '/' + to : to + '/' + from;
            const adjacent = edges.get(key) ?? [];
            for (const other of adjacent) {
                const agreement = normals[triangle].reduce((sum, value, i) => sum + value * normals[other][i], 0);
                if (materials[triangle] === materials[other] && agreement > .99985) parent[root(triangle)] = root(other);
            }
            adjacent.push(triangle); edges.set(key, adjacent);
        }
    }
    const incomplete = new Set();
    for (let triangle = first; triangle < end; triangle++) {
        if ([0, 1, 2].some((corner) => coordinates[triangle * 12 + corner * 4 + 3] < .5)) incomplete.add(root(triangle));
    }
    let omittedTriangles = 0;
    for (let triangle = first; triangle < end; triangle++) if (incomplete.has(root(triangle))) {
        if (coordinates[triangle * 12 + 3] > .5) omittedTriangles++;
        coordinates.fill(0, triangle * 12, triangle * 12 + 12);
    }
    return omittedTriangles;
}
