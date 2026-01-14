// src/graphics/engine3d/procedural_meshes/RegionMaterials.js
// Helpers for creating and managing region-based material sets.
import * as THREE from 'three';

export function makeRegionMaterials(regions, { wireframe = false, metalness = 0.0, roughness = 0.65 } = {}) {
    const list = Array.isArray(regions) ? regions : [];
    const w = !!wireframe;
    const m = Number.isFinite(metalness) ? metalness : 0.0;
    const r = Number.isFinite(roughness) ? roughness : 0.65;

    return list.map((region) => new THREE.MeshStandardMaterial({
        color: region?.color ?? 0xffffff,
        metalness: m,
        roughness: r,
        wireframe: w
    }));
}

export function disposeMaterials(materials) {
    if (!materials) return;
    if (Array.isArray(materials)) {
        for (const m of materials) m?.dispose?.();
        return;
    }
    materials?.dispose?.();
}

export function cloneSolidMaterials(materials, count) {
    const n = Number.isInteger(count) ? count : 0;
    if (Array.isArray(materials)) return materials.map((m) => m?.clone?.() ?? null).slice(0, n);
    const base = materials?.clone?.() ?? materials ?? null;
    return new Array(n).fill(null).map(() => base?.clone?.() ?? base);
}

