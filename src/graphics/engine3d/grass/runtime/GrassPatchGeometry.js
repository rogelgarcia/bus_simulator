// Build immutable instanced source tiles, sharing their placement buffers across every visible patch.
// @ts-check
import * as THREE from 'three';

function joinQuadrants(templates) {
    const geometry = new THREE.BufferGeometry(), indices = [];
    const count = templates.reduce((sum, source) => sum + source.attributes.position.count, 0);
    for (const [name, source] of Object.entries(templates[0].attributes)) {
        const attribute = new THREE.BufferAttribute(new source.array.constructor(count * source.itemSize), source.itemSize, source.normalized);
        let offset = 0;
        for (const [q, template] of templates.entries()) {
            const original = template.attributes[name];
            for (let i = 0; i < original.count; i++) {
                attribute.copyAt(offset + i, original, i);
                if (name === 'position') {
                    attribute.setX(offset + i, attribute.getX(offset + i) + (q % 2 ? .5 : -.5));
                    attribute.setZ(offset + i, attribute.getZ(offset + i) + (q >= 2 ? .5 : -.5));
                }
            }
            offset += original.count;
        }
        geometry.setAttribute(name, attribute);
    }
    let offset = 0;
    for (const template of templates) {
        for (let i = 0; i < template.index.count; i++) indices.push(offset + template.index.getX(i));
        offset += template.attributes.position.count;
    }
    geometry.setIndex(indices);
    return geometry;
}

/** @param {object} asset @param {number} patchSize */
export function createGrassPatchGeometry(asset, patchSize) {
    const sizes = [2, 2, patchSize, patchSize, patchSize], placements = new Map();
    for (const size of new Set(sizes)) {
        const offsets = [];
        for (let z = 1; z < size; z += 2) for (let x = 1; x < size; x += 2) offsets.push(x, z);
        placements.set(size, new THREE.InstancedBufferAttribute(new Float32Array(offsets), 2));
    }
    const joined = [joinQuadrants(asset.lod3.templates), joinQuadrants(asset.bridge.templates)];
    const sources = [...['LOD0', 'LOD1', 'LOD2'].map(level => asset.sources[level].geometry), ...joined];
    const geometries = sources.map((source, level) => {
        const size = sizes[level], placement = placements.get(size);
        const geometry = new THREE.InstancedBufferGeometry();
        for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
        const ranges = level < 3 ? asset.sources[`LOD${level}`].userData.grassLeafRanges : Array.from({ length: source.index.count / 6 }, (_, i) => ({ start: i * 6, count: 6 }));
        const roots = new THREE.Float32BufferAttribute(new Float32Array(source.attributes.position.count * 2), 2);
        for (const { start, count } of ranges) {
            const ids = new Set(source.index.array.subarray(start, start + count)), { position, uv } = source.attributes;
            const bottom = Math.min(...Array.from(ids, id => uv.getY(id)));
            const base = [...ids].filter(id => uv.getY(id) <= bottom + 1e-6);
            const x = base.reduce((sum, id) => sum + position.getX(id), 0) / base.length, z = base.reduce((sum, id) => sum + position.getZ(id), 0) / base.length;
            for (const id of ids) roots.setXY(id, x, z);
        }
        geometry.setAttribute('grassPatchRoot', roots);
        geometry.setIndex(source.index); geometry.setAttribute('grassPatchOffset', placement);
        geometry.instanceCount = placement.count;
        source.computeBoundingBox();
        const overhang = Math.max(0, -1 - source.boundingBox.min.x, source.boundingBox.max.x - 1,
            -1 - source.boundingBox.min.z, source.boundingBox.max.z - 1);
        geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-overhang, source.boundingBox.min.y, -overhang),
            new THREE.Vector3(size + overhang, source.boundingBox.max.y, size + overhang));
        geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
        return geometry;
    });
    return Object.freeze({ geometries, sizes, placementBytes: [...placements.values()].reduce((sum, value) => sum + value.array.byteLength, 0),
        extents: geometries.map(geometry => ({ overhang: -geometry.boundingBox.min.x,
            centerY: geometry.boundingSphere.center.y, radius: geometry.boundingSphere.radius })),
        triangles: geometries.map(geometry => geometry.index.count / 3 * geometry.instanceCount),
        dispose() { geometries.forEach(geometry => geometry.dispose()); joined.forEach(geometry => geometry.dispose()); } });
}
