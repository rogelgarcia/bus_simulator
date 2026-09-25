// Live debug projection, not a published offline bake. Both layouts share all PBR channels and texel density.
// @ts-check
import * as THREE from 'three';
import { grassCardNormalBakeShader } from '../../shaders/materials/grass/GrassCardNormalBakeShaderLoader.js';
import { grassPlantSurfaceBakeShader } from '../../shaders/materials/grass/GrassPlantSurfaceBakeShaderLoader.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';
import { createGrassAlphaCoverageMipmaps } from './GrassDebugV2AlphaCoverage.js';

export const GRASS_V2_PLANT_ATLAS = Object.freeze({ pageWidth: 2048, height: 2048, pages: 2, padding: 8 });
export const GRASS_V2_PLANT_ALPHA_TEST = 0.15;

function extendColors(pixels, width, height, normal) {
    // Undo coverage-weighted MSAA RGB, then extend edge colors without extending alpha.
    const valid = new Uint8Array(width * height);
    for (let i = 0; i < valid.length; i++) {
        const o = i * 4, alpha = pixels[o + 3] / 255;
        if (!alpha) continue;
        valid[i] = 1;
        for (let c = 0; c < 3; c++) pixels[o + c] = Math.min(255, Math.round(pixels[o + c] / alpha));
        if (normal) {
            const n = new THREE.Vector3().fromArray(pixels, o).multiplyScalar(2 / 255).subScalar(1).normalize();
            for (let c = 0; c < 3; c++) pixels[o + c] = Math.round((n.getComponent(c) * 0.5 + 0.5) * 255);
        }
    }
    for (let pass = 0; pass < GRASS_V2_PLANT_ATLAS.padding; pass++) {
        const frontier = [];
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            const i = y * width + x;
            if (valid[i]) continue;
            const neighbor = [x > 0 ? i - 1 : -1, x + 1 < width ? i + 1 : -1, y > 0 ? i - width : -1, y + 1 < height ? i + width : -1]
                .find(index => index >= 0 && valid[index]);
            if (neighbor === undefined) continue;
            pixels.set(pixels.subarray(neighbor * 4, neighbor * 4 + 3), i * 4);
            frontier.push(i);
        }
        for (const i of frontier) valid[i] = 1;
    }
}

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {import('./GrassDebugV2PlantCardLayout.js').PlantCardSource} plant
 * @param {ReturnType<import('./GrassDebugV2PlantCardLayout.js').createGrassDebugV2PlantCardLayout>} layout
 */
export function createGrassDebugV2PlantCardAtlas(renderer, plant, layout) {
    const { pageWidth: width, height } = GRASS_V2_PLANT_ATLAS;
    const { minX, maxX, minZ, maxZ } = layout.frame;
    const camera = new THREE.OrthographicCamera(minX, maxX, -minZ, -maxZ, 0.01, 2);
    camera.position.set(0, 1, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0);
    const sourceMaterial = plant.leaves[0].material;
    const color = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false });
    const normal = new THREE.MeshNormalMaterial({ normalMap: sourceMaterial.normalMap, normalScale: sourceMaterial.normalScale, side: THREE.DoubleSide });
    attachShaderMetadata(normal, grassCardNormalBakeShader);
    registerMaterialShaderHook(normal, { id: 'grass.plant.normal_projection', variantKey: grassCardNormalBakeShader.variantKey,
        apply: shader => { shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', grassCardNormalBakeShader.fragmentSource); } });
    const roughness = new THREE.ShaderMaterial({ vertexShader: grassPlantSurfaceBakeShader.vertexSource,
        fragmentShader: grassPlantSurfaceBakeShader.fragmentSource,
        uniforms: { roughnessMap: { value: sourceMaterial.roughnessMap }, roughness: { value: sourceMaterial.roughness } },
        side: THREE.DoubleSide, toneMapped: false });
    attachShaderMetadata(roughness, grassPlantSurfaceBakeShader);
    const scene = new THREE.Scene();
    for (const leaf of plant.leaves) {
        const mesh = new THREE.Mesh(leaf.geometry, color); mesh.position.copy(leaf.position); scene.add(mesh);
    }
    const target = new THREE.WebGLRenderTarget(width, height, { samples: 4, colorSpace: THREE.NoColorSpace });
    const previous = { target: renderer.getRenderTarget(), color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(),
        autoClear: renderer.autoClear, toneMapping: renderer.toneMapping, viewport: renderer.getViewport(new THREE.Vector4()),
        scissor: renderer.getScissor(new THREE.Vector4()), scissorTest: renderer.getScissorTest() };
    const maps = {};
    try {
        renderer.autoClear = false; renderer.toneMapping = THREE.NoToneMapping; renderer.setScissorTest(false);
        for (const [name, material] of [['albedo', color], ['normal', normal], ['roughness', roughness]]) {
            scene.overrideMaterial = material;
            renderer.setRenderTarget(target); renderer.setClearColor(0, 0); renderer.clear(); renderer.render(scene, camera);
            // Unbinding resolves MSAA before the readback.
            renderer.setRenderTarget(null);
            const page = new Uint8Array(width * height * 4);
            renderer.readRenderTargetPixels(target, 0, 0, width, height, page);
            extendColors(page, width, height, name === 'normal');
            const packed = new Uint8Array(width * 2 * height * 4);
            for (let y = 0; y < height; y++) {
                const row = page.subarray(y * width * 4, (y + 1) * width * 4);
                packed.set(row, y * width * 8); packed.set(row, y * width * 8 + width * 4);
                const z = maxZ - (y + 0.5) / height * (maxZ - minZ);
                if (z > layout.negative && z < layout.positive) {
                    for (let x = width; x < width * 2; x++) packed[(y * width * 2 + x) * 4 + 3] = 0;
                }
            }
            const texture = new THREE.DataTexture(packed, width * 2, height, THREE.RGBAFormat);
            texture.name = `GrassV2Plant${name}`; texture.colorSpace = THREE.NoColorSpace;
            texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
            texture.generateMipmaps = true; texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); texture.needsUpdate = true;
            maps[name] = texture;
            if (name === 'albedo') {
                const corrected = texture.clone(); corrected.name = 'GrassV2PlantCoverage';
                corrected.mipmaps = createGrassAlphaCoverageMipmaps(packed, width * 2, height,
                    { alphaTest: GRASS_V2_PLANT_ALPHA_TEST, pages: GRASS_V2_PLANT_ATLAS.pages });
                corrected.generateMipmaps = false; corrected.needsUpdate = true; maps.coverage = corrected;
            }
        }
    } catch (error) { Object.values(maps).forEach(map => map.dispose()); throw error; }
    finally {
        renderer.setRenderTarget(previous.target); renderer.setViewport(previous.viewport); renderer.setScissor(previous.scissor);
        renderer.setScissorTest(previous.scissorTest); renderer.setClearColor(previous.color, previous.alpha);
        renderer.autoClear = previous.autoClear; renderer.toneMapping = previous.toneMapping;
        target.dispose(); color.dispose(); normal.dispose(); roughness.dispose();
    }
    return Object.freeze({ ...maps, definition: GRASS_V2_PLANT_ATLAS,
        dispose: () => Object.values(maps).forEach(map => map.dispose()) });
}
