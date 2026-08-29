// src/graphics/lighting/ShadowCasterMerge.js
// Collapses a building's shadow casting into one mesh.
//
// A building is split into ~5 (sometimes 100+) meshes because the *main* pass
// needs different materials. The shadow pass is depth-only and ignores
// materials entirely, so all of that geometry can cast from a single mesh
// instead. This is lossless, unlike a box proxy: the merged mesh holds the
// same triangles, so rooftop bulkheads, cornice lines and every other
// self-shadowing detail survive exactly as before.
//
// Only position and index are kept — the depth pass needs nothing else, and
// normalBias is applied on the receiving surface, not the caster.
//
// Not merged:
// - Optional InstancedMesh detail. Structural opening frames explicitly opt in
//   and are expanded once so the building keeps one complete shadow draw.
// - Anything alpha-tested or transparent. Its silhouette comes from a texture,
//   which an untextured merged mesh cannot reproduce.
// @ts-check

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const ORIGINAL_CAST = '_shadowMergeOriginalCast';

function isMergeableCaster(o) {
    if (!o?.isMesh || (o.isInstancedMesh && !o.userData?.expandIntoMergedShadowCaster) || !o.geometry) return false;
    if (!o.geometry.attributes?.position) return false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
        if (!m) return false;
        // A cutout silhouette lives in the alpha map; merging would fill it in.
        if (m.transparent || (Number.isFinite(m.alphaTest) && m.alphaTest > 0) || m.alphaMap) return false;
    }
    return true;
}

/**
 * Build one shadow-casting mesh per building group.
 *
 * The merged mesh has to stay visible to the camera — three tests
 * `object.layers` against the *scene* camera in the shadow pass, so an object
 * hidden from the camera is hidden from shadows too. `colorWrite: false` and
 * `depthWrite: false` make it draw nothing instead: one cheap main-pass call
 * that leaves the frame buffer untouched.
 *
 * @param {THREE.Object3D} buildingsGroup Parent whose children are buildings.
 * @returns {Array<{ group: THREE.Object3D, merged: THREE.Mesh, sources: THREE.Mesh[] }>}
 */
export function buildMergedShadowCasters(buildingsGroup) {
    const results = [];
    if (!buildingsGroup?.children) return results;
    buildingsGroup.updateMatrixWorld(true);

    const inverse = new THREE.Matrix4();
    for (const group of buildingsGroup.children) {
        if (!group?.traverse) continue;

        /** @type {THREE.Mesh[]} */
        const sources = [];
        group.traverse((o) => { if (o.castShadow && isMergeableCaster(o)) sources.push(o); });

        // The unit of cost is the draw, not the mesh: a geometry with material
        // groups issues one draw per group, in the shadow pass too. So a single
        // multi-material building mesh is still worth collapsing — that is the
        // common shape here, since the geometry merger groups by material.
        let drawUnits = 0;
        for (const mesh of sources) drawUnits += mesh.geometry.groups?.length || 1;
        if (drawUnits < 2) continue;

        inverse.copy(group.matrixWorld).invert();
        const parts = [];
        const instanceMatrix = new THREE.Matrix4();
        for (const mesh of sources) {
            const src = mesh.geometry;
            const position = src.attributes.position;
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', position.clone());
            // mergeGeometries refuses a mix of indexed and non-indexed inputs —
            // it returns null rather than throwing, so this is silent if not
            // normalised. Buildings hit it: the wall mesh is indexed with
            // material groups, the roof mesh is not indexed at all.
            if (src.index) {
                geo.setIndex(src.index.clone());
            } else {
                const count = position.count;
                const index = count > 65535 ? new Uint32Array(count) : new Uint16Array(count);
                for (let i = 0; i < count; i++) index[i] = i;
                geo.setIndex(new THREE.BufferAttribute(index, 1));
            }
            // Bake into the building group's space so the merged mesh can sit
            // on the group with an identity transform.
            const instanceCount = mesh.isInstancedMesh ? mesh.count : 1;
            for (let i = 0; i < instanceCount; i++) {
                const part = i === instanceCount - 1 ? geo : geo.clone();
                const matrix = inverse.clone().multiply(mesh.matrixWorld);
                if (mesh.isInstancedMesh) { mesh.getMatrixAt(i, instanceMatrix); matrix.multiply(instanceMatrix); }
                part.applyMatrix4(matrix);
                parts.push(part);
            }
        }

        // useGroups false: one draw for the whole building, which is the point.
        const mergedGeometry = mergeGeometries(parts, false);
        for (const geo of parts) geo.dispose();
        if (!mergedGeometry) continue;

        const material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
        material.userData.isShadowCasterMerge = true;
        const merged = new THREE.Mesh(mergedGeometry, material);
        merged.name = `${group.name || 'building'}__shadow_merge`;
        merged.castShadow = true;
        merged.receiveShadow = false;
        merged.userData.excludeFromAmbientOcclusion = true;
        merged.userData.isShadowCasterMerge = true;
        group.add(merged);

        for (const mesh of sources) mesh.userData[ORIGINAL_CAST] = true;
        results.push({ group, merged, sources });
    }
    return results;
}

