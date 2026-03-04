// src/graphics/gui/mesh_fabrication/services/contextMenuStatusService.js

export function buildTopologyHoverStatus({
    hit,
    pivotPosition,
    formatVector3,
    formatAuthored,
    resolveCanonical
}) {
    if (!hit || typeof hit !== 'object') {
        return { canonical: '-', authored: '-' };
    }
    if (String(hit.kind ?? '').trim().toLowerCase() === 'pivot') {
        const coords = Array.isArray(hit.coords) && hit.coords.length >= 3
            ? {
                x: Number(hit.coords[0]) || 0,
                y: Number(hit.coords[1]) || 0,
                z: Number(hit.coords[2]) || 0
            }
            : pivotPosition;
        return {
            canonical: 'scene.pivot',
            authored: `Pivot @ (${formatVector3(coords)})`
        };
    }

    const authored = formatAuthored(hit);
    const canonicalRaw = typeof hit.canonicalId === 'string' && hit.canonicalId.trim()
        ? hit.canonicalId.trim()
        : resolveCanonical(hit.id);
    return {
        canonical: canonicalRaw || '-',
        authored: authored || '-'
    };
}
