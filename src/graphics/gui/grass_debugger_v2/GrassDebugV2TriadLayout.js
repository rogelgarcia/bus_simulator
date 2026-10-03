// Fixed three-axis card groups assign roots once; boundary and sparse groups retain LOD2 leaves.
// @ts-check
export const GRASS_TRIAD_LAYOUT = Object.freeze({
    widthMeters: .2, smallWidthMeters: .1, depthMeters: .1, centerSpacingMeters: .1,
    textureVariants: 10, cardsPerTriad: 3, maximumRotationDegrees: 5
});
const ANGLES = Object.freeze([0, Math.PI / 3, Math.PI * 2 / 3]);

/** @param {number} yaw @returns {number[]} */
export function getGrassTriadTurns(yaw) {
    if (!Number.isFinite(yaw)) throw new Error('Triad camera yaw must be finite.');
    const limit = GRASS_TRIAD_LAYOUT.maximumRotationDegrees * Math.PI / 180;
    return ANGLES.map(angle => limit * Math.sin(2 * (yaw - angle)));
}

/** @param {{bounds:{minX:number,maxX:number,minZ:number,maxZ:number},roots:readonly {x:number,z:number,nx?:number,nz?:number}[],inset?:number}} options */
export function createGrassDebugV2TriadLayout({ bounds, roots, inset = 0 }) {
    const inner = { minX: bounds.minX + inset, maxX: bounds.maxX - inset, minZ: bounds.minZ + inset, maxZ: bounds.maxZ - inset };
    if (![...Object.values(bounds), inset].every(Number.isFinite) || inset < 0 || inner.minX >= inner.maxX || inner.minZ >= inner.maxZ)
        throw new Error('Triad bounds must define a nonempty finite rectangle.');
    const spacing = GRASS_TRIAD_LAYOUT.centerSpacingMeters, halfDepth = GRASS_TRIAD_LAYOUT.depthMeters / 2;
    const groups = new Map(), fallback = [], assignments = new Int32Array(roots.length).fill(-1);
    const fits = (x, z, angle, width) => {
        const limit = GRASS_TRIAD_LAYOUT.maximumRotationDegrees * Math.PI / 180;
        const candidates = [angle - limit, angle + limit];
        for (let k = -2; k <= 2; k++) if (k * Math.PI / 2 >= angle - limit && k * Math.PI / 2 <= angle + limit) candidates.push(k * Math.PI / 2);
        return candidates.every(a => Math.abs(Math.cos(a)) * width / 2 <= Math.min(x - inner.minX, inner.maxX - x) + 1e-8
            && Math.abs(Math.sin(a)) * width / 2 <= Math.min(z - inner.minZ, inner.maxZ - z) + 1e-8);
    };
    for (let id = 0; id < roots.length; id++) {
        const root = roots[id], gx = Math.floor((root.x - bounds.minX) / spacing), gz = Math.floor((root.z - bounds.minZ) / spacing);
        const key = gx + ':' + gz;
        let group = groups.get(key);
        if (!group) {
            const x = bounds.minX + (gx + .5) * spacing, z = bounds.minZ + (gz + .5) * spacing;
            group = { id: groups.size, x, z, cards: ANGLES.map((angle, axis) => {
                const width = fits(x, z, angle, .2) ? .2 : fits(x, z, angle, .1) ? .1 : 0;
                return { x, z, angle, axis, width, small: width === .1, leafIds: [], groupId: groups.size };
            }) };
            groups.set(key, group);
        }
        let selected = null, score = -Infinity;
        for (const card of group.cards) {
            if (!card.width) continue;
            const sine = Math.sin(card.angle), cosine = Math.cos(card.angle), dx = root.x - card.x, dz = root.z - card.z;
            const u = cosine * dx - sine * dz, depth = sine * dx + cosine * dz;
            if (Math.abs(u) > card.width / 2 || Math.abs(depth) > halfDepth + 1e-8) continue;
            const facing = Math.abs(sine * (root.nx ?? 0) + cosine * (root.nz ?? 1));
            if (facing > score) { score = facing; selected = card; }
        }
        if (selected && root.x >= inner.minX && root.x <= inner.maxX && root.z >= inner.minZ && root.z <= inner.maxZ) selected.leafIds.push(id);
        else fallback.push(id);
    }
    const plates = [];
    for (const group of groups.values()) for (const card of group.cards) {
        if (card.leafIds.length < 2) fallback.push(...card.leafIds);
        else {
            const id = plates.length; plates.push({ ...card, id });
            for (const leaf of card.leafIds) assignments[leaf] = id;
        }
    }
    return Object.freeze({ plates, fallback, assignments, inner, triads: new Set(plates.map(p => p.groupId)).size });
}
