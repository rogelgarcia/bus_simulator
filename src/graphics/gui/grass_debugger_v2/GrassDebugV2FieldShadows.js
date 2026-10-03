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
