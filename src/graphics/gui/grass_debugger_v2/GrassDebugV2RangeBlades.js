// Retain spatially distributed LOD2 blades for distant bands, with width compensation prepared once.
// @ts-check
import * as THREE from 'three';

/** Build borrowed-material representations without card projection or per-frame geometry updates.
 * @param {THREE.Mesh} source
 * @param {{fraction:number,widthScale:number,colorGain:number[]}} options */
export function createGrassDebugV2RangeBlades(source, { fraction, widthScale, colorGain }) {
    if (!(fraction > 0 && fraction <= 1 && widthScale >= 1 && widthScale <= 3)) throw new Error('Invalid distant blade profile.');
    if (colorGain?.length !== 3 || colorGain.some(value => !Number.isFinite(value) || value <= 0 || value > 4)) throw new Error('Invalid distant blade color calibration.');
    const { geometry } = source, { position, uv } = geometry.attributes, index = geometry.index;
    const centers = [[-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5]], buckets = new Map();
    for (const [id, range] of source.userData.grassLeafRanges.entries()) {
        const vertices = new Set(); let low = Infinity, x = 0, z = 0, count = 0;
        for (let i = range.start; i < range.start + range.count; i++) { const vertex = index.getX(i); vertices.add(vertex); low = Math.min(low, uv.getY(vertex)); }
        for (const vertex of vertices) if (uv.getY(vertex) <= low + 1e-6) { x += position.getX(vertex); z += position.getZ(vertex); count++; }
        x /= count; z /= count;
        if (x < -1 || x >= 1 || z < -1 || z >= 1) continue;
        let rank = Math.imul(id + 1, 1597334677); rank = Math.imul(rank ^ rank >>> 16, 2246822519) >>> 0;
        const key = Math.floor((x + 1) * 10) + ':' + Math.floor((z + 1) * 10);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push({ range, vertices, x, z, rank });
    }
    const selected = [...buckets.values()].flatMap(leaves => leaves.sort((a, b) => a.rank - b.rank).slice(0, Math.max(1, Math.round(leaves.length * fraction))));
    const templates = centers.map(([cx, cz], quadrant) => {
        const leaves = selected.filter(leaf => Number(leaf.x >= 0) + 2 * Number(leaf.z >= 0) === quadrant);
        const ids = [], indices = [], positions = [];
        for (const { range, vertices } of leaves) {
            const remap = new Map(), rows = new Map();
            for (const vertex of vertices) {
                const key = uv.getY(vertex).toFixed(6);
                if (!rows.has(key)) rows.set(key, []);
                rows.get(key).push(vertex);
            }
            for (const row of rows.values()) {
                const x = row.reduce((sum, vertex) => sum + position.getX(vertex), 0) / row.length;
                const z = row.reduce((sum, vertex) => sum + position.getZ(vertex), 0) / row.length;
                for (const vertex of row) {
                    remap.set(vertex, ids.length); ids.push(vertex);
                    positions.push(x + (position.getX(vertex) - x) * widthScale - cx, position.getY(vertex), z + (position.getZ(vertex) - z) * widthScale - cz);
                }
            }
            for (let i = range.start; i < range.start + range.count; i++) indices.push(remap.get(index.getX(i)));
        }
        const result = new THREE.BufferGeometry();
        for (const [name, attribute] of Object.entries(geometry.attributes)) {
            const copy = new THREE.BufferAttribute(new attribute.array.constructor(ids.length * attribute.itemSize), attribute.itemSize, attribute.normalized);
            ids.forEach((id, i) => copy.copyAt(i, attribute, id)); result.setAttribute(name, copy);
        }
        result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); result.setIndex(indices);
        const color = result.attributes.color;
        for (let i = 0; i < color.count; i++) color.setXYZ(i, color.getX(i) * colorGain[0], color.getY(i) * colorGain[1], color.getZ(i) * colorGain[2]);
        result.userData.grassLeafCount = leaves.length; result.computeBoundingBox(); result.computeBoundingSphere();
        return result;
    });
    return Object.freeze({ material: source.material, templates: { cards: templates },
        getSnapshot: () => ({ fraction, widthScale, colorGain, textureBytes: 0, leavesPerSquareMeter: selected.length / 4, trianglesPerSquareMeter: templates.reduce((sum, item) => sum + item.index.count / 3, 0) / 4 }),
        dispose() { templates.forEach(item => item.dispose()); } });
}
