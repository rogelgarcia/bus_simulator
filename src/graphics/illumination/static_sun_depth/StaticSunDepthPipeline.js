// Internal/development AI 531 pipeline: AI 530 staging, frame-boundary handoff, shader binding, and caster ownership.
// @ts-check

import * as THREE from 'three';
import {
    validateOwnedStaticSunDepthTileArrayIntegrity,
    validateStaticSunDepthTileSetDescriptor
} from '../../../app/illumination/static_sun_depth/index.js';
import { createIlluminationRuntime } from '../runtime/index.js';
import { DynamicSunShadowLayer } from '../dynamic_sun_shadow/index.js';
import { StaticSunDepthCasterController } from './StaticSunDepthCasterController.js';
import {
    STATIC_SUN_DEPTH_DEBUG_MODES,
    createStaticSunDepthShaderBinding,
    StaticSunDepthMaterialSet
} from './StaticSunDepthMaterialAdapter.js';
import {
    assertStaticSunDepthPlanIdentity,
    assertStaticSunDepthTextureLayout,
    extractStaticSunDepthTileSetDescriptor,
    requireStaticSunDepthPlanResource
} from './StaticSunDepthPlanContract.js';
import { createThreeStaticSunDepthResourceFactory } from './ThreeStaticSunDepthResources.js';
import { StaticSunDepthFenceTracker } from './StaticSunDepthFenceTracker.js';
import { STATIC_SUN_DEPTH_RUNTIME_DEFAULTS } from './StaticSunDepthRuntimeLimits.js';

const PREPARED_BINDING_ID = 'static_sun_depth.prepared_binding.v1';
const SUN_DIRECTION_EPSILON = 1e-8;
const SHADER_DIRECTION_MATCH_MINIMUM = 0.9995;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const LIVE_IDENTITY_KEYS = Object.freeze([
    'alphaSemanticsSha256',
    'casterInventorySha256',
    'cityId',
    'developmentCacheAllowed',
    'lightingProfileId',
    'resolvedSourceSha256',
    'staticSunDepthSourceSha256'
]);

export class StaticSunDepthPipeline {
    constructor(engine, options = {}) {
        if (!engine?.renderer?.isWebGLRenderer) throw new TypeError('StaticSunDepthPipeline requires a GameEngine WebGLRenderer.');
        this.engine = engine;
        this.renderer = engine.renderer;
        this._materials = new StaticSunDepthMaterialSet();
        this._casters = new StaticSunDepthCasterController(engine);
        this._dynamicShadows = new DynamicSunShadowLayer(this.renderer, options.dynamicShadow);
        this._active = null;
        this._cachedActivation = null;
        this._exactCityCompileCount = 0;
        this._cacheActivationCount = 0;
        this._lastError = null;
        this._disposed = false;
        this._debugMode = requireDebugMode(options.debugMode ?? 'final');
        this._getLiveIdentity = options.getLiveStaticSunDepthIdentity ?? null;
        if (this._getLiveIdentity !== null && typeof this._getLiveIdentity !== 'function') {
            throw new TypeError('getLiveStaticSunDepthIdentity must be a synchronous function.');
        }
        this._fenceTracker = new StaticSunDepthFenceTracker({
            getContext: () => this.renderer?.getContext?.(),
            now: options.now,
            onError: (error) => {
                this._lastError = error;
            }
        });
        const createResource = createThreeStaticSunDepthResourceFactory(this.renderer);
        this.runtime = createIlluminationRuntime({
            initialMode: options.initialMode ?? 'current',
            cacheInactiveResources: true,
            fetchPackage: options.fetchPackage,
            createResource,
            validateResourcePlan: createResource.validatePlan,
            prewarm: (resources, context) => this._prewarm(resources, context),
            commitSnapshot: (snapshot) => this._commitSnapshot(snapshot),
            waitUntilSafeToDispose: (_resourceSet, context) => this._waitForGeneration(context.generation),
            capabilities: options.capabilities ?? this._capabilities(),
            expectations: options.expectations,
            memoryLimits: {
                ...STATIC_SUN_DEPTH_RUNTIME_DEFAULTS.memoryLimits,
                ...(options.memoryLimits ?? {})
            },
            baselineMemory: options.baselineMemory,
            residentCpuPolicy: 'retain',
            prewarmMemory: { cpuBytes: 0, gpuBytes: 0 },
            maximumPackageBytes: options.maximumPackageBytes
                ?? STATIC_SUN_DEPTH_RUNTIME_DEFAULTS.maximumPackageBytes,
            now: options.now
        });
        this._contextEventTarget = this.renderer.domElement ?? null;
        this._onContextLost = () => {
            if (!this._disposed) this._fallbackNow('webgl_context_lost');
        };
        this._contextEventTarget?.addEventListener?.('webglcontextlost', this._onContextLost);
    }

