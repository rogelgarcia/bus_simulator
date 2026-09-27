// Display evenly distributed field grass with a low canopy and matching LOD placements.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2SingleLeaf } from './GrassDebugV2SingleLeaf.js';
import { createGrassDebugV2PlantCards } from './GrassDebugV2PlantCards.js';
import { varyGrassDebugV2LeafBend } from './GrassDebugV2LeafBend.js';
import { attachGrassDebugV2InstancedCardNormals } from './GrassDebugV2InstancedCards.js';

export const GRASS_V2_FIELD_PROFILES = Object.freeze([
    Object.freeze({ id: 'upright', share: 4, tipFraction: 0.76, upperBend: 0.15, length: Object.freeze([0.42, 0.52]), width: Object.freeze([0.38, 0.52]) }),
    Object.freeze({ id: 'bowed', share: 4, tipFraction: 0.80, upperBend: 0.40, length: Object.freeze([0.44, 0.56]), width: Object.freeze([0.38, 0.52]) }),
    Object.freeze({ id: 'relaxed', share: 2, tipFraction: 0.84, upperBend: 0.70, length: Object.freeze([0.48, 0.60]), width: Object.freeze([0.38, 0.52]) })
]);
const MODES = Object.freeze(['refined', 'detailed', 'curved', 'split']);

/**
 * @param {{renderer:THREE.WebGLRenderer, plant:ReturnType<import('./GrassDebugV2SingleLeaf.js').createGrassDebugV2SingleLeaf>,
 * cards:ReturnType<import('./GrassDebugV2PlantCards.js').createGrassDebugV2PlantCards>,
 * rootSoil:import('./GrassDebugV2CardRootSoil.js').CardRootSoil, count?:number,
 * profiles?:typeof GRASS_V2_FIELD_PROFILES, seed?:number}} options
 */
