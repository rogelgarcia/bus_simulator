// Capture half the directional LOD0 plates and reuse matching images for the remaining placements.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2PlatePlan, GRASS_PLATE_LAYOUT } from './GrassDebugV2PlatePlan.js?v=lod3-plates-2';
import { createGrassDebugV2PlateReuse } from './GrassDebugV2PlateReuse.js?v=lod3-plates-2';
import { createGrassDebugV2PlateMaterial } from './GrassDebugV2PlateMaterial.js?v=lod3-plates-2';
import { grassPlateSurfaceBakeShader, grassPlateNormalShader } from '../../shaders/materials/grass/GrassPlateShaderLoader.js?v=lod3-plates-2';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';

/** Undo MSAA coverage and extend RGB only, keeping each bespoke tile isolated. */
function padTiles(data, size, tileWidth, tileHeight, normal) {
    const valid = new Uint8Array(data.length / 4), queue = new Int32Array(valid.length);
    let head = 0, tail = 0;
    for (let i = 0; i < valid.length; i++) {
        const o = i * 4, alpha = data[o + 3] / 255;
        if (!alpha) continue;
        valid[i] = 1; queue[tail++] = i;
        for (let c = 0; c < 3; c++) data[o + c] = Math.min(255, Math.round(data[o + c] / alpha));
        if (normal) {
            const x = data[o] / 127.5 - 1, y = data[o + 1] / 127.5 - 1, z = data[o + 2] / 127.5 - 1;
            const length = Math.hypot(x, y, z);
            data[o] = Math.round((x / length + 1) * 127.5);
            data[o + 1] = Math.round((y / length + 1) * 127.5);
            data[o + 2] = Math.round((z / length + 1) * 127.5);
        }
    }
    const visit = (from, to) => {
        if (!valid[to]) {
            const a = from * 4, b = to * 4;
            data[b] = data[a]; data[b + 1] = data[a + 1]; data[b + 2] = data[a + 2];
            valid[to] = 1; queue[tail++] = to;
        }
    };
    while (head < tail) {
        const i = queue[head++], x = i % size, y = Math.floor(i / size);
        if (x % tileWidth) visit(i, i - 1);
        if (x % tileWidth < tileWidth - 1) visit(i, i + 1);
        if (y % tileHeight) visit(i, i - size);
        if (y % tileHeight < tileHeight - 1) visit(i, i + size);
    }
}

/**
 * @param {{renderer:THREE.WebGLRenderer, meshes:readonly THREE.Mesh[], material:THREE.MeshStandardMaterial,
 * study?:boolean, onProgress?:(message:string)=>void}} options
 */
