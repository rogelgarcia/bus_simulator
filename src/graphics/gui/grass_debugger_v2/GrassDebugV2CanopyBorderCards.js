// Capture fixed perimeter strips from the original LOD2 leaves; retain geometric corners and incomplete strips.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2CanopyBorderLayout } from './GrassDebugV2CanopyBorderLayout.js';
import { createGrassDebugV2PlateMaterial } from './GrassDebugV2PlateMaterial.js';
import { padGrassPlateTiles } from './GrassDebugV2DynamicPlates.js';
import { grassPlateSurfaceBakeShader, grassPlateNormalShader } from '../../shaders/materials/grass/GrassPlateShaderLoader.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';

function describeLeaves(source, ids) {
    const { position: p, uv } = source.geometry.attributes, index = source.geometry.index;
    return ids.map(id => {
        const range = source.userData.grassLeafRanges[id], vertices = new Set();
        let minV = Infinity, minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
        for (let i = range.start; i < range.start + range.count; i++) {
            const vertex = index.getX(i); vertices.add(vertex); minV = Math.min(minV, uv.getY(vertex));
            minX = Math.min(minX, p.getX(vertex)); maxX = Math.max(maxX, p.getX(vertex));
            minZ = Math.min(minZ, p.getZ(vertex)); maxZ = Math.max(maxZ, p.getZ(vertex));
        }
        let rootX = 0, rootZ = 0, count = 0;
        for (const vertex of vertices) if (uv.getY(vertex) <= minV + 1e-6) {
            rootX += p.getX(vertex); rootZ += p.getZ(vertex); count++;
        }
        return { id, minX, maxX, minZ, maxZ, rootX: rootX / count, rootZ: rootZ / count };
    });
}

function selectGeometry(source, ids) {
    const indices = [], vertices = new Map(), index = source.geometry.index;
    for (const id of ids) {
        const range = source.userData.grassLeafRanges[id];
        for (let i = range.start; i < range.start + range.count; i++) {
            const vertex = index.getX(i);
            if (!vertices.has(vertex)) vertices.set(vertex, vertices.size);
            indices.push(vertices.get(vertex));
        }
    }
    const geometry = new THREE.BufferGeometry();
    for (const [name, sourceAttribute] of Object.entries(source.geometry.attributes)) {
        const attribute = new THREE.BufferAttribute(new sourceAttribute.array.constructor(vertices.size * sourceAttribute.itemSize), sourceAttribute.itemSize, sourceAttribute.normalized);
        for (const [original, vertex] of vertices) attribute.copyAt(vertex, sourceAttribute, original);
        geometry.setAttribute(name, attribute);
    }
    geometry.setIndex(indices); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return geometry;
}

function geometryBytes(geometry) {
    return Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, geometry.index?.array.byteLength ?? 0);
}

/**
 * @param {{renderer:THREE.WebGLRenderer,lod2:THREE.Mesh,edgeIds:readonly number[],width:number,depth:number,
 * edgeWidth?:number,onProgress?:(message:string)=>void}} options
 */
