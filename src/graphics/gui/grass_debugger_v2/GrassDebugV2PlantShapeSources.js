// Transform arch and length around each blade's buried root while sharing geometry, atlases and materials.
// Object-space normals follow Three's inverse-transpose normal matrix, including these nonuniform shape transforms.
// @ts-check
import * as THREE from 'three';
import { GRASS_V2_PLANT } from './GrassDebugV2Plant.js';

export const GRASS_V2_PLANT_CURVATURES = Object.freeze([
    Object.freeze({ id: 'gentle', label: 'Gentle', archScale: 0.65 }),
    Object.freeze({ id: 'straighter', label: 'Straighter', archScale: 0.30 })
]);
export const GRASS_V2_PLANT_LENGTHS = Object.freeze([
    Object.freeze({ id: 'full', label: 'Full length', lengthScale: 1, share: 0.6 }),
    Object.freeze({ id: 'short', label: 'Short', lengthScale: 0.6, share: 0.4 })
]);

/** @param {ReturnType<import('./GrassDebugV2PlantRow.js').createGrassDebugV2PlantRow>} plant */
export function createGrassDebugV2PlantShapeSources(plant) {
    if (plant.roots.length !== 5 || plant.leaves.length !== 10)
        throw new Error('Patch shape variants require a paired five-leaf source.');
    const rootY = -GRASS_V2_PLANT.rootDepthMeters, point = new THREE.Vector3();
    return Object.freeze(GRASS_V2_PLANT_CURVATURES.flatMap(curvature => GRASS_V2_PLANT_LENGTHS.flatMap(length => [0, 1].map(side => {
        const source = plant.leaves[side].geometry.attributes.position;
        const tip = new THREE.Vector3().fromBufferAttribute(source, source.count - 1);
        const { archScale } = curvature, { lengthScale } = length;
        const shear = (1 - archScale) * (tip.y - rootY) / tip.z;
        const matrix = new THREE.Matrix4().set(
            1, 0, (lengthScale - 1) * tip.x / tip.z, 0,
            0, lengthScale * archScale, lengthScale * shear, rootY * (1 - lengthScale * archScale),
            0, 0, lengthScale, 0,
            0, 0, 0, 1
        );
        const positions = new Float64Array(source.count * 3);
        for (let i = 0; i < source.count; i++) point.fromBufferAttribute(source, i).applyMatrix4(matrix).toArray(positions, i * 3);
        return Object.freeze({ id: curvature.id + '_' + length.id + '_' + side,
            curvatureId: curvature.id, lengthId: length.id, archScale, lengthScale, fraction: length.share / 4,
            side, matrix, positions, roots: plant.roots });
    }))));
}
