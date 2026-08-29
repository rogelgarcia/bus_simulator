// Subdivides flat window parts across their width and bends them onto a facade arc.
// @ts-check

import * as THREE from 'three';

const EPS = 1e-7;

function interpolateVertex(a, b, t, attributeNames) {
    const out = {};
    for (const name of attributeNames) {
        const av = a[name];
        const bv = b[name];
        out[name] = av.map((value, index) => value + (bv[index] - value) * t);
    }
    return out;
}

function clipPolygonAtX(polygon, boundary, keepGreater, attributeNames) {
    const out = [];
    for (let index = 0; index < polygon.length; index++) {
        const current = polygon[index];
        const previous = polygon[(index - 1 + polygon.length) % polygon.length];
        const currentX = current.position[0];
        const previousX = previous.position[0];
        const currentInside = keepGreater ? currentX >= boundary - EPS : currentX <= boundary + EPS;
        const previousInside = keepGreater ? previousX >= boundary - EPS : previousX <= boundary + EPS;
        if (currentInside !== previousInside) {
            const denominator = currentX - previousX;
            const t = Math.abs(denominator) > EPS ? (boundary - previousX) / denominator : 0;
            out.push(interpolateVertex(previous, current, t, attributeNames));
        }
        if (currentInside) out.push(current);
    }
    return out;
}

function appendTriangle(outByName, a, b, c, attributeNames) {
    const ax = a.position[0];
    const ay = a.position[1];
    const az = a.position[2];
    const bx = b.position[0];
    const by = b.position[1];
    const bz = b.position[2];
    const cx = c.position[0];
    const cy = c.position[1];
    const cz = c.position[2];
    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;
    const areaSquared = Math.hypot(
        aby * acz - abz * acy,
        abz * acx - abx * acz,
        abx * acy - aby * acx
    );
    if (!(areaSquared > EPS)) return;
    for (const name of attributeNames) outByName.get(name).push(...a[name], ...b[name], ...c[name]);
}

function bendPosition(position, centerZ, zOffset) {
    const x = position[0];
    const y = position[1];
    const z = position[2] + zOffset;
    const radius = Math.abs(centerZ);
    const sign = Math.sign(centerZ);
    const angle = x / radius;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    return [
        (radius - sign * z) * sin,
        y,
        centerZ * (1 - cos) + z * cos
    ];
}

function bendDirection(direction, sourceX, centerZ) {
    const sign = Math.sign(centerZ);
    const angle = sourceX / Math.abs(centerZ);
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const x = cos * direction[0] - sign * sin * direction[2];
    const y = direction[1];
    const z = sign * sin * direction[0] + cos * direction[2];
    const length = Math.hypot(x, y, z) || 1;
    return [x / length, y / length, z / length, ...direction.slice(3)];
}

