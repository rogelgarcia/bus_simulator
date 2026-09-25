// Builds one deterministic square metre; every blade belongs to exactly one card slice.
// Stratified roots fill each planting cell; unconfined tips overlap adjacent cells and patch instances.
// @ts-check
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createGrassDebugV2Blade } from './GrassDebugV2Blade.js';

export const GRASS_V2_TUFT = Object.freeze({ seed: 192209, cellSize: 0.25, cellsPerSide: 4, leavesPerCell: 128, rootColumns: 8, sections: 4, trianglesPerLeaf: 14 });

function createBlade(random, cellX, cellZ, leaf) {
    const yaw = random() * Math.PI * 2;
    const reach = 0.14 + random() * 0.075;
    const height = 0.065 + random() * 0.055;
    const width = 0.009 + random() * 0.007;
    const twist = (random() - 0.5) * 0.018;
    // Preserve the placement seed sequence while removing per-blade color variation.
    random(); random(); random();
    const geometry = createGrassDebugV2Blade({ yaw, reach, height, width, twist });
    const { rootColumns, leavesPerCell, cellSize } = GRASS_V2_TUFT;
    const root = new THREE.Vector3(
        (cellX + (leaf % rootColumns + random()) / rootColumns) * cellSize,
        0,
        (cellZ + (Math.floor(leaf / rootColumns) + random()) / (leavesPerCell / rootColumns)) * cellSize
    );
    geometry.translate(root.x, root.y, root.z);
    const tip = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, geometry.attributes.position.count - 1);
    return { geometry, root, tip, facing: Math.round(yaw / (Math.PI / 2)) % 4 };
}

/** @returns {{geometry: THREE.BufferGeometry, slices: Array<{geometry: THREE.BufferGeometry, rootCenter: THREE.Vector3, incline: number, facing: number, leafCount: number, cellX: number, cellZ: number, profile?: THREE.Vector3[]}>}} */
export function createGrassDebugV2Tuft() {
    let seed = GRASS_V2_TUFT.seed;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const slices = [];
    for (let z = 0; z < 4; z++) for (let x = 0; x < 4; x++) {
        const groups = Array.from({ length: 4 }, () => []);
        for (let leaf = 0; leaf < GRASS_V2_TUFT.leavesPerCell; leaf++) {
            const blade = createBlade(random, x, z, leaf);
            groups[blade.facing].push(blade);
        }
        groups.forEach((blades, facing) => {
            if (!blades.length) throw new Error(`Empty grass card slice: ${x},${z},${facing}`);
            const geometry = mergeGeometries(blades.map(blade => blade.geometry));
            geometry.computeBoundingBox();
            const rootCenter = new THREE.Vector3();
            const forward = new THREE.Vector3(Math.sin(facing * Math.PI / 2), 0, Math.cos(facing * Math.PI / 2));
            let reach = 0, rise = 0;
            for (const blade of blades) {
                rootCenter.add(blade.root);
                reach += blade.tip.clone().sub(blade.root).dot(forward);
                rise += blade.tip.y - blade.root.y;
            }
            rootCenter.divideScalar(blades.length);
            slices.push({ geometry, rootCenter, incline: Math.atan2(rise, reach), facing, leafCount: blades.length, cellX: x, cellZ: z });
            blades.forEach(blade => blade.geometry.dispose());
        });
    }
    const geometry = mergeGeometries(slices.map(slice => slice.geometry));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return { geometry, slices };
}
