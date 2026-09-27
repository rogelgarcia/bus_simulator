// Live debug projection, not a published offline bake. Both layouts share all PBR channels and texel density.
// @ts-check
import * as THREE from 'three';
import { extendGrassBakeColors } from './GrassDebugV2BakePadding.js';
import { grassCardNormalBakeShader } from '../../shaders/materials/grass/GrassCardNormalBakeShaderLoader.js';
import { grassPlantSurfaceBakeShader } from '../../shaders/materials/grass/GrassPlantSurfaceBakeShaderLoader.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';
import { createGrassAlphaCoverageMipmaps } from './GrassDebugV2AlphaCoverage.js';
import { createGrassDebugV2CardRootSoil } from './GrassDebugV2CardRootSoil.js';

export const GRASS_V2_PLANT_ATLAS = Object.freeze({ pageWidth: 2048, height: 2048, pages: 2, rgbDilation: 'full-page' });
export const GRASS_V2_PLANT_ALPHA_TEST = 0.15;

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {import('./GrassDebugV2PlantCardLayout.js').PlantCardSource} plant
 * @param {ReturnType<import('./GrassDebugV2PlantCardLayout.js').createGrassDebugV2PlantCardLayout>} layout
 * @param {{rootSoil?: import('./GrassDebugV2CardRootSoil.js').CardRootSoil|null}} options
 */
export function createGrassDebugV2PlantCardAtlas(renderer, plant, layout, { rootSoil = null } = {}) {
    const bakeMeshes = plant.bakeMeshes ?? plant.leaves;
    if (bakeMeshes.some(mesh => !mesh.geometry.attributes.grassFacingNormal
        || mesh.geometry.attributes.grassFacingNormal.count !== mesh.geometry.attributes.position.count))
        throw new Error('Plant card atlas requires a structural facing normal for every source vertex.');
    if (rootSoil && Object.keys(layout.splitSides).length !== 1) throw new Error('Card root soil requires a single-sided card layout.');
    const soil = rootSoil ? createGrassDebugV2CardRootSoil(rootSoil, Object.values(layout.splitSides)[0]) : null;
    const { pageWidth: width, height } = GRASS_V2_PLANT_ATLAS;
    const { minX, maxX, minZ, maxZ } = layout.frame;
    const bounds = new THREE.Box3().setFromObject(plant.group);
    const margin = Math.max(0.01, (bounds.max.y - bounds.min.y) * 0.02);
    const cameraHeight = Math.max(1, bounds.max.y + margin), far = Math.max(2, cameraHeight - bounds.min.y + margin);
    const camera = new THREE.OrthographicCamera(minX, maxX, -minZ, -maxZ, 0.01, far);
    camera.position.set(0, cameraHeight, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0);
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
    for (const leaf of bakeMeshes) {
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
            extendGrassBakeColors(page, width, height, name === 'normal',
                name === 'albedo' && soil ? pixels => soil.apply(pixels, width, height, layout.frame) : null);
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
    const definition = Object.freeze({ ...GRASS_V2_PLANT_ATLAS,
        capture: Object.freeze({ cameraHeight, near: camera.near, far, sourceMinHeight: bounds.min.y, sourceMaxHeight: bounds.max.y }),
        ...(soil ? { rootSoil: soil.getSnapshot() } : {}) });
    return Object.freeze({ ...maps, definition,
        dispose: () => Object.values(maps).forEach(map => map.dispose()) });
}
