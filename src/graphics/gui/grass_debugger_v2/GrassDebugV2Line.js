// One aligned row isolates card projection from random orientation, density and overlapping roots.
// @ts-check
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createGrassDebugV2Blade } from './GrassDebugV2Blade.js';

export const GRASS_V2_LINE = Object.freeze({ leaves: 16, cards: 4, rootX: 0.65, reach: 0.18, height: 0.1, width: 0.012 });

/** @returns {ReturnType<import('./GrassDebugV2Tuft.js').createGrassDebugV2Tuft>} */
export function createGrassDebugV2Line() {
    const { leaves, cards, rootX, reach, height, width } = GRASS_V2_LINE;
    const blade = createGrassDebugV2Blade({ yaw: -Math.PI / 2, reach, height, width, twist: 0 });
    const tipHeight = blade.attributes.position.getY(12);
    const profile = Array.from({ length: 5 }, (_, station) => {
        const point = new THREE.Vector3().fromBufferAttribute(blade.attributes.position, station * 3);
        if (station < 4) point.add(new THREE.Vector3().fromBufferAttribute(blade.attributes.position, station * 3 + 2)).multiplyScalar(0.5);
        return point;
    });
    const slices = [];
    for (let cell = 0; cell < cards; cell++) {
        const blades = [];
        const leafCount = leaves / cards;
        for (let leaf = 0; leaf < leafCount; leaf++) {
            const z = (cell * leafCount + leaf + 0.5) / leaves;
            blades.push(blade.clone().translate(rootX, 0, z));
        }
        const geometry = mergeGeometries(blades);
        geometry.computeBoundingBox();
        slices.push({ geometry, rootCenter: new THREE.Vector3(rootX, 0, (cell + 0.5) / cards), incline: Math.atan2(tipHeight, reach), facing: 3, leafCount, cellX: 2, cellZ: cell, profile });
        blades.forEach(geometry => geometry.dispose());
    }
    blade.dispose();
    const geometry = mergeGeometries(slices.map(slice => slice.geometry));
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return { geometry, slices };
}
