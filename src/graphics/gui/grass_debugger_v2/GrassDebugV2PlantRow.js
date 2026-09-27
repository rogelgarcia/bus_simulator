// Paired source leaves share a straight root line for one reusable card atlas; the historical default is ten pairs.
// Tangent-matched collar heights remove the join crease without moving the blade ribs sideways.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2Plant, GRASS_V2_PLANT } from './GrassDebugV2Plant.js';
import { resolveGrassDebugV2LeafContact } from './GrassDebugV2LeafContact.js';

export const GRASS_V2_PLANT_ROW = Object.freeze({ pairs: 10, spacingMeters: 0.044 });

const SAME_SIDE_PAIR = Object.freeze({ spacingMeters: 0.052, openingHeightMeters: 0.010,
    heightOffsetMeters: 0.00035, fanDegrees: 5.6, innerSheathRadiusMeters: 0.00215, outerSheathRadiusMeters: 0.00230 });

function makeSeparatedLeaf(source, sign) {
    const geometry = source.clone(), p = geometry.attributes.position;
    const stride = GRASS_V2_PLANT.acrossSegments + 1, rootDepth = GRASS_V2_PLANT.rootDepthMeters;
    const fan = Math.tan(THREE.MathUtils.degToRad(SAME_SIDE_PAIR.fanDegrees));
    for (let start = 0; start < p.count; start += stride) {
        const count = Math.min(stride, p.count - start), center = start + Math.floor(count / 2);
        const rise = Math.max(0, p.getY(center) + rootDepth);
        const t = geometry.attributes.uv.getY(center);
        // Keep the closed sheaths concentric; open sideways only as they unroll.
        const peel = THREE.MathUtils.smootherstep(t, 0.025, 0.07);
        const opening = -Math.expm1(-rise / SAME_SIDE_PAIR.openingHeightMeters) * peel;
        const rootBlend = 1 - THREE.MathUtils.smootherstep(t, 0, GRASS_V2_PLANT.collarJoin);
        const radius = sign < 0 ? SAME_SIDE_PAIR.innerSheathRadiusMeters : SAME_SIDE_PAIR.outerSheathRadiusMeters;
        const radialScale = 1 + (radius / GRASS_V2_PLANT.leaves[0].sheathRadius - 1) * rootBlend;
        const separation = Math.max(0, p.getZ(center)) * fan * opening;
        for (let i = start; i < start + count; i++)
            p.setXYZ(i, p.getX(i) * radialScale + sign * separation,
                p.getY(i) - (sign > 0 ? SAME_SIDE_PAIR.heightOffsetMeters * opening : 0), p.getZ(i) * radialScale);
    }
    const start = (GRASS_V2_PLANT.sheathSegments + GRASS_V2_PLANT.collarSegments / 2) * stride;
    let end = start; while (geometry.attributes.uv.getY(end) < 0.15) end += stride;
    for (let side = 0; side < stride; side++) {
        const a = start + side, b = end + side, span = p.getZ(b) - p.getZ(a);
        const slope = i => (p.getY(i + stride) - p.getY(i - stride)) / (p.getZ(i + stride) - p.getZ(i - stride));
        const y0 = p.getY(a), y1 = p.getY(b), c0 = y0 + slope(a) * span / 3, c1 = y1 - slope(b) * span / 3;
        for (let i = a + stride; i < b; i += stride) {
            const u = (p.getZ(i) - p.getZ(a)) / span, v = 1 - u;
            p.setY(i, v * v * v * y0 + 3 * v * v * u * c0 + 3 * v * u * u * c1 + u * u * u * y1);
        }
    }
    geometry.computeVertexNormals();
    const facing = geometry.attributes.grassFacingNormal, normal = new THREE.Vector3();
    for (let start = 0; start < p.count; start += stride) {
        const count = Math.min(stride, p.count - start);
        normal.fromBufferAttribute(geometry.attributes.normal, start + Math.floor(count / 2));
        for (let i = start; i < start + count; i++) facing.setXYZ(i, normal.x, normal.y, normal.z);
    }
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return geometry;
}

/** @param {{material: THREE.MeshStandardMaterial, pairs?: number, sameSide?: boolean}} options */
export function createGrassDebugV2PlantRow({ material, pairs = GRASS_V2_PLANT_ROW.pairs, sameSide = false }) {
    if (!Number.isInteger(pairs) || pairs < 1) throw new Error('Plant row requires a positive pair count.');
    const bodySegments = sameSide ? 96 : 32;
    const source = createGrassDebugV2Plant({ material, bodySegments });
    const pairLeaves = sameSide ? [-1, 1].map(sign => {
        const mesh = source.leaves[0].clone();
        mesh.geometry = makeSeparatedLeaf(mesh.geometry, sign);
        return mesh;
    }) : source.leaves;
    const contact = sameSide ? resolveGrassDebugV2LeafContact({ upper: pairLeaves[0].geometry, lower: pairLeaves[1].geometry, minimumHeightMeters: 0.004, blendRadiusMeters: 0.004 }) : null;
    const group = new THREE.Group(); group.name = 'GrassV2TwentyLeafRow';
    const leaves = [], crowns = [], roots = [];
    const { spacingMeters } = sameSide ? SAME_SIDE_PAIR : GRASS_V2_PLANT_ROW;
    for (let i = 0; i < pairs; i++) {
        const x = (i - (pairs - 1) / 2) * spacingMeters;
        roots.push(x);
        for (const leaf of pairLeaves) {
            const mesh = leaf.clone(); mesh.position.x = x;
            group.add(mesh); leaves.push(mesh);
        }
        const crown = source.crown.clone(); crown.position.x = x;
        if (sameSide) crown.scale.set(1.9, 1, 1.9);
        group.add(crown); crowns.push(crown);
    }
    const sourceSnapshot = source.getSnapshot();
    return Object.freeze({ group, leaves: Object.freeze(leaves), crowns: Object.freeze(crowns), roots: Object.freeze(roots),
        getSnapshot: () => {
            const bounds = new THREE.Box3().setFromObject(group);
            return { definition: { ...GRASS_V2_PLANT_ROW, pairs, sameSide, spacingMeters, bodySegments, ...(sameSide ? { separation: SAME_SIDE_PAIR } : {}) }, specimens: pairs, leaves: leaves.length, contact,
            leafTriangles: sourceSnapshot.leafTriangles * pairs, crownTriangles: sourceSnapshot.crownTriangles * pairs,
            roots, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } };
        },
        dispose: () => { if (sameSide) pairLeaves.forEach(leaf => leaf.geometry.dispose()); source.dispose(); }
    });
}
