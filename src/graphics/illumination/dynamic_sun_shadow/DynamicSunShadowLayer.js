// Shared moving-object directional shadow map for AI 532 hybrid illumination.
// @ts-check

import * as THREE from 'three';
import { fitDynamicSunShadowProjection } from '../../../app/illumination/dynamic_sun_shadow/index.js';

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const DEFAULTS = Object.freeze({
    mapSize: 2048,
    worldUnitsPerTexel: 0.025,
    paddingTexels: 8,
    depthPaddingMeters: 2,
    receiverMinimumY: 0,
    constantBiasMeters: 0.0125,
    normalBiasMeters: 0.025
});

function stableId(value) {
    if (typeof value !== 'string' || !value || value.trim() !== value
        || CONTROL_CHARACTER_PATTERN.test(value)) {
        throw new TypeError('Dynamic sun-shadow object id must be a stable non-empty string.');
    }
    return value;
}

function finite(value, label) {
    const resolved = Number(value);
    if (!Number.isFinite(resolved)) throw new TypeError(`${label} must be finite.`);
    return Object.is(resolved, -0) ? 0 : resolved;
}

function positive(value, label) {
    const resolved = finite(value, label);
    if (resolved <= 0) throw new RangeError(`${label} must be greater than zero.`);
    return resolved;
}

function mapSize(value) {
    const resolved = finite(value, 'dynamic shadow mapSize');
    if (!Number.isSafeInteger(resolved) || resolved < 16 || resolved > 4096
        || (resolved & (resolved - 1)) !== 0) {
        throw new RangeError('Dynamic shadow mapSize must be a power of two from 16 through 4096.');
    }
    return resolved;
}

function paddingTexels(value, size) {
    const resolved = finite(value, 'dynamic shadow paddingTexels');
    if (!Number.isSafeInteger(resolved) || resolved < 0 || resolved * 2 >= size) {
        throw new RangeError('Dynamic shadow paddingTexels must leave a non-empty map interior.');
    }
    return resolved;
}

function requireRoot(root) {
    if (!root?.isObject3D || typeof root.traverse !== 'function') {
        throw new TypeError('Dynamic sun-shadow registration requires an Object3D root.');
    }
    return root;
}

function isAncestor(candidate, object) {
    for (let cursor = object; cursor; cursor = cursor.parent) {
        if (cursor === candidate) return true;
    }
    return false;
}

function materialArray(value) {
    if (!Array.isArray(value)) return value ? [value] : [];
    if (value.some((material) => !material)) {
        throw new TypeError('Dynamic sun-shadow material arrays may not contain empty entries.');
    }
    return value.slice();
}

function materialCanCast(material, customDepthMaterial) {
    if (customDepthMaterial) return true;
    if (!material || material.visible === false) return false;
    if (Number(material.alphaTest ?? 0) > 0) return true;
    if (material.transparent === true && Number(material.opacity ?? 1) < 1) return false;
    if (Number(material.transmission ?? 0) > 0) return false;
    return true;
}

function resolveShadowSide(material) {
    if (material?.shadowSide !== null && material?.shadowSide !== undefined) return material.shadowSide;
    if (material?.side === THREE.BackSide) return THREE.FrontSide;
    if (material?.side === THREE.DoubleSide) return THREE.DoubleSide;
    return THREE.BackSide;
}

function syncDepthMaterial(depthMaterial, sourceMaterial) {
    if (!depthMaterial?.isMeshDepthMaterial || !sourceMaterial) return;
    depthMaterial.visible = sourceMaterial.visible !== false
        && materialCanCast(sourceMaterial, null);
    depthMaterial.map = sourceMaterial.map ?? null;
    depthMaterial.alphaMap = sourceMaterial.alphaMap ?? null;
    depthMaterial.alphaTest = Number(sourceMaterial.alphaTest ?? 0);
    depthMaterial.opacity = Number(sourceMaterial.opacity ?? 1);
    depthMaterial.side = resolveShadowSide(sourceMaterial);
    depthMaterial.displacementMap = sourceMaterial.displacementMap ?? null;
    depthMaterial.displacementScale = Number(sourceMaterial.displacementScale ?? 1);
    depthMaterial.displacementBias = Number(sourceMaterial.displacementBias ?? 0);
    depthMaterial.clippingPlanes = sourceMaterial.clippingPlanes ?? null;
    depthMaterial.clipIntersection = sourceMaterial.clipIntersection === true;
}

