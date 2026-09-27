// Compare dense geometry with relightable floor tiles and complementary sparse geometry.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2FloorBake } from './GrassDebugV2FloorBake.js';
import { createGrassDebugV2FloorMaterial } from './GrassDebugV2FloorMaterial.js';
import { createGrassDebugV2TextureVolume } from './GrassDebugV2TextureVolume.js';
import { createGrassDebugV2EdgeLeaves } from './GrassDebugV2EdgeLeaves.js';
import { createGrassDebugV2RingPatch } from './GrassDebugV2RingPatch.js';
import { createGrassDebugV2DirectionalFloor } from './GrassDebugV2DirectionalFloor.js';

function makeSubset(original, stride, offset = 0) {
    const subset = new THREE.Group(), matrix = new THREE.Matrix4();
    for (const mesh of original.children.filter(mesh => mesh.isInstancedMesh)) {
        const copy = new THREE.InstancedMesh(mesh.geometry, mesh.material, mesh.count / stride);
        for (let i = 0; i < copy.count; i++) { mesh.getMatrixAt(i * stride + offset, matrix); copy.setMatrixAt(i, matrix); }
        copy.castShadow = copy.receiveShadow = true; copy.instanceMatrix.needsUpdate = true;
        copy.computeBoundingBox(); copy.computeBoundingSphere(); subset.add(copy);
    }
    return subset;
}

function disposeSubset(subset) {
    subset.children.forEach(mesh => mesh.dispose());
}

