// Build reduced LODs from recorded paired-shoot placements and seeded color variation.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2RibbonShoot } from './GrassDebugV2RibbonShoot.js?v=lod2-color-1';
import { fitGrassDebugV2RibbonLod2Root } from './GrassDebugV2RibbonLod2.js?v=lod2-color-1';
import { clipGrassDebugV2MeshAtSoil } from './GrassDebugV2SoilClip.js';
import { fitGrassDebugV2RibbonRoot } from './GrassDebugV2RibbonRoot.js?v=lod2-color-1';
import { sampleGrassDebugV2ShootColor, sampleGrassDebugV2Lod2Color } from './GrassDebugV2ShootAppearance.js?v=lod2-color-1';

/** @typedef {{id:number, x:number, z:number, azimuthDegrees:number, scale:number, backwardInclinationDegrees:number}} GrassFieldPlacement */
/** @param {{material: THREE.MeshStandardMaterial, placements: readonly GrassFieldPlacement[], seed: number, lod?: 'LOD1'|'LOD2'|'LOD0_SMART'}} options */
export function createGrassDebugV2FieldLod({ material, placements, seed, lod = 'LOD1' }) {
    if (lod !== 'LOD1' && lod !== 'LOD2' && lod !== 'LOD0_SMART') throw new Error('Unknown reduced grass LOD: ' + lod);
    if (!placements.length || !Number.isInteger(seed)) throw new Error(lod + ' requires recorded placements and a seed.');
    for (const [i, p] of placements.entries()) {
        if (p.id !== i || ![p.x, p.z, p.azimuthDegrees, p.scale, p.backwardInclinationDegrees].every(Number.isFinite)
            || p.scale <= 0 || p.backwardInclinationDegrees < 0 || p.backwardInclinationDegrees > 45)
            throw new Error('Invalid recorded grass placement: ' + i);
    }
    const source = createGrassDebugV2RibbonShoot({ material, lod });
    source.trimAtSoil(() => 0); source.group.updateMatrixWorld(true);
    const { maximumTrianglesPerLeaf, rootTopology } = source.getSnapshot().definition;
    const variants = new Map();
    const origin = new THREE.Matrix4().makeTranslation(-0.035, 0, 0);
    for (const degrees of new Set(placements.map(p => p.backwardInclinationDegrees))) {
        const pitch = new THREE.Matrix4().makeRotationX(-THREE.MathUtils.degToRad(degrees)).multiply(origin);
        variants.set(degrees, source.leaves.slice(1).map(leaf => {
            const transform = new THREE.Matrix4().multiplyMatrices(pitch, leaf.matrixWorld);
            const geometry = leaf.geometry.clone().applyMatrix4(transform);
            if (transform.determinant() < 0) {
                const indices = geometry.index.array;
                for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
            }
            const mesh = new THREE.Mesh(geometry, material);
            if (lod === 'LOD2') fitGrassDebugV2RibbonLod2Root(mesh, () => 0);
            else if (rootTopology === 'edge-fit') fitGrassDebugV2RibbonRoot(mesh, () => 0);
            else clipGrassDebugV2MeshAtSoil(mesh, () => 0);
            if (mesh.geometry.index.count / 3 > maximumTrianglesPerLeaf) throw new Error('Inclined ' + lod + ' exceeds its triangle budget.');
            return mesh.geometry;
        }));
    }
    source.dispose();
    let vertexCount = 0, indexCount = 0, minimum = Infinity, maximum = 0;
    for (const p of placements) for (const geometry of variants.get(p.backwardInclinationDegrees)) {
        vertexCount += geometry.attributes.position.count; indexCount += geometry.index.count;
        minimum = Math.min(minimum, geometry.index.count / 3); maximum = Math.max(maximum, geometry.index.count / 3);
    }
    const positions = new Float32Array(vertexCount * 3), normals = new Float32Array(vertexCount * 3);
    const colors = new Float32Array(vertexCount * 3), uvs = new Float32Array(vertexCount * 2), indices = new Uint32Array(indexCount);
    const color = new THREE.Color(), leafRanges = [];
    let state = seed, vertexOffset = 0, indexOffset = 0;
    const random = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
    for (const [i, placement] of placements.entries()) {
        const { x, z, scale, azimuthDegrees, backwardInclinationDegrees } = placement;
        for (let call = 0; call < (i === 0 || i === placements.length - 1 ? 3 : 5); call++) random();
        const brightness = 0.94 + random() * 0.12;
        const angle = THREE.MathUtils.degToRad(azimuthDegrees), cosine = Math.cos(angle), sine = Math.sin(angle);
        for (const [blade, part] of variants.get(backwardInclinationDegrees).entries()) {
            leafRanges.push({ start: indexOffset, count: part.index.count });
            const p = part.attributes.position, n = part.attributes.normal, uv = part.attributes.uv;
            const variation = ((Math.imul(i * 2 + blade + 1, 1597334677) ^ seed) >>> 0) / 4294967296;
            const dryness = variation < 0.12 ? 0.65 + variation / 0.12 * 0.35 : (variation - 0.12) * 0.22;
            for (let j = 0; j < p.count; j++) {
                const v = vertexOffset + j, v3 = v * 3;
                positions[v3] = x + scale * (cosine * p.getX(j) + sine * p.getZ(j));
                positions[v3 + 1] = scale * p.getY(j);
                positions[v3 + 2] = z + scale * (cosine * p.getZ(j) - sine * p.getX(j));
                normals[v3] = cosine * n.getX(j) + sine * n.getZ(j);
                normals[v3 + 1] = n.getY(j);
                normals[v3 + 2] = cosine * n.getZ(j) - sine * n.getX(j);
                uvs[v * 2] = uv.getX(j); uvs[v * 2 + 1] = uv.getY(j);
                (lod === 'LOD2' ? sampleGrassDebugV2Lod2Color : sampleGrassDebugV2ShootColor)(THREE.MathUtils.clamp((uv.getY(j) - 0.18) / 0.82, 0, 1), color, dryness);
                colors[v3] = color.r * brightness; colors[v3 + 1] = color.g * brightness; colors[v3 + 2] = color.b * brightness;
            }
            for (let j = 0; j < part.index.count; j++) indices[indexOffset++] = vertexOffset + part.index.getX(j);
            vertexOffset += p.count;
        }
    }
    variants.forEach(parts => parts.forEach(geometry => geometry.dispose()));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('grassFacingNormal', geometry.attributes.normal.clone());
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.grassLeafRanges = leafRanges;
    mesh.name = 'GrassField-' + lod; mesh.castShadow = mesh.receiveShadow = true;
    return Object.freeze({
        mesh,
        getSnapshot: () => ({ leaves: placements.length * 2, triangles: indexCount / 3,
            trianglesPerLeaf: { min: minimum, max: maximum }, maximumTrianglesPerLeaf }),
        dispose: () => { mesh.removeFromParent(); geometry.dispose(); }
    });
}

export const createGrassDebugV2FieldLod1 = options => createGrassDebugV2FieldLod({ ...options, lod: 'LOD1' });
