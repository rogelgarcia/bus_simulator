// @ts-check
// Arranges shared grass/litter meshes in a nine-field grid and counts camera-visible geometry.
import * as THREE from 'three';

const CELLS = Object.freeze([[0, 0], [0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [-1, -1], [1, 1], [-1, 1]].map(Object.freeze));
const GAP_METERS = 1;
const COMPARISON_LODS = Object.freeze({ 'LOD2+4': ['LOD2', 'LOD4'], 'LOD2+3+4': ['LOD2', 'LOD3', 'LOD4'] });

/**
 * @param {{ parent: THREE.Object3D, field: THREE.Object3D, substrate: THREE.Object3D,
 * lod1: THREE.Mesh, lod2?: THREE.Mesh, lod3?: THREE.Object3D, lod4?: THREE.Object3D, smartLod0?: THREE.Mesh, widthMeters: number, depthMeters: number, leavesPerField: number }} options
 */
export function createGrassDebugV2FieldLayout({ parent, field, substrate, lod1, lod2, lod3, lod4, smartLod0, widthMeters, depthMeters, leavesPerField }) {
    if (!(widthMeters > 0 && depthMeters > 0) || !Number.isInteger(leavesPerField) || leavesPerField < 1) {
        throw new Error('Field dimensions and leaf count must be positive.');
    }
    const sourceMeshes = field.children.filter(child => child instanceof THREE.Mesh || child === lod3 || child === lod4);
    const lod1Index = sourceMeshes.indexOf(lod1);
    const meshLods = sourceMeshes.map(mesh => mesh === lod1 ? 'LOD1' : mesh === lod2 ? 'LOD2' : mesh === lod3 ? 'LOD3' : mesh === lod4 ? 'LOD4' : mesh === smartLod0 ? 'LOD0_SMART' : 'LOD0');
    if (lod1Index < 0 || (lod2 && !sourceMeshes.includes(lod2)) || (lod3 && !sourceMeshes.includes(lod3)) || (lod4 && !sourceMeshes.includes(lod4)) || (smartLod0 && !sourceMeshes.includes(smartLod0)) || sourceMeshes.length < 2 || field.parent !== parent || substrate.parent !== parent) {
        throw new Error('Expected the exported grass, litter and requested LODs in one scene.');
    }
    let count = 1, lod = 'LOD0', grassVisible = true, litterVisible = true;
    const original = new THREE.Group();
    original.add(field, substrate);
    const tiles = CELLS.map(([x, z], index) => {
        const root = index === 0 ? original : original.clone(true);
        root.name = 'GrassFieldTile_' + (index + 1);
        root.position.set(x * (widthMeters + GAP_METERS), 0, z * (depthMeters + GAP_METERS));
        root.visible = index < count;
        const grass = root.children[0], litter = root.children[1];
        if (index > 0) {
            grass.name = field.name + '_Field_' + (index + 1);
            litter.name = substrate.name + '_Field_' + (index + 1);
        }
        parent.add(root);
        return { root, grass, litter, meshes: grass.children, gridPhase: x + z };
    });
    const tileLod = tile => {
        const cycle = COMPARISON_LODS[lod];
        return cycle ? cycle[((tile.gridPhase % cycle.length) + cycle.length) % cycle.length] : lod;
    };
    const frustum = new THREE.Frustum(), projection = new THREE.Matrix4();
    const inView = mesh => mesh.visible && cameraLayers.test(mesh.layers)
        && (Array.isArray(mesh.material) ? mesh.material.some(material => material.visible) : mesh.material.visible)
        && (!mesh.frustumCulled || frustum.intersectsObject(mesh));
    let cameraLayers = new THREE.Layers();
    const getBounds = () => {
        const active = tiles.slice(0, count);
        return {
            minX: Math.min(...active.map(tile => tile.root.position.x)) - widthMeters / 2,
            maxX: Math.max(...active.map(tile => tile.root.position.x)) + widthMeters / 2,
            minZ: Math.min(...active.map(tile => tile.root.position.z)) - depthMeters / 2,
            maxZ: Math.max(...active.map(tile => tile.root.position.z)) + depthMeters / 2
        };
    };
    return Object.freeze({
        /** @param {number} value */
        setCount(value) {
            if (!Number.isInteger(value) || value < 1 || value > CELLS.length) throw new Error('Field count must be an integer from 1 to 9.');
            count = value;
            tiles.forEach((tile, index) => { tile.root.visible = index < count; });
        },
        /** @param {string} value */
        setLod(value) {
            const cycle = COMPARISON_LODS[value];
            if (!meshLods.includes(value) && !(cycle && cycle.every(level => meshLods.includes(level)))) throw new Error('Unknown grass LOD: ' + value);
            lod = value;
            tiles.forEach(tile => tile.meshes.forEach((mesh, index) => {
                mesh.visible = meshLods[index] === tileLod(tile);
            }));
        },
        /** @param {{ grass: boolean, litter: boolean }} visibility */
        setVisibility({ grass, litter }) {
            if (typeof grass !== 'boolean' || typeof litter !== 'boolean') throw new Error('Field visibility must use booleans.');
            grassVisible = grass; litterVisible = litter;
            tiles.forEach(tile => { tile.grass.visible = grass; tile.litter.visible = litter; });
        },
        /** @param {THREE.Camera} camera */
        countInView(camera) {
            parent.updateWorldMatrix(true, true); camera.updateMatrixWorld();
            cameraLayers = camera.layers;
            frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
            let visibleTriangles = 0, visibleFields = 0, visibleLeaves = 0;
            parent.traverseVisible(mesh => {
                if (mesh instanceof THREE.Mesh && inView(mesh)) {
                    const geometry = mesh.geometry, available = geometry.index?.count ?? geometry.attributes.position.count;
                    const count = Math.max(0, Math.min(available - geometry.drawRange.start, geometry.drawRange.count));
                    visibleTriangles += count / 3 * (geometry.isInstancedBufferGeometry ? geometry.instanceCount : 1);
                    visibleLeaves += geometry.userData.grassLeafCount ?? mesh.userData.grassLeafCount ?? 0;
                }
            });
            tiles.forEach(tile => {
                if (!tile.root.visible || !tile.grass.visible) return;
                let visible = false;
                tile.grass.traverseVisible(mesh => { if (mesh instanceof THREE.Mesh && inView(mesh)) visible = true; });
                if (visible) visibleFields++;
            });
            return { visibleFields, visibleLeaves, visibleTriangles };
        },
        getSnapshot: () => ({
            count, lod, grassVisible, litterVisible, gapMeters: GAP_METERS, widthMeters, depthMeters,
            leaves: count * leavesPerField, bounds: getBounds(),
            tiles: tiles.map((tile, index) => ({ index, x: tile.root.position.x, z: tile.root.position.z, active: tile.root.visible, lod: tileLod(tile) }))
        }),
        dispose() {
            tiles.slice(1).forEach(tile => tile.root.removeFromParent());
            parent.add(field, substrate); original.removeFromParent();
        }
    });
}
