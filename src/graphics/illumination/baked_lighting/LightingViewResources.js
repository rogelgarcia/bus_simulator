// Initializes the visible view's GPU buffers without touching its displayed framebuffer.
// @ts-check
import * as THREE from 'three';
import { prepareReceiverTexture } from '../receiver_lightmaps/ReceiverTexturePreparation.js';

/** @param {any} renderer @param {any} scene @param {any} camera @param {AbortSignal} signal */
export async function prepareLightingViewResources(renderer, scene, camera, signal) {
    signal.throwIfAborted();
    scene.updateMatrixWorld(); camera.updateMatrixWorld();
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const geometries = new Set(), textures = new Set();
    scene.traverseVisible(object => {
        if (!(object.isMesh || object.isLine || object.isPoints) || !object.layers.test(camera.layers)) return;
        if (object.frustumCulled && !frustum.intersectsObject(object)) return;
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            for (const value of Object.values(material)) if (value?.isTexture && !value.isRenderTargetTexture) textures.add(value);
            for (const uniform of Object.values(renderer.properties.get(material).uniforms ?? {})) {
                const value = uniform.value;
                if (value?.isTexture && !value.isRenderTargetTexture) textures.add(value);
            }
        }
    });
    const metrics = { geometries: geometries.size, textures: 0, maximumBatchMs: 0 };
    let batch = performance.now();
    const yieldBatch = async () => {
        metrics.maximumBatchMs = Math.max(metrics.maximumBatchMs, performance.now() - batch);
        await new Promise(resolve => requestAnimationFrame(resolve));
        signal.throwIfAborted();
        if (renderer.getContext().isContextLost()) throw new Error('lighting_view_context_lost');
        batch = performance.now();
    };
    for (const texture of textures) {
        signal.throwIfAborted();
        if (renderer.properties.get(texture).__version === texture.version) continue;
        const rowUpload = (texture.format === THREE.RGBFormat || texture.format === THREE.RGBAFormat)
            && [THREE.UnsignedInt5999Type, THREE.FloatType, THREE.UnsignedByteType].includes(texture.type);
        if (rowUpload && texture.isDataTexture && texture.image?.data && !texture.mipmaps.length && !texture.generateMipmaps) {
            await prepareReceiverTexture(renderer, texture, [texture.image], signal); batch = performance.now();
        } else renderer.initTexture(texture);
        metrics.textures++;
        if (performance.now() - batch >= 4) await yieldBatch();
    }
    const target = new THREE.WebGLRenderTarget(1, 1), staging = new THREE.Scene();
    const material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false });
    const emptyGeometry = new THREE.BufferGeometry();
    const mesh = new THREE.Mesh(emptyGeometry, material); mesh.frustumCulled = false;
    staging.add(mesh);
    try {
        for (const geometry of geometries) {
            signal.throwIfAborted(); mesh.geometry = geometry;
            const previous = renderer.getRenderTarget();
            try { renderer.setRenderTarget(target); renderer.render(staging, camera); }
            finally { renderer.setRenderTarget(previous); }
            if (performance.now() - batch >= 4) await yieldBatch();
        }
        metrics.maximumBatchMs = Math.max(metrics.maximumBatchMs, performance.now() - batch);
    } finally {
        staging.remove(mesh); material.dispose(); target.dispose(); emptyGeometry.dispose();
    }
    return metrics;
}