export async function createGrassDebugV2DynamicPlates({ renderer, meshes, material, study = false, onProgress = () => {} }) {
    const started = performance.now(), plan = createGrassDebugV2PlatePlan(meshes);
    const tileWidth = study ? 2048 : 128, tileHeight = study ? 256 : 64;
    const size = 2048, columns = size / tileWidth, capacity = columns * (size / tileHeight), gutter = 2;
    if (renderer.capabilities.maxTextureSize < size) throw new Error('Dynamic grass plates require 2048-pixel textures.');
    const group = new THREE.Group(); group.name = 'GrassField-LOD3';
    const reuse = createGrassDebugV2PlateReuse(plan.plates), captures = reuse.captures;
    const step = Math.PI * 2 / GRASS_PLATE_LAYOUT.directions;
    const sets = [], visited = new Uint8Array(plan.geometry.attributes.position.count);
    const order = [], ranges = [];
    for (const plate of captures) {
        ranges.push({ start: order.length, count: plate.count });
        for (let i = plate.start; i < plate.start + plate.count; i++) order.push(plan.geometry.index.getX(i));
    }
    plan.geometry.setIndex(order);
    const p = plan.geometry.attributes.position, n = plan.geometry.attributes.normal, index = plan.geometry.index;
    const sourcePosition = p.clone(); plan.geometry.setAttribute('grassPlatePosition', sourcePosition);
    // Project each source vertex into its own atlas tile; retain source depth for correct within-plate occlusion.
    for (const [captureIndex, plate] of captures.entries()) {
        const range = ranges[captureIndex];
        const tile = captureIndex % capacity, x0 = (tile % columns) * tileWidth + gutter;
        const y0 = Math.floor(tile / columns) * tileHeight + gutter;
        const angle = plate.direction * step, sine = Math.sin(angle), cosine = Math.cos(angle);
        for (let i = range.start; i < range.start + range.count; i++) {
            const v = index.getX(i);
            if (visited[v]) continue;
            visited[v] = 1;
            const x = p.getX(v), y = p.getY(v), z = p.getZ(v), nx = n.getX(v), nz = n.getZ(v);
            sourcePosition.setXYZ(v, cosine * x - sine * z - plate.left, y, sine * x + cosine * z - plate.front);
            p.setXYZ(v, x0 + (cosine * x - sine * z - plate.left) / .5 * (tileWidth - 2 * gutter),
                y0 + y / plan.height * (tileHeight - 2 * gutter), sine * x + cosine * z - plate.front);
            n.setXYZ(v, cosine * nx - sine * nz, n.getY(v), sine * nx + cosine * nz);
        }
    }
    p.needsUpdate = n.needsUpdate = true;
    const albedo = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false });
    const normal = new THREE.MeshNormalMaterial({ normalMap: material.normalMap, normalScale: material.normalScale,
        side: THREE.DoubleSide, toneMapped: false });
    attachShaderMetadata(normal, grassPlateNormalShader);
    registerMaterialShaderHook(normal, { id: 'grass.plate.capture.normal', variantKey: grassPlateNormalShader.variantKey,
        apply: shader => { shader.vertexShader = grassPlateNormalShader.vertexSource; } });
    const surface = new THREE.ShaderMaterial({ vertexShader: grassPlateSurfaceBakeShader.vertexSource,
        fragmentShader: grassPlateSurfaceBakeShader.fragmentSource, side: THREE.DoubleSide, toneMapped: false,
        uniforms: { roughnessMap: { value: material.roughnessMap }, roughness: { value: material.roughness } } });
    attachShaderMetadata(surface, grassPlateSurfaceBakeShader);
    const target = new THREE.WebGLRenderTarget(size, size, { samples: 4, colorSpace: THREE.NoColorSpace });
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(0, size, size, 0, .01, 2);
    camera.position.z = 1;
    const capture = new THREE.Mesh(plan.geometry, albedo); capture.frustumCulled = false; scene.add(capture);
    const previous = { target: renderer.getRenderTarget(), color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(),
        autoClear: renderer.autoClear, toneMapping: renderer.toneMapping, xr: renderer.xr.enabled,
        viewport: renderer.getViewport(new THREE.Vector4()), scissor: renderer.getScissor(new THREE.Vector4()), scissorTest: renderer.getScissorTest() };
    try {
        renderer.xr.enabled = false; renderer.autoClear = false; renderer.toneMapping = THREE.NoToneMapping; renderer.setScissorTest(false);
        for (let first = 0; first < captures.length; first += capacity) {
            const plates = plan.plates.filter(plate => reuse.captureIndices[plate.id] >= first && reuse.captureIndices[plate.id] < first + capacity), maps = {};
            const begin = ranges[first].start, last = ranges[Math.min(first + capacity, captures.length) - 1];
            plan.geometry.setDrawRange(begin, last.start + last.count - begin);
            onProgress('Baking LOD3 plates · ' + first.toLocaleString() + ' / ' + captures.length.toLocaleString());
            const set = { maps, material: null, geometry: null }; sets.push(set);
            for (const [name, captureMaterial] of [['albedo', albedo], ['normal', normal], ['roughness', surface]]) {
                capture.material = captureMaterial;
                renderer.setRenderTarget(target);
                renderer.setClearColor(0, 0); renderer.clear(); renderer.render(scene, camera); renderer.setRenderTarget(null);
                const pixels = new Uint8Array(size * size * 4);
                renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
                padTiles(pixels, size, tileWidth, tileHeight, name === 'normal');
                const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
                texture.name = 'GrassPlate-' + first + '-' + name; texture.colorSpace = THREE.NoColorSpace;
                texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter; texture.generateMipmaps = true;
                texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); texture.needsUpdate = true;
                maps[name] = texture;
            }
            set.material = createGrassDebugV2PlateMaterial(maps); set.material.color.copy(material.color);
            const positions = [], uvs = [], indices = [], colors = [];
            for (const [i, plate] of plates.entries()) {
                const angle = plate.direction * step, sine = Math.sin(angle), cosine = Math.cos(angle);
                const tile = reuse.captureIndices[plate.id] - first;
                const x0 = (tile % columns) * tileWidth + gutter, y0 = Math.floor(tile / columns) * tileHeight + gutter;
                for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
                    const x = plate.left + u * .5;
                    positions.push(cosine * x + sine * plate.front, v * plan.height, -sine * x + cosine * plate.front);
                    uvs.push((x0 + u * (tileWidth - 2 * gutter)) / size, (y0 + v * (tileHeight - 2 * gutter)) / size);
                    colors.push(1, 1, 1);
                }
                indices.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3);
            }
            const geometry = new THREE.BufferGeometry(); set.geometry = geometry;
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            geometry.setIndex(indices); geometry.computeVertexNormals();
            geometry.setAttribute('grassFacingNormal', geometry.attributes.normal.clone());
            geometry.computeBoundingBox(); geometry.computeBoundingSphere();
            const mesh = new THREE.Mesh(geometry, set.material);
            mesh.name = 'GrassLOD3PlateAtlas-' + sets.length; mesh.castShadow = mesh.receiveShadow = true;
            mesh.userData.grassLeafCount = plates.reduce((sum, plate) => sum + plate.leafIds.length, 0);
            group.add(mesh);
            // Keep the loading status responsive during this deliberately bespoke capture.
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    } catch (error) {
        sets.forEach(set => { set.geometry?.dispose(); set.material?.dispose(); Object.values(set.maps).forEach(map => map.dispose()); });
        throw error;
    } finally {
        renderer.setRenderTarget(previous.target); renderer.setViewport(previous.viewport); renderer.setScissor(previous.scissor);
        renderer.setScissorTest(previous.scissorTest); renderer.setClearColor(previous.color, previous.alpha);
        renderer.autoClear = previous.autoClear; renderer.toneMapping = previous.toneMapping; renderer.xr.enabled = previous.xr;
        target.dispose(); albedo.dispose(); normal.dispose(); surface.dispose(); plan.dispose();
    }
    const snapshot = Object.freeze({ ...GRASS_PLATE_LAYOUT, source: 'LOD0', lod: 'LOD3', layout: 'dynamic-plates',
        leaves: plan.leaves, cards: plan.plates.length, triangles: plan.plates.length * 2, leafTriangles: plan.plates.length * 2,
        bakedPlates: captures.length, reusedPlates: plan.plates.length - captures.length,
        trianglesPerCard: 2, trianglesPerLeaf: [], atlasSets: sets.length, atlasSize: size, tileWidth, tileHeight,
        estimatedTextureBytes: sets.length * size * size * 4 * 3 * 4 / 3,
        captureMilliseconds: performance.now() - started, lightingBaked: false, directionLeaves: plan.directionLeaves,
        minimumFacing: plan.minimumFacing });
    return Object.freeze({ group, bakeMeshes: Object.freeze([...group.children]), plan: Object.freeze({ plates: plan.plates, assignments: plan.assignments, captures, captureIndices: reuse.captureIndices }), sets,
        getSnapshot: () => snapshot,
        dispose: () => { group.removeFromParent(); sets.forEach(set => { set.geometry.dispose(); set.material.dispose(); Object.values(set.maps).forEach(map => map.dispose()); }); }
    });
}

export { padTiles as padGrassPlateTiles };
