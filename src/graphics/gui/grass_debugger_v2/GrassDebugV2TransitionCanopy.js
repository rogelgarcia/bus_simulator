// Cache watertight canopy edge/corner geometry; diagonal grass cells must lower the shared corner too.
// @ts-check
import * as THREE from 'three';

const CORNERS = Object.freeze([[1, 4, -1, -1], [2, 4, 1, -1], [1, 8, -1, 1], [2, 8, 1, 1]]);

/** @param {object} cell @param {Uint8Array} levels @param {number} size */
export function grassTransitionCanopyProfile(cell, levels, size) {
    const open = (dx, dz) => cell.x + dx >= 0 && cell.x + dx < size && cell.z + dz >= 0 && cell.z + dz < size
        && levels[cell.id + dx + dz * size] < 4;
    const edges = cell.edge | (open(-1, 0) ? 1 : 0) | (open(1, 0) ? 2 : 0) | (open(0, -1) ? 4 : 0) | (open(0, 1) ? 8 : 0);
    const corners = CORNERS.reduce((mask, [xSide, zSide, dx, dz], i) => mask | (!(edges & (xSide | zSide)) && open(dx, dz) ? 1 << i : 0), 0);
    return edges | (corners << 4) | (cell.edge << 8);
}

/** @param {number} profile @param {{height:number,ramp:number}} shape */
export function createGrassTransitionCanopyGeometry(profile, { height, ramp }) {
    if (!Number.isInteger(profile) || profile < 0 || profile > 4095 || !(height > 0 && ramp > 0 && ramp < .5))
        throw new Error('Canopy geometry requires an edge/corner profile and a positive sub-cell ramp.');
    const edges = profile & 15, corners = (profile >> 4) & 15, boundary = profile >> 8;
    let divisions = edges;
    CORNERS.forEach(([xSide, zSide], i) => { if (corners & (1 << i)) divisions |= xSide | zSide; });
    const xs = [-.5, ...(divisions & 1 ? [-.5 + ramp] : []), ...(divisions & 2 ? [.5 - ramp] : []), .5];
    const zs = [-.5, ...(divisions & 4 ? [-.5 + ramp] : []), ...(divisions & 8 ? [.5 - ramp] : []), .5];
    const positions = [], normals = [], uvs = [], indices = [];
    for (const z of zs) for (const x of xs) {
        const insets = [x + .5, .5 - x, z + .5, .5 - z];
        let y = height;
        const lower = (distance, floor) => {
            const t = Math.min(1, distance / ramp);
            y = Math.min(y, floor + (height - floor) * t * t * (3 - 2 * t));
        };
        insets.forEach((distance, i) => { if (edges & (1 << i)) lower(distance, boundary & (1 << i) ? 0 : .005); });
        CORNERS.forEach(([, , dx, dz], i) => {
            if (corners & (1 << i)) lower(Math.hypot(dx < 0 ? x + .5 : .5 - x, dz < 0 ? z + .5 : .5 - z), .005);
        });
        positions.push(x, y, z); normals.push(0, 1, 0); uvs.push(x + .5, .5 - z);
    }
    for (let z = 0; z < zs.length - 1; z++) for (let x = 0; x < xs.length - 1; x++) {
        const a = z * xs.length + x, b = a + xs.length;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return geometry;
}
