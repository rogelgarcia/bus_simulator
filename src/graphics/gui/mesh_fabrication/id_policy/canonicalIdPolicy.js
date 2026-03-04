// src/graphics/gui/mesh_fabrication/id_policy/canonicalIdPolicy.js

import { padOrdinal } from '../math/quantization.js';

export function sanitizeToken(value, fallback = 'token') {
    const raw = String(value ?? '').trim();
    const token = raw.replace(/[^a-zA-Z0-9._-]+/g, '_');
    return token || fallback;
}

export function makeStableOperationId(index, prefix = 'op') {
    return `${sanitizeToken(prefix, 'op')}_${String(Math.max(0, Number(index) | 0) + 1).padStart(6, '0')}`;
}

export function composeUvVertexId(componentPath, u, v) {
    return `${componentPath}.vertex.u${padOrdinal(u)}.v${padOrdinal(v)}`;
}

export function composeUvFaceId(componentPath, u, v) {
    return `${componentPath}.face.u${padOrdinal(u)}.v${padOrdinal(v)}`;
}

export function composeUvEdgeId(componentPath, ua, va, ub, vb) {
    return `${componentPath}.edge.u${padOrdinal(ua)}.v${padOrdinal(va)}.to.u${padOrdinal(ub)}.v${padOrdinal(vb)}`;
}
