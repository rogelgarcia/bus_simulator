// Prepare shaded roots and contrasting blade faces without runtime lighting or extra geometry.
// @ts-check
import * as THREE from 'three';

/** @param {THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>} source */
export function createGrassDebugV2NaturalSource(source) {
    const mesh = source.clone(false), geometry = source.geometry.clone();
    geometry.computeBoundingBox();
    const { position, color, uv } = geometry.attributes, index = geometry.index, tint = source.material.color;
    const canopyHeight = geometry.boundingBox.max.y;
    for (const [leafIndex, range] of source.userData.grassLeafRanges.entries()) {
        const vertices = new Map(); let low = Infinity, high = -Infinity;
        let hash = Math.imul(leafIndex + 1, 1597334677); hash = Math.imul(hash ^ hash >>> 16, 2246822519);
        const random = (hash >>> 0) / 4294967296, variation = .75 + .5 * random;
        const lightWing = random > .5;
        for (let i = range.start; i < range.start + range.count; i += 3) {
            const triangle = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
            const rightWing = triangle.reduce((sum, id) => sum + uv.getX(id), 0) / 3 >= .5;
            const face = rightWing === lightWing ? 1.15 : .5;
            for (const id of triangle) {
                const entry = vertices.get(id) || { sum: 0, count: 0 };
                entry.sum += face; entry.count++; vertices.set(id, entry);
                low = Math.min(low, position.getY(id)); high = Math.max(high, position.getY(id));
            }
        }
        if (!(high > low)) throw new Error('Natural grass shading requires a leaf with nonzero height.');
        for (const [id, face] of vertices) {
            const h = (position.getY(id) - low) / (high - low);
            // Do not average this gradient back toward the leaf mean: that erases the root cavity.
            const root = .045 + .955 * Math.pow(h, .8);
            const canopyOcclusion = .65 + .35 * position.getY(id) / canopyHeight;
            const shade = root * canopyOcclusion * face.sum / face.count * variation;
            color.setXYZ(id, color.getX(id) * tint.r * shade * (.82 + .18 * h),
                color.getY(id) * tint.g * shade, color.getZ(id) * tint.b * shade * (1.08 - .08 * h));
        }
    }
    color.needsUpdate = true; mesh.geometry = geometry; mesh.userData = { ...source.userData };
    return mesh;
}