/** @param {{renderer:THREE.WebGLRenderer, patch:ReturnType<import('./GrassDebugV2RandomLeafPatch.js').createGrassDebugV2RandomLeafPatch>, ground:THREE.Mesh, shadowDirection:THREE.Vector3}} options */
export async function createGrassDebugV2FloorComparison({ renderer, patch, ground, shadowDirection }) {
    const source = patch.getSnapshot(), leaves = 1000;
    if (source.leaves !== 4000) throw new Error('Floor comparison requires the 4,000-leaf source patch.');
    const bakeSource = patch.representations.refined.group;
    const bake = await createGrassDebugV2FloorBake({ renderer, source: bakeSource, ground });
    const sparseSource = makeSubset(bakeSource, 2);
    let sparseBake;
    try { sparseBake = await createGrassDebugV2FloorBake({ renderer, source: sparseSource, ground }); }
    catch (error) { bake.dispose(); throw error; }
    finally { disposeSubset(sparseSource); }
    const group = new THREE.Group(); group.name = 'GrassV2FloorComparison';
    const materials = [bake, sparseBake].map((sourceBake, i) => {
        const material = createGrassDebugV2FloorMaterial(sourceBake.textures, { canopyContrast: i ? 0.5 : 1 });
        material.name = i ? 'GrassV2RelightableFloor2K' : 'GrassV2RelightableFloor4K'; return material;
    });
    const geometry = new THREE.PlaneGeometry(1, 1); geometry.rotateX(-Math.PI / 2);
    const inset = 0.01, mixedSize = 1 - 2 * inset;
    const mixedGeometry = new THREE.PlaneGeometry(mixedSize, mixedSize); mixedGeometry.rotateX(-Math.PI / 2);
    const mixedUv = mixedGeometry.attributes.uv;
    for (let i = 0; i < mixedUv.count; i++)
        mixedUv.setXY(i, inset + mixedUv.getX(i) * mixedSize, inset + mixedUv.getY(i) * mixedSize);
    const fields = [
        { id: 'source', x: 0, z: 0, geometryLeaves: 4000, textureLeaves: 0, label: '4,000 leaves' },
        { id: 'texture4k', x: -2.6, z: -1.3, geometryLeaves: 0, textureLeaves: 4000, label: 'Texture · 4K + alpha edge' },
        { id: 'hybrid1k', x: 0, z: -2.6, geometryLeaves: 1000, textureLeaves: 4000, label: 'Texture · 4K + 1K leaves' },
        { id: 'reference', x: 1.3, z: 0, geometryLeaves: 2000, textureLeaves: 0, label: '2,000 leaves' },
        { id: 'texture2k', x: 1.3, z: -1.3, geometryLeaves: 0, textureLeaves: 2000, label: 'Texture · 2K + alpha edge' },
        { id: 'hybrid2k', x: 1.3, z: -2.6, geometryLeaves: 2000, textureLeaves: 2000, label: 'Texture · 2K + 2K leaves' },
        { id: 'edge4k', x: 0, z: -1.3, geometryLeaves: 0, textureLeaves: 4000, edgeLeaves: true, label: 'Texture · 4K + LOD3 · 2 edge' },
        { id: 'rings4k', x: -1.3, z: -1.3, geometryLeaves: 0, textureLeaves: 4000, experimentalRing: true, label: 'Texture · 4K · 3 views + bent outer ring' }
    ];
    const volume = await createGrassDebugV2TextureVolume({ renderer, source: bakeSource, topBakes: { 4000: bake, 2000: sparseBake },
        fields: fields.filter(field => field.textureLeaves && !field.geometryLeaves && !field.experimentalRing) });
    group.add(volume.group);
    const edgeField = fields.find(field => field.edgeLeaves);
    const edgeLeaves = createGrassDebugV2EdgeLeaves({ source: patch.representations.split.group, surfaceHeight: volume.surfaceHeight,
        x: edgeField.x, z: edgeField.z });
    group.add(edgeLeaves.group);
    const ringField = fields.find(field => field.experimentalRing);
    const ringPatch = await createGrassDebugV2RingPatch({ renderer, source: bakeSource, sideBake: volume.bake, x: ringField.x, z: ringField.z });
    group.add(ringPatch.group);
    const directionalFloor = await createGrassDebugV2DirectionalFloor({ renderer, source: bakeSource, ground, topBake: bake, planeHeight: ringPatch.baseHeight, shadowDirection });
    const ringMaterial = directionalFloor.material;
    const surfaceHeight = field => field.experimentalRing ? ringPatch.baseHeight : field.textureLeaves ? (field.geometryLeaves ? 0.01 : volume.surfaceHeight) : 0;
    const tiles = fields.filter(field => field.textureLeaves).map(field => {
        const tile = new THREE.Mesh(field.experimentalRing ? ringPatch.floorGeometry : field.geometryLeaves ? mixedGeometry : geometry, field.experimentalRing ? ringMaterial : materials[field.textureLeaves === 2000 ? 1 : 0]);
        tile.position.set(field.x, surfaceHeight(field), field.z); tile.castShadow = false; tile.receiveShadow = true;
        if (field.experimentalRing) tile.onBeforeRender = (_renderer, _scene, camera) => directionalFloor.updateCamera(camera, tile);
        tile.name = 'GrassV2Floor-' + field.id; group.add(tile); return tile;
    });
    const originals = { LOD0: patch.lod0, ...Object.fromEntries(Object.entries(patch.representations).map(([mode, variant]) => [mode, variant.group])) };
    const makeRepresentations = (stride, offset, field) => Object.freeze(Object.fromEntries(Object.entries(originals).map(([mode, original]) => {
        const subset = makeSubset(original, stride, offset); subset.position.set(field.x, 0, field.z);
        subset.name = 'GrassV2Comparison-' + field.id + '-' + mode; group.add(subset); return [mode, subset];
    })));
    const hybrid = makeRepresentations(4, 0, fields[2]);
    const reference = makeRepresentations(2, 0, fields[3]);
    const hybrid2K = makeRepresentations(2, 1, fields[5]);
    const representations = [hybrid, reference, hybrid2K];
    const outlineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 0, -0.5),
        new THREE.Vector3(0.5, 0, 0.5), new THREE.Vector3(-0.5, 0, 0.5)
    ]);
    const outlineMaterial = new THREE.LineBasicMaterial({ color: new THREE.Color('#348fff').multiplyScalar(1 / renderer.toneMappingExposure),
        toneMapped: false, depthTest: false, depthWrite: false });
    const outlines = fields.slice(1).map(field => {
        const outline = new THREE.LineLoop(outlineGeometry, outlineMaterial); outline.position.set(field.x, 0.002, field.z);
        outline.renderOrder = 11; group.add(outline); return outline;
    });
    const labels = fields.map(field => {
        const element = document.createElement('div'); element.className = 'grass-comparison-label';
        element.textContent = field.label;
        document.body.append(element); return { element, anchor: new THREE.Vector3(field.x, 0.002, field.z + 0.56) };
    });
    const bounds = new THREE.Box3(new THREE.Vector3(-3.1, 0, -3.1), new THREE.Vector3(1.8, source.bounds.max[1], 0.5));
    const screen = new THREE.Vector3(); let mode = 'LOD0', labelsVisible = true;
    const setMode = value => {
        if (!Object.hasOwn(hybrid, value)) throw new Error('Unknown floor comparison LOD.');
        mode = value;
        for (const variants of representations) for (const [name, subset] of Object.entries(variants)) subset.visible = name === mode;
    };
    const trianglesForLeaves = count => (mode === 'LOD0' ? source.leafTriangles + source.crownTriangles : source.variants[mode].triangles) * count / source.leaves;
    const getPatchDetails = id => {
        const field = fields.find(field => field.id === id);
        if (!field) throw new Error('Unknown comparison patch.');
        const label = mode === 'LOD0' ? 'LOD0' : 'LOD3 · ' + source.variants[mode].cardsPerTuft;
        const leafTriangles = field.edgeLeaves ? edgeLeaves.leaves * 4 : trianglesForLeaves(field.geometryLeaves), floorTriangles = field.textureLeaves ? 2 : 0;
        const wallTriangles = field.textureLeaves && !field.geometryLeaves ? 8 : 0;
        const silhouetteTriangles = field.experimentalRing ? 16 : wallTriangles && !field.edgeLeaves ? 8 : 0;
        const shadowOnlyTriangles = field.experimentalRing ? ringPatch.getSnapshot().shadowOnlyTriangles : 0;
        return { textureLeaves: field.textureLeaves, rings: field.experimentalRing ? ringPatch.getSnapshot().rings : [],
            leavesByLod: field.edgeLeaves ? { 'LOD3 · 2': edgeLeaves.leaves } : field.geometryLeaves ? { [label]: field.geometryLeaves } : {},
            leafTriangles, floorTriangles, wallTriangles, silhouetteTriangles, shadowOnlyTriangles, triangles: leafTriangles + floorTriangles + wallTriangles + silhouetteTriangles + shadowOnlyTriangles };
    };
    setMode(mode);
    return Object.freeze({ group, tiles: Object.freeze(tiles), hybrid, reference, hybrid2K, bake, sparseBake, volume, edgeLeaves, ringPatch, directionalFloor, bounds, setMode, getPatchDetails,
        setNormalFacing: edgeLeaves.setNormalFacing, setAlphaCoverage: edgeLeaves.setAlphaCoverage,
        setSquareBounds: visible => outlines.forEach(outline => { outline.visible = visible; }),
        setLabelsVisible: visible => { labelsVisible = !!visible; },
        updateLabels: (camera, canvas) => {
            const rect = canvas.getBoundingClientRect();
            for (const { element, anchor } of labels) {
                screen.copy(anchor).project(camera); element.hidden = !labelsVisible || screen.z < -1 || screen.z > 1 || Math.abs(screen.x) > 1.1 || Math.abs(screen.y) > 1.1;
                element.style.left = rect.left + (screen.x * 0.5 + 0.5) * rect.width + 'px';
                element.style.top = rect.top + (-screen.y * 0.5 + 0.5) * rect.height + 'px';
            }
        },
        getSnapshot: () => ({ sourceLeaves: source.leaves, hybridLeaves: leaves, gapMeters: 0.3, squareMeters: 1, mode, labelsVisible,
            centers: fields.map(field => [field.x, surfaceHeight(field), field.z]),
            fields: fields.map(field => ({ ...field, geometryLeaves: field.edgeLeaves ? edgeLeaves.leaves : field.geometryLeaves,
                surfaceHeight: surfaceHeight(field), geometryTriangles: getPatchDetails(field.id).leafTriangles,
                ...getPatchDetails(field.id) })),
            edgeLeaves: edgeLeaves.getSnapshot(), ringPatch: ringPatch.getSnapshot(), directionalFloor: directionalFloor.getSnapshot(),
            volume: volume.getSnapshot(),
            bake: { ...bake.getSnapshot(), sourceLod: 'LOD3 · 10', sourceLeaves: 4000, sourceTriangles: source.variants.refined.triangles },
            sparseBake: { ...sparseBake.getSnapshot(), sourceLod: 'LOD3 · 10', sourceLeaves: 2000, sourceStride: 2, sourceOffset: 0 },
            hybridTriangles: trianglesForLeaves(leaves), hybrid2KTriangles: trianglesForLeaves(2000),
            totalGeometryLeaves: 9000 + edgeLeaves.leaves,
            totalTriangles: fields.reduce((sum, field) => sum + getPatchDetails(field.id).triangles, 0) }),
        dispose: () => {
            labels.forEach(label => label.element.remove()); volume.dispose(); edgeLeaves.dispose(); ringPatch.dispose(); directionalFloor.dispose();
            representations.forEach(variants => Object.values(variants).forEach(disposeSubset));
            geometry.dispose(); mixedGeometry.dispose(); materials.forEach(material => material.dispose()); outlineGeometry.dispose(); outlineMaterial.dispose(); bake.dispose(); sparseBake.dispose();
        }
    });
}