function captureMaterialSemantics(material) {
    return Object.freeze({
        visible: material?.visible !== false,
        map: material?.map ?? null,
        alphaMap: material?.alphaMap ?? null,
        alphaTest: Number(material?.alphaTest ?? 0),
        opacity: Number(material?.opacity ?? 1),
        transparent: material?.transparent === true,
        transmission: Number(material?.transmission ?? 0),
        side: material?.side,
        shadowSide: material?.shadowSide,
        displacementMap: material?.displacementMap ?? null,
        displacementScale: Number(material?.displacementScale ?? 1),
        displacementBias: Number(material?.displacementBias ?? 0),
        clippingPlanes: material?.clippingPlanes ?? null,
        clipIntersection: material?.clipIntersection === true
    });
}

function materialSemanticsMatch(material, state) {
    const current = captureMaterialSemantics(material);
    return Object.keys(state).every((key) => current[key] === state[key]);
}

function makeDepthMaterial(sourceMaterial, customDepthMaterial = null) {
    if (customDepthMaterial) {
        if (!customDepthMaterial.isMeshDepthMaterial) {
            throw new TypeError('Dynamic sun-shadow customDepthMaterial must be a MeshDepthMaterial.');
        }
        const custom = customDepthMaterial.clone();
        custom.depthPacking = THREE.RGBADepthPacking;
        custom.blending = THREE.NoBlending;
        return custom;
    }
    const depth = new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking,
        blending: THREE.NoBlending
    });
    syncDepthMaterial(depth, sourceMaterial);
    return depth;
}

function makeProxy(source) {
    if (source.isBatchedMesh) {
        throw new TypeError('Dynamic sun-shadow BatchedMesh casters are not supported by v1.');
    }
    const sourceMaterials = materialArray(source.material);
    const customDepth = source.customDepthMaterial ?? null;
    const castingMaterials = sourceMaterials.filter((material) => materialCanCast(material, customDepth));
    if (castingMaterials.length === 0) return null;
    if (customDepth && sourceMaterials.length !== 1) {
        throw new TypeError('Dynamic sun-shadow customDepthMaterial requires a single source material.');
    }
    const depthMaterials = sourceMaterials.map((material) => makeDepthMaterial(material, customDepth));
    const proxy = source.clone(false);
    proxy.name = `DynamicSunShadowProxy:${source.name || source.uuid}`;
    proxy.material = Array.isArray(source.material) ? depthMaterials : depthMaterials[0];
    proxy.matrixAutoUpdate = false;
    proxy.matrixWorldAutoUpdate = true;
    proxy.frustumCulled = false;
    proxy.castShadow = false;
    proxy.receiveShadow = false;
    if (proxy.isSkinnedMesh) {
        proxy.skeleton = source.skeleton;
        proxy.bindMatrix.copy(source.bindMatrix);
        proxy.bindMatrixInverse.copy(source.bindMatrixInverse);
    }
    if (proxy.isInstancedMesh) {
        proxy.instanceMatrix = source.instanceMatrix;
        proxy.count = source.count;
    }
    return {
        proxy,
        sourceMaterials,
        depthMaterials,
        materialStates: sourceMaterials.map(captureMaterialSemantics)
    };
}

function worldVisible(object, root) {
    for (let cursor = object; cursor; cursor = cursor.parent) {
        if (cursor.visible === false) return false;
        if (cursor === root) return true;
    }
    return false;
}

function geometryTriangles(geometry) {
    const indexCount = Number(geometry?.index?.count ?? 0);
    const positionCount = Number(geometry?.attributes?.position?.count ?? 0);
    const drawCount = Number(geometry?.drawRange?.count);
    const available = indexCount > 0 ? indexCount : positionCount;
    const count = Number.isFinite(drawCount) ? Math.min(available, Math.max(0, drawCount)) : available;
    return Math.floor(count / 3);
}

function drawCallsFor(source) {
    const groups = source.geometry?.groups ?? [];
    return Array.isArray(source.material) ? Math.max(1, groups.length) : 1;
}

