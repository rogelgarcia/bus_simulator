// AI 597 D5 frame pipeline of the landscape viewer (landscape-frame-pipeline-v1): every frame renders into a linear half-float target so the
// animated sea can read the opaque frame (the seabed the terrain lit under water, the swash sheet) through its refraction and compose the
// water column in linear light, and a final pass tone-maps and encodes the target for the canvas. three.js compiles the materials' own tone
// mapping and output transfer out under a render target, so every material writes linear radiance unchanged, and the terrain compiles one
// program variant as long as the target stays bound whenever a program can compile or a tile can upload: the view binds it after each frame's
// canvas reads. The canvas multisampling is replaced by the final pass's edge filter (an RGBA16F target with four samples would cost 116 MB at
// 1080p and 464 MB at UHD); the bytes are the drawing buffer's, reported by the view snapshot rather than streamed through the residency ledger.
// @ts-check
import * as THREE from 'three';
import { attachShaderMetadata, createShaderPayload, loadShaderSourceSet } from '../../shaders/core/ShaderLoader.js';
import { LANDSCAPE_FRAME_PIPELINE, landscapeFramePipelineBytes } from './LandscapeFramePipelineModel.js';
export { LANDSCAPE_FRAME_PIPELINE, landscapeFramePipelineBytes } from './LandscapeFramePipelineModel.js';

const FINAL_SOURCES = await loadShaderSourceSet({ vertexPath: 'materials/landscape/ocean_pass.vert.glsl', fragmentPath: 'materials/landscape/frame_final.frag.glsl' });

/**
 * @param {{renderer:any}} options
 * @returns {{readonly sceneTexture:any, readonly target:any, bind():void, copyScene(renderer:any):void, render(scene:any, camera:any):void, snapshot():any, dispose():void}}
 */
export function createLandscapeFramePipeline({ renderer }) {
    if (!renderer || typeof renderer.setRenderTarget !== 'function') throw new Error('[LandscapeFramePipeline] The pipeline needs the renderer');
    if (!renderer.extensions.has('EXT_color_buffer_float')) throw new Error('[LandscapeFramePipeline] float render targets are unavailable (EXT_color_buffer_float)');
    const edge = LANDSCAPE_FRAME_PIPELINE.edge;
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, colorSpace: THREE.LinearSRGBColorSpace, depthBuffer: true, stencilBuffer: false,
        generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    target.texture.name = 'Landscape frame';
    const payload = createShaderPayload({ shaderId: 'landscape/frame-final', sourceSet: FINAL_SOURCES, defines: {} });
    const material = new THREE.ShaderMaterial({ vertexShader: payload.vertexSource, fragmentShader: payload.fragmentSource, depthTest: false, depthWrite: false, toneMapped: true,
        uniforms: { uFrame: { value: target.texture }, uFrameTexel: { value: new THREE.Vector2(1, 1) }, uFrameSharpness: { value: edge.sharpness }, uFrameEdge: { value: new THREE.Vector2(edge.threshold, edge.thresholdMin) } } });
    attachShaderMetadata(material, payload);
    const finalScene = new THREE.Scene(), finalCamera = new THREE.Camera(), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    quad.name = 'Landscape frame final pass';
    quad.frustumCulled = false;
    finalScene.add(quad);
    const size = new THREE.Vector2();
    let sceneTexture = null, width = 0, height = 0, frames = 0, copies = 0, resizes = 0, disposed = false;
    const ensureSize = () => {
        renderer.getDrawingBufferSize(size);
        const nextWidth = Math.max(1, Math.round(size.x)), nextHeight = Math.max(1, Math.round(size.y));
        if (nextWidth === width && nextHeight === height) return;
        width = nextWidth; height = nextHeight; resizes++;
        target.setSize(width, height);
        sceneTexture?.dispose();
        sceneTexture = new THREE.FramebufferTexture(width, height);
        sceneTexture.type = THREE.HalfFloatType;
        sceneTexture.colorSpace = THREE.LinearSRGBColorSpace;
        sceneTexture.minFilter = THREE.LinearFilter;
        sceneTexture.magFilter = THREE.LinearFilter;
        sceneTexture.name = 'Landscape frame scene copy';
        material.uniforms.uFrameTexel.value.set(1 / width, 1 / height);
    };
    ensureSize();
    return Object.freeze({
        /** The opaque frame copied when the sea starts drawing (linear RGBA16F, the drawing buffer's size). */
        get sceneTexture() { return sceneTexture; },
        get target() { return target; },
        /** Binds the frame target: the view calls it after its canvas reads so programs compile and tiles upload against the target's variant. */
        bind() { if (!disposed) { ensureSize(); renderer.setRenderTarget(target); } },
        /** Copies the frame drawn so far into the scene texture (the first ocean ring calls it before it draws; the target is bound then). */
        copyScene(currentRenderer) {
            if (disposed || currentRenderer.getRenderTarget() !== target) return;
            currentRenderer.copyFramebufferToTexture(sceneTexture);
            copies++;
        },
        /** One frame: the scene into the target, the final pass to the canvas; the canvas stays bound for the view's reads. @param {any} scene @param {any} camera */
        render(scene, camera) {
            if (disposed) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
            ensureSize();
            // the target clears to alpha 1: alpha 0 is the verification views' sentinel for the final pass
            const clearAlpha = renderer.getClearAlpha();
            renderer.setClearAlpha(1);
            renderer.setRenderTarget(target);
            renderer.render(scene, camera);
            renderer.setClearAlpha(clearAlpha);
            renderer.setRenderTarget(null);
            renderer.render(finalScene, finalCamera);
            frames++;
        },
        snapshot() {
            return { recipe: LANDSCAPE_FRAME_PIPELINE.id, active: !disposed, width, height, format: 'RGBA16F', passes: LANDSCAPE_FRAME_PIPELINE.passes, antialias: 'fxaa-console',
                bytes: landscapeFramePipelineBytes(width, height), frames, copies, resizes };
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            if (renderer.getRenderTarget() === target) renderer.setRenderTarget(null);
            target.dispose();
            sceneTexture?.dispose();
            sceneTexture = null;
            material.dispose();
            quad.geometry.dispose();
        }
    });
}
