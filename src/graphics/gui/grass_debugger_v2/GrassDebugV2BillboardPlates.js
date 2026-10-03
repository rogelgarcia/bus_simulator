// Fixed three-card groups share ten atlas variants and rotate at most five degrees per side.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2BillboardSource } from './GrassDebugV2BillboardSource.js?v=lod3-triads-1';
import { createGrassDebugV2TriadLayout, getGrassTriadTurns, GRASS_TRIAD_LAYOUT } from './GrassDebugV2TriadLayout.js?v=lod3-triads-1';
import { createGrassDebugV2BillboardAtlas } from './GrassDebugV2BillboardAtlas.js?v=lod3-triads-1';
import { createGrassDebugV2BillboardMaterial, attachGrassBillboardPlacement } from './GrassDebugV2BillboardMaterial.js?v=lod3-triads-1';

/**
 * @param {{renderer:THREE.WebGLRenderer,meshes:readonly THREE.Mesh[],lod2Meshes:readonly THREE.Mesh[],
 * material:THREE.MeshStandardMaterial,bounds?:{minX:number,maxX:number,minZ:number,maxZ:number},study?:boolean,
 * onProgress?:(message:string)=>void}} options
 */
export async function createGrassDebugV2BillboardPlates({ renderer, meshes, lod2Meshes, material, bounds, study = false, onProgress = () => {} }) {
    const started = performance.now(), source = createGrassDebugV2BillboardSource(meshes, lod2Meshes);
    const box = source.source.geometry.boundingBox;
    bounds ??= { minX: Math.floor((box.min.x - .3) / .3) * .3, maxX: Math.ceil((box.max.x + .3) / .3) * .3,
        minZ: Math.floor((box.min.z - .1) / .05) * .05, maxZ: Math.ceil((box.max.z + .1) / .05) * .05 };
    const plan = createGrassDebugV2TriadLayout({ bounds, roots: source.roots });
    onProgress('Baking LOD3 · 10 shared triad textures');
    const atlas = await createGrassDebugV2BillboardAtlas({ renderer, source, bounds, material, study });
    source.source.geometry.dispose();
    const capacity = Math.max(1, plan.plates.length);
    const placement = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const rectangles = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    const axes = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-.5, 0, 0, .5, 0, 0, -.5, 1, 0, .5, 1, 0], 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Array(12).fill(1), 3));
    geometry.setAttribute('grassPlateAxis', axes); geometry.setAttribute('grassPlatePlacement', placement); geometry.setAttribute('grassPlateUvRect', rectangles);
    geometry.setIndex([0, 1, 2, 2, 1, 3]); geometry.instanceCount = 0;
    geometry.boundingBox = new THREE.Box3(new THREE.Vector3(bounds.minX - .3, 0, bounds.minZ - .3), new THREE.Vector3(bounds.maxX + .3, source.height, bounds.maxZ + .3));
    geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
    const uniforms = { grassTriadTurns: { value: new THREE.Vector3() }, grassBillboardHeight: { value: source.height } };
    const materials = createGrassDebugV2BillboardMaterial(atlas.maps, uniforms); materials.material.color.copy(material.color);
    const cards = new THREE.Mesh(geometry, materials.material); cards.name = 'GrassLOD3Triads';
    cards.castShadow = cards.receiveShadow = true; cards.customDepthMaterial = materials.depth;
    const fallbackGeometry = source.fallback.geometry, sourceIndices = fallbackGeometry.index.array;
    const fallbackIndices = new THREE.BufferAttribute(new Uint32Array(sourceIndices.length), 1).setUsage(THREE.DynamicDrawUsage);
    fallbackGeometry.setIndex(fallbackIndices); fallbackGeometry.setDrawRange(0, 0);
    const fallback = new THREE.Mesh(fallbackGeometry, material); fallback.name = 'GrassLOD3BoundaryLeaves';
    fallback.castShadow = fallback.receiveShadow = true;
    const group = new THREE.Group(); group.name = 'GrassField-LOD3'; group.add(cards, fallback);
    const wireGeometry = new THREE.InstancedBufferGeometry();
    for (const [name, attribute] of Object.entries(geometry.attributes)) wireGeometry.setAttribute(name, attribute);
    wireGeometry.setIndex([0, 1, 1, 3, 3, 2, 2, 0, 1, 2]); wireGeometry.instanceCount = 0;
    wireGeometry.boundingBox = geometry.boundingBox; wireGeometry.boundingSphere = geometry.boundingSphere;
    const wireMaterial = new THREE.LineBasicMaterial({ color: '#102415', depthWrite: false, toneMapped: false });
    attachGrassBillboardPlacement(wireMaterial, uniforms);
    const wire = new THREE.LineSegments(wireGeometry, wireMaterial); wire.visible = false; wire.renderOrder = 1; group.add(wire);
    const fallbackWireGeometry = new THREE.BufferGeometry();
    fallbackWireGeometry.setAttribute('position', fallbackGeometry.attributes.position); fallbackWireGeometry.setIndex([]);
    const fallbackWireMaterial = new THREE.LineBasicMaterial({ color: '#102415', depthWrite: false, toneMapped: false });
    const fallbackWire = new THREE.LineSegments(fallbackWireGeometry, fallbackWireMaterial); fallbackWire.visible = false; fallbackWire.renderOrder = 1; group.add(fallbackWire);
    let lastYaw = 0, overheadFallback = false, updateMilliseconds = 0, fallbackCount = 0, fallbackTriangles = 0, wireVisible = false;
    const direction = new THREE.Vector3(), variantMatches = new Map();
    const updateWire = () => {
        if (!study || !wireVisible) return;
        const lines = [];
        for (let i = 0; i < fallbackCount; i += 3) {
            const a = fallbackIndices.array[i], b = fallbackIndices.array[i + 1], c = fallbackIndices.array[i + 2];
            lines.push(a, b, b, c, c, a);
        }
        fallbackWireGeometry.setIndex(lines); fallbackWireGeometry.computeBoundingSphere();
    };
    const build = () => {
        const then = performance.now();
        let representedLeaves = 0;
        for (const [i, plate] of plan.plates.entries()) {
            const matchKey = (plate.small ? 'small:' : 'large:') + plate.leafIds.length;
            let matches = variantMatches.get(matchKey);
            if (!matches) {
                const variants = atlas.variants.filter(variant => (plate.small ? variant.smallLeaves : variant.leafCount) > 0);
                if (!variants.length) throw new Error('No populated texture variant for a billboard width.');
                const distance = variant => Math.abs((plate.small ? variant.smallLeaves : variant.leafCount) - plate.leafIds.length);
                const minimum = Math.min(...variants.map(distance));
                matches = variants.filter(variant => distance(variant) === minimum); variantMatches.set(matchKey, matches);
            }
            const variant = matches[(Math.imul(plate.groupId, 31) + plate.axis >>> 0) % matches.length];
            plate.variant = variant.tile;
            placement.setXYZ(i, plate.x, plate.z, plate.width); axes.setX(i, plate.axis);
            const [u, v, w, h] = variant.uv;
            rectangles.setXYZW(i, u + (plate.small ? w * .25 : 0), v, w * (plate.small ? .5 : 1), h);
            representedLeaves += plate.leafIds.length;
        }
        geometry.instanceCount = wireGeometry.instanceCount = plan.plates.length;
        geometry.userData.grassLeafCount = representedLeaves;
        placement.clearUpdateRanges(); placement.addUpdateRange(0, Math.max(3, plan.plates.length * 3)); placement.needsUpdate = true;
        rectangles.clearUpdateRanges(); rectangles.addUpdateRange(0, Math.max(4, plan.plates.length * 4)); rectangles.needsUpdate = true;
        fallbackCount = 0;
        for (const id of plan.fallback) {
            const range = source.fallback.ranges[id];
            fallbackIndices.array.set(sourceIndices.subarray(range.start, range.start + range.count), fallbackCount); fallbackCount += range.count;
        }
        fallbackTriangles = fallbackCount / 3;
        fallbackGeometry.setDrawRange(0, fallbackCount); fallbackGeometry.userData.grassLeafCount = plan.fallback.length;
        fallbackIndices.clearUpdateRanges(); fallbackIndices.addUpdateRange(0, Math.max(1, fallbackCount)); fallbackIndices.needsUpdate = true;
        updateWire(); updateMilliseconds = performance.now() - then;
    };
    build();
    const largeCards = plan.plates.filter(p => !p.small).length, smallCards = plan.plates.length - largeCards;
    const baseFallbackIndices = fallbackIndices.array.slice(0, fallbackCount);
    const setOverhead = enabled => {
        overheadFallback = enabled;
        const indices = enabled ? sourceIndices : baseFallbackIndices;
        fallbackIndices.array.set(indices); fallbackIndices.needsUpdate = true;
        fallbackIndices.clearUpdateRanges(); fallbackIndices.addUpdateRange(0, Math.max(1, indices.length));
        fallbackCount = indices.length; fallbackTriangles = fallbackCount / 3; fallbackGeometry.setDrawRange(0, fallbackCount);
        fallbackGeometry.userData.grassLeafCount = enabled ? source.roots.length : plan.fallback.length;
        geometry.instanceCount = wireGeometry.instanceCount = enabled ? 0 : plan.plates.length;
        geometry.userData.grassLeafCount = enabled ? 0 : source.roots.length - plan.fallback.length;
        updateWire();
    };
    const captureMilliseconds = performance.now() - started;
    const wireframe = Object.freeze({
        setVisible(value) {
            wireVisible = !!value; wire.visible = fallbackWire.visible = wireVisible;
            materials.material.polygonOffset = wireVisible; materials.material.polygonOffsetFactor = materials.material.polygonOffsetUnits = wireVisible ? 1 : 0;
            updateWire();
        },
        getSnapshot: () => ({ visible: wireVisible, meshes: 2, segments: geometry.instanceCount * 5 + fallbackCount }),
        dispose: () => { wire.removeFromParent(); fallbackWire.removeFromParent(); wireGeometry.dispose(); wireMaterial.dispose(); fallbackWireGeometry.dispose(); fallbackWireMaterial.dispose(); }
    });
    return Object.freeze({ group, bakeMeshes: Object.freeze([cards, fallback]), atlas, wireframe,
        /** @returns {boolean} Whether the shadow geometry changed. */
        updateCamera(camera) {
            const then = performance.now();
            camera.getWorldDirection(direction);
            const yaw = Math.hypot(direction.x, direction.z) > 1e-8 ? Math.atan2(-direction.x, -direction.z) : lastYaw;
            const turns = getGrassTriadTurns(yaw), current = uniforms.grassTriadTurns.value;
            const changed = Math.max(Math.abs(turns[0] - current.x), Math.abs(turns[1] - current.y), Math.abs(turns[2] - current.z)) > 1e-6;
            if (changed) current.fromArray(turns);
            const overheadChanged = (Math.abs(direction.y) > .98) !== overheadFallback;
            if (overheadChanged) setOverhead(!overheadFallback);
            lastYaw = yaw; updateMilliseconds = performance.now() - then;
            return overheadChanged;
        },
        getPlan: () => plan,
        getSnapshot: () => ({ ...GRASS_TRIAD_LAYOUT, layout: 'fixed-triads', lod: 'LOD3', source: 'LOD0',
            leaves: source.roots.length, cards: geometry.instanceCount, largeCards: overheadFallback ? 0 : largeCards, smallCards: overheadFallback ? 0 : smallCards,
            triads: overheadFallback ? 0 : plan.triads, fallbackLeaves: overheadFallback ? source.roots.length : plan.fallback.length, fallbackTriangles,
            triangles: geometry.instanceCount * 2 + fallbackTriangles, leafTriangles: geometry.instanceCount * 2 + fallbackTriangles,
            trianglesPerCard: 2, trianglesPerLeaf: [], atlasSets: 1, atlasSize: [atlas.width, atlas.height],
            estimatedTextureBytes: atlas.estimatedTextureBytes, captureMilliseconds,
            lightingBaked: false, worldOrientedNormals: true, doubleSided: true, fixedRestShadows: true, overheadFallback, axisTurns: uniforms.grassTriadTurns.value.toArray(), cameraYaw: lastYaw, updateMilliseconds }),
        dispose() { group.removeFromParent(); wireframe.dispose(); geometry.dispose(); fallbackGeometry.dispose(); materials.material.dispose(); materials.depth.dispose(); atlas.dispose(); }
    });
}
