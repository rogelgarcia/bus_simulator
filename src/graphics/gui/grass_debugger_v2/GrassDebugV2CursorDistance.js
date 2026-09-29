// Reuses the visible depth buffer with a throttled asynchronous one-pixel read; no scene redraw or CPU mesh raycast.
// @ts-check
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { cursorDistanceShader } from '../../shaders/postprocessing/CursorDistanceShaderLoader.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';

/**
 * @param {{renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera,
 * pipeline: import('../../visuals/postprocessing/PostProcessingPipeline.js').PostProcessingPipeline,
 * onChange: () => void}} options
 */
export function createGrassDebugV2CursorDistance({ renderer, camera, pipeline, onChange }) {
    const composer = pipeline?.composer, renderPassIndex = composer?.passes.indexOf(pipeline.renderPass) ?? -1;
    if (renderPassIndex < 0) throw new Error('Cursor distance requires the visible-scene composer pass.');
    const canvas = renderer.domElement, target = new THREE.WebGLRenderTarget(1, 1, {
        depthBuffer: false, stencilBuffer: false, format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
        colorSpace: THREE.NoColorSpace, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter
    });
    const uniforms = { tDepth: { value: null }, uCursorUv: { value: new THREE.Vector2() },
        uProjectionInverse: { value: new THREE.Matrix4() }, uDepthRange: { value: new THREE.Vector2() } };
    const material = new THREE.ShaderMaterial({
        vertexShader: cursorDistanceShader.vertexSource, fragmentShader: cursorDistanceShader.fragmentSource,
        uniforms, depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending
    });
    attachShaderMetadata(material, cursorDistanceShader);
    const quad = new FullScreenQuad(material), pass = new Pass(), pixel = new Uint8Array(4);
    pass.needsSwap = false;
    let clientX = 0, clientY = 0, active = false, pending = false, disposed = false, revision = 0;
    let distanceMeters = null, error = null, samples = 0, lastSampleAt = -Infinity;
    const clear = () => {
        active = false; revision++;
        if (distanceMeters !== null) { distanceMeters = null; onChange(); }
    };
    const move = event => {
        if (document.elementFromPoint(event.clientX, event.clientY) !== canvas) { clear(); return; }
        clientX = event.clientX; clientY = event.clientY; active = true; revision++;
    };
    const fail = reason => {
        if (disposed) return;
        error = String(reason); distanceMeters = null; pass.enabled = false; onChange();
        console.error('[GrassCursorDistance] ' + error);
    };
    pass.render = (currentRenderer, writeBuffer, readBuffer) => {
        const now = performance.now();
        if (!active || pending || disposed || now - lastSampleAt < 100) return;
        const rect = canvas.getBoundingClientRect();
        if (document.elementFromPoint(clientX, clientY) !== canvas) { clear(); return; }
        if (!readBuffer.depthTexture) { fail('Visible depth texture unavailable.'); return; }
        const x = Math.floor((clientX - rect.left) / rect.width * readBuffer.width);
        const y = Math.floor((clientY - rect.top) / rect.height * readBuffer.height);
        if (x < 0 || y < 0 || x >= readBuffer.width || y >= readBuffer.height) { clear(); return; }
        uniforms.tDepth.value = readBuffer.depthTexture;
        uniforms.uCursorUv.value.set((x + 0.5) / readBuffer.width, 1 - (y + 0.5) / readBuffer.height);
        uniforms.uProjectionInverse.value.copy(camera.projectionMatrixInverse);
        uniforms.uDepthRange.value.set(camera.near, camera.far);
        const previousTarget = currentRenderer.getRenderTarget(), ticket = revision;
        lastSampleAt = now; pending = true;
        try {
            currentRenderer.setRenderTarget(target); quad.render(currentRenderer);
            currentRenderer.readRenderTargetPixelsAsync(target, 0, 0, 1, 1, pixel).then(() => {
                if (disposed || !active || ticket !== revision) return;
                distanceMeters = pixel[3] ? (pixel[0] + pixel[1] * 256 + pixel[2] * 65536) / 1000 : null;
                samples++; onChange();
            }).catch(fail).finally(() => { pending = false; });
        } catch (reason) { pending = false; fail(reason); }
        finally { currentRenderer.setRenderTarget(previousTarget); }
    };
    composer.insertPass(pass, renderPassIndex + 1);
    window.addEventListener('pointermove', move);
    canvas.addEventListener('pointerleave', clear);
    window.addEventListener('blur', clear);
    return Object.freeze({
        invalidate() { revision++; distanceMeters = null; lastSampleAt = -Infinity; onChange(); },
        getSnapshot: () => ({ active, distanceMeters, pending, samples, error }),
        dispose() {
            disposed = true; clear(); composer.removePass(pass);
            window.removeEventListener('pointermove', move); canvas.removeEventListener('pointerleave', clear);
            window.removeEventListener('blur', clear); quad.dispose(); material.dispose(); target.dispose();
        }
    });
}
