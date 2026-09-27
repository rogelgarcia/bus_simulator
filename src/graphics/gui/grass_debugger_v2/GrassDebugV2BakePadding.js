// Extend captured grass RGB through transparent texels without changing alpha coverage.
// @ts-check
import * as THREE from 'three';

/**
 * @param {Uint8Array} pixels
 * @param {number} width
 * @param {number} height
 * @param {boolean} normal
 * @param {((pixels:Uint8Array)=>void)|null} process
 */
export function extendGrassBakeColors(pixels, width, height, normal, process = null) {
    // Undo coverage-weighted MSAA RGB, then extend edge colors without extending alpha.
    const valid = new Uint8Array(width * height);
    for (let i = 0; i < valid.length; i++) {
        const o = i * 4, alpha = pixels[o + 3] / 255;
        if (!alpha) continue;
        valid[i] = 1;
        for (let c = 0; c < 3; c++) pixels[o + c] = Math.min(255, Math.round(pixels[o + c] / alpha));
        if (normal) {
            const n = new THREE.Vector3().fromArray(pixels, o).multiplyScalar(2 / 255).subScalar(1).normalize();
            for (let c = 0; c < 3; c++) pixels[o + c] = Math.round((n.getComponent(c) * 0.5 + 0.5) * 255);
        }
    }
    process?.(pixels);
    // Full-page RGB dilation keeps wide mip/aniso footprints away from black; alpha stays untouched.
    const queue = new Int32Array(valid.length);
    let head = 0, tail = 0;
    for (let i = 0; i < valid.length; i++) if (valid[i]) queue[tail++] = i;
    while (head < tail) {
        const i = queue[head++], x = i % width;
        for (const neighbor of [x > 0 ? i - 1 : -1, x + 1 < width ? i + 1 : -1, i - width, i + width])
            if (neighbor >= 0 && neighbor < valid.length && !valid[neighbor]) {
                pixels.set(pixels.subarray(i * 4, i * 4 + 3), neighbor * 4); valid[neighbor] = 1; queue[tail++] = neighbor;
            }
    }
}
