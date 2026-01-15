// src/graphics/assets3d/generators/road/connectors/ConnectorSampling.js
import { sampleConnector } from '../../../../../app/geometry/ConnectorSampling.js';

export function sampleConnectorPoints(connector, curveSampleStep) {
    if (!connector || !connector.ok) return null;
    const { points } = sampleConnector(connector, curveSampleStep);
    if (!points || points.length < 2) return null;
    const out = new Array(points.length);
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        out[i] = { x: p.x, y: p.y };
    }
    return out;
}

export function getConnectorPoints(record, curveSampleStep, cache) {
    if (!record) return null;
    if (cache) {
        const cached = cache.get(record);
        if (cached) return cached;
    }
    const points = sampleConnectorPoints(record.connector, curveSampleStep);
    if (points && cache) cache.set(record, points);
    return points;
}
