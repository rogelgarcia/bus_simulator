// Allocates measured facade detail independently of camera poses and material color.
// @ts-check
export const RECEIVER_FACADE_DENSITY = 'opaque-building-walls-8cm-v1';

/** @param {any} mapping @param {any} material @param {number[][][]} faces @param {number} base */
export function receiverFacadeTexelSize(mapping, material, faces, base) {
    if (mapping.category !== 'buildings' || material.alpha.mode !== 'opaque'
        || material.customSemantics?.materialVariationConfig?.normalized?.root !== 'wall'
        || !(material.roughness >= .6) || !(material.metalness <= .05) || material.transmission > 0
        || material.customShaderTags?.some(tag => /window|glass|interior/i.test(tag))) return base;
    for (const [a, b, c] of faces) {
        const u = b.map((v, i) => v - a[i]), v = c.map((v, i) => v - a[i]);
        const n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
        if (Math.abs(n[1]) > Math.hypot(...n) * .25) return base;
    }
    return Math.min(base, .0825);
}
