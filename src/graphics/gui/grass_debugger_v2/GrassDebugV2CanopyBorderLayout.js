// Partition the exact perimeter leaves into fixed two-metre cards, one-metre cards and geometric remainders.
// @ts-check

/** @typedef {{id:number,rootX:number,rootZ:number,minX:number,maxX:number,minZ:number,maxZ:number}} BorderLeaf */

/** @param {{width:number,depth:number,leaves:readonly BorderLeaf[],edgeWidth?:number}} options */
export function createGrassDebugV2CanopyBorderLayout({ width, depth, leaves, edgeWidth = .1 }) {
    if (!(width > 2 * edgeWidth && depth > 2 * edgeWidth) || !(edgeWidth > 0)
        || new Set(leaves.map(leaf => leaf.id)).size !== leaves.length
        || leaves.some(leaf => !Number.isInteger(leaf.id) || leaf.id < 0
            || ![leaf.rootX, leaf.rootZ, leaf.minX, leaf.maxX, leaf.minZ, leaf.maxZ].every(Number.isFinite)
            || leaf.minX > leaf.maxX || leaf.minZ > leaf.maxZ))
        throw new Error('Canopy borders require finite leaf bounds, unique leaf ids and positive field dimensions.');
    const sides = [
        { name: 'north', half: width / 2, front: depth / 2 - edgeWidth / 2, nx: 0, nz: 1, rx: 1, rz: 0 },
        { name: 'east', half: depth / 2, front: width / 2 - edgeWidth / 2, nx: 1, nz: 0, rx: 0, rz: -1 },
        { name: 'south', half: width / 2, front: depth / 2 - edgeWidth / 2, nx: 0, nz: -1, rx: -1, rz: 0 },
        { name: 'west', half: depth / 2, front: width / 2 - edgeWidth / 2, nx: -1, nz: 0, rx: 0, rz: 1 }
    ];
    const segments = sides.map(side => {
        let left = -side.half + edgeWidth, remaining = 2 * side.half - 2 * edgeWidth;
        const cards = [];
        for (const cardWidth of [2, 1]) while (remaining >= cardWidth - 1e-9) {
            cards.push({ ...side, left, width: cardWidth, leafIds: [] });
            left += cardWidth; remaining -= cardWidth;
        }
        return cards;
    });
    const fallback = [];
    for (const leaf of leaves) {
        const onX = Math.abs(leaf.rootX) >= width / 2 - edgeWidth;
        const onZ = Math.abs(leaf.rootZ) >= depth / 2 - edgeWidth;
        if (onX === onZ) { fallback.push(leaf.id); continue; }
        const sideIndex = onZ ? (leaf.rootZ >= 0 ? 0 : 2) : (leaf.rootX >= 0 ? 1 : 3);
        const side = sides[sideIndex];
        const low = side.rx === 1 ? leaf.minX : side.rx === -1 ? -leaf.maxX : side.rz === 1 ? leaf.minZ : -leaf.maxZ;
        const high = side.rx === 1 ? leaf.maxX : side.rx === -1 ? -leaf.minX : side.rz === 1 ? leaf.maxZ : -leaf.minZ;
        const card = segments[sideIndex].find(candidate => low >= candidate.left + .002 && high <= candidate.left + candidate.width - .002);
        if (card) card.leafIds.push(leaf.id);
        else fallback.push(leaf.id);
    }
    const cards = [];
    for (const card of segments.flat()) {
        if (card.leafIds.length < 2) fallback.push(...card.leafIds);
        else cards.push(Object.freeze({ ...card, id: cards.length, leafIds: Object.freeze(card.leafIds) }));
    }
    fallback.sort((a, b) => a - b);
    return Object.freeze({ cards: Object.freeze(cards), fallback: Object.freeze(fallback), leaves: leaves.length,
        cardLeaves: cards.reduce((sum, card) => sum + card.leafIds.length, 0),
        largeCards: cards.filter(card => card.width === 2).length, smallCards: cards.filter(card => card.width === 1).length });
}