/**
 * Switch between merged and per-material shadow casting. Exactly one of the
 * two is active, or the same geometry would be drawn into the shadow map twice.
 */
export function setMergedShadowCastersEnabled(entries, enabled) {
    if (!Array.isArray(entries)) return;
    for (const entry of entries) {
        if (!entry?.merged) continue;
        entry.merged.castShadow = !!enabled;
        for (const mesh of entry.sources) {
            if (mesh.userData?.[ORIGINAL_CAST]) mesh.castShadow = !enabled;
        }
    }
}

/**
 * Index a building group's optional instanced facade detail — window sills,
 * decorations, handles — so its shadow casting can be switched as a set.
 *
 * These are excluded from the merge above, so each one stays a draw call per
 * shadow pass when the optional detail-shadow setting is enabled.
 *
 * @param {THREE.Object3D} buildingsGroup
 * @returns {Array<{ mesh: THREE.Mesh, originalCast: boolean }>}
 */
export function collectInstancedShadowCasters(buildingsGroup) {
    const entries = [];
    if (!buildingsGroup?.traverse) return entries;
    buildingsGroup.traverse((o) => {
        if (!o?.isInstancedMesh || o.userData?.expandIntoMergedShadowCaster) return;
        entries.push({ mesh: o, originalCast: !!o.castShadow });
    });
    return entries;
}

/**
 * Switch instanced facade detail in or out of the shadow passes.
 *
 * Off is the default because these small details sit close to a wall that
 * already casts. Structural opening frames are not optional; they are folded
 * into the merged building silhouette instead.
 *
 * @returns {boolean} whether anything changed.
 */
export function setInstancedShadowCastersEnabled(entries, enabled) {
    if (!Array.isArray(entries)) return false;
    const want = !!enabled;
    let changed = false;
    for (const entry of entries) {
        const mesh = entry?.mesh;
        if (!mesh) continue;
        // Never turn casting ON for something that was not a caster to begin
        // with; the toggle restores the original, it does not promote.
        const next = want ? entry.originalCast : false;
        if (mesh.castShadow !== next) {
            mesh.castShadow = next;
            changed = true;
        }
    }
    return changed;
}

/** Free merged geometry and detach the meshes, restoring original casting. */
export function disposeMergedShadowCasters(entries) {
    if (!Array.isArray(entries)) return;
    for (const entry of entries) {
        if (!entry?.merged) continue;
        entry.merged.removeFromParent();
        entry.merged.geometry?.dispose?.();
        const mat = entry.merged.material;
        if (Array.isArray(mat)) for (const m of mat) m?.dispose?.();
        else mat?.dispose?.();
        for (const mesh of entry.sources) {
            if (mesh.userData?.[ORIGINAL_CAST]) mesh.castShadow = true;
        }
    }
}

export function summarizeMergedShadowCasters(entries) {
    if (!Array.isArray(entries)) return { buildings: 0, sourceMeshes: 0, sourceDraws: 0 };
    let sourceMeshes = 0;
    let sourceDraws = 0;
    for (const entry of entries) {
        sourceMeshes += entry.sources.length;
        for (const mesh of entry.sources) sourceDraws += mesh.geometry?.groups?.length || 1;
    }
    // sourceDraws collapse to one draw per building, per shadow map.
    return { buildings: entries.length, sourceMeshes, sourceDraws };
}
