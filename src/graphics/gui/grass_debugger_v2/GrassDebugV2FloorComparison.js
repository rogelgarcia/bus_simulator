// Assemble already-generated pipeline configurations into the comparison scene.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2FloorMaterial } from './GrassDebugV2FloorMaterial.js';

export function createGrassDebugV2FloorComparison({ renderer, patch, configurations, textureRecipes, bakes, volume, layout }) {
    const source = patch.getSnapshot(), fields = Object.values(configurations).map(item => item.field);
    const group = new THREE.Group(); group.name = 'GrassV2FloorComparison';
    const materials = Object.fromEntries(textureRecipes.map(recipe => {
        const material = createGrassDebugV2FloorMaterial(bakes[recipe.id].textures, { canopyContrast: recipe.canopyContrast });
        material.name = 'GrassV2RelightableFloor-' + recipe.id; return [recipe.id, material];
    }));
    const geometry = new THREE.PlaneGeometry(1, 1); geometry.rotateX(-Math.PI / 2);
    const inset = layout.mixedInsetMeters, mixedSize = 1 - 2 * inset;
    const mixedGeometry = new THREE.PlaneGeometry(mixedSize, mixedSize); mixedGeometry.rotateX(-Math.PI / 2);
    const mixedUv = mixedGeometry.attributes.uv;
    for (let i = 0; i < mixedUv.count; i++)
        mixedUv.setXY(i, inset + mixedUv.getX(i) * mixedSize, inset + mixedUv.getY(i) * mixedSize);
    group.add(volume.group);
    const surfaceHeight = field => field.experimentalRing ? configurations[field.id].ring.baseHeight
        : field.textureLeaves ? (field.geometryLeaves ? layout.mixedHeightMeters : volume.surfaceHeight) : 0;
    const tiles = fields.filter(field => field.textureLeaves).map(field => {
        const item = configurations[field.id];
        const tile = new THREE.Mesh(field.experimentalRing ? item.ring.floorGeometry : field.geometryLeaves ? mixedGeometry : geometry,
            field.experimentalRing ? item.directional.material : materials[field.textureId]);
        tile.position.set(field.x, surfaceHeight(field), field.z); tile.castShadow = false; tile.receiveShadow = true;
        if (field.experimentalRing) {
            tile.onBeforeRender = (_renderer, _scene, camera) => item.directional.updateCamera(camera, tile);
            group.add(item.ring.group);
        }
        if (item.edge) group.add(item.edge.group);
        tile.name = 'GrassV2Floor-' + field.id; group.add(tile); return tile;
    });
    const representations = Object.values(configurations).filter(item => item.representations).map(item => item.representations);
    for (const variants of representations) group.add(...Object.values(variants));
    const outlineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 0, -0.5),
        new THREE.Vector3(0.5, 0, 0.5), new THREE.Vector3(-0.5, 0, 0.5)
    ]);
    const outlineMaterial = new THREE.LineBasicMaterial({ color: new THREE.Color('#348fff').multiplyScalar(1 / renderer.toneMappingExposure),
        toneMapped: false, depthTest: false, depthWrite: false });
    const outlines = fields.filter(field => field.id !== 'source').map(field => {
        const outline = new THREE.LineLoop(outlineGeometry, outlineMaterial); outline.position.set(field.x, 0.002, field.z);
        outline.renderOrder = 11; group.add(outline); return outline;
    });
    const labels = fields.map(field => {
        const element = document.createElement('div'); element.className = 'grass-comparison-label';
        element.textContent = field.label; element.hidden = true;
        document.body.append(element); return { element, anchor: new THREE.Vector3(field.x, 0.002, field.z + 0.56) };
    });
    const bounds = new THREE.Box3();
    for (const field of fields) {
        bounds.expandByPoint(new THREE.Vector3(field.x - 0.5, 0, field.z - 0.5));
        bounds.expandByPoint(new THREE.Vector3(field.x + 0.5, source.bounds.max[1], field.z + 0.5));
    }
    const screen = new THREE.Vector3(); let mode = 'LOD0', labelsVisible = true;
    const setMode = value => {
        if (value !== 'LOD0' && !Object.hasOwn(patch.representations, value)) throw new Error('Unknown floor comparison LOD.');
        mode = value;
        for (const variants of representations) for (const [name, subset] of Object.entries(variants)) subset.visible = name === mode;
    };
    const groupTriangles = object => object.children.reduce((sum, mesh) => sum + (mesh.isInstancedMesh ? mesh.count * mesh.geometry.index.count / 3 : 0), 0);
    const getPatchDetails = id => {
        const item = configurations[id];
        if (!item) throw new Error('Unknown comparison patch.');
        const field = item.field;
        const label = mode === 'LOD0' ? 'LOD0' : 'LOD3 · ' + source.variants[mode].cardsPerTuft;
        const leafTriangles = item.edge ? item.edge.getSnapshot().triangles : item.representations ? groupTriangles(item.representations[mode])
            : field.id === 'source' ? groupTriangles(mode === 'LOD0' ? patch.lod0 : patch.representations[mode].group) : 0;
        const floorTriangles = field.textureLeaves ? 2 : 0;
        const wallTriangles = volume.walls.filter(wall => wall.userData.configurationId === id).length * 2
            + (item.ring ? item.ring.getSnapshot().wallTriangles : 0);
        const silhouetteTriangles = item.ring ? item.ring.getSnapshot().silhouetteTriangles
            : volume.silhouettes.filter(card => card.userData.configurationId === id).length * 2;
        const shadowOnlyTriangles = item.ring?.getSnapshot().shadowOnlyTriangles ?? 0;
        return { textureLeaves: field.textureLeaves,
            captures: item.directional ? { obliqueViews: item.directional.bakes.length,
                obliqueResolution: item.directional.getSnapshot().recipe.resolution, topResolution: item.bake.getSnapshot().resolution } : null,
            rings: item.ring?.getSnapshot().rings ?? [],
            leavesByLod: item.edge ? { [item.edge.getSnapshot().lod]: item.edge.leaves } : field.geometryLeaves ? { [label]: field.geometryLeaves } : {},
            leafTriangles, floorTriangles, wallTriangles, silhouetteTriangles, shadowOnlyTriangles,
            triangles: leafTriangles + floorTriangles + wallTriangles + silhouetteTriangles + shadowOnlyTriangles };
    };
    const edgeLeaves = Object.values(configurations).find(item => item.edge)?.edge;
    const experiment = Object.values(configurations).find(item => item.ring);
    const ringPatch = experiment?.ring, directionalFloor = experiment?.directional;
    const bake = bakes['4k'], sparseBake = bakes['2k'];
    const textureMetadata = id => {
        const recipe = textureRecipes.find(recipe => recipe.id === id);
        if (!recipe) return null;
        const captured = bakes[id].getSnapshot();
        return { ...captured, sourceLeaves: captured.sourceLeaves,
            sourceStride: recipe.stride, sourceOffset: recipe.offset };
    };
    setMode(mode);
    return Object.freeze({ group, configurations: Object.freeze(configurations), tiles: Object.freeze(tiles),
        hybrid: configurations.hybrid1k?.representations, reference: configurations.reference?.representations,
        hybrid2K: configurations.hybrid2k?.representations, bake, sparseBake, volume, edgeLeaves, ringPatch, directionalFloor, bounds, setMode, getPatchDetails,
        setNormalFacing: enabled => Object.values(configurations).forEach(item => item.edge?.setNormalFacing(enabled)),
        setAlphaCoverage: enabled => Object.values(configurations).forEach(item => item.edge?.setAlphaCoverage(enabled)),
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
        getSnapshot: () => ({ textures: Object.fromEntries(textureRecipes.map(recipe => [recipe.id, textureMetadata(recipe.id)])), sourceLeaves: source.leaves, hybridLeaves: configurations.hybrid1k?.field.geometryLeaves ?? 0, gapMeters: layout.gapMeters, squareMeters: 1, mode, labelsVisible,
            centers: fields.map(field => [field.x, surfaceHeight(field), field.z]),
            fields: fields.map(field => ({ ...field, geometryLeaves: configurations[field.id].edge?.leaves ?? field.geometryLeaves,
                surfaceHeight: surfaceHeight(field), geometryTriangles: getPatchDetails(field.id).leafTriangles, ...getPatchDetails(field.id) })),
            edgeLeaves: edgeLeaves?.getSnapshot() ?? null, ringPatch: ringPatch?.getSnapshot() ?? null, directionalFloor: directionalFloor?.getSnapshot() ?? null,
            volume: volume.getSnapshot(), bake: textureMetadata('4k'), sparseBake: textureMetadata('2k'),
            hybridTriangles: configurations.hybrid1k ? getPatchDetails('hybrid1k').leafTriangles : 0,
            hybrid2KTriangles: configurations.hybrid2k ? getPatchDetails('hybrid2k').leafTriangles : 0,
            totalGeometryLeaves: fields.reduce((sum, field) => sum + (configurations[field.id].edge?.leaves ?? field.geometryLeaves), 0),
            totalTriangles: fields.reduce((sum, field) => sum + getPatchDetails(field.id).triangles, 0) }),
        dispose: () => {
            labels.forEach(label => label.element.remove());
            geometry.dispose(); mixedGeometry.dispose(); Object.values(materials).forEach(material => material.dispose());
            outlineGeometry.dispose(); outlineMaterial.dispose(); group.clear();
        }
    });
}
