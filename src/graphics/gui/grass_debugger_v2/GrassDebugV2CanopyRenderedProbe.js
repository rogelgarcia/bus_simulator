// Re-bake candidate leaves and evaluate the production canopy shader with real lights and mip filtering.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2FieldCanopyBake } from './GrassDebugV2FieldCanopyBake.js?v=lod4-rendered-feedback-1';
import { createGrassDebugV2PeriodicSource } from './GrassDebugV2PeriodicSource.js';
import { createGrassDebugV2CanopyMaterials } from './GrassDebugV2CanopyMaterial.js';
import { applyIBLIntensity, applyIBLToScene } from '../../lighting/IBL.js';
import { createColorGradingOutputPass } from '../../visuals/postprocessing/ColorGradingPass.js';
import { scoreGrassCanopyRenderedPhase, validateGrassCanopyRenderedExposure } from './GrassDebugV2CanopyRenderedScore.js';

export const GRASS_CANOPY_RENDERED_VIEWS = Object.freeze([6, 12].flatMap(distance => [12, 35, 65].flatMap(elevation =>
    [0, 45, 90, 135, 180, 225, 270, 315].map(azimuth => Object.freeze({ distance, elevation, azimuth })))));

/** @param {object} options */
export function createGrassDebugV2CanopyRenderedProbe({ renderer, soil, litter, lighting, shadowDirection, shadowPadding,
    sourceHeight, periodMeters, filterFootprint }) {
    const size = 32, width = 384, height = 384, scene = new THREE.Scene();
    const sun = lighting.sun.clone(), hemi = lighting.hemi.clone();
    sun.position.copy(shadowDirection).normalize().multiplyScalar(20); sun.target.position.set(0, 0, 0);
    sun.castShadow = true; sun.shadow.mapSize.set(256, 256); sun.shadow.autoUpdate = false;
    scene.add(sun, sun.target, hemi);
    applyIBLToScene(scene, lighting.environment, lighting.settings.ibl);
    const geometry = new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2);
    const position = geometry.attributes.position, uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, .5 + position.getX(i) / periodMeters, .5 - position.getZ(i) / periodMeters);
    const surface = new THREE.Mesh(geometry); surface.position.y = .1; surface.receiveShadow = true; scene.add(surface);
    const white = new THREE.DataTexture(new Uint8Array([255]), 1, 1, THREE.RedFormat); white.needsUpdate = true;
    const shadowUniforms = { grassCanopyShadowVisibility: { value: white }, grassCanopyShadowBounds: { value: new THREE.Vector4(-10, 10, .05, .05) },
        grassCanopyShadowPass: { value: 2 } };
    const target = new THREE.WebGLRenderTarget(width, height, { samples: 4, type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace });
    const output = createColorGradingOutputPass(); output.renderToScreen = true;
    const pixels = new Uint8Array(width * height * 4), point = new THREE.Vector3();
    const cameras = GRASS_CANOPY_RENDERED_VIEWS.map(pose => {
        const camera = new THREE.PerspectiveCamera(45, 1, .01, 100), az = pose.azimuth * Math.PI / 180, el = pose.elevation * Math.PI / 180;
        const distance = pose.distance * periodMeters;
        camera.position.set(Math.sin(az) * Math.cos(el) * distance, .1 + Math.sin(el) * distance, Math.cos(az) * Math.cos(el) * distance);
        camera.lookAt(0, .1, 0); camera.updateMatrixWorld();
        const samples = [];
        for (let z = 0; z < size * 3; z++) for (let x = 0; x < size * 3; x++) {
            point.set((-1.5 + (x + .5) / size) * periodMeters, .1, (-1.5 + (z + .5) / size) * periodMeters).project(camera);
            const px = Math.floor((point.x * .5 + .5) * width), py = Math.floor((point.y * .5 + .5) * height);
            if (px < 0 || px >= width || py < 0 || py >= height) continue;
            samples.push({ offset: (py * width + px) * 4, cell: (z % size) * size + x % size });
        }
        return { camera, pose, samples };
    });
    let material = null, materialResolution = 0, evaluations = 0;
    async function evaluate(mesh, resolution = 512, shadowResolution = 2048) {
        const periodic = createGrassDebugV2PeriodicSource(mesh, 0, periodMeters);
        const shadows = createGrassDebugV2PeriodicSource(mesh, shadowPadding, periodMeters);
        let bake;
        const previous = { target: renderer.getRenderTarget(), shadow: renderer.shadowMap.enabled, auto: renderer.shadowMap.autoUpdate,
            update: renderer.shadowMap.needsUpdate, viewport: renderer.getViewport(new THREE.Vector4()), scissor: renderer.getScissor(new THREE.Vector4()),
            scissorTest: renderer.getScissorTest(), color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(),
            autoClear: renderer.autoClear, xr: renderer.xr.enabled };
        try {
            for (const [name, uniform] of Object.entries(lighting.pipeline?.outputPass?.uniforms ?? {}))
                if (name !== 'tDiffuse') output.uniforms[name].value = uniform.value;
            const renderPipeline = { profile: 'hdr-display-v1', hdrFormat: 'RGBA16F', displayTransform: 'scene-color-grading-output',
                toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure, outputColorSpace: renderer.outputColorSpace,
                colorGradingEnabled: output.uniforms.uEnableColorGrading.value > .5 };
            bake = await createGrassDebugV2FieldCanopyBake({ renderer, source: periodic.group, shadowSource: shadows.group, shadowDirection,
                soil, litter, width: periodMeters, depth: periodMeters, sourceHeight, resolution, shadowResolution, layers: ['all'], yieldBetweenChannels: false });
            if (materialResolution !== resolution) {
                material?.dispose();
                material = createGrassDebugV2CanopyMaterials({ texturesByLayer: bake.textures, shadowUniforms, resolution, tileMeters: periodMeters,
                    filterFootprint, sourceHeight }).all;
                materialResolution = resolution;
                if (!surface.material.name) surface.material.dispose();
                surface.material = material;
                applyIBLIntensity(scene, lighting.settings.ibl, { force: true });
            } else {
                material.map = bake.textures.all.albedo; material.normalMap = bake.textures.all.normal; material.roughnessMap = bake.textures.all.roughness;
                material.userData.grassCanopyTileVisibility.value = bake.textures.all.visibility;
            }
            const normal = bake.readPixels('all', 'normal'), albedo = bake.readPixels('all', 'albedo');
            const leaf = [0, 0, 0], background = [0, 0, 0]; let coverage = 0, leafCount = 0, backgroundCount = 0;
            for (let i = 0; i < normal.length; i += 4) {
                coverage += normal[i + 3] / 255;
                if (normal[i + 3] > 250) { leafCount++; for (let c = 0; c < 3; c++) leaf[c] += albedo[i + c]; }
                if (normal[i + 3] < 5) { backgroundCount++; for (let c = 0; c < 3; c++) background[c] += albedo[i + c]; }
            }
            const masks = { coverage: coverage / (normal.length / 4), leaf: leaf.map(v => v / leafCount), background: background.map(v => v / backgroundCount) };
            renderer.xr.enabled = false; renderer.autoClear = true; renderer.setScissorTest(false); renderer.setClearColor(0, 1);
            renderer.shadowMap.enabled = true; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = evaluations === 0;
            const views = []; let preview;
            for (const { camera, pose, samples } of cameras) {
                renderer.setRenderTarget(target); renderer.render(scene, camera);
                // Three tone maps the final display pass, not an offscreen scene
                // render. Preserve HDR until the same output transform as the field.
                renderer.setRenderTarget(null); renderer.setViewport(0, 0, width / renderer.getPixelRatio(), height / renderer.getPixelRatio());
                output.render(renderer, null, target);
                renderer.getContext().readPixels(0, 0, width, height, renderer.getContext().RGBA, renderer.getContext().UNSIGNED_BYTE, pixels);
                const sums = new Float64Array(size * size), counts = new Uint16Array(size * size);
                let clipped = 0, black = 0, minimum = Infinity, maximum = -Infinity;
                for (const { offset, cell } of samples) {
                    const r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2], luminance = .2126 * r + .7152 * g + .0722 * b;
                    sums[cell] += luminance; counts[cell]++;
                    if (Math.max(r, g, b) >= 254) clipped++; if (Math.max(r, g, b) <= 1) black++;
                    minimum = Math.min(minimum, luminance); maximum = Math.max(maximum, luminance);
                }
                if (counts.some(count => !count)) throw new Error('Rendered pattern view misses a tile phase.');
                const view = { ...pose, ...scoreGrassCanopyRenderedPhase(sums.map((sum, i) => sum / counts[i]), size),
                    sampleCount: samples.length, clippedFraction: clipped / samples.length, blackFraction: black / samples.length, minimum, maximum };
                validateGrassCanopyRenderedExposure(view); views.push(view);
                if (!preview) {
                    preview = new Uint8Array(pixels.length);
                    for (let row = 0; row < height; row++) preview.set(pixels.subarray(row * width * 4, (row + 1) * width * 4), (height - 1 - row) * width * 4);
                }
            }
            evaluations++;
            return { views, masks, preview: { rgba: preview, width, height }, resolution, shadowResolution, renderPipeline };
        } finally {
            renderer.setRenderTarget(previous.target); renderer.setViewport(previous.viewport); renderer.setScissor(previous.scissor); renderer.setScissorTest(previous.scissorTest);
            renderer.setClearColor(previous.color, previous.alpha); renderer.autoClear = previous.autoClear; renderer.xr.enabled = previous.xr;
            renderer.shadowMap.enabled = previous.shadow; renderer.shadowMap.autoUpdate = previous.auto; renderer.shadowMap.needsUpdate = previous.update;
            bake?.dispose(); periodic.dispose(); shadows.dispose();
        }
    }
    return Object.freeze({ evaluate, dispose() { material?.dispose(); surface.material = null; geometry.dispose(); target.dispose(); output.dispose(); white.dispose(); sun.shadow.dispose(); } });
}
