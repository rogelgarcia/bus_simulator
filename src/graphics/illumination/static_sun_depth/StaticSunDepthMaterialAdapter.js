// Audited Three r183 material extension for the AI 531 static directional visibility cache.
// @ts-check

import * as THREE from 'three';
import { validateStaticSunDepthTileSetDescriptor } from '../../../app/illumination/static_sun_depth/index.js';
import { isLitMaterial } from '../../lighting/SceneShadowMaterials.js';
import {
    getMaterialShaderHookRegistrySnapshot,
    registerMaterialShaderHook
} from '../../shaders/core/MaterialShaderHookRegistry.js';
import {
    createShaderPayload,
    loadShaderSourceSet
} from '../../shaders/core/ShaderLoader.js';
import {
    patchStaticSunDepthDirectionalChunk,
    STATIC_SUN_DEPTH_THREE_REVISION
} from './StaticSunDepthShaderContract.js';

const HOOK_ID = 'illumination.static_sun_depth';
const HOOK_PRIORITY = 200;
const SHADER_SOURCES = await loadShaderSourceSet({
    vertexPath: 'materials/static_sun_depth.vert.glsl',
    fragmentPath: 'materials/static_sun_depth.frag.glsl'
});
const SHADER_PAYLOAD = createShaderPayload({
    shaderId: 'illumination.static_sun_depth.v1',
    sourceSet: SHADER_SOURCES
});
const DYNAMIC_SHADER_SOURCES = await loadShaderSourceSet({
    vertexPath: 'materials/dynamic_sun_shadow.vert.glsl',
    fragmentPath: 'materials/dynamic_sun_shadow.frag.glsl'
});
const DYNAMIC_SHADER_PAYLOAD = createShaderPayload({
    shaderId: 'illumination.dynamic_sun_shadow.v1',
    sourceSet: DYNAMIC_SHADER_SOURCES
});
let bindingVariantSerial = 0;

export const STATIC_SUN_DEPTH_DEBUG_MODES = Object.freeze({
    final: 0,
    visibility: 1,
    tile: 2,
    reconstructedDepth: 3,
    receiverCoordinates: 4,
    residency: 5,
    bias: 6,
    outOfRange: 7,
    seam: 8,
    currentDifference: 9,
    liveFinal: 10,
    signedDifference: 11,
    dynamicVisibility: 12,
    dynamicDepth: 13,
    dynamicProjection: 14,
    dynamicBias: 15,
    composedVisibility: 16,
    hybridDifference: 17
});

function replaceExactlyOnce(source, anchor, replacement, label) {
    const first = source.indexOf(anchor);
    if (first < 0 || source.indexOf(anchor, first + anchor.length) >= 0) {
        throw new Error(`[StaticSunDepthMaterialAdapter] Expected exactly one ${label} anchor.`);
    }
    return source.slice(0, first) + replacement + source.slice(first + anchor.length);
}

function matrixFromDescriptor(descriptor) {
    const { basis } = descriptor.identity;
    const origin = basis.originWorld;
    const right = basis.rightAxisWorld;
    const up = basis.upAxisWorld;
    const depth = basis.depthAxisWorld;
    return new THREE.Matrix4().set(
        right[0], right[1], right[2], -dot(right, origin),
        up[0], up[1], up[2], -dot(up, origin),
        depth[0], depth[1], depth[2], -dot(depth, origin),
        0, 0, 0, 1
    );
}