export async function createGrassDebugV2RandomLeafPatch({ renderer, plant, cards, rootSoil, count = 4000,
    profiles = GRASS_V2_FIELD_PROFILES, seed = 9262026 }) {
    if (!Number.isInteger(count) || count <= 0 || count > 10000 || count % 10)
        throw new Error('Random leaf count must be a positive multiple of ten, at most 10,000.');
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Field seed must be an unsigned 32-bit integer.');
    if (!Array.isArray(profiles) || !profiles.length || new Set(profiles.map(profile => profile.id)).size !== profiles.length
        || !profiles.every(profile => typeof profile.id === 'string' && profile.id.length > 0
            && Number.isFinite(profile.share) && profile.share > 0 && Number.isInteger(count * profile.share / 10)
            && Number.isFinite(profile.tipFraction) && profile.tipFraction >= 0.5 && profile.tipFraction <= 1
            && Number.isFinite(profile.upperBend) && profile.upperBend >= 0 && profile.upperBend <= 1
            && [profile.length, profile.width].every(range => Array.isArray(range) && range.length === 2
                && range.every(Number.isFinite) && range[0] > 0 && range[1] >= range[0]))
        || Math.abs(profiles.reduce((sum, profile) => sum + profile.share, 0) - 10) > 1e-9)
        throw new Error('Field profiles require unique IDs, valid shape ranges and shares totaling ten with whole-leaf allocations.');
    profiles = Object.freeze(profiles.map(profile => Object.freeze({ ...profile,
        length: Object.freeze([...profile.length]), width: Object.freeze([...profile.width]) })));
    const leafSource = plant.getSnapshot();
    const lod0 = new THREE.Group(), representations = {}, sources = [], placements = [], shapeMetrics = [];
    lod0.name = 'GrassV2RandomLeafPatchLOD0';
    const boundaryMaterial = new THREE.LineBasicMaterial({ color: new THREE.Color('#cf55ff').multiplyScalar(1 / renderer.toneMappingExposure),
        depthTest: false, depthWrite: false, toneMapped: false });
    const boundaryPoints = Object.fromEntries(MODES.map(mode => [mode, []]));
    for (const mode of MODES) representations[mode] = { group: new THREE.Group(), boundaries: null };
    let randomState = seed;
    const random = () => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 4294967296; };
    const between = (a, b) => THREE.MathUtils.lerp(a, b, random());
    const transform = new THREE.Object3D(), bounds = new THREE.Box3(), vertex = new THREE.Vector3();
    for (const profile of profiles) {
        const source = createGrassDebugV2SingleLeaf({ material: plant.leaves[0].material, tipFraction: profile.tipFraction,
            definition: leafSource.definition, shape: leafSource.shape });
        shapeMetrics.push({ ...profile, leaves: count * profile.share / 10,
            ...varyGrassDebugV2LeafBend(source, 1, { upperBend: profile.upperBend }) });
        const sourceCards = createGrassDebugV2PlantCards(renderer, source, { nested: true, rootSoil });
        attachGrassDebugV2InstancedCardNormals(sourceCards.material);
        const instances = count * profile.share / 10;
        const meshes = [
            ...source.bakeMeshes.map(mesh => ({ group: lod0, mesh: new THREE.InstancedMesh(mesh.geometry, mesh.material, instances) })),
            ...MODES.map(mode => ({ group: representations[mode].group,
                mesh: new THREE.InstancedMesh(sourceCards[mode].mesh.geometry, sourceCards.material, instances) }))
        ];
        const edges = Object.fromEntries(MODES.map(mode => [mode, new THREE.EdgesGeometry(sourceCards[mode].mesh.geometry)]));
        const sourceBounds = new THREE.Box3().setFromObject(source.group);
        for (const mode of MODES) sourceBounds.union(sourceCards[mode].mesh.geometry.boundingBox);
        sources.push({ plant: source, cards: sourceCards, meshes, edges, bounds: sourceBounds, placed: 0 });
        await new Promise(resolve => requestAnimationFrame(resolve));
    }
    const variants = profiles.flatMap((profile, index) => Array(count * profile.share / 10).fill(index));
    for (let i = variants.length - 1; i > 0; i--) {
        const other = Math.floor(random() * (i + 1));
        [variants[i], variants[other]] = [variants[other], variants[i]];
    }
    const cells = Math.ceil(Math.sqrt(count)), spacing = 1 / cells, rootGrid = new Map();
    const cell = value => Math.floor((value + 0.5) / spacing);
    const nearestDistanceSquared = (x, z) => {
        let distance = (2 * spacing) ** 2;
        const cx = cell(x), cz = cell(z);
        for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
            const neighbors = rootGrid.get(((cx + dx + cells) % cells) + ':' + ((cz + dz + cells) % cells));
            if (neighbors) for (const root of neighbors) {
                const deltaX = Math.abs(root.x - x), deltaZ = Math.abs(root.z - z);
                distance = Math.min(distance, Math.min(deltaX, 1 - deltaX) ** 2 + Math.min(deltaZ, 1 - deltaZ) ** 2);
            }
        }
        return distance;
    };
    for (const variant of variants) {
        const profile = profiles[variant], source = sources[variant];
        const yaw = between(0, 360), pitch = between(-9, 9), roll = between(-5, 5);
        const scale = between(...profile.length), widthScale = between(...profile.width), burial = between(0, 0.0015);
        transform.position.set(0, -burial, 0);
        transform.rotation.set(THREE.MathUtils.degToRad(pitch), THREE.MathUtils.degToRad(yaw), THREE.MathUtils.degToRad(roll), 'YXZ');
        transform.scale.set(widthScale, scale, scale); transform.updateMatrix();
        const leafBounds = source.bounds.clone().applyMatrix4(transform.matrix);
        let x = 0, z = 0, separation = -1;
        for (let candidate = 0; candidate < 24; candidate++) {
            const candidateX = between(-0.5, 0.5);
            const candidateZ = between(-0.5, 0.5);
            const distance = nearestDistanceSquared(candidateX, candidateZ);
            if (distance > separation) { x = candidateX; z = candidateZ; separation = distance; }
        }
        const rootKey = cell(x) + ':' + cell(z);
        if (!rootGrid.has(rootKey)) rootGrid.set(rootKey, []);
        rootGrid.get(rootKey).push({ x, z });
        transform.position.set(x, -burial, z); transform.updateMatrix();
        bounds.union(leafBounds.translate(new THREE.Vector3(x, 0, z)));
        for (const { mesh } of source.meshes) mesh.setMatrixAt(source.placed, transform.matrix);
        source.placed++;
        for (const mode of MODES) {
            const points = source.edges[mode].attributes.position;
            for (let j = 0; j < points.count; j++) {
                vertex.fromBufferAttribute(points, j).applyMatrix4(transform.matrix);
                boundaryPoints[mode].push(vertex.x, vertex.y, vertex.z);
            }
        }
        placements.push({ variant, profile: profile.id, yaw, pitch, roll, scale, widthScale, burialMeters: burial, x, z });
    }
    for (const source of sources) {
        for (const { group, mesh } of source.meshes) {
            mesh.instanceMatrix.needsUpdate = true; mesh.castShadow = mesh.receiveShadow = true;
            mesh.computeBoundingBox(); mesh.computeBoundingSphere(); group.add(mesh);
        }
        Object.values(source.edges).forEach(edge => edge.dispose());
    }
    for (const mode of MODES) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(boundaryPoints[mode], 3));
        const boundaries = new THREE.LineSegments(geometry, boundaryMaterial);
        boundaries.visible = false; boundaries.renderOrder = 10;
        representations[mode].boundaries = boundaries; representations[mode].group.add(boundaries);
        Object.freeze(representations[mode]);
    }
    const counts = cards.getSnapshot().variants;
    const triangles = meshes => meshes.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0);
    const leafTriangles = sources.reduce((sum, source) => sum + triangles(source.plant.leaves) * source.placed, 0);
    const crownTriangles = sources.reduce((sum, source) => sum + triangles(source.plant.crowns) * source.placed, 0);
    return Object.freeze({
        lod0, representations: Object.freeze(representations),
        setNormalFacing: enabled => sources.forEach(source => source.cards.setNormalFacing(enabled)),
        setAlphaCoverage: enabled => sources.forEach(source => source.cards.setAlphaCoverage(enabled)),
        getSnapshot: () => ({
            layout: 'random', leaves: count, squareMeters: 1, seed, sourceLeaf: { definition: leafSource.definition, shape: leafSource.shape },
            placements, bends: shapeMetrics, distribution: 'even-independent', periodicRoots: true,
            bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
            leafTriangles, crownTriangles,
            variants: Object.fromEntries(MODES.map(mode => [mode, {
                cardsPerTuft: counts[mode].cards, cards: counts[mode].cards * count, triangles: counts[mode].triangles * count
            }])),
            corrections: sources.map(source => source.cards.getSnapshot().corrections)
        }),
        dispose: () => {
            for (const group of [lod0, ...Object.values(representations).map(value => value.group)]) group.traverse(object => {
                if (object.isInstancedMesh) object.dispose();
            });
            for (const value of Object.values(representations)) value.boundaries.geometry.dispose();
            boundaryMaterial.dispose();
            for (const source of sources) { source.cards.dispose(); source.plant.dispose(); }
        }
    });
}
