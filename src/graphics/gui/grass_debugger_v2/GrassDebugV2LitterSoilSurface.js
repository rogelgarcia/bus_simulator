// Preserve raised litter geometry and remove the hidden soil under opaque merged patches.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2LitterSoilMaterial } from './GrassDebugV2LitterSoilMaterial.js?v=litter-merged-1';

import { cutGrassDebugV2GroundRectangle } from './GrassDebugV2GroundCutout.js?v=lod4-canopy-1';

function groundMapping(soil) {
    const position = soil.geometry.attributes.position, uv = soil.geometry.attributes.uv;
    const points = [0, 1, 2].map(i => new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(soil.matrixWorld));
    const basis = new THREE.Matrix3().set(...points.flatMap(p => [p.x, p.z, 1]));
    if (Math.abs(basis.determinant()) < 1e-8) throw new Error('Soil UV mapping requires noncollinear ground vertices.');
    const inverse = basis.invert();
    const u = new THREE.Vector3(...[0, 1, 2].map(i => uv.getX(i))).applyMatrix3(inverse);
    const v = new THREE.Vector3(...[0, 1, 2].map(i => uv.getY(i))).applyMatrix3(inverse);
    return new THREE.Matrix3().set(u.x, u.y, u.z, v.x, v.y, v.z, 0, 0, 1);
}

function cutGround(bounds, holes, mapping, worldToLocal) {
    const xs = [...new Set([bounds.min.x, bounds.max.x, ...holes.flatMap(h => [h.min.x, h.max.x])])].sort((a, b) => a - b);
    const zs = [...new Set([bounds.min.z, bounds.max.z, ...holes.flatMap(h => [h.min.z, h.max.z])])].sort((a, b) => a - b);
    const positions = [], uvs = [], indices = [], p = new THREE.Vector3(), uv = new THREE.Vector3();
    for (const z of zs) for (const x of xs) {
        p.set(x, 0, z).applyMatrix4(worldToLocal); positions.push(p.x, p.y, p.z);
        uv.set(x, z, 1).applyMatrix3(mapping); uvs.push(uv.x, uv.y);
    }
    for (let z = 0; z < zs.length - 1; z++) for (let x = 0; x < xs.length - 1; x++) {
        const cx = (xs[x] + xs[x + 1]) / 2, cz = (zs[z] + zs[z + 1]) / 2;
        if (holes.some(h => cx > h.min.x && cx < h.max.x && cz > h.min.z && cz < h.max.z)) continue;
        const a = z * xs.length + x, b = a + xs.length;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return geometry;
}

/** @param {{ parent: THREE.Object3D, soil: THREE.Mesh, fields: object }} options */
export function createGrassDebugV2LitterSoilSurface({ parent, soil, fields }) {
    parent.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(soil), originalGeometry = soil.geometry;
    if (Math.abs(bounds.min.y) > 1e-6 || Math.abs(bounds.max.y) > 1e-6) throw new Error('Merged litter requires a flat soil surface at zero height.');
    const mapping = groundMapping(soil), worldToLocal = soil.matrixWorld.clone().invert();
    const materials = new Map(), entries = [], cache = new Map(), cutPatches = new Map();
    const tiles = fields.getSnapshot().tiles.map(tile => {
        const litter = parent.getObjectByName('GrassFieldTile_' + (tile.index + 1)).children[1];
        const footprint = new THREE.Box3().setFromObject(litter);
        if (footprint.min.x <= bounds.min.x || footprint.max.x >= bounds.max.x
            || footprint.min.z <= bounds.min.z || footprint.max.z >= bounds.max.z) throw new Error('Litter footprint exceeds soil bounds.');
        litter.traverse(mesh => {
            if (!mesh.isMesh) return;
            const original = mesh.material;
            if (!materials.has(original)) materials.set(original, createGrassDebugV2LitterSoilMaterial({ litter: original, soil: soil.material, soilUv: mapping }));
            entries.push({ mesh, original, geometry: mesh.geometry, tileIndex: tile.index, transform: mesh.matrixWorld.clone(), renderOrder: mesh.renderOrder });
        });
        return footprint;
    });
    let treatment = 'merged', enabled = true, count = fields.getSnapshot().count, canopy = null;
    const apply = () => {
        const merged = treatment === 'merged', state = fields.getSnapshot();
        const canopyTiles = canopy ? state.tiles.filter(tile => tile.active && tile.lod === 'LOD4') : [];
        for (const { mesh, original, geometry, tileIndex, transform, renderOrder } of entries) {
            const useCanopy = canopy && state.tiles[tileIndex].lod === 'LOD4';
            if (useCanopy && !cutPatches.has(geometry)) {
                const tile = state.tiles[tileIndex];
                const localTransform = new THREE.Matrix4().makeTranslation(-tile.x, 0, -tile.z).multiply(transform);
                cutPatches.set(geometry, cutGrassDebugV2GroundRectangle(geometry, localTransform, canopy));
            }
            mesh.geometry = useCanopy ? cutPatches.get(geometry) : geometry;
            mesh.material = merged ? materials.get(original) : original;
            mesh.renderOrder = merged ? 0 : renderOrder;
        }
        if (merged && enabled || canopyTiles.length) {
            const key = merged && enabled ? count + '-litter' : 'canopy-' + canopyTiles.map(tile => tile.index).join(',');
            const holes = merged && enabled ? tiles.slice(0, count) : canopyTiles.map(tile =>
                new THREE.Box3(new THREE.Vector3(tile.x + canopy.minX, 0, tile.z + canopy.minZ), new THREE.Vector3(tile.x + canopy.maxX, 0, tile.z + canopy.maxZ)));
            if (!cache.has(key)) cache.set(key, cutGround(bounds, holes, mapping, worldToLocal));
            soil.geometry = cache.get(key);
        } else soil.geometry = originalGeometry;
    };
    apply();
    return Object.freeze({
        /** @param {'alpha'|'merged'} value */
        setTreatment(value) {
            if (value !== 'alpha' && value !== 'merged') throw new Error('Unknown litter treatment: ' + value);
            treatment = value; apply();
        },
        /** @param {boolean} visible @param {object|null} [canopyBounds] */
        sync(visible, canopyBounds = null) {
            enabled = visible; count = fields.getSnapshot().count; canopy = canopyBounds; apply();
        },
        getSnapshot: () => ({
            treatment, active: enabled, soilCutouts: treatment === 'merged' && enabled ? count : canopy ? fields.getSnapshot().tiles.filter(tile => tile.active && tile.lod === 'LOD4').length : 0, canopyCutout: canopy,
            soilTriangles: soil.geometry.index.count / 3, extraTextureBytes: 0,
            surfaceTriangles: entries.filter(entry => entry.tileIndex < count).reduce((sum, { mesh }) => sum + mesh.geometry.index.count / 3, 0),
            surfaceTrianglesPerField: entries.slice(0, 9).reduce((sum, { mesh }) => sum + mesh.geometry.index.count / 3, 0),
            elevationMeters: .005, sharedMaterials: materials.size
        }),
        dispose() {
            for (const { mesh, original, geometry, renderOrder } of entries) { mesh.material = original; mesh.geometry = geometry; mesh.renderOrder = renderOrder; }
            soil.geometry = originalGeometry;
            cache.forEach(geometry => geometry.dispose()); cutPatches.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
        }
    });
}
