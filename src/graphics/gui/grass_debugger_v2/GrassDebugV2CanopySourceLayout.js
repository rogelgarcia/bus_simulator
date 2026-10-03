// Redistribute the bake's paired shoots on a torus without changing leaf shapes or materials.
// @ts-check

/** @param {import('three').Mesh} mesh @param {{periodMeters:number,shootIds:number[],seed?:number}} options */
export function redistributeGrassDebugV2CanopySource(mesh, { periodMeters, shootIds, seed = 0x6d2b79f5 }) {
    const ranges = mesh.userData.grassLeafRanges, position = mesh.geometry.attributes.position, index = mesh.geometry.index;
    if (!(periodMeters > 0) || !Number.isFinite(periodMeters) || !Number.isInteger(seed)
        || !ranges?.length || shootIds.length !== ranges.length || !shootIds.every(Number.isInteger))
        throw new Error('Canopy layout requires a periodic tile and a shoot id for every leaf.');
    const grouped = new Map();
    for (const [leaf, range] of ranges.entries()) {
        const id = shootIds[leaf];
        if (!grouped.has(id)) grouped.set(id, { vertices: new Set(), x: 0, z: 0, area: 0 });
        const group = grouped.get(id);
        for (let i = range.start; i < range.start + range.count; i += 3) {
            const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
            group.vertices.add(a); group.vertices.add(b); group.vertices.add(c);
            const area = Math.abs((position.getX(b) - position.getX(a)) * (position.getZ(c) - position.getZ(a))
                - (position.getZ(b) - position.getZ(a)) * (position.getX(c) - position.getX(a))) * .5;
            group.x += area * (position.getX(a) + position.getX(b) + position.getX(c)) / 3;
            group.z += area * (position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3;
            group.area += area;
        }
    }
    const groups = [...grouped.values()], meanArea = groups.reduce((sum, group) => sum + group.area, 0) / groups.length;
    for (const group of groups) {
        if (group.area <= 0) throw new Error('Canopy source shoot has no projected area.');
        group.x /= group.area; group.z /= group.area;
        group.radius = Math.sqrt(Math.max(group.area, meanArea * .25));
    }
    let state = seed >>> 0;
    const random = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
    for (let i = groups.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1)); [groups[i], groups[j]] = [groups[j], groups[i]];
    }
    const placed = [], candidates = 32;
    for (const group of groups) {
        let best = null;
        for (let candidate = 0; candidate < candidates; candidate++) {
            const x = random() * periodMeters, z = random() * periodMeters;
            let score = Infinity;
            for (const other of placed) {
                const dx = Math.abs(x - other.x), dz = Math.abs(z - other.z), radius = group.radius + other.radius;
                const distance = (Math.min(dx, periodMeters - dx) ** 2 + Math.min(dz, periodMeters - dz) ** 2) / (radius * radius);
                score = Math.min(score, distance);
            }
            if (!best || score > best.score) best = { x, z, score, radius: group.radius };
        }
        const dx = best.x - periodMeters / 2 - group.x, dz = best.z - periodMeters / 2 - group.z;
        for (const vertex of group.vertices)
            position.setXYZ(vertex, position.getX(vertex) + dx, position.getY(vertex), position.getZ(vertex) + dz);
        placed.push(best);
    }
    position.needsUpdate = true; mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere();
    return Object.freeze({ algorithm: 'periodic-best-candidate', periodMeters, seed, candidates, shoots: groups.length, leaves: ranges.length });
}
