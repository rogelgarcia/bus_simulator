// Cache conservative world-grid occupancy once, independently of the moving camera.
// @ts-check

/** @param {{minX:number,minZ:number,maxX:number,maxZ:number}} bounds @param {number} size @param {object} coverage */
export function createGrassPatchGrid(bounds, size, coverage) {
    const minX = Math.floor(bounds.minX / size), minZ = Math.floor(bounds.minZ / size);
    const columns = Math.ceil(bounds.maxX / size) - minX, rows = Math.ceil(bounds.maxZ / size) - minZ;
    const occupied = new Uint8Array(columns * rows);
    let count = 0;
    for (let z = 0; z < rows; z++) for (let x = 0; x < columns; x++) {
        let intersects = false;
        for (let dz = .5; dz < size && !intersects; dz++) for (let dx = .5; dx < size; dx++) {
            if (coverage.intersectsCell((x + minX) * size + dx, (z + minZ) * size + dz)) { intersects = true; break; }
        }
        occupied[z * columns + x] = Number(intersects); count += Number(intersects);
    }
    return Object.freeze({ minX, minZ, columns, rows, occupied, count, size });
}
