// src/graphics/engine3d/procedural_meshes/RegionGeometry.js
// Helpers for working with grouped region geometries.
import * as THREE from 'three';

export function computeBoundingBox(geometry) {
    if (!geometry) return null;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    return geometry.boundingBox ?? null;
}

export function computeIndexedBoundingBox(geometry) {
    const positions = geometry?.attributes?.position;
    if (!positions || !positions.isBufferAttribute) return computeBoundingBox(geometry);

    const index = geometry?.index;
    const out = new THREE.Box3();
    out.makeEmpty();

    if (index && index.isBufferAttribute) {
        const idxCount = index.count;
        const v = new THREE.Vector3();
        for (let i = 0; i < idxCount; i++) {
            const vi = index.getX(i);
            v.fromBufferAttribute(positions, vi);
            out.expandByPoint(v);
        }
        return out;
    }

    out.setFromBufferAttribute(positions);
    return out;
}

export function cloneGeometryGroup(geometry, group) {
    const out = geometry.clone();
    out.clearGroups();

    const index = out.index;
    if (!index || !index.isBufferAttribute) return out;

    const start = Number.isInteger(group?.start) ? group.start : 0;
    const count = Number.isInteger(group?.count) ? group.count : 0;
    const sliced = index.array.slice(start, start + count);
    out.setIndex(new THREE.BufferAttribute(sliced, 1));
    return out;
}

export function extractRegionGeometries(geometry, regionCount) {
    const groups = geometry?.groups ?? [];
    const groupByMaterialIndex = new Map();
    for (const group of groups) {
        const materialIndex = group?.materialIndex;
        if (!Number.isInteger(materialIndex) || materialIndex < 0 || materialIndex >= regionCount) continue;
        groupByMaterialIndex.set(materialIndex, group);
    }

    const out = [];
    for (let i = 0; i < regionCount; i++) {
        const group = groupByMaterialIndex.get(i) ?? null;
        if (!group) return null;
        out.push(cloneGeometryGroup(geometry, group));
    }
    return out;
}

