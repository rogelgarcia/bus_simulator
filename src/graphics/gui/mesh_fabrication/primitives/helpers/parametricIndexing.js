// src/graphics/gui/mesh_fabrication/primitives/helpers/parametricIndexing.js

export const PARAMETRIC_INDEXING_POLICY = Object.freeze({
    uOrder: 'ascending',
    vOrder: 'top_to_bottom',
    seamOrdering: 'u0_at_uSeam'
});

export function normalizeSeamAngle(angle) {
    const tau = Math.PI * 2;
    let value = Number(angle);
    if (!Number.isFinite(value)) value = 0;
    value %= tau;
    if (value < 0) value += tau;
    return value;
}
