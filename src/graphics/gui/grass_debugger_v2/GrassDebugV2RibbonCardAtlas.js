// Capture four-leaf LOD0 tufts as unlit, relightable cards at fixed physical pair spacing.
// @ts-check
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createGrassDebugV2RibbonShoot, GRASS_V2_RIBBON_TUFT } from './GrassDebugV2RibbonShoot.js?v=lod3-w-1';
import { sampleGrassDebugV2ShootColor } from './GrassDebugV2ShootAppearance.js';
import { extendGrassBakeColors } from './GrassDebugV2BakePadding.js';
import { createGrassAlphaCoverageMipmaps } from './GrassDebugV2AlphaCoverage.js';
import { createGrassDebugV2RibbonCardMaterial } from './GrassDebugV2RibbonCardMaterial.js?v=lod3-w-1';
import { grassRibbonCardSurfaceBakeShader } from '../../shaders/materials/grass/GrassRibbonCardShaderLoader.js?v=lod3-w-1';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';

/** @param {{renderer: THREE.WebGLRenderer, material: THREE.MeshStandardMaterial, scales?: readonly number[]}} options */
export function createGrassDebugV2RibbonCardAtlas({ renderer, material, scales = [1] }) {
    const pages = scales.length, pageWidth = pages === 1 ? 512 : 128, height = pages === 1 ? 512 : 256;
    if (!pages || (pages & (pages - 1)) || scales.some(scale => !(scale > 0)))
        throw new Error('Ribbon atlas requires a power-of-two list of positive leaf scales.');
    const templates = [], projections = [], frames = [];
    for (const [page, leafScale] of scales.entries()) {
        const source = createGrassDebugV2RibbonShoot({ material, lod: 'LOD0_SMART', layout: 'tuft', leafScale });
        source.trimAtSoil(() => 0); source.group.updateMatrixWorld(true);
        const parts = source.leaves.map((leaf, id) => {
            const part = leaf.geometry.clone().applyMatrix4(leaf.matrixWorld);
            if (leaf.matrixWorld.determinant() < 0) {
                const index = part.index.array;
                for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
            }
            part.setAttribute('grassLeafId', new THREE.Float32BufferAttribute(new Array(part.attributes.position.count).fill(id), 1));
            return part;
        });
        const geometry = mergeGeometries(parts); parts.forEach(part => part.dispose()); source.dispose();
        geometry.computeBoundingBox();
        const box = geometry.boundingBox, padding = (box.max.x - box.min.x) * 2 / pageWidth;
        const frame = { minX: box.min.x - padding, maxX: box.max.x + padding, minY: 0, maxY: box.max.y * (1 + 2 / height) };
        frames.push(frame);
        const card = new THREE.BufferGeometry();
        card.setAttribute('position', new THREE.Float32BufferAttribute([
            frame.minX, 0, 0, frame.maxX, 0, 0, frame.minX, frame.maxY, 0, frame.maxX, frame.maxY, 0
        ], 3));
        card.setAttribute('uv', new THREE.Float32BufferAttribute([page/pages, 0, (page+1)/pages, 0, page/pages, 1, (page+1)/pages, 1], 2));
        card.setAttribute('color', new THREE.Float32BufferAttribute(new Array(12).fill(1), 3));
        card.setAttribute('grassDryness', new THREE.Float32BufferAttribute(new Array(16).fill(0), 4));
        card.setIndex([0, 1, 2, 2, 1, 3]); card.computeVertexNormals();
        card.setAttribute('grassFacingNormal', card.attributes.normal.clone());
        card.computeBoundingBox(); card.computeBoundingSphere(); templates.push(card);
        const dry = geometry.clone(), tint = new THREE.Color();
        for (let i = 0; i < dry.attributes.color.count; i++) {
            sampleGrassDebugV2ShootColor((dry.attributes.uv.getY(i) - 0.18) / 0.82, tint, 1);
            dry.attributes.color.setXYZ(i, tint.r, tint.g, tint.b);
        }
        projections.push({ geometry, dry });
    }
    const color = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false });
    const normal = new THREE.MeshNormalMaterial({ normalMap: material.normalMap, normalScale: material.normalScale,
        side: THREE.DoubleSide, toneMapped: false });
    const roughness = new THREE.ShaderMaterial({ vertexShader: grassRibbonCardSurfaceBakeShader.vertexSource,
        fragmentShader: grassRibbonCardSurfaceBakeShader.fragmentSource, side: THREE.DoubleSide, toneMapped: false,
        uniforms: { roughnessMap: { value: material.roughnessMap }, roughness: { value: material.roughness } } });
    attachShaderMetadata(roughness, grassRibbonCardSurfaceBakeShader);
    const target = new THREE.WebGLRenderTarget(pageWidth, height, { samples: 4, colorSpace: THREE.NoColorSpace });
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera();
    camera.position.set(0, 0, 1); camera.near = .01; camera.far = 2;
    const mesh = new THREE.Mesh(projections[0].geometry, color); scene.add(mesh);
    const previous = { target: renderer.getRenderTarget(), color: renderer.getClearColor(new THREE.Color()),
        alpha: renderer.getClearAlpha(), autoClear: renderer.autoClear, toneMapping: renderer.toneMapping,
        viewport: renderer.getViewport(new THREE.Vector4()), scissor: renderer.getScissor(new THREE.Vector4()),
        scissorTest: renderer.getScissorTest(), xr: renderer.xr.enabled };
    const maps = {};
    try {
        renderer.xr.enabled = false; renderer.autoClear = false; renderer.toneMapping = THREE.NoToneMapping; renderer.setScissorTest(false);
        for (const [name, surface] of [['albedo', color], ['dry', color], ['normal', normal], ['roughness', roughness]]) {
            const packed = new Uint8Array(pageWidth * pages * height * 4);
            for (let page = 0; page < pages; page++) {
                const frame = frames[page];
                Object.assign(camera, { left: frame.minX, right: frame.maxX, bottom: frame.minY, top: frame.maxY });
                camera.updateProjectionMatrix(); mesh.geometry = name === 'dry' ? projections[page].dry : projections[page].geometry; mesh.material = surface;
                renderer.setRenderTarget(target); renderer.setClearColor(0, 0); renderer.clear(); renderer.render(scene, camera); renderer.setRenderTarget(null);
                const pixels = new Uint8Array(pageWidth * height * 4);
                renderer.readRenderTargetPixels(target, 0, 0, pageWidth, height, pixels);
                extendGrassBakeColors(pixels, pageWidth, height, name === 'normal');
                for (let row = 0; row < height; row++)
                    packed.set(pixels.subarray(row * pageWidth * 4, (row + 1) * pageWidth * 4), (row * pageWidth * pages + page * pageWidth) * 4);
            }
            const texture = new THREE.DataTexture(packed, pageWidth * pages, height, THREE.RGBAFormat);
            texture.name = 'GrassV2RibbonCard-' + name; texture.colorSpace = THREE.NoColorSpace;
            texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
            texture.generateMipmaps = name !== 'albedo'; texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
            if (name === 'albedo') texture.mipmaps = createGrassAlphaCoverageMipmaps(packed, pageWidth * pages, height, { pages });
            texture.needsUpdate = true; maps[name] = texture;
        }
    } catch (error) {
        Object.values(maps).forEach(map => map.dispose()); templates.forEach(g => g.dispose()); throw error;
    } finally {
        renderer.setRenderTarget(previous.target); renderer.setViewport(previous.viewport); renderer.setScissor(previous.scissor);
        renderer.setScissorTest(previous.scissorTest); renderer.setClearColor(previous.color, previous.alpha);
        renderer.autoClear = previous.autoClear; renderer.toneMapping = previous.toneMapping; renderer.xr.enabled = previous.xr;
        target.dispose(); color.dispose(); normal.dispose(); roughness.dispose();
        projections.forEach(p => { p.geometry.dispose(); p.dry.dispose(); });
    }
    const cardMaterial = createGrassDebugV2RibbonCardMaterial(maps); cardMaterial.color.copy(material.color);
    return Object.freeze({ ...maps, material: cardMaterial, templates: Object.freeze(templates),
        definition: Object.freeze({ source: 'LOD0', sourceTrianglesPerLeaf: 18, sourceTrianglesPerCard: 72,
            leavesPerCard: 4, trianglesPerCard: 2, ...GRASS_V2_RIBBON_TUFT,
            width: pageWidth * pages, height, pages, frames, scales: [...scales], lightingBaked: false,
            channels: ['albedo-alpha', 'dry-albedo', 'tangent-normal', 'leaf-id-roughness-transmission'], alphaCoverage: true }),
        dispose: () => { cardMaterial.dispose(); templates.forEach(g => g.dispose()); Object.values(maps).forEach(map => map.dispose()); } });
}
