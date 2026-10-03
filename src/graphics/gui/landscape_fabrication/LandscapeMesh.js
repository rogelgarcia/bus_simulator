// Builds a bounded preview from the shared landscape sample lattice.
// @ts-check
import * as THREE from 'three';
import { LANDSCAPE_LAND_COVER_CATALOG } from '../../../app/landscape/index.js';

export const OVERVIEW_MEMORY_CAP = 32 * 1024 * 1024;

/** @param {{descriptor: any, heights: Float32Array, landCover: Uint8Array}} chunk @param {{catalog?:ReadonlyArray<{id:number,color:string}>}} options */
export function createLandscapeMesh(chunk, { catalog = LANDSCAPE_LAND_COVER_CATALOG } = {}) {
    const { columns, rows, bounds } = chunk.descriptor;
    const count = columns * rows;
    const estimatedPeakBytes = count * 400;
    if (estimatedPeakBytes > OVERVIEW_MEMORY_CAP) throw new Error('Overview exceeds the 32 MiB preview allocation cap. Prepare a coarser overview.');
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const palette = new Map(catalog.map(entry => [entry.id, new THREE.Color(entry.color)]));
    for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
            const i = row * columns + column;
            positions[i * 3] = bounds.minX + column * (bounds.maxX - bounds.minX) / (columns - 1);
            positions[i * 3 + 1] = chunk.heights[i];
            positions[i * 3 + 2] = bounds.maxZ - row * (bounds.maxZ - bounds.minZ) / (rows - 1);
            const color = palette.get(chunk.landCover[i]);
            colors.set([color.r, color.g, color.b], i * 3);
        }
    }
    const indices = new Uint32Array((columns - 1) * (rows - 1) * 6);
    let cursor = 0;
    for (let row = 0; row < rows - 1; row++) {
        for (let column = 0; column < columns - 1; column++) {
            const a = row * columns + column, b = a + 1, c = a + columns, d = c + 1;
            indices.set([a, d, c, a, b, d], cursor);
            cursor += 6;
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `Landscape:${chunk.descriptor.id}`;
    const geometryBytes = Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, indices.byteLength);
    let wire = null;
    return {
        mesh,
        estimatedPeakBytes,
        geometryBytes,
        setMode(mode) {
            material.visible = mode !== 'wireframe';
            material.polygonOffset = mode === 'combined';
            material.polygonOffsetFactor = 1;
            material.polygonOffsetUnits = 1;
            if (mode !== 'shaded' && !wire) {
                wire = new THREE.LineSegments(new THREE.WireframeGeometry(geometry), new THREE.LineBasicMaterial({ color: 0x122c32, transparent: true, opacity: 0.52 }));
                wire.name = 'Terrain triangulation';
                mesh.add(wire);
            } else if (mode === 'shaded' && wire) {
                mesh.remove(wire);
                wire.geometry.dispose();
                wire.material.dispose();
                wire = null;
            }
            if (wire) { wire.material.color.set(mode === 'wireframe' ? 0xa6c7c0 : 0x122c32); wire.material.opacity = mode === 'wireframe' ? 1 : .52; }
        },
        diagnostics() {
            const overlayBytes = wire ? wire.geometry.attributes.position.array.byteLength : 0;
            return { vertices: count, triangles: indices.length / 3, geometryBytes, overlayBytes, estimatedGpuBytes: geometryBytes + overlayBytes, estimatedPeakBytes, memoryCapBytes: OVERVIEW_MEMORY_CAP };
        },
        dispose() {
            wire?.geometry.dispose();
            wire?.material.dispose();
            geometry.dispose();
            material.dispose();
        }
    };
}
