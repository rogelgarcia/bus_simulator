// Fixed instanced LOD comparison; changing modes does no rebuilding or instance uploads.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2Tuft, GRASS_V2_TUFT } from './GrassDebugV2Tuft.js';
import { createGrassDebugV2Cards } from './GrassDebugV2Cards.js';
import { createGrassDebugV2Material } from './GrassDebugV2Material.js';
import { GrassDebugV2Mixed } from './GrassDebugV2Mixed.js';

const PATCH_ROWS = 4;
const PATCH_COLUMNS = 36;
const PATCH_COUNT = PATCH_ROWS * PATCH_COLUMNS;
const LEAVES_PER_PATCH = GRASS_V2_TUFT.leavesPerCell * GRASS_V2_TUFT.cellsPerSide ** 2;

export class GrassDebugV2Grass {
    /** @param {{renderer: THREE.WebGLRenderer, scene: THREE.Scene, road: object, bus: THREE.Group}} options */
    constructor({ renderer, scene, road, bus }) {
        const tuft = createGrassDebugV2Tuft();
        const roadBounds = new THREE.Box3().setFromObject(road.sidewalk);
        const edgeX = roadBounds.min.x - 0.05;
        const startZ = bus.position.z - 4;
        this.placement = Object.freeze({ minX: edgeX - PATCH_ROWS, maxX: edgeX, minZ: startZ, maxZ: startZ + PATCH_COLUMNS, rows: PATCH_ROWS, columns: PATCH_COLUMNS });
        this.canopyUniforms = {
            grassCanopyBounds: { value: new THREE.Vector4(this.placement.minX, this.placement.minZ, this.placement.maxX, this.placement.maxZ) },
            grassCanopyHeight: { value: tuft.geometry.boundingBox.max.y },
            grassCanopyOpticalDepth: { value: 8 }
        };
        this.cards = createGrassDebugV2Cards(renderer, tuft.slices, this.canopyUniforms);
        tuft.slices.forEach(slice => slice.geometry.dispose());
        this.group = new THREE.Group();
        this.group.name = 'GrassV2Comparison';
        this.meshes = {
            LOD0: new THREE.InstancedMesh(tuft.geometry, createGrassDebugV2Material({ vertexColors: true }, this.canopyUniforms), PATCH_COUNT),
            LOD3: new THREE.InstancedMesh(this.cards.geometry, this.cards.material, PATCH_COUNT)
        };
        const matrix = new THREE.Matrix4();
        for (const [mode, mesh] of Object.entries(this.meshes)) {
            mesh.name = `GrassV2${mode}`;
            mesh.receiveShadow = true;
            for (let row = 0; row < PATCH_ROWS; row++) for (let column = 0; column < PATCH_COLUMNS; column++) {
                matrix.makeTranslation(edgeX - row - 1, 0, startZ + column);
                mesh.setMatrixAt(row * PATCH_COLUMNS + column, matrix);
            }
            mesh.instanceMatrix.needsUpdate = true;
            mesh.computeBoundingBox();
            mesh.computeBoundingSphere();
            this.group.add(mesh);
        }
        this.mixed = new GrassDebugV2Mixed({ renderer, edgeX, startZ });
        this.group.add(this.mixed.group);
        scene.add(this.group);
        this.setMode('LOD0');
    }

    /** @param {'OFF'|'LOD0'|'LOD3'|'MIXED'} mode */
    setMode(mode) {
        if (!['OFF', 'LOD0', 'LOD3', 'MIXED'].includes(mode)) throw new Error(`Unknown grass mode: ${mode}`);
        this.mode = mode;
        for (const [id, mesh] of Object.entries(this.meshes)) mesh.visible = id === mode;
        this.mixed.group.visible = mode === 'MIXED';
    }

    getSnapshot() {
        if (this.mode === 'MIXED') return this.mixed.getSnapshot();
        const mesh = this.meshes[this.mode];
        return {
            implemented: true, mode: this.mode, leaves: mesh ? LEAVES_PER_PATCH * mesh.count : 0,
            triangles: mesh ? mesh.geometry.index.count / 3 * mesh.count : 0,
            patches: PATCH_COUNT, patchSizeMeters: 1, leavesPerPatch: LEAVES_PER_PATCH, trianglesPerLeaf: GRASS_V2_TUFT.trianglesPerLeaf,
            cardsPerPatch: 64, cellSizeMeters: GRASS_V2_TUFT.cellSize, placement: { ...this.placement },
            incrementalGpuMs: null, targetGpuMs: 1
        };
    }

    dispose() {
        this.mixed.dispose();
        this.cards.dispose();
        for (const mesh of Object.values(this.meshes)) {
            mesh.geometry.dispose(); mesh.material.dispose(); mesh.dispose();
        }
        this.group.removeFromParent();
    }
}
