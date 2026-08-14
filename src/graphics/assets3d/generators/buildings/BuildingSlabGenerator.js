// src/graphics/assets3d/generators/buildings/BuildingSlabGenerator.js
// Builds foundation slab meshes under buildings from building slab plans.
import * as THREE from 'three';
import { planBuildingSlabs } from '../../../../app/city/BuildingSlabPlan.js';

const UV_METERS_PER_TILE = 2.0;

function pushPoint(positions, uvs, point, y) {
    positions.push(point.x, y, point.z);
    uvs.push(point.x / UV_METERS_PER_TILE, point.z / UV_METERS_PER_TILE);
}

function dedupeLoop(points) {
    const out = [];
    for (const p of points) {
        const prev = out[out.length - 1] ?? null;
        if (prev && Math.hypot(prev.x - p.x, prev.z - p.z) < 1e-4) continue;
        out.push(p);
    }
    while (out.length > 1) {
        const first = out[0];
        const last = out[out.length - 1];
        if (Math.hypot(first.x - last.x, first.z - last.z) < 1e-4) out.pop();
        else break;
    }
    return out;
}

/**
 * Creates one slab mesh from a plan produced by BuildingSlabPlan.
 * `plan.top` and `plan.foot` are equal-length loop-ordered point lists;
 * consecutive pairs form skirt quads (corner duplicates degenerate into the
 * triangles that fill mode-change corners).
 * @param {object} input
 * @param {{top:{x:number,z:number}[], foot:{x:number,z:number}[]}} input.plan
 * @param {number} input.topY slab walking surface height
 * @param {number} input.groundY surrounding terrain height
 * @param {THREE.Material} input.material shared sidewalk material
 * @returns {THREE.Mesh|null}
 */
export function createBuildingSlabMesh({ plan, topY, groundY, material }) {
    const topPoints = Array.isArray(plan?.top) ? plan.top : [];
    const footPoints = Array.isArray(plan?.foot) ? plan.foot : [];
    if (topPoints.length < 3 || topPoints.length !== footPoints.length) return null;

    const top = Number.isFinite(topY) ? topY : 0;
    const ground = Number.isFinite(groundY) ? Math.min(groundY, top) : top;

    const positions = [];
    const uvs = [];
    const indices = [];

    // Top surface from the deduplicated outline. ShapeUtils works in 2D; the
    // direct (x, z) mapping yields downward faces, so triangles are flipped.
    const topLoop = dedupeLoop(topPoints);
    if (topLoop.length < 3) return null;
    const contour = topLoop.map((p) => new THREE.Vector2(p.x, p.z));
    const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
    for (const p of topLoop) pushPoint(positions, uvs, p, top);
    for (const tri of triangles) {
        indices.push(tri[0], tri[2], tri[1]);
    }

    // Skirt: one quad per consecutive top/foot pair. Connected edges are
    // vertical (foot == top), beveled edges slope outward to their foot.
    const n = topPoints.length;
    for (let i = 0; i < n; i++) {
        const a = topPoints[i];
        const b = topPoints[(i + 1) % n];
        const fa = footPoints[i];
        const fb = footPoints[(i + 1) % n];

        const degenerateTop = Math.hypot(a.x - b.x, a.z - b.z) < 1e-6;
        const degenerateFoot = Math.hypot(fa.x - fb.x, fa.z - fb.z) < 1e-6;
        if (degenerateTop && degenerateFoot) continue;

        const base = positions.length / 3;
        pushPoint(positions, uvs, a, top);
        pushPoint(positions, uvs, b, top);
        pushPoint(positions, uvs, fb, ground);
        pushPoint(positions, uvs, fa, ground);
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    const mesh = new THREE.Mesh(geo, material);
    mesh.name = 'BuildingSlab';
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.userData = mesh.userData ?? {};
    mesh.userData.buildingSlabPlan = plan;
    return mesh;
}

/**
 * Plans and creates the slab meshes for all buildings at once so overlapping
 * slabs merge into shared geometry (slab-to-slab only; sidewalks stay their
 * own geometry and slabs simply end on their boundary).
 * @param {object} input
 * @param {{x:number,z:number}[][]} input.footprintLoops one outer loop per building
 * @param {{x:number,z:number}[][]} input.sidewalkBoundaries sidewalk outer boundary loops
 * @param {number} input.topY
 * @param {number} input.groundY
 * @param {THREE.Material} input.material
 * @returns {THREE.Mesh[]}
 */
export function createBuildingSlabMeshes({
    footprintLoops,
    sidewalkBoundaries,
    topY,
    groundY,
    material
}) {
    const plans = planBuildingSlabs({ footprintLoops, sidewalkBoundaries });
    const meshes = [];
    for (const plan of plans) {
        const mesh = createBuildingSlabMesh({ plan, topY, groundY, material });
        if (mesh) meshes.push(mesh);
    }
    return meshes;
}