    async setMode(mode, request = null) {
        if (this._disposed) throw new Error('StaticSunDepthPipeline is disposed.');
        return this.runtime.setMode(mode, request);
    }

    load(request) {
        if (this._disposed) throw new Error('StaticSunDepthPipeline is disposed.');
        return this.runtime.load(request);
    }

    registerDynamicShadowObject(descriptor) {
        if (this._disposed) throw new Error('StaticSunDepthPipeline is disposed.');
        if (this._active) this._fallbackNow('dynamic_shadow_registry_changed');
        const registration = this._dynamicShadows.register(descriptor);
        return Object.freeze({
            id: registration.id,
            unregister: () => {
                if (this._active) this._fallbackNow('dynamic_shadow_registry_changed');
                return registration.unregister();
            }
        });
    }

    /**
     * Rebuilds only the independently owned moving-object target. Static baked
     * textures and prepared receiver materials remain resident.
     * @param {{mapSize: number, worldUnitsPerTexel: number}} resolution
     */
    setDynamicShadowResolution(resolution) {
        if (this._disposed) throw new Error('StaticSunDepthPipeline is disposed.');
        const diagnostics = this._dynamicShadows.getDiagnostics();
        if (diagnostics.map.size === resolution?.mapSize
            && diagnostics.map.worldUnitsPerTexel === resolution?.worldUnitsPerTexel) return false;
        const activeBinding = this._active?.binding ?? null;
        try {
            this._dynamicShadows.deactivate();
            const changed = this._dynamicShadows.setResolution(resolution);
            if (changed && activeBinding && this._shouldUseDynamicLayer()) {
                this._renderDynamicLayer(activeBinding);
            }
            return changed;
        } catch (error) {
            this._lastError = error;
            this._fallbackNow('dynamic_shadow_resolution_change_failed');
            throw error;
        }
    }

    frameBegin() {
        if (this._disposed) return;
        if (this._active && !this._activeLiveIdentityMatches()) {
            this._fallbackNow('static_sun_identity_drift');
        }
        if (this._active && !this._activeReceiverOwnershipMatches()) {
            this._fallbackNow('static_receiver_material_drift');
        }
        if (this._active && this._shouldSuppressCasters() && !this._casters.verifySuppressed()) {
            this._fallbackNow('static_caster_ownership_lost');
        }
        if (this._active && this._shouldUseDynamicLayer()
            && this._dynamicShadows.getRegistrationCount() > 0
            && !this._dynamicShadows.verifyOwnership()) {
            this._fallbackNow('dynamic_caster_ownership_lost');
        }
        try {
            this.runtime.commitFrameBoundary();
        } catch (error) {
            this._lastError = error;
            this._restoreCurrent('frame_commit_failed');
        }
        this._materials.updateCamera(this.engine.camera);
    }

    shadowPrepare() {
        if (this._active && this._shouldSuppressCasters() && !this._casters.verifySuppressed()) {
            this._fallbackNow('static_caster_reenabled_before_shadow');
        }
        if (!this._active || !this._shouldUseDynamicLayer()) return;
        try {
            this._renderDynamicLayer(this._active.binding);
        } catch (error) {
            this._lastError = error;
            this._fallbackNow('dynamic_shadow_render_failed');
        }
    }

    frameEnd() {
        if (!this._active) return;
        if (this._shouldSuppressCasters()) {
            try {
                this._casters.freezeShadowMapPassAfterEmptyRender();
            } catch (error) {
                this._lastError = error;
                this._fallbackNow('legacy_shadow_map_pass_disable_failed');
                return;
            }
        }
        this._recordFence(this._active.generation);
    }

