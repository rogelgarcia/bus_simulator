// Bake a sparse, periodic leaf population over litter for the card LODs.
import * as THREE from 'three';
import { createGrassDebugV2PeriodicSource } from './GrassDebugV2PeriodicSource.js';
import { createGrassDebugV2FieldCanopyBake } from './GrassDebugV2FieldCanopyBake.js?v=lod4-resolution-options-1';
import { createGrassDebugV2CanopyMaterials } from './GrassDebugV2CanopyMaterial.js?v=lod4-shadow-fast-1';
import { selectGrassSparseBaseShoots } from './GrassDebugV2SparseBaseLayout.js';

export async function createGrassDebugV2CardBase({ renderer, sources, density, soil, litter, shadowDirection,
    shadowPadding, shadowUniforms, sourceHeight, tileMeters, anisotropy, onProgress }) {
    if (!(density > 0 && density < 1) || sources.length !== 2) throw new Error('Card base requires a partial density and two compatible source tiles.');
    const bakes = [], leafCounts = [];
    let materials;
    try {
        const selectedShoots = selectGrassSparseBaseShoots(sources, density, tileMeters);
        for (const source of sources) {
            const geometry = source.geometry.clone(), indices = [], ranges = [];
            let selected = 0;
            source.userData.grassLeafRanges.forEach(({ start, count }, id) => {
                if (!selectedShoots.has(Math.floor(id / 2))) return;
                selected++;
                ranges.push({ start: indices.length, count });
                for (let i = start; i < start + count; i++) indices.push(source.geometry.index.getX(i));
            });
            geometry.setIndex(indices); leafCounts.push(selected);
            const mesh = new THREE.Mesh(geometry, source.material);
            mesh.userData.grassLeafRanges = ranges;
            let periodic, shadows;
            try {
                periodic = createGrassDebugV2PeriodicSource(mesh, 0, tileMeters);
                shadows = createGrassDebugV2PeriodicSource(mesh, shadowPadding, tileMeters);
                bakes.push(await createGrassDebugV2FieldCanopyBake({ renderer, source: periodic.group, shadowSource: shadows.group,
                    shadowDirection, soil, litter, width: tileMeters, depth: tileMeters, sourceHeight,
                    resolution: 1024, shadowResolution: 8192, anisotropy, layers: ['all'], onProgress }));
            } finally { periodic?.dispose(); shadows?.dispose(); geometry.dispose(); }
        }
        materials = createGrassDebugV2CanopyMaterials({ texturesByLayer: bakes[0].textures,
            secondaryTexturesByLayer: bakes[1].textures, shadowUniforms, resolution: 1024, tileMeters,
            sourceHeight, filterFootprint: 0, distanceStart: 10000, distanceEnd: 10001, farScale: 1 });
        materials.all.name = 'GrassCardBase-Sparse';
        return Object.freeze({ materials,
            getSnapshot: () => ({ density, leafCounts, layout: 'joint periodic coverage', variants: 2, resolution: 1024, tileMeters,
                textureBytes: bakes.reduce((sum, bake) => sum + bake.getSnapshot().residentTextureBytes, 0) }),
            dispose() { Object.values(materials).forEach(material => material.dispose()); bakes.forEach(bake => bake.dispose()); }
        });
    } catch (error) {
        if (materials) Object.values(materials).forEach(material => material.dispose());
        bakes.forEach(bake => bake.dispose()); throw error;
    }
}
