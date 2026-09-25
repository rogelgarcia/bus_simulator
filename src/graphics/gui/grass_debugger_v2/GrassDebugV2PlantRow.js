// Twenty source leaves share a straight root line so one set of V/top cards can represent the whole row.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2Plant } from './GrassDebugV2Plant.js';

export const GRASS_V2_PLANT_ROW = Object.freeze({ pairs: 10, spacingMeters: 0.044 });

/** @param {{material: THREE.MeshStandardMaterial}} options */
export function createGrassDebugV2PlantRow({ material }) {
    const source = createGrassDebugV2Plant({ material });
    const group = new THREE.Group(); group.name = 'GrassV2TwentyLeafRow';
    const leaves = [], crowns = [], roots = [];
    const { pairs, spacingMeters } = GRASS_V2_PLANT_ROW;
    for (let i = 0; i < pairs; i++) {
        const x = (i - (pairs - 1) / 2) * spacingMeters;
        roots.push(x);
        for (const leaf of source.leaves) {
            const mesh = leaf.clone(); mesh.position.x = x;
            group.add(mesh); leaves.push(mesh);
        }
        const crown = source.crown.clone(); crown.position.x = x;
        group.add(crown); crowns.push(crown);
    }
    const bounds = new THREE.Box3().setFromObject(group), sourceSnapshot = source.getSnapshot();
    return Object.freeze({ group, leaves: Object.freeze(leaves), crowns: Object.freeze(crowns), roots: Object.freeze(roots),
        getSnapshot: () => ({ definition: GRASS_V2_PLANT_ROW, specimens: pairs, leaves: leaves.length,
            leafTriangles: sourceSnapshot.leafTriangles * pairs, crownTriangles: sourceSnapshot.crownTriangles * pairs,
            roots, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } }),
        dispose: () => source.dispose()
    });
}