    setDebugMode(mode) {
        const validatedMode = requireDebugMode(mode);
        this._materials.setDebugMode(validatedMode);
        this._debugMode = validatedMode;
        if (!this._active) return;
        try {
            if (debugModeValue(validatedMode) === STATIC_SUN_DEPTH_DEBUG_MODES.liveFinal) {
                // This must be the genuine current-engine program, not merely
                // a cache shader that happens to return before sampling.
                this._materials.deactivate();
            } else if (!this._materials.getDiagnostics().enabled) {
                this._materials.activate();
            }
            if (this._shouldSuppressCasters()) {
                if (!this._casters.getDiagnostics().active) this._casters.activate(this._active.city);
            } else {
                this._casters.deactivate(
                    debugModeValue(validatedMode) === STATIC_SUN_DEPTH_DEBUG_MODES.liveFinal
                        ? 'validation_live_final_shadow_retained'
                        : 'comparison_current_shadow_retained'
                );
            }
            if (this._shouldUseDynamicLayer()) {
                this._renderDynamicLayer(this._active.binding);
            } else {
                this._dynamicShadows.deactivate();
                this._active.binding.setDynamicShadowState(null);
            }
        } catch (error) {
            this._lastError = error;
            this._fallbackNow('comparison_caster_transition_failed');
            throw error;
        }
    }

    deactivate(reason = 'deactivated') {
        if (this._disposed) return null;
        // Only request the transition here. GameEngine.frameBegin owns the
        // synchronous commit boundary.
        return this.runtime.deactivate(reason);
    }

    uninstall(reason = 'pipeline_uninstalled') {
        if (this._disposed) return;
        try {
            this.runtime.deactivate(reason);
            this.runtime.commitFrameBoundary();
        } catch (error) {
            this._lastError = error;
            this._restoreCurrent(reason);
            throw error;
        }
        if (this._active) this._restoreCurrent(reason);
    }

    getDiagnostics() {
        return Object.freeze({
            active: this._active ? Object.freeze({
                generation: this._active.generation,
                cityId: this._active.binding.descriptor.identity.cityId,
                channelSourceSha256: this._active.binding.descriptor.identity.channelSourceSha256,
                variantKey: this._active.binding.variantKey,
                tileIntegrity: Object.freeze({
                    schema: this._active.tileIntegrity.schema,
                    byteLength: this._active.tileIntegrity.byteLength,
                    layerCount: this._active.tileIntegrity.layerCount,
                    validatedGuardTexelCount: this._active.tileIntegrity.validatedGuardTexelCount
                })
            }) : null,
            cached: this._cachedActivation ? Object.freeze({
                generation: this._cachedActivation.generation,
                cityId: this._cachedActivation.binding.descriptor.identity.cityId,
                variantKey: this._cachedActivation.binding.variantKey
            }) : null,
            exactCityCompileCount: this._exactCityCompileCount,
            cacheActivationCount: this._cacheActivationCount,
            debugMode: this._debugMode,
            lastError: this._lastError ? String(this._lastError?.message ?? this._lastError) : null,
            fences: this._fenceTracker.getSnapshot(),
            materials: this._materials.getDiagnostics(),
            casters: this._casters.getDiagnostics(),
            dynamicShadows: this._dynamicShadows.getDiagnostics(),
            runtime: this.runtime.getDiagnostics()
        });
    }

    async dispose() {
        if (this._disposed) return;
        this._disposed = true;
        this._contextEventTarget?.removeEventListener?.('webglcontextlost', this._onContextLost);
        let firstError = null;
        try {
            this._restoreCurrent('disposed');
        } catch (error) {
            firstError = error;
        }
        try {
            await this.runtime.teardown();
        } catch (error) {
            firstError ??= error;
        }
        for (const dispose of [
            () => this._materials.dispose(),
            () => this._casters.dispose(),
            () => this._dynamicShadows.dispose(),
            () => this._fenceTracker.dispose()
        ]) {
            try {
                dispose();
            } catch (error) {
                firstError ??= error;
            }
        }
        if (firstError) throw firstError;
    }

