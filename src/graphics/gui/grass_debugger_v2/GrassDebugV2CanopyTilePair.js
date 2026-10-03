// Keep geometry and sun-shadow continuations identical while varying the interior of two periodic tiles.
// @ts-check

export function grassCanopyShootBounds(mesh, shootIds, sun) {
    const position = mesh.geometry.attributes.position, index = mesh.geometry.index, groups = new Map();
    for (const [leaf, range] of mesh.userData.grassLeafRanges.entries()) {
        const id = shootIds[leaf];
        if (!groups.has(id)) groups.set(id, { id, vertices: new Set(), minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
        const group = groups.get(id);
        for (let i = range.start; i < range.start + range.count; i++) group.vertices.add(index.getX(i));
    }
    for (const group of groups.values()) for (const v of group.vertices) {
        const x = position.getX(v), y = position.getY(v), z = position.getZ(v);
        // Protect the entire projected shadow, including a caster whose root lies well inside the tile.
        const sx = x - y * sun[0] / sun[1], sz = z - y * sun[2] / sun[1];
        group.minX = Math.min(group.minX, x, sx); group.maxX = Math.max(group.maxX, x, sx);
        group.minZ = Math.min(group.minZ, z, sz); group.maxZ = Math.max(group.maxZ, z, sz);
    }
    return groups;
}

export function createGrassCanopyInteriorConstraint(mesh, { shootIds, periodMeters, sun, boundaryBandMeters = .08 }) {
    const groups = grassCanopyShootBounds(mesh, shootIds, sun), limit = periodMeters / 2 - boundaryBandMeters;
    const inside = (g, dx, dz) => g.minX + dx > -limit && g.maxX + dx < limit && g.minZ + dz > -limit && g.maxZ + dz < limit;
    const movable = new Set([...groups.values()].filter(g => inside(g, 0, 0)).map(g => g.id));
    return Object.freeze({
        canMove: (group, dx, dz) => movable.has(group.id) && inside(groups.get(group.id), dx, dz),
        movableShoots: movable.size, fixedShoots: groups.size - movable.size, boundaryBandMeters
    });
}

export function varyGrassCanopyInterior(mesh, options) {
    const { shootIds, sun } = options, groups = [...grassCanopyShootBounds(mesh, shootIds, sun).values()];
    const constraint = createGrassCanopyInteriorConstraint(mesh, options), position = mesh.geometry.attributes.position;
    const candidates = groups.filter(g => constraint.canMove(g, 0, 0));
    for (const group of candidates) {
        group.x = 0; group.z = 0; group.dx = 0; group.dz = 0;
        for (const v of group.vertices) { group.x += position.getX(v); group.z += position.getZ(v); }
        group.x /= group.vertices.size; group.z /= group.vertices.size;
    }
    let seed = 0x48c725b1, swaps = 0;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < candidates.length * 8; i++) {
        const a = candidates[Math.floor(random() * candidates.length)], b = candidates[Math.floor(random() * candidates.length)];
        if (a === b) continue;
        const dx = b.x + b.dx - a.x - a.dx, dz = b.z + b.dz - a.z - a.dz;
        if (!constraint.canMove(a, a.dx + dx, a.dz + dz) || !constraint.canMove(b, b.dx - dx, b.dz - dz)) continue;
        a.dx += dx; a.dz += dz; b.dx -= dx; b.dz -= dz; swaps++;
    }
    for (const group of candidates) for (const v of group.vertices)
        position.setXYZ(v, position.getX(v) + group.dx, position.getY(v), position.getZ(v) + group.dz);
    position.needsUpdate = true; mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere();
    return { algorithm: 'compatible-interior-swaps', swaps, movableShoots: candidates.length,
        fixedShoots: groups.length - candidates.length, boundaryBandMeters: constraint.boundaryBandMeters };
}

export function validateGrassCanopyPairBoundaries(meshes, { shootIds, periodMeters, sun, boundaryBandMeters = .08 }) {
    const [a, b] = meshes, limit = periodMeters / 2 - boundaryBandMeters;
    const bounds = meshes.map(mesh => grassCanopyShootBounds(mesh, shootIds, sun));
    let sharedShoots = 0, changedShoots = 0;
    for (const [id, first] of bounds[0]) {
        const second = bounds[1].get(id), edge = [first, second].some(g =>
            g.minX <= -limit || g.maxX >= limit || g.minZ <= -limit || g.maxZ >= limit);
        const same = [...first.vertices].every(v => [0, 1, 2].every(c =>
            a.geometry.attributes.position.array[v * 3 + c] === b.geometry.attributes.position.array[v * 3 + c]));
        if (edge && !same) throw new Error('LOD4 variants change shared boundary geometry or its shadow continuation.');
        if (same) sharedShoots++; else changedShoots++;
    }
    if (!changedShoots) throw new Error('LOD4 variants have identical interiors.');
    return { periodMeters, boundaryBandMeters, sharedShoots, changedShoots, shadowsProtected: true };
}
