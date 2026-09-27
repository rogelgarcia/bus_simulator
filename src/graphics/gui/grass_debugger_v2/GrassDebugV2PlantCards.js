// Shared blade atlases support nested authoring cards and the historical benchmark fits.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2PlantCardLayout } from './GrassDebugV2PlantCardLayout.js';
import { createGrassDebugV2PlantCardAtlas } from './GrassDebugV2PlantCardAtlas.js';
import { createGrassDebugV2PlantCardMaterial } from './GrassDebugV2PlantCardMaterial.js';
/** @param {THREE.WebGLRenderer} renderer @param {import('./GrassDebugV2PlantCardLayout.js').PlantCardSource} plant @param {{nested?: boolean, rootSoil?: import('./GrassDebugV2CardRootSoil.js').CardRootSoil|null}} options */
export function createGrassDebugV2PlantCards(renderer, plant, { nested = false, rootSoil = null } = {}) {
    if ((plant.leaves.length !== 1 && (plant.leaves.length < 2 || plant.leaves.length % 2)) || !plant.leaves.every(leaf => leaf.geometry.attributes.uv && leaf.material.isMeshStandardMaterial
        && leaf.position.y === 0 && leaf.position.z === 0 && leaf.rotation.x === 0 && leaf.rotation.y === 0 && leaf.rotation.z === 0)) {
        throw new Error('Plant cards require one leaf or paired leaves aligned along X, with UVs and standard materials.');
    }
    const layout = createGrassDebugV2PlantCardLayout(plant, { nested });
    let atlas;
    try { atlas = createGrassDebugV2PlantCardAtlas(renderer, plant, layout, { rootSoil }); }
    catch (error) { layout.dispose(); throw error; }
    const shading = createGrassDebugV2PlantCardMaterial(atlas);
    const { material, setNormalFacing, setAlphaCoverage } = shading;
    const boundaryMaterial = new THREE.LineBasicMaterial({ color: new THREE.Color('#cf55ff').multiplyScalar(1 / renderer.toneMappingExposure), depthTest: false, depthWrite: false, toneMapped: false });
    const makeVariant = (geometry, cardGeometries) => {
        const group = new THREE.Group(), mesh = new THREE.Mesh(geometry, material), boundaries = new THREE.Group();
        mesh.castShadow = mesh.receiveShadow = true; group.add(mesh, boundaries);
        for (const card of Object.values(cardGeometries)) {
            const edge = new THREE.LineSegments(new THREE.EdgesGeometry(card), boundaryMaterial);
            edge.renderOrder = 10; boundaries.add(edge);
        }
        boundaries.visible = false;
        return Object.freeze({ group, mesh, boundaries });
    };
    const split = makeVariant(layout.split, layout.splitCards), curved = makeVariant(layout.curved, layout.curvedCards);
    const detailed = makeVariant(layout.detailed, layout.detailedCards);
    const refined = makeVariant(layout.refined, layout.refinedCards);
    const joined = Object.freeze({ mesh: new THREE.Mesh(layout.joined, material) });
    const sideCount = Object.keys(layout.sides).length;
    const counts = geometry => ({ cards: geometry.index.count / 6, cardsPerSide: geometry.index.count / (6 * sideCount), triangles: geometry.index.count / 3 });
    return Object.freeze({ split, curved, detailed, refined, joined, atlas, layout, material, setNormalFacing, setAlphaCoverage,
        getSnapshot: () => ({ specimens: Math.ceil(plant.leaves.length / 2), sourceLeaves: plant.leaves.length, sameSide: sideCount === 1,
            corrections: shading.getCorrections(),
            variants: { split: counts(layout.split), curved: counts(layout.curved), detailed: counts(layout.detailed), refined: counts(layout.refined) },
            hierarchy: layout.hierarchy,
            atlas: atlas.definition, maximumHeight: layout.curved.boundingBox.max.y, sides: layout.sides,
            splitSides: layout.splitSides, splitMaximumHeight: layout.split.boundingBox.max.y, splitMaximumProfileDeviation: layout.splitMaxDeviation,
            detailedSides: layout.detailedSides, detailedMaximumHeight: layout.detailed.boundingBox.max.y,
            detailedMaximumProfileDeviation: layout.detailedMaxDeviation,
            refinedSides: layout.refinedSides, refinedMaximumHeight: layout.refined.boundingBox.max.y,
            refinedMaximumProfileDeviation: layout.refinedMaxDeviation,
            baseline: { cards: 3, triangles: 6, topHeight: layout.topHeight, maximumCenterlineDeviation: layout.baselineMaxDeviation },
            maximumProfileDeviation: layout.maxDeviation, fitTarget: 'upper_blade_margins', profile: layout.profile, ...layout.metrics }),
        dispose: () => {
            for (const variant of [split, curved, detailed, refined]) for (const edge of variant.boundaries.children) edge.geometry.dispose();
            boundaryMaterial.dispose(); material.dispose(); atlas.dispose(); layout.dispose();
        }
    });
}
