// Opt-in finite directional source filtering of the renderer's existing native depth map.
import * as THREE from 'three';
import {getMaterialShaderHookRegistrySnapshot, registerMaterialShaderHook} from '../shaders/core/MaterialShaderHookRegistry.js';
import {getShaderDebugIdentity, getShaderSourcePaths} from '../shaders/core/ShaderLoader.js';
import {createFiniteSunShadowShader} from '../shaders/lighting/FiniteSunShadowShader.js';

export class FiniteSunShadow {
    #renderer;
    #scene;
    #light;
    #handles = new Map();
    #uniforms = {uFiniteSunGeometry: {value: new THREE.Vector4()}};
    #angularDiameter;

    constructor({renderer, scene, light, angularDiameter = 0.00925}) {
        if (!light?.isDirectionalLight || !light.castShadow) throw new Error('FiniteSunShadow requires a shadow-casting directional light.');
        this.#renderer = renderer;
        this.#scene = scene;
        this.#light = light;
        this.setAngularDiameter(angularDiameter);
        this.update();
    }

    setAngularDiameter(radians) {
        if (!Number.isFinite(radians) || radians < 0 || radians > 0.2) throw new Error('Finite sun angular diameter must be in [0, 0.2] radians.');
        this.#angularDiameter = radians;
    }

    // Call before rendering, including after edits to the light's orthographic frustum.
    update() {
        if (this.#renderer.shadowMap.type !== THREE.BasicShadowMap || this.#renderer.capabilities.reversedDepthBuffer) {
            throw new Error('FiniteSunShadow requires native BasicShadowMap depth with forward depth.');
        }
        const casters = [];
        this.#scene.traverseVisible(object => {
            if (object.isDirectionalLight && object.castShadow) casters.push(object);
        });
        if (casters.length !== 1 || casters[0] !== this.#light) throw new Error('FiniteSunShadow currently supports one directional shadow light; CSM is not supported.');
        const camera = this.#light.shadow.camera;
        const width = (camera.right - camera.left) / camera.zoom, height = (camera.top - camera.bottom) / camera.zoom, depth = camera.far - camera.near;
        if (!camera.isOrthographicCamera || ![width, height, depth].every(value => Number.isFinite(value) && value > 0)) throw new Error('FiniteSunShadow requires a valid orthographic shadow frustum.');
        this.#uniforms.uFiniteSunGeometry.value.set(1 / width, 1 / height, depth, Math.tan(this.#angularDiameter / 2));
        const shadow = this.#light.shadow;
        const dimensions = [shadow.mapSize.x, shadow.mapSize.y];
        if (!dimensions.every(value => Number.isInteger(value) && value > 0 && value <= this.#renderer.capabilities.maxTextureSize)) throw new Error('FiniteSunShadow shadow-map dimensions exceed the renderer limits.');
        // Three does not resize an existing native map when mapSize is edited.
        // Updating its viewport alone renders into only part of the old texture.
        if (shadow.map && (shadow.map.width !== dimensions[0] || shadow.map.height !== dimensions[1])) {
            shadow.map.setSize(...dimensions);
            shadow.needsUpdate = true;
        }
    }

    attach(material) {
        if (this.#handles.has(material)) return;
        if (!(material.isMeshLambertMaterial || material.isMeshStandardMaterial || material.isMeshPhongMaterial) || material.defines?.USE_CSM !== undefined) {
            throw new Error('FiniteSunShadow requires a native lit material without CSM.');
        }
        if (getMaterialShaderHookRegistrySnapshot(material).hooks.some(hook => hook.id === 'finite-sun-shadow')) throw new Error('FiniteSunShadow material already belongs to another filter.');
        const payload = createFiniteSunShadowShader();
        const handle = registerMaterialShaderHook(material, {
            id: 'finite-sun-shadow', priority: 50, variantKey: payload.variantKey,
            uniforms: this.#uniforms,
            apply: shader => {
                const declaration = '#include <shadowmap_pars_fragment>';
                const lighting = '#include <lights_fragment_begin>';
                const nativeCall = 'getShadow( directionalShadowMap[ i ],';
                if (!shader.fragmentShader.includes(declaration) || !shader.fragmentShader.includes(lighting) || !THREE.ShaderChunk.lights_fragment_begin.includes(nativeCall)) {
                    throw new Error('FiniteSunShadow: native directional shader contract changed.');
                }
                Object.assign(shader.uniforms, this.#uniforms);
                shader.fragmentShader = shader.fragmentShader
                    .replace(declaration, declaration + '\n' + payload.fragmentSource)
                    .replace(lighting, THREE.ShaderChunk.lights_fragment_begin.replaceAll(nativeCall, 'getFiniteSunShadow( directionalShadowMap[ i ],'));
            }
        });
        material.userData.finiteSunShadow = {shaderIdentity: getShaderDebugIdentity(payload), sourcePaths: getShaderSourcePaths(payload)};
        this.#handles.set(material, handle);
    }

    detach(material) {
        if (!this.#handles.has(material)) return;
        this.#handles.get(material).remove();
        delete material.userData.finiteSunShadow;
        this.#handles.delete(material);
    }

    dispose() {
        for (const material of this.#handles.keys()) this.detach(material);
    }
}
