// src/graphics/gui/mesh_fabrication/picking/hitRanking.js

const PICK_PRIORITY = Object.freeze({
    vertex: 0,
    edge: 1,
    face_center: 2,
    face: 3,
    pivot: 4
});

export function rankTopologyHits(hits) {
    const list = Array.isArray(hits) ? hits.filter(Boolean) : [];
    if (list.length < 1) return null;
    list.sort((a, b) => {
        const ak = String(a?.kind ?? '').trim().toLowerCase();
        const bk = String(b?.kind ?? '').trim().toLowerCase();
        const ap = PICK_PRIORITY[ak] ?? 99;
        const bp = PICK_PRIORITY[bk] ?? 99;
        if (ap !== bp) return ap - bp;
        const ad = Number(a?.distance ?? Number.POSITIVE_INFINITY);
        const bd = Number(b?.distance ?? Number.POSITIVE_INFINITY);
        if (ad !== bd) return ad - bd;
        const ai = String(a?.id ?? '');
        const bi = String(b?.id ?? '');
        return ai.localeCompare(bi);
    });
    return list[0] ?? null;
}
