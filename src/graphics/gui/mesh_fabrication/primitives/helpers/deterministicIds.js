// src/graphics/gui/mesh_fabrication/primitives/helpers/deterministicIds.js

import { composeUvEdgeId, composeUvFaceId, composeUvVertexId } from '../../id_policy/canonicalIdPolicy.js';
import { padOrdinal } from '../../math/quantization.js';

export {
    composeUvEdgeId,
    composeUvFaceId,
    composeUvVertexId,
    padOrdinal
};

export function composeSeedFaceId(componentPath, faceName) {
    return `${componentPath}.face.seed.${String(faceName)}`;
}

export function composeSeedVertexId(componentPath, vertexName) {
    return `${componentPath}.vertex.seed.${String(vertexName)}`;
}