    async _prewarm(resources, context) {
        const plan = context.plan;
        const resourceDescriptor = requireStaticSunDepthPlanResource(plan);
        const descriptor = extractStaticSunDepthTileSetDescriptor(resourceDescriptor);
        const validated = validateStaticSunDepthTileSetDescriptor(descriptor);
        assertStaticSunDepthPlanIdentity(plan, validated);
        assertStaticSunDepthTextureLayout(resourceDescriptor, validated);
        const resource = resources.getResource(resourceDescriptor.id);
        const sourcePixels = resource?.texture?.image?.data;
        if (!(sourcePixels instanceof Uint8Array)) {
            throw new TypeError('Static-sun texture resource has no owned authenticated payload.');
        }
        let initialized = false;
        const tileIntegrity = await validateOwnedStaticSunDepthTileArrayIntegrity(
            validated,
            sourcePixels,
            (verifiedPixels) => {
                if (typeof resource?.initialize !== 'function') {
                    throw new TypeError('Static-sun texture resource has no authenticated upload boundary.');
                }
                resource.initialize(verifiedPixels);
                initialized = true;
            }
        );
        if (!initialized) throw new Error('Static-sun verified payload was not uploaded.');
        const binding = createStaticSunDepthShaderBinding({
            descriptor: validated,
            texture: resource?.texture,
            debugMode: this._debugMode
        });
        await this._prewarmMaterialVariants(binding);
        context.registerResource(PREPARED_BINDING_ID, Object.freeze({
            resource: Object.freeze({
                binding,
                packageIdentity: plan.identity,
                tileIntegrity,
                resourceId: resourceDescriptor.id
            }),
            cpuBytes: 0,
            gpuBytes: 0,
            dispose: () => this._releasePreparedBinding(binding)
        }));
    }