export async function createGrassDebugV2CanopyBorderCards({ renderer, lod2, edgeIds, width, depth, edgeWidth = .1, onProgress }) {
    if (!lod2.geometry.index || !lod2.geometry.attributes.uv || !lod2.userData.grassLeafRanges
        || Array.isArray(lod2.material) || edgeIds.some(id => !lod2.userData.grassLeafRanges[id]))
        throw new Error('Canopy border capture requires an indexed LOD2 mesh, leaf ranges and one source material.');
    const started = performance.now(), plan = createGrassDebugV2CanopyBorderLayout({ width, depth, edgeWidth, leaves: describeLeaves(lod2, edgeIds) });
    const group = new THREE.Group(); group.name = 'GrassField-LOD4-CardEdges';
    group.userData.grassCanopyBorderCards = true;
    const fallbackGeometry = selectGeometry(lod2, plan.fallback), fallback = new THREE.Mesh(fallbackGeometry, lod2.material);
    fallback.name = 'GrassField-LOD4-CardEdgeRemainder'; fallback.castShadow = false; fallback.receiveShadow = true;
    fallback.userData.grassLeafCount = plan.fallback.length; group.add(fallback);
    if (!plan.cards.length) return Object.freeze({ group,
        getSnapshot: () => ({ strategy: 'alpha-cards', leaves: plan.leaves, cards: 0, largeCards: 0, smallCards: 0,
            cardLeaves: 0, liveLeaves: plan.fallback.length, triangles: fallbackGeometry.index.count / 3,
            cardTriangles: 0, fallbackTriangles: fallbackGeometry.index.count / 3, textureBytes: 0,
            cpuTextureBytes: 0, geometryBytes: geometryBytes(fallbackGeometry), source: 'LOD2', lightingBaked: false }),
        dispose: () => { group.removeFromParent(); fallbackGeometry.dispose(); } });
    const tileWidth = 512, tileHeight = 128, gutter = 4, columns = 4;
    const atlasWidth = columns * tileWidth;
    const atlasHeight = THREE.MathUtils.ceilPowerOfTwo(Math.ceil(plan.cards.length * 2 / columns) * tileHeight);
    if (Math.max(atlasWidth, atlasHeight) > renderer.capabilities.maxTextureSize) throw new Error('Canopy border atlas exceeds GPU texture dimensions.');
    lod2.geometry.computeBoundingBox();
    const bottom = lod2.geometry.boundingBox.min.y - .002, height = lod2.geometry.boundingBox.max.y - bottom + .002;
    const { position: p, normal: n, color, uv } = lod2.geometry.attributes, index = lod2.geometry.index;
    const positions = [], sourcePositions = [], normals = [], colors = [], uvs = [], captures = [];
    for (const card of plan.cards) for (const facing of [1, -1]) {
        const tile = captures.length, x0 = tile % columns * tileWidth + gutter, y0 = Math.floor(tile / columns) * tileHeight + gutter;
        const start = positions.length / 3;
        for (const id of card.leafIds) {
            const range = lod2.userData.grassLeafRanges[id];
            for (let i = range.start; i < range.start + range.count; i++) {
                const vertex = index.getX(i), x = p.getX(vertex), y = p.getY(vertex), z = p.getZ(vertex);
                const u = card.rx * x + card.rz * z - card.left;
                const localX = facing === 1 ? u : card.width - u;
                const localY = y - bottom, localZ = facing * (card.nx * x + card.nz * z - card.front);
                positions.push(x0 + localX / card.width * (tileWidth - 2 * gutter), y0 + localY / height * (tileHeight - 2 * gutter), localZ);
                sourcePositions.push(localX, localY, localZ);
                normals.push(facing * (card.rx * n.getX(vertex) + card.rz * n.getZ(vertex)), n.getY(vertex),
                    facing * (card.nx * n.getX(vertex) + card.nz * n.getZ(vertex)));
                colors.push(color.getX(vertex), color.getY(vertex), color.getZ(vertex)); uvs.push(uv.getX(vertex), uv.getY(vertex));
            }
        }
        captures.push({ card, facing, tile, x0, y0, start, count: positions.length / 3 - start });
    }
    const captureGeometry = new THREE.BufferGeometry();
    for (const [name, array, components] of [['position', positions, 3], ['grassPlatePosition', sourcePositions, 3], ['normal', normals, 3], ['color', colors, 3], ['uv', uvs, 2]])
        captureGeometry.setAttribute(name, new THREE.Float32BufferAttribute(array, components));
    const material = lod2.material;
    const albedo = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false });
    const normal = new THREE.MeshNormalMaterial({ normalMap: material.normalMap, normalScale: material.normalScale,
        side: THREE.DoubleSide, toneMapped: false });
    attachShaderMetadata(normal, grassPlateNormalShader);
    registerMaterialShaderHook(normal, { id: 'grass.canopy_border.normal', variantKey: grassPlateNormalShader.variantKey,
        apply: shader => { shader.vertexShader = grassPlateNormalShader.vertexSource; } });
    const surface = new THREE.ShaderMaterial({ vertexShader: grassPlateSurfaceBakeShader.vertexSource,
        fragmentShader: grassPlateSurfaceBakeShader.fragmentSource, side: THREE.DoubleSide, toneMapped: false,
        uniforms: { roughnessMap: { value: material.roughnessMap }, roughness: { value: material.roughness } } });
    attachShaderMetadata(surface, grassPlateSurfaceBakeShader);
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(0, atlasWidth, atlasHeight, 0, .01, 4);
    camera.position.z = 2;
    const captureMesh = new THREE.Mesh(captureGeometry, albedo); captureMesh.frustumCulled = false; scene.add(captureMesh);
    const target = new THREE.WebGLRenderTarget(atlasWidth, atlasHeight, { samples: 4, colorSpace: THREE.NoColorSpace });
    const maps = {}, previous = { target: renderer.getRenderTarget(), color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(),
        autoClear: renderer.autoClear, toneMapping: renderer.toneMapping, xr: renderer.xr.enabled,
        viewport: renderer.getViewport(new THREE.Vector4()), scissor: renderer.getScissor(new THREE.Vector4()), scissorTest: renderer.getScissorTest() };
    try {
        renderer.xr.enabled = false; renderer.autoClear = false; renderer.toneMapping = THREE.NoToneMapping; renderer.setScissorTest(false);
        for (const [name, captureMaterial] of [['albedo', albedo], ['normal', normal], ['roughness', surface]]) {
            onProgress?.('Baking LOD4 border ' + name + ' · ' + plan.cards.length + ' fixed cards');
            captureMesh.material = captureMaterial; target.scissorTest = false;
            renderer.setRenderTarget(target); renderer.setClearColor(0, 0); renderer.clear();
            for (const capture of captures) {
                captureGeometry.setDrawRange(capture.start, capture.count);
                target.scissor.set(capture.x0, capture.y0, tileWidth - 2 * gutter, tileHeight - 2 * gutter);
                target.scissorTest = true; renderer.setRenderTarget(target); renderer.render(scene, camera);
            }
            const pixels = new Uint8Array(atlasWidth * atlasHeight * 4);
            renderer.readRenderTargetPixels(target, 0, 0, atlasWidth, atlasHeight, pixels);
            padGrassPlateTiles(pixels, atlasWidth, tileWidth, tileHeight, name === 'normal');
            const texture = new THREE.DataTexture(pixels, atlasWidth, atlasHeight, THREE.RGBAFormat);
            texture.name = 'GrassCanopyBorder-' + name; texture.colorSpace = THREE.NoColorSpace;
            texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter; texture.generateMipmaps = true;
            texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); texture.needsUpdate = true; maps[name] = texture;
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    } catch (error) {
        Object.values(maps).forEach(map => map.dispose()); fallbackGeometry.dispose(); throw error;
    } finally {
        renderer.setRenderTarget(previous.target); renderer.setViewport(previous.viewport); renderer.setScissor(previous.scissor);
        renderer.setScissorTest(previous.scissorTest); renderer.setClearColor(previous.color, previous.alpha);
        renderer.autoClear = previous.autoClear; renderer.toneMapping = previous.toneMapping; renderer.xr.enabled = previous.xr;
        captureGeometry.dispose(); albedo.dispose(); normal.dispose(); surface.dispose(); target.dispose();
    }
    const cardMaterial = createGrassDebugV2PlateMaterial(maps);
    cardMaterial.name = 'GrassV2CanopyBorder'; cardMaterial.color.copy(material.color);
    cardMaterial.side = THREE.FrontSide; cardMaterial.envMap = material.envMap; cardMaterial.envMapIntensity = material.envMapIntensity;
    const cardPositions = [], cardUvs = [], cardColors = [], cardIndices = [];
    for (const capture of captures) {
        const { card, facing, x0, y0 } = capture, first = cardPositions.length / 3;
        for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
            const along = card.left + (facing === 1 ? u : 1 - u) * card.width;
            cardPositions.push(card.rx * along + card.nx * card.front, bottom + v * height, card.rz * along + card.nz * card.front);
            cardUvs.push((x0 + u * (tileWidth - 2 * gutter)) / atlasWidth, (y0 + v * (tileHeight - 2 * gutter)) / atlasHeight);
            cardColors.push(1, 1, 1);
        }
        cardIndices.push(first, first + 1, first + 2, first + 2, first + 1, first + 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(cardPositions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(cardUvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(cardColors, 3));
    geometry.setIndex(cardIndices); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, cardMaterial); mesh.name = 'GrassField-LOD4-BorderCards';
    mesh.castShadow = false; mesh.receiveShadow = true; mesh.userData.grassLeafCount = plan.cardLeaves; group.add(mesh);
    const snapshot = Object.freeze({ strategy: 'alpha-cards', source: 'LOD2', lightingBaked: false, shadowSource: 'cached-LOD2',
        leaves: plan.leaves, cards: plan.cards.length, largeCards: plan.largeCards, smallCards: plan.smallCards,
        cardLeaves: plan.cardLeaves, liveLeaves: plan.fallback.length, cardTriangles: geometry.index.count / 3,
        fallbackTriangles: fallbackGeometry.index.count / 3, triangles: (geometry.index.count + fallbackGeometry.index.count) / 3,
        frontAndBackCaptures: captures.length, atlasWidth, atlasHeight, tileWidth, tileHeight,
        textureBytes: atlasWidth * atlasHeight * 4 * 3 * 4 / 3, cpuTextureBytes: atlasWidth * atlasHeight * 4 * 3,
        geometryBytes: geometryBytes(geometry) + geometryBytes(fallbackGeometry), captureMilliseconds: performance.now() - started });
    return Object.freeze({ group, getSnapshot: () => snapshot,
        dispose() { group.removeFromParent(); geometry.dispose(); fallbackGeometry.dispose(); cardMaterial.dispose(); Object.values(maps).forEach(map => map.dispose()); } });
}
