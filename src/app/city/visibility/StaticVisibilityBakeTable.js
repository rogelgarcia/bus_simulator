// Pure helpers shared by the offline baker and deterministic tests.
// @ts-check

export function expandStaticVisibilityNeighborMasks({
    source,
    width,
    height,
    directionCount,
    wordsPerMask,
    radius = 1
} = {}) {
    if (!(source instanceof Uint32Array)) throw new Error('Static visibility neighbor expansion requires a Uint32Array');
    if (![width, height, directionCount, wordsPerMask].every((value) => Number.isInteger(value) && value > 0)) {
        throw new Error('Static visibility neighbor expansion shape is invalid');
    }
    const expectedWords = width * height * directionCount * wordsPerMask;
    if (source.length !== expectedWords) throw new Error('Static visibility neighbor expansion length mismatch');
    const safeRadius = Math.max(0, Math.floor(Number(radius) || 0));
    const output = new Uint32Array(source.length);
    const offset = (cellIndex, directionIndex) => (cellIndex * directionCount + directionIndex) * wordsPerMask;

    for (let cellY = 0; cellY < height; cellY += 1) {
        for (let cellX = 0; cellX < width; cellX += 1) {
            const destinationCell = cellX + cellY * width;
            for (let directionIndex = 0; directionIndex < directionCount; directionIndex += 1) {
                const destination = offset(destinationCell, directionIndex);
                for (let dy = -safeRadius; dy <= safeRadius; dy += 1) {
                    for (let dx = -safeRadius; dx <= safeRadius; dx += 1) {
                        const sourceX = cellX + dx;
                        const sourceY = cellY + dy;
                        if (sourceX < 0 || sourceY < 0 || sourceX >= width || sourceY >= height) continue;
                        const sourceOffset = offset(sourceX + sourceY * width, directionIndex);
                        for (let word = 0; word < wordsPerMask; word += 1) {
                            output[destination + word] |= source[sourceOffset + word];
                        }
                    }
                }
            }
        }
    }
    return output;
}