    async _prewarmMaterialVariants(binding) {
        const scene = new THREE.Scene();
        const root = new THREE.Group();
        scene.add(root);
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const materials = [new THREE.MeshStandardMaterial(), new THREE.MeshPhysicalMaterial()];
        materials.forEach((material, index) => {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.x = index * 2;
            root.add(mesh);
        });
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.copy(new THREE.Vector3(...binding.descriptor.identity.sunPointDirectionWorld).multiplyScalar(10));
        scene.add(light, light.target);
        const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 20);
        camera.position.set(0, 2, 6);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld(true);
        binding.updateCamera(camera);
        const materialSet = new StaticSunDepthMaterialSet();
        const shaderDiagnostics = createShaderDiagnosticGuard(this.renderer);
        try {
            materialSet.prepare(root, binding, { outsideRoot: scene });
            materialSet.activate();
            if (typeof this.renderer.compileAsync === 'function') {
                await this.renderer.compileAsync(scene, camera);
            } else {
                this.renderer.compile(scene, camera);
            }
            shaderDiagnostics.assertNoFailure();
        } finally {
            shaderDiagnostics.restore();
            materialSet.dispose();
            materials.forEach((material) => material.dispose());
            geometry.dispose();
        }
    }

    _commitSnapshot(snapshot) {
        if (snapshot.mode === 'current') {
            this._restoreCurrent('current_commit', {
                retainPreparedMaterials: snapshot.retainResources === true
            });
            return true;
        }
        const prepared = snapshot.resources?.getResource?.(PREPARED_BINDING_ID);
        const binding = prepared?.binding;
        if (!binding) throw new Error('Prepared static-sun binding is absent at frame-boundary commit.');
        if (!this._liveIdentityMatches(binding.descriptor, null, prepared.packageIdentity)) {
            throw new Error('Prepared static-sun cache does not match the live city/sun identity.');
        }
        const city = this.engine?.context?.city;
        if (this._canReuseCachedActivation(binding, city)) {
            const cached = this._cachedActivation;
            try {
                this._materials.activate();
                binding.updateCamera(this.engine.camera);
                if (this._shouldUseDynamicLayer()) this._renderDynamicLayer(binding);
                if (this._shouldSuppressCasters()) this._casters.activate(city);
                this._active = Object.freeze({ ...cached, generation: snapshot.generation });
                this._cachedActivation = null;
                this._cacheActivationCount += 1;
                return true;
            } catch (error) {
                this._restoreCurrent('cache_activation_rollback');
                throw error;
            }
        }
        this._restoreCurrent('baked_replacement');
        try {
            const receiverRoots = [city.group, ...this._dynamicShadows.getReceiverRoots()];
            this._materials.prepareRoots(receiverRoots, binding, { outsideRoot: this.engine.scene });
            this._materials.activate();
            binding.updateCamera(this.engine.camera);
            if (this._shouldUseDynamicLayer()) this._renderDynamicLayer(binding);
            this._compileExactCityVariants();
            if (this._shouldSuppressCasters()) this._casters.activate(city);
            this._active = Object.freeze({
                generation: snapshot.generation,
                binding,
                city,
                cityGroup: city.group,
                cityParent: city.group.parent,
                packageIdentity: prepared.packageIdentity,
                tileIntegrity: prepared.tileIntegrity
            });
            return true;
        } catch (error) {
            this._restoreCurrent('activation_rollback');
            throw error;
        }
    }

    _restoreCurrent(reason, { retainPreparedMaterials = false } = {}) {
        const previous = this._active;
        let firstError = null;
        try {
            this._casters.deactivate(reason);
        } catch (error) {
            firstError = error;
        }
        try {
            this._dynamicShadows.deactivate();
        } catch (error) {
            firstError ??= error;
        }
        let retained = false;
        if (retainPreparedMaterials && previous) {
            try {
                previous.binding.setDynamicShadowState(null);
                this._materials.suspend();
                this._cachedActivation = previous;
                retained = true;
            } catch (error) {
                firstError ??= error;
            }
        }
        if (!retained) {
            try {
                this._materials.dispose();
            } catch (error) {
                firstError ??= error;
            }
            this._materials = new StaticSunDepthMaterialSet();
            this._cachedActivation = null;
        }
        this._active = null;
        if (firstError) throw firstError;
    }

    _compileExactCityVariants() {
        const shaderDiagnostics = createShaderDiagnosticGuard(this.renderer);
        try {
            this.renderer.compile(this.engine.scene, this.engine.camera);
            shaderDiagnostics.assertNoFailure();
            this._exactCityCompileCount += 1;
        } finally {
            shaderDiagnostics.restore();
        }
    }

    _canReuseCachedActivation(binding, city) {
        const cached = this._cachedActivation;
        return Boolean(
            cached
            && cached.binding === binding
            && cached.city === city
            && cached.cityGroup === city?.group
            && cached.cityParent === city?.group?.parent
            && this._materials.getDiagnostics().shaderHooksEnabled
            && this._materials.verifyPreparedOwnership()
        );
    }

    _releasePreparedBinding(binding) {
        if (this._active?.binding === binding) {
            throw new Error('Cannot dispose the active static-sun shader binding.');
        }
        if (this._cachedActivation?.binding !== binding) return;
        this._materials.dispose();
        this._materials = new StaticSunDepthMaterialSet();
        this._cachedActivation = null;
    }

    _fallbackNow(reason) {
        try {
            this.runtime.deactivate(reason);
            this.runtime.commitFrameBoundary();
        } catch (error) {
            this._lastError = error;
            this._restoreCurrent(reason);
        }
    }

    _liveIdentityMatches(descriptor, active = null, packageIdentity = active?.packageIdentity ?? null) {
        const city = this.engine?.context?.city;
        if (!city?.group || city.cityId !== descriptor.identity.cityId) return false;
        if (!isAttachedTo(city.group, this.engine?.scene)) return false;
        if (active && (
            city !== active.city
            || city.group !== active.cityGroup
            || city.group.parent !== active.cityParent
        )) return false;
        if (!packageIdentity || !liveIdentityMatches(
            this._getLiveIdentity,
            descriptor,
            packageIdentity
        )) return false;
        const live = city.sunRef?.direction;
        if (!live) return false;
        const expected = descriptor.identity.sunPointDirectionWorld;
        const magnitude = Math.hypot(live.x, live.y, live.z);
        if (!Number.isFinite(magnitude) || magnitude <= 0) return false;
        const dot = (
            live.x * expected[0]
            + live.y * expected[1]
            + live.z * expected[2]
        ) / magnitude;
        return Number.isFinite(dot)
            && dot >= 1 - SUN_DIRECTION_EPSILON
            && hasUnambiguousNamedSun(city, this.engine?.scene, expected);
    }

    _activeLiveIdentityMatches() {
        try {
            return this._liveIdentityMatches(
                this._active.binding.descriptor,
                this._active
            );
        } catch (error) {
            this._lastError = error;
            return false;
        }
    }

    _activeReceiverOwnershipMatches() {
        try {
            if (debugModeValue(this._debugMode) === STATIC_SUN_DEPTH_DEBUG_MODES.liveFinal) {
                return this._materials.getDiagnostics().enabled === false
                    && this._materials.verifyPreparedOwnership();
            }
            return this._materials.verifyOwnership();
        } catch (error) {
            this._lastError = error;
            return false;
        }
    }

    _shouldSuppressCasters() {
        const mode = debugModeValue(this._debugMode);
        return mode !== STATIC_SUN_DEPTH_DEBUG_MODES.currentDifference
            && mode !== STATIC_SUN_DEPTH_DEBUG_MODES.liveFinal
            && mode !== STATIC_SUN_DEPTH_DEBUG_MODES.signedDifference
            && mode !== STATIC_SUN_DEPTH_DEBUG_MODES.hybridDifference;
    }

    _shouldUseDynamicLayer() {
        const mode = debugModeValue(this._debugMode);
        return this._shouldSuppressCasters()
            || mode === STATIC_SUN_DEPTH_DEBUG_MODES.hybridDifference;
    }

    _renderDynamicLayer(binding) {
        if (this._dynamicShadows.getRegistrationCount() === 0) {
            binding.setDynamicShadowState(null);
            return;
        }
        const suppressCurrentCasters = this._shouldSuppressCasters();
        const diagnostics = this._dynamicShadows.getDiagnostics();
        if (diagnostics.active
            && diagnostics.suppressesCurrentCasters !== suppressCurrentCasters) {
            this._dynamicShadows.deactivate();
        }
        if (!this._dynamicShadows.getDiagnostics().active) {
            this._dynamicShadows.activate({ suppressCurrentCasters });
        }
        const state = this._dynamicShadows.render(
            binding.descriptor.identity.sunPointDirectionWorld
        );
        binding.setDynamicShadowState(state);
        binding.updateCamera(this.engine.camera);
    }

    _capabilities() {
        const gl = this.renderer.getContext();
        const precision = gl.getShaderPrecisionFormat?.(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
        return Object.freeze({
            webgl2: this.renderer.capabilities.isWebGL2 === true,
            texture_2d_array: typeof THREE.DataArrayTexture === 'function',
            fragment_highp_float: Number(precision?.precision ?? 0) > 0,
            rg8_unorm: THREE.RGFormat !== undefined && THREE.UnsignedByteType !== undefined,
            rgba8_unorm: THREE.RGBAFormat !== undefined && THREE.UnsignedByteType !== undefined,
            static_receiver_sampling_v1: true
        });
    }

    _recordFence(generation) {
        this._fenceTracker.record(generation);
    }

    _waitForGeneration(generation) {
        return this._fenceTracker.wait(generation);
    }
}

