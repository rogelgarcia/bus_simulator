// src/graphics/gui/mesh_fabrication/math/polygon3.js

import { crossVec3, dotVec3, lengthVec3, normalizeVec3, subVec3 } from './vector3.js';

export function polygonAreaEstimate(points) {
    if (!Array.isArray(points) || points.length < 3) return 0;
    const origin = points[0];
    let area = 0;
    for (let i = 1; i < points.length - 1; i++) {
        const a = subVec3(points[i], origin);
        const b = subVec3(points[i + 1], origin);
        area += lengthVec3(crossVec3(a, b)) * 0.5;
    }
    return area;
}

export function triangleArea(points) {
    if (!Array.isArray(points) || points.length !== 3) return 0;
    const ab = subVec3(points[1], points[0]);
    const ac = subVec3(points[2], points[0]);
    return lengthVec3(crossVec3(ab, ac)) * 0.5;
}

export function planeFromTriangle(points) {
    if (!Array.isArray(points) || points.length < 3) {
        return Object.freeze({ normal: [0, 1, 0], distance: 0 });
    }
    const ab = subVec3(points[1], points[0]);
    const ac = subVec3(points[2], points[0]);
    const normal = normalizeVec3(crossVec3(ab, ac));
    const distance = dotVec3(normal, points[0]);
    return Object.freeze({ normal, distance });
}
