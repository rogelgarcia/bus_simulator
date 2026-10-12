// Adapt final city hardscape and slab contours to the shared filtered grass boundary.
// @ts-check
import { createGrassBoundaryMask } from './GrassBoundaryMask.js';

/** @param {{size:number,roadPolygons:object[][],roadMargin:number,roadBoundaryLoops?:object[][],buildingFootprints:object[][][],slabFootprints?:object[][]}} options */
export function createGrassCoverageMask({ size, roadPolygons, roadMargin, roadBoundaryLoops = [], buildingFootprints, slabFootprints = [] }) {
    if (!(size > 0) || !Number.isFinite(size)) throw new Error('[Grass] Invalid city ground size.');
    const resolution = Math.min(4096, Math.max(64, 2 ** Math.ceil(Math.log2(size * 8)))), texel = size / resolution, half = size / 2;
    const boundary = createGrassBoundaryMask({ bounds: { minX: -half, minZ: -half, maxX: half, maxZ: half }, resolution,
        outline: [[-half, -half], [half, -half], [half, half], [-half, half]].map(([x, z]) => ({ x, z })),
        exclusions: roadBoundaryLoops,
        exclusionGroups: [
            ...(roadBoundaryLoops.length ? [] : roadPolygons.map(loop => ({ loops: [loop], margin: roadMargin + texel }))),
            ...buildingFootprints.map(loops => ({ loops, margin: .1 + texel })),
            ...slabFootprints.map(loop => ({ loops: [loop], margin: texel }))
        ] });
    return Object.freeze({ ...boundary, size, sample: (x, z) => boundary.sample(x, z) >= .5 });
}