function finiteBox(box) {
    return [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z]
        .every(Number.isFinite);
}

export class DynamicSunShadowLayer {
    constructor(renderer, options = {}) {
        if (!renderer?.isWebGLRenderer) throw new TypeError('DynamicSunShadowLayer requires a WebGLRenderer.');
        this.renderer = renderer;
        this.options = Object.freeze({
            mapSize: mapSize(options.mapSize ?? DEFAULTS.mapSize),
            worldUnitsPerTexel: positive(
                options.worldUnitsPerTexel ?? DEFAULTS.worldUnitsPerTexel,
                'dynamic shadow worldUnitsPerTexel'
            ),
            paddingTexels: 0,
            depthPaddingMeters: positive(
                options.depthPaddingMeters ?? DEFAULTS.depthPaddingMeters,
                'dynamic shadow depthPaddingMeters'
            ),
            receiverMinimumY: finite(
                options.receiverMinimumY ?? DEFAULTS.receiverMinimumY,
                'dynamic shadow receiverMinimumY'
            ),
            constantBiasMeters: positive(
                options.constantBiasMeters ?? DEFAULTS.constantBiasMeters,
                'dynamic shadow constantBiasMeters'
            ),
            normalBiasMeters: positive(
                options.normalBiasMeters ?? DEFAULTS.normalBiasMeters,
                'dynamic shadow normalBiasMeters'
            )
        });
        this.options = Object.freeze({
            ...this.options,
            paddingTexels: paddingTexels(options.paddingTexels ?? DEFAULTS.paddingTexels, this.options.mapSize)
        });
        this._registrations = new Map();
        this._records = [];
        this._scene = null;
        this._camera = null;
        this._target = null;
        this._worldToClip = new THREE.Matrix4();
        this._fit = null;
        this._active = false;
        this._suppressesCurrentCasters = false;
        this._disposed = false;
        this._lastError = null;
        this._metrics = {
            renders: 0,
            drawCalls: 0,
            triangles: 0,
            casterMeshCount: 0,
            receiverObjectCount: 0
        };
    }

    register({ id, root, cast = true, receive = true } = {}) {
        if (this._disposed) throw new Error('DynamicSunShadowLayer is disposed.');
        if (this._active) throw new Error('Dynamic objects may only be registered while the layer is inactive.');
        const objectId = stableId(id);
        const objectRoot = requireRoot(root);
        if (typeof cast !== 'boolean' || typeof receive !== 'boolean' || (!cast && !receive)) {
            throw new TypeError('Dynamic object cast/receive flags must be boolean and at least one must be true.');
        }
        if (this._registrations.has(objectId)) throw new Error(`Dynamic object '${objectId}' is already registered.`);
        for (const entry of this._registrations.values()) {
            if (entry.root === objectRoot || isAncestor(entry.root, objectRoot) || isAncestor(objectRoot, entry.root)) {
                throw new Error(`Dynamic object '${objectId}' overlaps registered root '${entry.id}'.`);
            }
        }
        const entry = Object.freeze({ id: objectId, root: objectRoot, cast, receive });
        this._registrations.set(objectId, entry);
        let removed = false;
        return Object.freeze({
            id: objectId,
            unregister: () => {
                if (removed) return false;
                if (this._active) throw new Error('Dynamic objects may only be unregistered while the layer is inactive.');
                removed = this._registrations.delete(objectId);
                return removed;
            }
        });
    }

    getReceiverRoots() {
        return Object.freeze([...this._registrations.values()]
            .filter((entry) => entry.receive)
            .sort((left, right) => left.id.localeCompare(right.id))
            .map((entry) => entry.root));
    }

    getRegistrationCount() {
        return this._registrations.size;
    }

