// src/graphics/gui/inspector_room/InspectorRoomTreeMaterialUtils.js
// Utilities for stable trunk/leaf material assignment in the Inspector Room tree mesh viewer.

function clampInt(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    const rounded = Math.round(num);
    return Math.max(min, Math.min(max, rounded));
}

function isFoliageName(name) {
    const s = String(name ?? '').toLowerCase();
    return s.includes('leaf') || s.includes('foliage') || s.includes('bush');
}

function groupForTriangleOffset(geometry, triOffset) {
    const groups = geometry?.groups ?? [];
    for (const group of groups) {
        const start = group?.start ?? 0;
        const count = group?.count ?? 0;
        if (triOffset >= start && triOffset < start + count) return group;
    }
    return null;
}

function resolveTreeRoleFromMaterial(mat, { sharedLeaf, sharedTrunk, fallbackName = '' } = {}) {
    if (!mat) return 'trunk';
    if (sharedLeaf && mat === sharedLeaf) return 'leaf';
    if (sharedTrunk && mat === sharedTrunk) return 'trunk';
    if (sharedLeaf && mat?.map && sharedLeaf?.map && mat.map === sharedLeaf.map) return 'leaf';
    if (sharedTrunk && mat?.map && sharedTrunk?.map && mat.map === sharedTrunk.map) return 'trunk';
    if (sharedLeaf && mat?.normalMap && sharedLeaf?.normalMap && mat.normalMap === sharedLeaf.normalMap) return 'leaf';
    if (sharedTrunk && mat?.normalMap && sharedTrunk?.normalMap && mat.normalMap === sharedTrunk.normalMap) return 'trunk';
    if (Number(mat.alphaTest) > 1e-6 || !!mat.transparent) return 'leaf';
    const name = `${fallbackName} ${mat?.name ?? ''}`;
    return isFoliageName(name) ? 'leaf' : 'trunk';
}

export function tagInspectorTreeMaterialRoles(root, { sharedLeaf = null, sharedTrunk = null } = {}) {
    const r = root && typeof root === 'object' ? root : null;
    if (!r?.traverse) return;

    r.traverse((o) => {
        if (!o?.isMesh) return;
        const mats = o.material;
        if (Array.isArray(mats)) {
            const roles = mats.map((mat) => resolveTreeRoleFromMaterial(mat, { sharedLeaf, sharedTrunk, fallbackName: o.name }));
            o.userData._meshInspectorTreeMaterialRoles = roles;
            o.userData._meshInspectorTreeMaterialRole = null;
        } else {
            const role = resolveTreeRoleFromMaterial(mats, { sharedLeaf, sharedTrunk, fallbackName: o.name });
            o.userData._meshInspectorTreeMaterialRole = role;
            o.userData._meshInspectorTreeMaterialRoles = null;
        }
    });
}

export function getInspectorTreeRoleFromIntersection(hit, { defaultRole = 'trunk' } = {}) {
    const obj = hit?.object ?? null;
    if (!obj?.isMesh) return defaultRole === 'leaf' ? 'leaf' : 'trunk';

    const roles = obj.userData?._meshInspectorTreeMaterialRoles ?? null;
    const singleRole = obj.userData?._meshInspectorTreeMaterialRole ?? null;

    if (Array.isArray(roles) && Number.isFinite(hit?.faceIndex)) {
        const geometry = obj.geometry ?? null;
        const triOffset = clampInt(hit.faceIndex, 0, Number.MAX_SAFE_INTEGER) * 3;
        const group = groupForTriangleOffset(geometry, triOffset);
        const matIndex = Number.isFinite(group?.materialIndex) ? group.materialIndex : 0;
        const idx = clampInt(matIndex, 0, Math.max(0, roles.length - 1));
        return roles[idx] === 'leaf' ? 'leaf' : 'trunk';
    }

    if (singleRole === 'leaf' || singleRole === 'trunk') return singleRole;

    const mats = obj.material;
    const mat = Array.isArray(mats) ? (mats[0] ?? null) : mats;
    const name = `${obj.name} ${mat?.name ?? ''}`;
    return isFoliageName(name) ? 'leaf' : 'trunk';
}

export function applyInspectorTreeMaterials(root, { mode = 'semantic', leaf = null, trunk = null, solid = null, wireframe = false } = {}) {
    const r = root && typeof root === 'object' ? root : null;
    if (!r?.traverse) return;
    const applyWireframe = (mat) => {
        if (!mat) return;
        mat.wireframe = !!wireframe;
        mat.needsUpdate = true;
    };

    const m = mode === 'solid' ? 'solid' : 'semantic';
    if (m === 'solid') applyWireframe(solid);
    else {
        applyWireframe(leaf);
        applyWireframe(trunk);
    }

    r.traverse((o) => {
        if (!o?.isMesh) return;
        const roles = o.userData?._meshInspectorTreeMaterialRoles ?? null;
        const singleRole = o.userData?._meshInspectorTreeMaterialRole ?? null;

        if (Array.isArray(o.material)) {
            const desired = o.material.map((_, idx) => {
                if (m === 'solid') return solid;
                const role = Array.isArray(roles) ? roles[clampInt(idx, 0, Math.max(0, roles.length - 1))] : null;
                if (role === 'leaf') return leaf;
                if (role === 'trunk') return trunk;
                const fallbackName = `${o.name} ${o.material?.[idx]?.name ?? ''}`;
                return isFoliageName(fallbackName) ? leaf : trunk;
            });
            o.material = desired;
        } else {
            if (m === 'solid') o.material = solid;
            else if (singleRole === 'leaf') o.material = leaf;
            else if (singleRole === 'trunk') o.material = trunk;
            else {
                const fallbackName = `${o.name} ${o.material?.name ?? ''}`;
                o.material = isFoliageName(fallbackName) ? leaf : trunk;
            }
        }
        o.castShadow = true;
        o.receiveShadow = true;
    });
}

