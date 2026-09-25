// Four separated square-metre blocks compare identical blade lines under the same game lighting.
// Sparse lines omit the dense-field canopy approximation so placement cannot bias the LOD comparison.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2Line, GRASS_V2_LINE } from './GrassDebugV2Line.js';
import { createGrassDebugV2Cards } from './GrassDebugV2Cards.js';
import { createGrassDebugV2Material } from './GrassDebugV2Material.js';

const GAP = 0.5;
const STEP = 1 + GAP;

function createCardBounds(mesh, exposure) {
    const edges = new THREE.EdgesGeometry(mesh.geometry, 180);
    const positions = [];
    const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
    for (let instance = 0; instance < mesh.count; instance++) {
        mesh.getMatrixAt(instance, matrix);
        for (let i = 0; i < edges.attributes.position.count; i++) {
            point.fromBufferAttribute(edges.attributes.position, i).applyMatrix4(matrix);
            positions.push(point.x, point.y, point.z);
        }
    }
    edges.dispose();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const bounds = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
        color: new THREE.Color('#b02bff').multiplyScalar(1 / exposure), depthTest: false, depthWrite: false
    }));
    bounds.name = 'GrassV2MixedCardBounds';
    bounds.renderOrder = 1;
    bounds.visible = false;
    return bounds;
}

export class GrassDebugV2Mixed {
    /** @param {{renderer: THREE.WebGLRenderer, edgeX: number, startZ: number}} options */
    constructor({ renderer, edgeX, startZ }) {
        const line = createGrassDebugV2Line();
        this.cards = createGrassDebugV2Cards(renderer, line.slices);
        line.slices.forEach(slice => slice.geometry.dispose());
        this.group = new THREE.Group();
        this.group.name = 'GrassV2MixedLines';
        this.placement = Object.freeze({ minX: edgeX - 1 - STEP, maxX: edgeX, minZ: startZ, maxZ: startZ + STEP + 1, rows: 2, columns: 2, gapMeters: GAP });
        this.meshes = {
            LOD0: new THREE.InstancedMesh(line.geometry, createGrassDebugV2Material({ vertexColors: true }), 2),
            LOD3: new THREE.InstancedMesh(this.cards.geometry, this.cards.material, 2)
        };
        this.blocks = [];
        const outlines = [];
        for (const [row, mode] of ['LOD0', 'LOD3'].entries()) {
            const mesh = this.meshes[mode];
            mesh.name = `GrassV2Mixed${mode}`;
            mesh.receiveShadow = true;
            for (let column = 0; column < 2; column++) {
                const x = edgeX - 1 - row * STEP, z = startZ + column * STEP;
                mesh.setMatrixAt(column, new THREE.Matrix4().makeTranslation(x, 0, z));
                this.blocks.push(Object.freeze({ mode, row, column, x, z, sizeMeters: 1 }));
                for (const [ax, az, bx, bz] of [[0, 0, 1, 0], [1, 0, 1, 1], [1, 1, 0, 1], [0, 1, 0, 0]]) outlines.push(x + ax, 0.003, z + az, x + bx, 0.003, z + bz);
            }
            mesh.instanceMatrix.needsUpdate = true;
            mesh.computeBoundingBox(); mesh.computeBoundingSphere();
            this.group.add(mesh);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(outlines, 3));
        this.outlines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: '#b5c2bd' }));
        this.outlines.name = 'GrassV2MixedBlockBounds';
        this.group.add(this.outlines);
        this.cardBounds = createCardBounds(this.meshes.LOD3, renderer.toneMappingExposure);
        this.group.add(this.cardBounds);
    }

    /** @param {{aspect: number, fov: number}} camera */
    getCameraPose({ aspect, fov }) {
        const { minX, maxX, minZ, maxZ } = this.placement;
        const target = new THREE.Vector3((minX + maxX) / 2, 0.025, (minZ + maxZ) / 2);
        const halfFov = THREE.MathUtils.degToRad(fov) / 2;
        const limitFov = Math.min(halfFov, Math.atan(Math.tan(halfFov) * aspect));
        const distance = Math.hypot(maxX - minX, maxZ - minZ) / 2 / Math.sin(limitFov) * 1.05;
        return {
            position: target.clone().addScaledVector(new THREE.Vector3(-1, 2.4, -1).normalize(), distance),
            target
        };
    }

    getSnapshot() {
        const lods = Object.fromEntries(Object.entries(this.meshes).map(([mode, mesh]) => [mode, {
            leaves: GRASS_V2_LINE.leaves * mesh.count,
            triangles: mesh.geometry.index.count / 3 * mesh.count
        }]));
        return {
            implemented: true, mode: 'MIXED', leaves: GRASS_V2_LINE.leaves * 4,
            triangles: Object.values(lods).reduce((sum, lod) => sum + lod.triangles, 0),
            lods, cardBoundsVisible: this.cardBounds.visible,
            patches: 4, patchSizeMeters: 1, leavesPerPatch: GRASS_V2_LINE.leaves, trianglesPerLeaf: 14,
            cardsPerPatch: GRASS_V2_LINE.cards, cellSizeMeters: 0.25, layout: 'single-line',
            placement: { ...this.placement }, blocks: this.blocks.map(block => ({ ...block })),
            incrementalGpuMs: null, targetGpuMs: 1
        };
    }

    dispose() {
        this.cards.dispose();
        for (const mesh of Object.values(this.meshes)) {
            mesh.geometry.dispose(); mesh.material.dispose(); mesh.dispose();
        }
        this.outlines.geometry.dispose(); this.outlines.material.dispose();
        this.cardBounds.geometry.dispose(); this.cardBounds.material.dispose();
        this.group.removeFromParent();
    }
}
