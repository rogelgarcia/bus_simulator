// Split the paired source into independent five-leaf rows, sharing meshes and PBR atlases.
// LOD0 and every card layout share curvature, length, size, rotation, inclination and burial transforms.
// @ts-check
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GRASS_V2_PLANT } from './GrassDebugV2Plant.js';
import { createGrassDebugV2PlantShapeSources, GRASS_V2_PLANT_CURVATURES, GRASS_V2_PLANT_LENGTHS } from './GrassDebugV2PlantShapeSources.js';
import { createGrassDebugV2PlantPatchLayout, GRASS_V2_PATCH_PACKING } from './GrassDebugV2PlantPatchLayout.js';

/** @param {ReturnType<import('./GrassDebugV2PlantRow.js').createGrassDebugV2PlantRow>} plant
 * @param {ReturnType<import('./GrassDebugV2PlantCards.js').createGrassDebugV2PlantCards>} cards
 * @param {{singleTuft?: boolean}} [options] */
export function createGrassDebugV2PlantPatch(plant, cards, { singleTuft = false } = {}) {
    if (plant.roots.length !== 5 || plant.leaves.length !== 10) throw new Error('Split patch requires five source leaves on each side.');
    const leavesPerTuft = plant.roots.length;
    const source = plant.getSnapshot(), rootY = -GRASS_V2_PLANT.rootDepthMeters;
    const representations = {}, roots = [], leaves = [], ownedGeometries = [];
    const sideNames = ['positive', 'negative'];
    const sourceHalves = sideNames.map((_, side) => {
        const group = new THREE.Group();
        for (let i = 0; i < leavesPerTuft; i++) group.add(plant.leaves[i * 2 + side].clone(), plant.crowns[i].clone());
        return group;
    });
    const shapeSources = singleTuft ? [] : createGrassDebugV2PlantShapeSources(plant);
    const packing = singleTuft ? {
        placements: Object.freeze([Object.freeze({ side: 0, x: 0, z: 0, yaw: 0, scale: 1, inclination: 1, depth: 1,
            pitch: 0, burialMeters: 0, sourceId: 'original', curvatureId: 'original', lengthId: 'full', leafCount: leavesPerTuft })]),
        stats: null
    } : createGrassDebugV2PlantPatchLayout({
        sources: shapeSources,
        rootDepthMeters: -rootY, acrossSegments: GRASS_V2_PLANT.acrossSegments
    });
    const placements = packing.placements;
    const matrices = placements.map(placement => singleTuft ? new THREE.Matrix4() : new THREE.Matrix4()
        .makeTranslation(placement.x, rootY - placement.burialMeters, placement.z)
        .multiply(new THREE.Matrix4().makeScale(placement.scale, placement.scale, placement.scale))
        .multiply(new THREE.Matrix4().makeRotationY(placement.yaw))
        .multiply(new THREE.Matrix4().makeRotationX(placement.pitch))
        .multiply(new THREE.Matrix4().makeTranslation(0, -rootY, 0))
        .multiply(shapeSources.find(source => source.id === placement.sourceId).matrix));
    const instantiate = (sourceGroup, index) => {
        const group = sourceGroup.clone();
        group.matrixAutoUpdate = false; group.matrix.copy(matrices[index]);
        return group;
    };
    const lod0 = new THREE.Group(); lod0.name = 'GrassV2RandomSingleSideTufts';
    for (const [index, placement] of placements.entries()) {
        const tuft = instantiate(sourceHalves[placement.side], index);
        tuft.name = `GrassV2Tuft${index}_${sideNames[placement.side]}`;
        lod0.add(tuft);
        for (let i = 0; i < leavesPerTuft; i++) leaves.push(tuft.children[i * 2]);
        for (const x of plant.roots) {
            const root = new THREE.Vector3(x, 0, 0).applyMatrix4(matrices[index]);
            roots.push(Object.freeze({ x: root.x, z: root.z }));
        }
    }
    for (const name of ['refined', 'detailed', 'curved', 'split']) {
        const original = cards[name], group = new THREE.Group(), boundaries = [];
        const boundaryMaterial = original.boundaries.children[0].material;
        const halves = sideNames.map(side => {
            const geometrySet = Object.entries(cards.layout[`${name}Cards`])
                .filter(([key]) => key.startsWith(side)).map(([, geometry]) => geometry);
            const geometry = mergeGeometries(geometrySet);
            geometry.computeBoundingBox(); geometry.computeBoundingSphere(); ownedGeometries.push(geometry);
            const half = new THREE.Group(), mesh = new THREE.Mesh(geometry, cards.material), outline = new THREE.Group();
            mesh.castShadow = mesh.receiveShadow = true;
            for (const card of geometrySet) {
                const edges = new THREE.EdgesGeometry(card); ownedGeometries.push(edges);
                const line = new THREE.LineSegments(edges, boundaryMaterial);
                line.renderOrder = 10; outline.add(line);
            }
            outline.visible = false; half.add(mesh, outline);
            return half;
        });
        group.name = `GrassV2SingleSideTufts_${name}`;
        for (const [index, placement] of placements.entries()) {
            const tuft = instantiate(halves[placement.side], index);
            group.add(tuft); boundaries.push(tuft.children[1]);
        }
        representations[name] = Object.freeze({ group, boundaries: Object.freeze(boundaries) });
    }
    return Object.freeze({
        lod0, representations: Object.freeze(representations), roots: Object.freeze(roots), leaves: Object.freeze(leaves),
        getSnapshot: () => ({
            layout: singleTuft ? 'tuft' : 'patch', tufts: placements.length, leavesPerTuft, leaves: placements.length * leavesPerTuft, squareMeters: 1,
            sourceSides: { positive: placements.filter(p => p.side === 0).length, negative: placements.filter(p => p.side === 1).length }, placements,
            packing: packing.stats,
            curvatures: (singleTuft ? [{ id: 'original', label: 'Original', archScale: 1 }] : GRASS_V2_PLANT_CURVATURES).map(definition => ({
                ...definition, tufts: placements.filter(p => p.curvatureId === definition.id).length,
                leaves: leavesPerTuft * placements.filter(p => p.curvatureId === definition.id).length
            })),
            lengths: (singleTuft ? [{ ...GRASS_V2_PLANT_LENGTHS[0], share: 1 }] : GRASS_V2_PLANT_LENGTHS).map(definition => ({
                ...definition, tufts: placements.filter(p => p.lengthId === definition.id).length,
                leaves: leavesPerTuft * placements.filter(p => p.lengthId === definition.id).length
            })),
            variation: { size: singleTuft ? [1, 1] : GRASS_V2_PATCH_PACKING.size,
                inclination: singleTuft ? [1, 1] : GRASS_V2_PATCH_PACKING.inclination,
                depth: singleTuft ? [1, 1] : GRASS_V2_PATCH_PACKING.depth, baseRootDepthMeters: -rootY },
            leafTriangles: source.leafTriangles / 2 * placements.length, crownTriangles: source.crownTriangles * placements.length,
            variants: Object.fromEntries(Object.entries(cards.getSnapshot().variants).map(([key, value]) =>
                [key, { cardsPerTuft: value.cards / 2, cards: value.cards / 2 * placements.length, triangles: value.triangles / 2 * placements.length }]))
        }),
        dispose: () => { for (const geometry of ownedGeometries) geometry.dispose(); }
    });
}
