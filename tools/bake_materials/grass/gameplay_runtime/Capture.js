// Serialize the lab's finished detailed appearance and central source tile into a bounded runtime package.
import * as THREE from 'three';

function centralSource(source) {
    const input = source.geometry, { position, uv } = input.attributes, indices = [], vertices = [], remap = new Map(), ranges = [];
    for (const range of source.userData.grassLeafRanges) {
        const ids = new Set(); let low = Infinity, x = 0, z = 0, n = 0;
        for (let i = range.start; i < range.start + range.count; i++) { const id = input.index.getX(i); ids.add(id); low = Math.min(low, uv.getY(id)); }
        for (const id of ids) if (uv.getY(id) <= low + 1e-6) { x += position.getX(id); z += position.getZ(id); n++; }
        if (x / n < -1 || x / n >= 1 || z / n < -1 || z / n >= 1) continue;
        const start = indices.length;
        for (let i = range.start; i < range.start + range.count; i++) {
            const id = input.index.getX(i);
            if (!remap.has(id)) { remap.set(id, vertices.length); vertices.push(id); }
            indices.push(remap.get(id));
        }
        ranges.push({ start, count: range.count });
    }
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(input.attributes)) {
        const output = new THREE.BufferAttribute(new attribute.array.constructor(vertices.length * attribute.itemSize), attribute.itemSize, attribute.normalized);
        vertices.forEach((id, i) => output.copyAt(i, attribute, id)); geometry.setAttribute(name, output);
    }
    geometry.setIndex(indices);
    return { geometry, ranges };
}

/** @param {object} baked */
export function captureGrassRuntime(baked) {
    const chunks = []; let bytes = 0;
    const array = input => {
        const padding = (4 - bytes % 4) % 4;
        if (padding) { chunks.push(new Uint8Array(padding)); bytes += padding; }
        const record = { offset: bytes, length: input.length, type: input.constructor.name };
        chunks.push(new Uint8Array(input.buffer, input.byteOffset, input.byteLength)); bytes += input.byteLength;
        return record;
    };
    const geometry = input => ({ attributes: Object.fromEntries(Object.entries(input.attributes).map(([name, value]) => [name,
        { ...array(value.array), itemSize: value.itemSize, normalized: value.normalized }])), index: array(input.index.array),
        leafCount: input.userData.grassLeafCount ?? 0 });
    const texture = input => ({ width: input.image.width, height: input.image.height, anisotropy: input.anisotropy,
        mipmaps: (input.mipmaps.length ? input.mipmaps : [input.image]).map(mip => ({ width: mip.width, height: mip.height, ...array(mip.data) })) });
    const sources = Object.fromEntries(Object.entries(baked.sources).map(([lod, mesh]) => {
        const tile = centralSource(mesh), result = { ...geometry(tile.geometry), ranges: tile.ranges };
        tile.geometry.dispose(); return [lod, result];
    }));
    const handoff = baked.sources.LOD2.material.userData.grassCanopyHandoff;
    const manifest = { schema: 'bus-simulator.gameplay-grass', version: 1, appearance: baked.getSnapshot(),
        definition: baked.canopy.getSnapshot().definition, sources,
        blades: baked.blades.map(blade => blade.templates.cards.map(geometry)),
        canopy: handoff.maps.map(texture), litter: baked.maps.litter.map(texture),
        canopyColor: handoff.color.toArray(), leafColor: baked.sources.LOD2.material.color.toArray(),
        litterColor: baked.litterMaterial.color.toArray(), canopyUvScale: handoff.uvScale };
    const binary = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { binary.set(chunk, offset); offset += chunk.length; }
    return { manifest, binary };
}
