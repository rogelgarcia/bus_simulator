// Fills the view below the horizon, beyond the finite landscape, with the aerial-perspective limit of the view lighting.
// @ts-check
// Design: the calibrated HDR has no ground below the horizon (nearly black), which showed as a dark band between the hazy far terrain and the
// bright horizon. A camera-centered sphere just inside the far plane draws the haze limit there (backdrop.frag.glsl); terrain and water occlude
// it by depth, it never joins picking and owns no ledger allocation beyond its sphere buffers.
import * as THREE from 'three';
import { createLandscapeShaderPayload } from '../../shaders/materials/landscape/LandscapeShaderLoader.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';

const FAR_FRACTION = .97;

/** @param {{scene:any,lighting:import('./LandscapeLighting.js').LandscapeLighting}} options @returns {any} */
export function createLandscapeAtmosphereBackdrop({ scene, lighting }) {
    if (!scene || !lighting?.uniforms) throw new Error('[Landscape] The atmosphere backdrop needs the view scene and lighting');
    const geometry = new THREE.SphereGeometry(1, 48, 24);
    let tier = lighting.tier;
    const payload = createLandscapeShaderPayload('backdrop', { lightingTier: tier });
    const material = new THREE.ShaderMaterial({ vertexShader: payload.vertexSource, fragmentShader: payload.fragmentSource, uniforms: { ...lighting.uniforms },
        side: THREE.BackSide, transparent: true, depthWrite: false });
    attachShaderMetadata(material, payload);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'Landscape atmosphere backdrop';
    mesh.frustumCulled = false;
    mesh.renderOrder = -1;
    mesh.onBeforeRender = (renderer, renderScene, camera) => {
        mesh.position.copy(camera.position);
        mesh.scale.setScalar(camera.far * FAR_FRACTION);
        mesh.updateMatrixWorld();
    };
    scene.add(mesh);
    return Object.freeze({
        mesh,
        /** @param {string} value recompiles the backdrop for a lighting tier on its next draw */
        setLightingTier(value) {
            const next = createLandscapeShaderPayload('backdrop', { lightingTier: value });
            material.vertexShader = next.vertexSource; material.fragmentShader = next.fragmentSource; material.needsUpdate = true;
            attachShaderMetadata(material, next);
            tier = value;
        },
        snapshot() { return { model: 'landscape-atmosphere-backdrop-v1', visible: mesh.visible, lightingTier: tier, farFraction: FAR_FRACTION, drawCalls: mesh.visible ? 1 : 0, triangles: mesh.visible ? geometry.index.count / 3 : 0 }; },
        dispose() { mesh.removeFromParent(); geometry.dispose(); material.dispose(); }
    });
}