function isAttachedTo(object, ancestor) {
    if (!object || !ancestor) return false;
    for (let cursor = object; cursor; cursor = cursor.parent) {
        if (cursor === ancestor) return true;
    }
    return false;
}

function requireDebugMode(value) {
    debugModeValue(value);
    return value;
}

function debugModeValue(value) {
    if (Number.isSafeInteger(value) && value >= 0 && value <= 17) return value;
    if (typeof value === 'string' && Object.prototype.hasOwnProperty.call(STATIC_SUN_DEPTH_DEBUG_MODES, value)) {
        return STATIC_SUN_DEPTH_DEBUG_MODES[value];
    }
    throw new TypeError(`Unknown static-sun-depth debug mode '${String(value)}'.`);
}

function liveIdentityMatches(provider, descriptor, packageIdentity) {
    if (typeof provider !== 'function') return false;
    let live;
    try {
        live = provider();
    } catch {
        return false;
    }
    if (!live || typeof live !== 'object' || Array.isArray(live)
        || (Object.getPrototypeOf(live) !== Object.prototype && Object.getPrototypeOf(live) !== null)
        || Object.keys(live).sort().join('\n') !== [...LIVE_IDENTITY_KEYS].sort().join('\n')) return false;
    for (const key of LIVE_IDENTITY_KEYS) {
        const property = Object.getOwnPropertyDescriptor(live, key);
        if (!property || !property.enumerable || !Object.prototype.hasOwnProperty.call(property, 'value')) return false;
    }
    if (live.developmentCacheAllowed !== true) return false;
    for (const key of [
        'alphaSemanticsSha256',
        'casterInventorySha256',
        'resolvedSourceSha256',
        'staticSunDepthSourceSha256'
    ]) {
        if (typeof live[key] !== 'string' || !SHA256_PATTERN.test(live[key])) return false;
    }
    const identity = descriptor.identity;
    return live.cityId === identity.cityId
        && live.cityId === packageIdentity.cityId
        && live.lightingProfileId === packageIdentity.profileId
        && live.resolvedSourceSha256 === packageIdentity.sourceHashes?.resolvedSourceSha256
        && live.staticSunDepthSourceSha256 === identity.channelSourceSha256
        && live.staticSunDepthSourceSha256 === packageIdentity.sourceHashes?.channels?.static_sun_depth
        && live.casterInventorySha256 === identity.casterInventorySha256
        && live.alphaSemanticsSha256 === identity.alpha.semanticsSha256;
}