    /**
     * Changes only the shared moving-object map density. Registration state is
     * retained, but active graphics must be released by the owning pipeline so
     * no receiver can sample a disposed render target.
     * @param {{mapSize: number, worldUnitsPerTexel: number}} resolution
     */
    setResolution(resolution) {
        if (this._disposed) throw new Error('DynamicSunShadowLayer is disposed.');
        const nextMapSize = mapSize(resolution?.mapSize);
        const nextWorldUnitsPerTexel = positive(
            resolution?.worldUnitsPerTexel,
            'dynamic shadow worldUnitsPerTexel'
        );
        if (nextMapSize === this.options.mapSize
            && nextWorldUnitsPerTexel === this.options.worldUnitsPerTexel) return false;
        if (this._active || this._target || this._records.length > 0) {
            throw new Error('Dynamic sun-shadow resolution may only change while the layer is inactive.');
        }
        this.options = Object.freeze({
            ...this.options,
            mapSize: nextMapSize,
            worldUnitsPerTexel: nextWorldUnitsPerTexel,
            paddingTexels: paddingTexels(this.options.paddingTexels, nextMapSize)
        });
        return true;
    }

    activate({ suppressCurrentCasters = true } = {}) {
        if (this._disposed) throw new Error('DynamicSunShadowLayer is disposed.');
        if (typeof suppressCurrentCasters !== 'boolean') {
            throw new TypeError('suppressCurrentCasters must be boolean.');
        }
        if (this._active) {
            if (this._suppressesCurrentCasters !== suppressCurrentCasters) {
                throw new Error('Dynamic sun-shadow caster suppression mode changed without deactivation.');
            }
            if (!this.verifyOwnership()) throw new Error('Dynamic sun-shadow ownership is no longer valid.');
            return this.getDiagnostics();
        }
        this._scene = new THREE.Scene();
        this._scene.name = 'DynamicSunShadowScene';
        this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
        this._camera.name = 'DynamicSunShadowCamera';
        this._createTarget();
        const records = [];
        try {
            for (const registration of [...this._registrations.values()]
                .sort((left, right) => left.id.localeCompare(right.id))) {
                registration.root.updateWorldMatrix(true, true);
                const meshes = [];
                registration.root.traverse((source) => {
                    if (!source?.isMesh) return;
                    const record = {
                        registration,
                        source,
                        geometry: source.geometry,
                        material: source.material,
                        customDepthMaterial: source.customDepthMaterial ?? null,
                        originalCastShadow: source.castShadow === true,
                        proxy: null,
                        sourceMaterials: [],
                        depthMaterials: [],
                        materialStates: []
                    };
                    if (registration.cast && record.originalCastShadow) {
                        const made = makeProxy(source);
                        if (made) {
                            Object.assign(record, made);
                            this._scene.add(record.proxy);
                        }
                    }
                    meshes.push(record);
                    records.push(record);
                    source.castShadow = suppressCurrentCasters
                        ? false
                        : record.originalCastShadow;
                });
                if (meshes.length === 0) {
                    throw new Error(`Dynamic object '${registration.id}' has no mesh inventory.`);
                }
            }
            this._records = records;
            this._active = true;
            this._suppressesCurrentCasters = suppressCurrentCasters;
            this._refreshMetrics();
            return this.getDiagnostics();
        } catch (error) {
            this._lastError = error;
            try {
                this._restoreRecords(records);
            } catch (restoreError) {
                this._lastError = restoreError;
            }
            this._records = records;
            this._disposeGraphics();
            this._records = [];
            this._suppressesCurrentCasters = false;
            throw error;
        }
    }

    render(pointDirectionWorld) {
        if (!this._active) throw new Error('DynamicSunShadowLayer must be active before rendering.');
        if (!this.verifyOwnership()) throw new Error('Dynamic sun-shadow source inventory or caster ownership changed.');
        const casterBounds = [];
        const box = new THREE.Box3();
        for (const registration of [...this._registrations.values()]
            .filter((entry) => entry.cast)
            .sort((left, right) => left.id.localeCompare(right.id))) {
            registration.root.updateWorldMatrix(true, true);
            box.makeEmpty();
            for (const record of this._records) {
                if (record.registration !== registration || !record.proxy
                    || !worldVisible(record.source, registration.root)) continue;
                box.expandByObject(record.source, true);
            }
            if (box.isEmpty()) continue;
            if (!finiteBox(box)) {
                throw new Error(`Dynamic object '${registration.id}' has no finite render bounds.`);
            }
            casterBounds.push({
                id: registration.id,
                min: box.min.toArray(),
                max: box.max.toArray()
            });
        }
        if (casterBounds.length === 0) {
            this._clearTarget();
            this._fit = null;
            return this.getBindingState();
        }
        const fit = fitDynamicSunShadowProjection({
            casterBounds,
            sunPointDirectionWorld: pointDirectionWorld,
            receiverMinimumY: this.options.receiverMinimumY,
            mapSize: this.options.mapSize,
            worldUnitsPerTexel: this.options.worldUnitsPerTexel,
            paddingTexels: this.options.paddingTexels,
            depthPaddingMeters: this.options.depthPaddingMeters
        });
        this._configureCamera(fit);
        for (const record of this._records) this._syncProxy(record);
        this._renderTarget();
        this._fit = fit;
        this._worldToClip.multiplyMatrices(this._camera.projectionMatrix, this._camera.matrixWorldInverse);
        this._metrics.renders += 1;
        this._refreshMetrics();
        return this.getBindingState();
    }

