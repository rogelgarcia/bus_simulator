// Six unchanged authoring tufts share their source meshes and baked card textures.
// Seed 39818: accepted placements have disjoint inflated blade-section volumes,
// while gaps and whole-tuft footprints may overlap. Keep these poses reproducible.
// @ts-check
import * as THREE from 'three';

export const GRASS_V2_PATCH_PLACEMENTS = Object.freeze([
    Object.freeze({ x: 0.17496119181721137, z: 0.0612916590291106, yaw: 5.138032964062248 }),
    Object.freeze({ x: 0.024717596574711065, z: -0.15907936379136212, yaw: 4.655734105738897 }),
    Object.freeze({ x: -0.20878063958973958, z: 0.1893690039980256, yaw: 4.777594163550868 }),
    Object.freeze({ x: -0.11138044509009792, z: 0.24811852002693646, yaw: 5.017410924081545 }),
    Object.freeze({ x: -0.049652615346921225, z: -0.2360782187786854, yaw: 1.3941465973331806 }),
    Object.freeze({ x: 0.016129780543061356, z: 0.20644055447718435, yaw: 4.9193511287774685 })
]);

/** @param {ReturnType<import('./GrassDebugV2PlantRow.js').createGrassDebugV2PlantRow>} plant
 * @param {ReturnType<import('./GrassDebugV2PlantCards.js').createGrassDebugV2PlantCards>} cards */
export function createGrassDebugV2PlantPatch(plant, cards) {
    const source = plant.getSnapshot();
    const representations = {}, roots = [], leaves = [];
    const instantiate = (sourceGroup, placement) => {
        const group = sourceGroup.clone();
        group.position.set(placement.x, 0, placement.z); group.rotation.y = placement.yaw;
        return group;
    };
    const lod0 = new THREE.Group(); lod0.name = 'GrassV2SixTufts';
    for (const placement of GRASS_V2_PATCH_PLACEMENTS) {
        const tuft = instantiate(plant.group, placement);
        lod0.add(tuft);
        for (const leaf of plant.leaves) leaves.push(tuft.children[plant.group.children.indexOf(leaf)]);
        for (const x of plant.roots) roots.push(Object.freeze({
            x: placement.x + Math.cos(placement.yaw) * x,
            z: placement.z - Math.sin(placement.yaw) * x
        }));
    }
    for (const name of ['refined', 'detailed', 'curved', 'split']) {
        const original = cards[name], group = new THREE.Group(), boundaries = [];
        group.name = `GrassV2SixTufts_${name}`;
        for (const placement of GRASS_V2_PATCH_PLACEMENTS) {
            const tuft = instantiate(original.group, placement);
            group.add(tuft);
            boundaries.push(tuft.children[original.group.children.indexOf(original.boundaries)]);
        }
        representations[name] = Object.freeze({ group, boundaries: Object.freeze(boundaries) });
    }
    const count = GRASS_V2_PATCH_PLACEMENTS.length;
    return Object.freeze({
        lod0, representations: Object.freeze(representations), roots: Object.freeze(roots), leaves: Object.freeze(leaves),
        getSnapshot: () => ({
            tufts: count, leaves: source.leaves * count, scale: 1, squareMeters: 1,
            placements: GRASS_V2_PATCH_PLACEMENTS,
            leafTriangles: source.leafTriangles * count, crownTriangles: source.crownTriangles * count,
            variants: Object.fromEntries(Object.entries(cards.getSnapshot().variants).map(([key, value]) =>
                [key, { cards: value.cards * count, triangles: value.triangles * count }]))
        })
    });
}