function hasUnambiguousNamedSun(city, scene, expectedDirection) {
    if (!scene?.traverse) return false;
    const allowed = new Set(
        Array.isArray(city?._csm?.csm?.lights) && city._csm.csm.lights.length > 0
            ? city._csm.csm.lights
            : (city?.sun?.isDirectionalLight ? [city.sun] : [])
    );
    if (allowed.size === 0) return false;
    const lightPosition = new THREE.Vector3();
    const targetPosition = new THREE.Vector3();
    let matchedAllowed = 0;
    let ambiguous = false;
    scene.traverse((object) => {
        if (ambiguous || !object?.isDirectionalLight || object.visible === false || object.intensity === 0) return;
        object.getWorldPosition(lightPosition);
        object.target?.getWorldPosition?.(targetPosition);
        const direction = lightPosition.sub(targetPosition);
        const magnitude = direction.length();
        if (!Number.isFinite(magnitude) || magnitude <= 0) return;
        const dot = (
            direction.x * expectedDirection[0]
            + direction.y * expectedDirection[1]
            + direction.z * expectedDirection[2]
        ) / magnitude;
        if (!Number.isFinite(dot) || dot < SHADER_DIRECTION_MATCH_MINIMUM) return;
        if (!allowed.has(object)) ambiguous = true;
        else matchedAllowed += 1;
    });
    return !ambiguous && matchedAllowed === allowed.size;
}

function createShaderDiagnosticGuard(renderer) {
    const debug = renderer?.debug;
    if (!debug || typeof debug !== 'object') {
        throw new Error('Static-sun activation requires WebGL shader diagnostics.');
    }
    const ownsCheck = Object.prototype.hasOwnProperty.call(debug, 'checkShaderErrors');
    const ownsHandler = Object.prototype.hasOwnProperty.call(debug, 'onShaderError');
    const previousCheck = debug.checkShaderErrors;
    const previousHandler = debug.onShaderError;
    const previousPrograms = new Set(Array.isArray(renderer.info?.programs)
        ? renderer.info.programs
        : []);
    let callbackFailure = false;
    let restored = false;
    debug.checkShaderErrors = true;
    debug.onShaderError = (...args) => {
        callbackFailure = true;
        if (typeof previousHandler === 'function') previousHandler(...args);
    };
    return Object.freeze({
        assertNoFailure() {
            const programFailure = Array.isArray(renderer.info?.programs)
                && renderer.info.programs.some((program) => (
                    !previousPrograms.has(program)
                    && program?.diagnostics?.runnable === false
                ));
            if (callbackFailure || programFailure) {
                throw new Error('Static-sun shader compilation or link validation failed.');
            }
        },
        restore() {
            if (restored) return;
            restored = true;
            if (ownsCheck) debug.checkShaderErrors = previousCheck;
            else delete debug.checkShaderErrors;
            if (ownsHandler) debug.onShaderError = previousHandler;
            else delete debug.onShaderError;
        }
    });
}