    getBindingState() {
        const enabled = this._active && this._fit !== null && this._target !== null;
        return Object.freeze({
            enabled,
            texture: enabled ? this._target.texture : null,
            worldToClip: this._worldToClip,
            mapSize: this.options.mapSize,
            constantBiasMeters: this.options.constantBiasMeters,
            normalBiasMeters: this.options.normalBiasMeters,
            depthRangeMeters: enabled ? this._fit.farMeters - this._fit.nearMeters : 1,
            pointDirectionWorld: enabled ? this._fit.pointDirectionWorld : Object.freeze([0, 1, 0])
        });
    }

    getDebugRenderTarget() {
        return this._target;
    }

    verifyOwnership() {
        if (!this._active) return false;
        const current = [];
        for (const registration of [...this._registrations.values()]
            .sort((left, right) => left.id.localeCompare(right.id))) {
            registration.root.traverse((source) => {
                if (source?.isMesh) current.push({ registration, source });
            });
        }
        if (current.length !== this._records.length) return false;
        for (let index = 0; index < current.length; index += 1) {
            const record = this._records[index];
            const value = current[index];
            if (record.registration !== value.registration || record.source !== value.source
                || value.source.geometry !== record.geometry
                || value.source.material !== record.material
                || (value.source.customDepthMaterial ?? null) !== record.customDepthMaterial
                || value.source.castShadow !== (
                    this._suppressesCurrentCasters ? false : record.originalCastShadow
                )
                || !record.sourceMaterials.every((material, materialIndex) => (
                    materialSemanticsMatch(material, record.materialStates[materialIndex])
                ))) return false;
        }
        return true;
    }

    getDiagnostics() {
        const registrations = [...this._registrations.values()]
            .sort((left, right) => left.id.localeCompare(right.id))
            .map((entry) => Object.freeze({
                id: entry.id,
                cast: entry.cast,
                receive: entry.receive
            }));
        return Object.freeze({
            schema: 'dynamic-sun-shadow-layer-diagnostics-v1',
            active: this._active,
            sharedInteractionMap: true,
            suppressesCurrentCasters: this._suppressesCurrentCasters,
            registrations: Object.freeze(registrations),
            map: Object.freeze({
                size: this.options.mapSize,
                worldUnitsPerTexel: this.options.worldUnitsPerTexel,
                estimatedGpuBytes: this._target ? this.options.mapSize ** 2 * 8 : 0,
                projection: this._fit
            }),
            metrics: Object.freeze({ ...this._metrics }),
            lastError: this._lastError ? String(this._lastError?.message ?? this._lastError) : null
        });
    }

    deactivate() {
        if (!this._active && this._records.length === 0 && !this._target) return false;
        let restoreError = null;
        try {
            this._restoreRecords(this._records);
        } catch (error) {
            restoreError = error;
            this._lastError = error;
        }
        this._records = [];
        this._active = false;
        this._suppressesCurrentCasters = false;
        this._fit = null;
        this._disposeGraphics();
        this._refreshMetrics();
        if (restoreError) throw restoreError;
        return true;
    }

    dispose() {
        if (this._disposed) return;
        this.deactivate();
        this._registrations.clear();
        this._disposed = true;
    }

