// Geometric LOD2, compact leaf detail and the distant canopy share cached geometric shadows.
// @ts-check
import * as THREE from 'three';

export const grassFieldShadowSource = lod => ['LOD3', 'LOD4', 'LOD2+4', 'LOD2+3+4'].includes(lod) ? 'LOD2' : lod;

/** @param {{renderer:object,scene:object,camera:object,sun:object,fields:object,lighting:object,canopyShadows:object}} options */
export function createGrassDebugV2FieldShadows({ renderer, scene, camera, sun, fields, lighting, canopyShadows }) {
    const originalRender = lighting.render, shadowMap = renderer.shadowMap;
    const target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    let generations = 0, source = null;
    lighting.render = function(dt) {
        const { lod, grassVisible } = fields.getSnapshot();
        const requested = grassVisible ? grassFieldShadowSource(lod) : 'soil';
        const refresh = shadowMap.enabled && (shadowMap.autoUpdate || shadowMap.needsUpdate)
            && (sun.shadow.autoUpdate || sun.shadow.needsUpdate);
        if (refresh && lod !== 'LOD2' && requested === 'LOD2' && grassVisible) {
            const previousTarget = renderer.getRenderTarget();
            const viewport = renderer.getViewport(new THREE.Vector4()), scissor = renderer.getScissor(new THREE.Vector4());
            const scissorTest = renderer.getScissorTest();
            fields.setLod('LOD2');
            try {
                // A normal render initializes Three's internal light state before refreshing the shadow map.
                // Its one-pixel color pass is discarded; subsequent frames only sample the cached shadow.
                renderer.setRenderTarget(target);
                renderer.setScissorTest(false);
                renderer.render(scene, camera);
            } finally {
                fields.setLod(lod);
                renderer.setRenderTarget(previousTarget);
                renderer.setViewport(viewport);
                renderer.setScissor(scissor);
                renderer.setScissorTest(scissorTest);
            }
        }
        originalRender.call(lighting, dt);
        if (refresh) {
            generations++; source = requested;
            if (requested === 'LOD2') {
                canopyShadows.update();
                if (lod !== 'LOD2') originalRender.call(lighting, 0);
            }
        }
    };
    return Object.freeze({
        getSnapshot: () => ({ generations, source, cached: !shadowMap.needsUpdate && !sun.shadow.needsUpdate, canopy: canopyShadows.getSnapshot() }),
        dispose: () => { lighting.render = originalRender; target.dispose(); }
    });
}

/** @param {{sun:THREE.DirectionalLight,renderer:THREE.WebGLRenderer,bounds:object}} input */
export function configureGrassDebugV2FieldShadows({ sun, renderer, bounds }) {
    sun.shadow.mapSize.set(8192, 8192);
    sun.shadow.normalBias = .0005; sun.shadow.bias = -.00001;
    sun.updateMatrixWorld(true); sun.target.updateMatrixWorld(true); sun.shadow.updateMatrices(sun);
    const camera = sun.shadow.camera, shadowBounds = new THREE.Box3();
    for (const x of [bounds.minX - 2, bounds.maxX + 2]) for (const z of [bounds.minZ - 2, bounds.maxZ + 2])
        for (const y of [0, 16]) shadowBounds.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
    camera.left = Math.min(camera.left, shadowBounds.min.x); camera.right = Math.max(camera.right, shadowBounds.max.x);
    camera.bottom = Math.min(camera.bottom, shadowBounds.min.y); camera.top = Math.max(camera.top, shadowBounds.max.y);
    camera.near = Math.min(camera.near, Math.max(.1, -shadowBounds.max.z - 16));
    camera.far = Math.max(camera.far, -shadowBounds.min.z + 16); camera.updateProjectionMatrix();
    renderer.shadowMap.autoUpdate = false;
}
