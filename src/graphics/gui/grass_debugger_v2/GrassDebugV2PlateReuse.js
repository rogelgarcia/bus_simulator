// Pair plates with equal direction and leaf count; reuse one capture without changing population counts.
// @ts-check
/** @param {readonly {id:number,direction:number,leafIds:number[],contentWidth:number,left:number,front:number}[]} plates */
export function createGrassDebugV2PlateReuse(plates) {
    const buckets = new Map(), captures = [], captureIndices = new Uint32Array(plates.length);
    for (const plate of plates) {
        const key = plate.direction + ':' + plate.leafIds.length;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(plate);
    }
    for (const bucket of buckets.values()) {
        bucket.sort((a, b) => a.contentWidth - b.contentWidth || a.front - b.front || a.left - b.left);
        for (let i = 0; i < bucket.length; i += 2) {
            const pair = bucket.slice(i, i + 2);
            const source = pair[Math.floor(i / 2) % pair.length];
            for (const plate of pair) captureIndices[plate.id] = captures.length;
            captures.push(source);
        }
    }
    return Object.freeze({ captures: Object.freeze(captures), captureIndices });
}
