// Resolve raster polygon-offset ownership as actual geometry for ray tracing.

const EPS = 1e-8;
const cross = (a, b, p) => (b[0] - a[0]) * (p[2] - a[2]) - (b[2] - a[2]) * (p[0] - a[0]);

/** Subtract one counterclockwise XZ triangle; preserve interpolated vertex payloads. */
export function subtractTriangle(polygon, triangle) {
    let inside = polygon;
    const result = [];
    for (let edge = 0; edge < 3 && inside.length >= 3; edge++) {
        const a = triangle[edge], b = triangle[(edge + 1) % 3], next = [], outside = [];
        for (let i = 0; i < inside.length; i++) {
            const p = inside[i], q = inside[(i + 1) % inside.length];
            const dp = cross(a, b, p), dq = cross(a, b, q);
            if (dp >= -EPS) next.push(p);
            if (dp <= EPS) outside.push(p);
            if ((dp > EPS && dq < -EPS) || (dp < -EPS && dq > EPS)) {
                const t = dp / (dp - dq), hit = p.map((value, j) => value + (q[j] - value) * t);
                next.push(hit); outside.push(hit);
            }
        }
        if (outside.length >= 3) result.push(outside);
        inside = next;
    }
    return result;
}

const area = polygon => Math.abs(polygon.reduce((sum, p, i) => {
    const q = polygon[(i + 1) % polygon.length]; return sum + p[0] * q[2] - q[0] * p[2];
}, 0)) * .5;
const bounds = polygon => ({ minX: Math.min(...polygon.map(p => p[0])), maxX: Math.max(...polygon.map(p => p[0])),
    minZ: Math.min(...polygon.map(p => p[2])), maxZ: Math.max(...polygon.map(p => p[2])) });

/** Spatial index of the exported game's actual asphalt triangles, in world space. */
export function createGroundRoadCoverage(asphalt, THREE) {
    if (!asphalt?.geometry) throw new Error('Actual asphalt mesh required for grass ownership');
    const cells = new Map(), cellSize = 16, pos = asphalt.geometry.attributes.position, index = asphalt.geometry.index;
    const eachCell = (box, visit) => {
        for (let x = Math.floor(box.minX / cellSize); x <= Math.floor(box.maxX / cellSize); x++)
            for (let z = Math.floor(box.minZ / cellSize); z <= Math.floor(box.maxZ / cellSize); z++) visit(`${x},${z}`);
    };
    for (let i = 0; i < (index?.count ?? pos.count); i += 3) {
        const triangle = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(pos, index ? index.getX(i + j) : i + j)
            .applyMatrix4(asphalt.matrixWorld).toArray());
        if (area(triangle) < EPS) continue;
        if (cross(triangle[0], triangle[1], triangle[2]) < 0) triangle.reverse();
        eachCell(bounds(triangle), key => { if (!cells.has(key)) cells.set(key, []); cells.get(key).push(triangle); });
    }
    const audit = { policy: 'Subtract actual coplanar asphalt XZ coverage from GroundTiles; interpolate authored attributes; no runtime changes.',
        meshes: 0, removedSquareMeters: 0, inputTriangles: 0, outputTriangles: 0 };
    return { audit, clip(geometry, matrix) {
        const attributes = Object.entries(geometry.attributes), inverse = matrix.clone().invert(), candidates = new Set();
        const vertices = [], idx = geometry.index, position = geometry.attributes.position;
        for (let i = 0; i < position.count; i++) {
            const world = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(matrix).toArray();
            for (const [, attribute] of attributes) for (let j = 0; j < attribute.itemSize; j++) world.push(attribute.getComponent(i, j));
            vertices.push(world);
        }
        eachCell(bounds(vertices), key => { for (const triangle of cells.get(key) ?? []) candidates.add(triangle); });
        const road = [...candidates].filter(t => Math.abs(t[0][1] - vertices[0][1]) < .0001);
        if (!road.length) return geometry;
        const outputs = attributes.map(() => []); let removed = 0, triangles = 0;
        for (let i = 0; i < (idx?.count ?? position.count); i += 3) {
            const source = [0, 1, 2].map(j => vertices[idx ? idx.getX(i + j) : i + j]);
            let pieces = [source];
            for (const triangle of road) {
                const box = bounds(triangle);
                pieces = pieces.flatMap(polygon => {
                    const p = bounds(polygon);
                    return p.maxX <= box.minX || p.minX >= box.maxX || p.maxZ <= box.minZ || p.minZ >= box.maxZ
                        ? [polygon] : subtractTriangle(polygon, triangle).filter(p => area(p) > EPS);
                });
                if (!pieces.length) break;
            }
            removed += area(source) - pieces.reduce((sum, p) => sum + area(p), 0);
            for (const polygon of pieces) for (let j = 1; j < polygon.length - 1; j++) {
                triangles++;
                for (const vertex of [polygon[0], polygon[j], polygon[j + 1]]) {
                    let offset = 3;
                    attributes.forEach(([name, attribute], slot) => {
                        const data = name === 'position' ? new THREE.Vector3(...vertex.slice(0, 3)).applyMatrix4(inverse).toArray()
                            : vertex.slice(offset, offset + attribute.itemSize);
                        outputs[slot].push(...data); offset += attribute.itemSize;
                    });
                }
            }
        }
        audit.meshes++; audit.removedSquareMeters += removed;
        audit.inputTriangles += (idx?.count ?? position.count) / 3; audit.outputTriangles += triangles;
        const result = new THREE.BufferGeometry();
        attributes.forEach(([name, attribute], slot) => result.setAttribute(name, new THREE.Float32BufferAttribute(outputs[slot], attribute.itemSize)));
        return result;
    } };
}
