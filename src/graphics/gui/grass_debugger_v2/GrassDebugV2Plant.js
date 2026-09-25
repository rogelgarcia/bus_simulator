// Two low leaves share a compact crown, with continuous sheath-to-blade surfaces for LOD authoring.
// Inspired by the_grass.html's nested sheaths; the reviewed blade curve, rounded tip and colors remain shared.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2DetailedBladeSampler } from './GrassDebugV2DetailedBlade.js';
import { sampleGrassDebugV2BladeColor } from './GrassDebugV2Blade.js';

export const GRASS_V2_PLANT = Object.freeze({
    acrossSegments: 32, sheathSegments: 8, collarSegments: 20, collarJoin: 0.07,
    rootDepthMeters: 0.006,
    leaves: Object.freeze([
        Object.freeze({ azimuthDegrees: -4, elevationDegrees: 8, lengthScale: 1, widthScale: 1, liftMeters: 0.009, sheathRadius: 0.00145, sheathTop: 0.002 }),
        Object.freeze({ azimuthDegrees: 168, elevationDegrees: 10, lengthScale: 0.88, widthScale: 0.92, liftMeters: 0.0105, sheathRadius: 0.00112, sheathTop: 0.0035 })
    ])
});

function makeLeaf(definition) {
    const { acrossSegments, sheathSegments, collarSegments, collarJoin, rootDepthMeters } = GRASS_V2_PLANT;
    const sample = createGrassDebugV2DetailedBladeSampler();
    const rows = [];
    for (let j = 0; j <= sheathSegments; j++) rows.push({ sheath: j / sheathSegments, collar: 0, t: 0 });
    for (let j = 1; j <= collarSegments; j++) rows.push({ sheath: 1, collar: j / collarSegments, t: collarJoin * j / collarSegments });
    for (let j = 1; j <= 32; j++) rows.push({ sheath: 1, collar: 1, t: collarJoin + (0.72 - collarJoin) * j / 32 });
    for (let j = 1; j <= 16; j++) rows.push({ sheath: 1, collar: 1, t: 0.72 + 0.28 * Math.sin(j / 16 * Math.PI / 2) });
    const positions = [], colors = [], uvs = [], indices = [];
    const point = new THREE.Vector3(), ribbon = new THREE.Vector3(), color = new THREE.Color();
    const sheathColor = new THREE.Color('#526e35');
    const azimuth = THREE.MathUtils.degToRad(definition.azimuthDegrees), cs = Math.cos(azimuth), sn = Math.sin(azimuth);
    const elevation = THREE.MathUtils.degToRad(definition.elevationDegrees), ce = Math.cos(elevation), se = Math.sin(elevation);
    const stride = acrossSegments + 1;
    for (let row = 0; row < rows.length; row++) {
        const { sheath, collar, t } = rows[row];
        const blend = THREE.MathUtils.smootherstep(collar, 0, 1);
        sampleGrassDebugV2BladeColor(t, color);
        color.lerp(sheathColor, 1 - blend);
        const count = row === rows.length - 1 ? 1 : stride;
        for (let i = 0; i < count; i++) {
            const u = count === 1 ? 0.5 : i / acrossSegments, s = 2 * u - 1;
            // Unroll the sheath before spreading its margins into the blade. Raising a
            // closed tube through this bend produces an artificial folded lip at the crown.
            const angle = s * THREE.MathUtils.lerp(Math.PI * 1.04, 0.8, blend);
            const radius = definition.sheathRadius * (1 - 0.08 * sheath) * (1 + 0.04 * u);
            point.set(radius * Math.sin(angle), -rootDepthMeters + (definition.sheathTop + rootDepthMeters) * sheath, radius * Math.cos(angle));
            sample(t, s, ribbon);
            ribbon.x *= definition.widthScale;
            ribbon.z *= definition.lengthScale;
            // Pitch the blade around its buried origin; the shared crown and sheath stay grounded.
            const heightFromRoot = ribbon.y + rootDepthMeters, forward = ribbon.z;
            ribbon.y = heightFromRoot * ce + forward * se - rootDepthMeters + definition.liftMeters;
            ribbon.z = forward * ce - heightFromRoot * se;
            point.lerp(ribbon, blend);
            positions.push(cs * point.x + sn * point.z, point.y, -sn * point.x + cs * point.z);
            colors.push(color.r, color.g, color.b);
            uvs.push(u, t);
        }
    }
    for (let row = 0; row < rows.length - 2; row++) for (let i = 0; i < acrossSegments; i++) {
        const a = row * stride + i, b = a + stride;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const last = (rows.length - 2) * stride, apex = (rows.length - 1) * stride;
    for (let i = 0; i < acrossSegments; i++) indices.push(last + i, apex, last + i + 1);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const facing = new Float32Array(positions.length), centerNormal = new THREE.Vector3();
    for (let row = 0; row < rows.length; row++) {
        const start = row * stride, count = row === rows.length - 1 ? 1 : stride;
        centerNormal.fromBufferAttribute(geometry.attributes.normal, start + (count === 1 ? 0 : acrossSegments / 2));
        for (let i = 0; i < count; i++) centerNormal.toArray(facing, (start + i) * 3);
    }
    geometry.setAttribute('grassFacingNormal', new THREE.BufferAttribute(facing, 3));
    geometry.name = 'GrassV2PlantLeaf';
    return geometry;
}

/** @param {{material: THREE.MeshStandardMaterial}} options */
export function createGrassDebugV2Plant({ material }) {
    if (!material.isMeshStandardMaterial || !material.vertexColors) throw new Error('Grass plant requires a standard vertex-color leaf material.');
    const group = new THREE.Group(); group.name = 'GrassV2PairedPlant';
    const leaves = GRASS_V2_PLANT.leaves.map((definition, index) => {
        const mesh = new THREE.Mesh(makeLeaf(definition), material);
        mesh.name = `GrassV2PlantLeaf${index}`;
        mesh.castShadow = mesh.receiveShadow = true;
        group.add(mesh);
        return mesh;
    });
    const crownGeometry = new THREE.SphereGeometry(1, 32, 16);
    crownGeometry.scale(0.00105, 0.004, 0.00105); crownGeometry.translate(0, -0.002, 0);
    const crownMaterial = new THREE.MeshStandardMaterial({ color: '#526e35', roughness: 0.85, metalness: 0 });
    const crown = new THREE.Mesh(crownGeometry, crownMaterial);
    crown.name = 'GrassV2PlantCrown'; crown.castShadow = crown.receiveShadow = true; group.add(crown);
    const bounds = new THREE.Box3().setFromObject(group);
    return Object.freeze({ group, leaves: Object.freeze(leaves), crown,
        getSnapshot: () => ({ definition: GRASS_V2_PLANT, leaves: leaves.length,
            leafTriangles: leaves.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0),
            crownTriangles: crownGeometry.index.count / 3, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } }),
        dispose: () => { for (const leaf of leaves) leaf.geometry.dispose(); crownGeometry.dispose(); crownMaterial.dispose(); }
    });
}