    _createTarget() {
        const target = new THREE.WebGLRenderTarget(this.options.mapSize, this.options.mapSize, {
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            depthBuffer: true,
            stencilBuffer: false,
            generateMipmaps: false
        });
        target.texture.name = 'DynamicSunShadowDepthRGBA8';
        target.texture.colorSpace = THREE.NoColorSpace;
        this._target = target;
    }

    _configureCamera(fit) {
        const camera = this._camera;
        camera.left = -fit.halfExtentMeters;
        camera.right = fit.halfExtentMeters;
        camera.top = fit.halfExtentMeters;
        camera.bottom = -fit.halfExtentMeters;
        camera.near = fit.nearMeters;
        camera.far = fit.farMeters;
        camera.position.fromArray(fit.eyeWorld);
        camera.up.fromArray(fit.basis.upAxisWorld);
        camera.lookAt(new THREE.Vector3().fromArray(fit.targetWorld));
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld(true);
    }

    _syncProxy(record) {
        if (!record.proxy) return;
        const source = record.source;
        record.proxy.visible = worldVisible(source, record.registration.root);
        record.proxy.matrix.copy(source.matrixWorld);
        if (record.proxy.isSkinnedMesh) record.proxy.skeleton = source.skeleton;
        if (record.proxy.isInstancedMesh) {
            record.proxy.instanceMatrix = source.instanceMatrix;
            record.proxy.count = source.count;
        }
        record.proxy.morphTargetInfluences = source.morphTargetInfluences ?? record.proxy.morphTargetInfluences;
    }

    _renderTarget() {
        const renderer = this.renderer;
        const previousTarget = renderer.getRenderTarget();
        const previousClearColor = renderer.getClearColor(new THREE.Color()).clone();
        const previousClearAlpha = renderer.getClearAlpha();
        const previousAutoClear = renderer.autoClear;
        const previousXrEnabled = renderer.xr?.enabled;
        try {
            if (renderer.xr) renderer.xr.enabled = false;
            renderer.autoClear = true;
            renderer.setRenderTarget(this._target);
            renderer.setClearColor(0xffffff, 1);
            renderer.clear(true, true, true);
            renderer.render(this._scene, this._camera);
        } finally {
            renderer.setRenderTarget(previousTarget);
            renderer.setClearColor(previousClearColor, previousClearAlpha);
            renderer.autoClear = previousAutoClear;
            if (renderer.xr) renderer.xr.enabled = previousXrEnabled;
        }
    }

    _clearTarget() {
        if (!this._target) return;
        const renderer = this.renderer;
        const previousTarget = renderer.getRenderTarget();
        const previousClearColor = renderer.getClearColor(new THREE.Color()).clone();
        const previousClearAlpha = renderer.getClearAlpha();
        try {
            renderer.setRenderTarget(this._target);
            renderer.setClearColor(0xffffff, 1);
            renderer.clear(true, true, true);
        } finally {
            renderer.setRenderTarget(previousTarget);
            renderer.setClearColor(previousClearColor, previousClearAlpha);
        }
    }

    _restoreRecords(records) {
        let firstError = null;
        for (const record of records) {
            try {
                record.source.castShadow = record.originalCastShadow;
            } catch (error) {
                firstError ??= error;
            }
        }
        if (firstError) throw firstError;
    }

    _disposeGraphics() {
        for (const record of this._records) {
            for (const material of record.depthMaterials ?? []) material.dispose?.();
            record.proxy?.removeFromParent?.();
        }
        this._target?.dispose?.();
        this._target = null;
        this._scene = null;
        this._camera = null;
        this._worldToClip.identity();
    }

    _refreshMetrics() {
        const proxyRecords = this._records.filter((record) => record.proxy);
        this._metrics.casterMeshCount = proxyRecords.length;
        this._metrics.receiverObjectCount = [...this._registrations.values()]
            .filter((entry) => entry.receive).length;
        this._metrics.drawCalls = proxyRecords.reduce((sum, record) => sum + drawCallsFor(record.source), 0);
        this._metrics.triangles = proxyRecords.reduce((sum, record) => (
            sum + geometryTriangles(record.source.geometry) * Math.max(1, Number(record.source.count ?? 1))
        ), 0);
    }
}
