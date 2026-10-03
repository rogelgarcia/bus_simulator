// Synchronizes touching tile edges while one balanced sibling group refines or coarsens.
// @ts-check

/** @param {Array<{id:string,level:number,bounds:any,morph:number}>} tiles @returns {ReadonlyArray<any>} */
export function computeLandscapeTileEdges(tiles) {
    if (!Array.isArray(tiles) || tiles.some(tile => !Number.isFinite(tile.morph) || tile.morph < 0 || tile.morph > 1)) throw new Error('Terrain edges require bounded morph amounts');
    return Object.freeze(tiles.map(tile => {
        const a = tile.bounds, coarser = [0, 0, 0, 0], morph = [1, 1, 1, 1];
        for (const neighbor of tiles) {
            if (neighbor.id === tile.id) continue;
            const b = neighbor.bounds;
            const touching = [];
            if (Math.min(a.maxZ, b.maxZ) > Math.max(a.minZ, b.minZ)) {
                if (a.minX === b.maxX) touching.push(0);
                if (a.maxX === b.minX) touching.push(1);
            }
            if (Math.min(a.maxX, b.maxX) > Math.max(a.minX, b.minX)) {
                if (a.minZ === b.maxZ) touching.push(2);
                if (a.maxZ === b.minZ) touching.push(3);
            }
            if (touching.length && Math.abs(tile.level - neighbor.level) > 1) throw new Error(`Unbalanced rendered terrain edge ${tile.id}/${neighbor.id}`);
            for (const edge of touching) {
                if (neighbor.level < tile.level) coarser[edge] = 1;
                if (neighbor.level === tile.level) morph[edge] = Math.min(morph[edge], neighbor.morph);
            }
        }
        return Object.freeze({ id: tile.id, coarser: Object.freeze(coarser), morph: Object.freeze(morph) });
    }));
}

/** @param {any} buffers @param {Float32Array} heights @param {{morph:number,coarser:number[],edgeMorph:number[]}} state @param {()=>any} read @returns {any} */
export function withLandscapeMorphedPositions(buffers, heights, state, read) {
    if (!(heights instanceof Float32Array) || heights.length !== buffers.descriptor.columns * buffers.descriptor.rows || typeof read !== 'function') throw new Error('Morphed terrain picking requires the authoritative tile heights and a synchronous reader');
    const { positions, parentHeights, boundaryPositions, skirtDepth } = buffers;
    const { bounds } = buffers.descriptor;
    const minX = Math.fround(bounds.minX), maxX = Math.fround(bounds.maxX), minZ = Math.fround(bounds.minZ), maxZ = Math.fround(bounds.maxZ);
    const originalHeight = index => index < heights.length ? heights[index] : boundaryPositions[(index - heights.length) * 3 + 1] - skirtDepth;
    try {
        for (let i = 0; i < parentHeights.length; i++) {
            let morph = state.morph;
            const x = positions[i * 3], z = positions[i * 3 + 2];
            if (Math.abs(x - minX) < .002) morph = state.coarser[0] ? 0 : Math.min(morph, state.edgeMorph[0]);
            if (Math.abs(x - maxX) < .002) morph = state.coarser[1] ? 0 : Math.min(morph, state.edgeMorph[1]);
            if (Math.abs(z - minZ) < .002) morph = state.coarser[2] ? 0 : Math.min(morph, state.edgeMorph[2]);
            if (Math.abs(z - maxZ) < .002) morph = state.coarser[3] ? 0 : Math.min(morph, state.edgeMorph[3]);
            positions[i * 3 + 1] = parentHeights[i] + (originalHeight(i) - parentHeights[i]) * morph;
        }
        return read();
    } finally {
        for (let i = 0; i < parentHeights.length; i++) positions[i * 3 + 1] = originalHeight(i);
    }
}