export function bendWindowGeometryToArc(geometry, { centerZ, segments = 8, zOffset = 0 } = {}) {
    if (!geometry?.isBufferGeometry) throw new TypeError('Window curve bending requires a BufferGeometry.');
    const resolvedCenterZ = Number(centerZ);
    if (!Number.isFinite(resolvedCenterZ) || Math.abs(resolvedCenterZ) < 0.1) {
        throw new RangeError('Window curve centerZ must be finite and at least 0.1m from the window plane.');
    }
    const resolvedSegments = Math.max(2, Math.min(32, Math.round(Number(segments) || 0)));
    const resolvedZOffset = Number(zOffset);
    if (!Number.isFinite(resolvedZOffset)) throw new TypeError('Window curve zOffset must be finite.');

    const instancedAttributes = Object.entries(geometry.attributes)
        .filter(([, attribute]) => attribute?.isInstancedBufferAttribute);
    let source = null;
    if (geometry.index) {
        const indexedSource = geometry.clone();
        for (const [name] of instancedAttributes) indexedSource.deleteAttribute(name);
        source = indexedSource.toNonIndexed();
        indexedSource.dispose();
    } else {
        source = geometry.clone();
    }
    const position = source.getAttribute('position');
    if (!position?.isBufferAttribute || position.count < 3 || position.count % 3 !== 0) {
        source.dispose();
        throw new TypeError('Window curve bending requires triangle position data.');
    }
    source.computeBoundingBox();
    const minX = source.boundingBox?.min.x ?? 0;
    const maxX = source.boundingBox?.max.x ?? 0;
    const width = maxX - minX;
    if (!(width > EPS)) {
        for (const [name, attribute] of instancedAttributes) source.setAttribute(name, attribute);
        return source;
    }

    const attributes = Object.entries(source.attributes)
        .filter(([, attribute]) => attribute?.isBufferAttribute && !attribute.isInstancedBufferAttribute && attribute.count === position.count);
    const attributeNames = attributes.map(([name]) => name);
    const outByName = new Map(attributeNames.map((name) => [name, []]));
    const vertices = [];
    for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex++) {
        const vertex = {};
        for (const [name, attribute] of attributes) {
            const values = [];
            for (let component = 0; component < attribute.itemSize; component++) {
                values.push(attribute.array[vertexIndex * attribute.itemSize + component]);
            }
            vertex[name] = values;
        }
        vertices.push(vertex);
    }

    const step = width / resolvedSegments;
    for (let triangle = 0; triangle < vertices.length; triangle += 3) {
        const tri = [vertices[triangle], vertices[triangle + 1], vertices[triangle + 2]];
        const triMin = Math.min(...tri.map((vertex) => vertex.position[0]));
        const triMax = Math.max(...tri.map((vertex) => vertex.position[0]));
        const firstSlab = Math.max(0, Math.floor((triMin - minX) / step));
        const lastSlab = Math.min(resolvedSegments - 1, Math.floor((triMax - minX - EPS) / step));
        for (let slab = firstSlab; slab <= lastSlab; slab++) {
            const left = minX + slab * step;
            const right = slab === resolvedSegments - 1 ? maxX : left + step;
            let polygon = clipPolygonAtX(tri, left, true, attributeNames);
            polygon = clipPolygonAtX(polygon, right, false, attributeNames);
            for (let index = 1; index + 1 < polygon.length; index++) {
                appendTriangle(outByName, polygon[0], polygon[index], polygon[index + 1], attributeNames);
            }
        }
    }

    const result = new THREE.BufferGeometry();
    const flatPositions = outByName.get('position').slice();
    for (const [name, sourceAttribute] of attributes) {
        const values = outByName.get(name);
        if (name === 'position') {
            for (let offset = 0; offset < values.length; offset += sourceAttribute.itemSize) {
                const bent = bendPosition(values.slice(offset, offset + sourceAttribute.itemSize), resolvedCenterZ, resolvedZOffset);
                values[offset] = bent[0];
                values[offset + 1] = bent[1];
                values[offset + 2] = bent[2];
            }
        } else if (name === 'normal' || name === 'tangent') {
            for (let offset = 0; offset < values.length; offset += sourceAttribute.itemSize) {
                const positionOffset = (offset / sourceAttribute.itemSize) * 3;
                const bent = bendDirection(
                    values.slice(offset, offset + sourceAttribute.itemSize),
                    flatPositions[positionOffset],
                    resolvedCenterZ
                );
                for (let component = 0; component < sourceAttribute.itemSize; component++) {
                    values[offset + component] = bent[component];
                }
            }
        }
        const ArrayType = sourceAttribute.array.constructor;
        result.setAttribute(name, new THREE.BufferAttribute(new ArrayType(values), sourceAttribute.itemSize, sourceAttribute.normalized));
    }
    for (const [name, attribute] of instancedAttributes) result.setAttribute(name, attribute);
    source.dispose();
    result.userData = {
        ...(geometry.userData && typeof geometry.userData === 'object' ? geometry.userData : {}),
        windowCurveBend: Object.freeze({ centerZ: resolvedCenterZ, segments: resolvedSegments, zOffset: resolvedZOffset })
    };
    result.computeBoundingBox();
    result.computeBoundingSphere();
    return result;
}