function dot(left, right) {
    return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function debugModeValue(value) {
    if (Number.isSafeInteger(value) && value >= 0 && value <= 17) return value;
    if (typeof value === 'string' && Object.prototype.hasOwnProperty.call(STATIC_SUN_DEPTH_DEBUG_MODES, value)) {
        return STATIC_SUN_DEPTH_DEBUG_MODES[value];
    }
    throw new TypeError(`Unknown static-sun-depth debug mode '${String(value)}'.`);
}

export function createStaticSunDepthShaderBinding({ descriptor, texture, debugMode = 'final' }) {
    const validated = validateStaticSunDepthTileSetDescriptor(descriptor);
    if (!texture?.isDataArrayTexture) throw new TypeError('Static-sun depth requires a Three DataArrayTexture.');
    const layout = validated.identity.layout;
    const pointDirectionWorld = new THREE.Vector3(...validated.identity.sunPointDirectionWorld).normalize();
    const pointDirectionView = pointDirectionWorld.clone();
    const dynamicPointDirectionWorld = pointDirectionWorld.clone();
    const bias = validated.identity.sampling.bias;
    const pcf = validated.identity.sampling.pcf;
    const geometricBias = bias.model
        === 'geometric-normal-offset-plus-constant-depth-relief-v1';
    const threeR183Filter = pcf.model === 'three-r183-vogel-5-linear-compare-v1';
    const constantBias = geometricBias
        ? bias.constantDepthReliefMeters : bias.constantMeters;
    const normalBias = geometricBias
        ? bias.geometricNormalOffsetMeters : bias.normalOffsetScaleMeters;
    const sourceMapRightLight = threeR183Filter ? new THREE.Vector2(
        dot(pcf.sourceMapRightAxisWorld, validated.identity.basis.rightAxisWorld),
        dot(pcf.sourceMapRightAxisWorld, validated.identity.basis.upAxisWorld)
    ) : new THREE.Vector2();
    const sourceMapUpLight = threeR183Filter ? new THREE.Vector2(
        dot(pcf.sourceMapUpAxisWorld, validated.identity.basis.rightAxisWorld),
        dot(pcf.sourceMapUpAxisWorld, validated.identity.basis.upAxisWorld)
    ) : new THREE.Vector2();
    // Three may retain a material's current program across hook removal and
    // reinstallation. Isolate each uniform owner so a replacement profile or
    // texture can never resume a program bound to disposed cache resources.
    bindingVariantSerial++;
    const variantKey = [
        'static-sun-depth-v2',
        'three-r' + STATIC_SUN_DEPTH_THREE_REVISION,
        SHADER_PAYLOAD.variantKey,
        DYNAMIC_SHADER_PAYLOAD.variantKey,
        validated.identity.encoding.id,
        'binding-' + bindingVariantSerial
    ].join(':');
    const uniforms = Object.freeze({
        staticSunDepthTiles: { value: texture },
        staticSunDepthWorldToLight: { value: matrixFromDescriptor(validated) },
        staticSunDepthPointDirectionWorld: { value: pointDirectionWorld },
        staticSunDepthPointDirectionView: { value: pointDirectionView },
        staticSunDepthGridOrigin: { value: new THREE.Vector2(...layout.boundsLightMeters.min) },
        staticSunDepthTileCount: { value: new THREE.Vector2(...layout.tileCount) },
        staticSunDepthDepthRange: { value: new THREE.Vector2(validated.identity.encoding.minDepthMeters, validated.identity.encoding.maxDepthMeters) },
        staticSunDepthEncodingMode: {
            value: validated.identity.encoding.id
                === 'rgba8-rgb24-linear-depth-alpha-occupancy-diagnostic-v1'
                ? 1
                : 0
        },
        staticSunDepthLayout: {
            value: new THREE.Vector4(
                layout.interiorTexels[0],
                layout.interiorTexels[1],
                layout.guardTexels,
                layout.texelSizeMeters
            )
        },
        staticSunDepthBiasPolicy: {
            value: new THREE.Vector4(
                constantBias,
                normalBias,
                pcf.radiusTexels,
                geometricBias ? 1 : 0
            )
        },
        staticSunDepthFilterPolicy: {
            value: new THREE.Vector4(
                threeR183Filter ? 1 : 0,
                pcf.radiusTexels,
                threeR183Filter ? pcf.sampleCount : 0,
                0
            )
        },
        staticSunDepthSourceMapSizeAndExtent: {
            value: new THREE.Vector4(
                threeR183Filter ? pcf.shadowMapSizeTexels[0] : 0,
                threeR183Filter ? pcf.shadowMapSizeTexels[1] : 0,
                threeR183Filter ? pcf.shadowMapWorldExtentMeters[0] : 0,
                threeR183Filter ? pcf.shadowMapWorldExtentMeters[1] : 0
            )
        },
        staticSunDepthSourceMapRightLight: { value: sourceMapRightLight },
        staticSunDepthSourceMapUpLight: { value: sourceMapUpLight },
        staticSunDepthDebugMode: { value: debugModeValue(debugMode) },
        dynamicSunShadowMap: { value: null },
        dynamicSunShadowWorldToClip: { value: new THREE.Matrix4() },
        dynamicSunShadowMapSizeBias: { value: new THREE.Vector4(1, 1, 0, 0) },
        dynamicSunShadowDepthRangeMeters: { value: 1 },
        dynamicSunShadowPointDirectionWorld: { value: dynamicPointDirectionWorld },
        dynamicSunShadowEnabled: { value: 0 }
    });
    return {
        descriptor: validated,
        texture,
        uniforms,
        variantKey,
        updateCamera(camera) {
            pointDirectionView.copy(pointDirectionWorld).transformDirection(camera.matrixWorldInverse);
        },
        setDynamicShadowState(state) {
            if (!state?.enabled) {
                uniforms.dynamicSunShadowEnabled.value = 0;
                uniforms.dynamicSunShadowMap.value = null;
                return;
            }
            if (!state.texture?.isTexture || !state.worldToClip?.isMatrix4) {
                throw new TypeError('Dynamic sun-shadow binding state is incomplete.');
            }
            const direction = new THREE.Vector3(...state.pointDirectionWorld).normalize();
            if (direction.dot(pointDirectionWorld) < 0.999999) {
                throw new Error('Dynamic and static sun-shadow directions do not match.');
            }
            dynamicPointDirectionWorld.copy(direction);
            uniforms.dynamicSunShadowMap.value = state.texture;
            uniforms.dynamicSunShadowWorldToClip.value.copy(state.worldToClip);
            uniforms.dynamicSunShadowMapSizeBias.value.set(
                state.mapSize,
                state.mapSize,
                state.constantBiasMeters,
                state.normalBiasMeters
            );
            uniforms.dynamicSunShadowDepthRangeMeters.value = state.depthRangeMeters;
            uniforms.dynamicSunShadowEnabled.value = 1;
        },
        setDebugMode(mode) {
            uniforms.staticSunDepthDebugMode.value = debugModeValue(mode);
        }
    };
}

export function applyStaticSunDepthShaderPatch(shader, binding) {
    if (!shader || typeof shader.vertexShader !== 'string' || typeof shader.fragmentShader !== 'string') {
        throw new TypeError('A compiled Three shader is required.');
    }
    const directional = patchStaticSunDepthDirectionalChunk(
        String(THREE.ShaderChunk?.lights_fragment_begin ?? ''),
        THREE.REVISION
    );
    shader.vertexShader = replaceExactlyOnce(
        shader.vertexShader,
        '#include <common>',
        `#include <common>\n${SHADER_PAYLOAD.vertexSource}\n${DYNAMIC_SHADER_PAYLOAD.vertexSource}`,
        'vertex common'
    );
    shader.vertexShader = replaceExactlyOnce(
        shader.vertexShader,
        '#include <project_vertex>',
        '#include <project_vertex>\nstaticSunDepthTransferWorldPosition( transformed, transformedNormal );',
        'post-transform vertex position'
    );
    shader.fragmentShader = replaceExactlyOnce(
        shader.fragmentShader,
        '#include <lights_pars_begin>',
        `#include <lights_pars_begin>\n${SHADER_PAYLOAD.fragmentSource}\n${DYNAMIC_SHADER_PAYLOAD.fragmentSource}`,
        'fragment lighting declarations'
    );
    shader.fragmentShader = replaceExactlyOnce(
        shader.fragmentShader,
        '#include <lights_fragment_begin>',
        directional.source,
        'fragment direct-light loop'
    );
    shader.fragmentShader = replaceExactlyOnce(
        shader.fragmentShader,
        '#include <opaque_fragment>',
        'outgoingLight = staticSunDepthDebugColor( outgoingLight, geometryNormal );\n#include <opaque_fragment>',
        'fragment output'
    );
    Object.assign(shader.uniforms, binding.uniforms);
    return Object.freeze({ directionalBranchesPatched: directional.replacements });
}

function isSupportedReceiverMaterial(material) {
    return isLitMaterial(material) && !material.isMeshToonMaterial;
}

export class StaticSunDepthMaterialSet {
    constructor() {
        /** @type {Map<any, {handle: {update: (patch: any) => any, remove: () => boolean}, state: {binding: any}}>} */
        this._handles = new Map();
        this._binding = null;
        this._enabled = false;
        this._unsupported = [];
        this._roots = [];
        this._outsideRoot = null;
    }

    prepare(root, binding, { outsideRoot = null } = {}) {
        return this.prepareRoots([root], binding, { outsideRoot });
    }

    prepareRoots(roots, binding, { outsideRoot = null } = {}) {
        if (!Array.isArray(roots) || roots.length === 0
            || roots.some((root) => !root?.traverse)) {
            throw new TypeError('Static-sun receiver roots must be non-empty Object3D subtrees.');
        }
        const uniqueRoots = [...new Set(roots)];
        const outsideMaterials = collectOutsideMaterials(outsideRoot, uniqueRoots);
        const materials = collectMaterialsFromRoots(uniqueRoots);
        const unsupported = [];
        for (const material of materials) {
            if (!isSupportedReceiverMaterial(material)) {
                if (isLitMaterial(material)) unsupported.push(material.uuid ?? material.name ?? material.type ?? 'unknown');
                continue;
            }
            if (outsideMaterials.has(material)) {
                throw new Error(`Static-sun receiver material '${material.uuid ?? material.name ?? 'unknown'}' is shared outside the static city.`);
            }
            let entry = this._handles.get(material);
            if (!entry) {
                const state = { binding };
                const handle = registerMaterialShaderHook(material, {
                    id: HOOK_ID,
                    priority: HOOK_PRIORITY,
                    enabled: false,
                    variantKey: binding.variantKey,
                    apply(shader) {
                        applyStaticSunDepthShaderPatch(shader, state.binding);
                    }
                });
                entry = { handle, state };
                this._handles.set(material, entry);
            } else {
                // Keep the registered apply function stable. Replacing a
                // descriptor only swaps uniform ownership and therefore must
                // not invent a shader-source variant.
                entry.state.binding = binding;
                entry.handle.update({ enabled: false, variantKey: binding.variantKey });
            }
        }
        this._binding = binding;
        this._unsupported = unsupported;
        this._roots = uniqueRoots;
        this._outsideRoot = outsideRoot;
        return Object.freeze({ supportedMaterialCount: this._handles.size, unsupported: Object.freeze(unsupported.slice()) });
    }

    activate() {
        if (!this._binding || this._unsupported.length > 0) {
            throw new Error(`Static-sun material set is incomplete (${this._unsupported.length} unsupported lit materials).`);
        }
        const activated = [];
        try {
            for (const { handle } of this._handles.values()) {
                handle.update({ enabled: true, variantKey: this._binding.variantKey });
                activated.push(handle);
            }
            this._enabled = true;
        } catch (error) {
            for (const handle of activated) handle.update({ enabled: false });
            this._enabled = false;
            throw error;
        }
    }

    deactivate() {
        for (const { handle } of this._handles.values()) handle.update({ enabled: false });
        this._enabled = false;
    }

    updateCamera(camera) {
        if (this._enabled) this._binding?.updateCamera(camera);
    }

    setDebugMode(mode) {
        this._binding?.setDebugMode(mode);
    }

    /** @returns {boolean} */
    verifyOwnership() {
        return this._enabled && this.verifyPreparedOwnership();
    }

    /**
     * Validate the prepared receiver inventory even while the validation-only
     * liveFinal mode has disabled every hook to render the original shaders.
     * @returns {boolean}
     */
    verifyPreparedOwnership() {
        if (this._roots.length === 0 || this._roots.some((root) => !root?.traverse)) return false;
        const current = new Set();
        for (const material of collectMaterialsFromRoots(this._roots)) {
            if (!isLitMaterial(material)) continue;
            if (!isSupportedReceiverMaterial(material)) return false;
            current.add(material);
        }
        if (current.size !== this._handles.size) return false;
        for (const material of current) {
            if (!this._handles.has(material)) return false;
        }
        const outside = collectOutsideMaterials(this._outsideRoot, this._roots);
        for (const material of this._handles.keys()) {
            if (outside.has(material)) return false;
        }
        return true;
    }

    getDiagnostics() {
        return Object.freeze({
            enabled: this._enabled,
            rootCount: this._roots.length,
            materialCount: this._handles.size,
            unsupported: Object.freeze(this._unsupported.slice()),
            registries: Object.freeze([...this._handles.keys()].map((material) => getMaterialShaderHookRegistrySnapshot(material)))
        });
    }

    dispose() {
        for (const { handle } of this._handles.values()) handle.remove();
        this._handles.clear();
        this._binding = null;
        this._enabled = false;
        this._unsupported = [];
        this._roots = [];
        this._outsideRoot = null;
    }
}

function collectMaterials(root) {
    const materials = new Set();
    root.traverse((object) => {
        const value = object?.material;
        if (Array.isArray(value)) value.forEach((material) => material && materials.add(material));
        else if (value) materials.add(value);
    });
    return materials;
}

function collectMaterialsFromRoots(roots) {
    const materials = new Set();
    for (const root of roots) {
        for (const material of collectMaterials(root)) materials.add(material);
    }
    return materials;
}

function collectOutsideMaterials(scene, excludedRoots) {
    const materials = new Set();
    if (!scene) return materials;
    const excluded = new Set(excludedRoots);
    const visit = (object) => {
        if (excluded.has(object)) return;
        const value = object?.material;
        if (Array.isArray(value)) value.forEach((material) => material && materials.add(material));
        else if (value) materials.add(value);
        if (Array.isArray(object?.children)) object.children.forEach(visit);
    };
    visit(scene);
    return materials;
}
