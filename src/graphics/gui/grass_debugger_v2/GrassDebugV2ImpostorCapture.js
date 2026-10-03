// Reuse GPU render targets to capture one clipped grass patch without touching scene shadows.
// @ts-check
import * as THREE from 'three';
import { grassImpostorCaptureShader, grassImpostorCaptureDeclarationsShader } from '../../shaders/materials/grass/GrassImpostorCaptureShaderLoader.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';

const CHANNELS = Object.freeze(['albedo', 'normal', 'surface']);

function captureMaterial(original, channel, clippingPlanes, hasFacingNormal) {
    const material = new THREE.MeshStandardMaterial({
        color: original.color, map: original.map, vertexColors: original.vertexColors,
        normalMap: original.normalMap, normalMapType: original.normalMapType, normalScale: original.normalScale,
        roughness: original.roughness, roughnessMap: original.roughnessMap,
        alphaMap: original.alphaMap, alphaTest: original.alphaTest, opacity: original.opacity,
        side: THREE.DoubleSide, toneMapped: false, fog: false, clippingPlanes, clipShadows: false,
        transparent: false, blending: THREE.NoBlending, depthTest: true, depthWrite: true,
        defines: { GRASS_IMPOSTOR_CAPTURE_CHANNEL: channel, USE_UV: 1,
            ...(hasFacingNormal ? { GRASS_IMPOSTOR_HAS_FACING_NORMAL: 1 } : {}) }
    });
    attachShaderMetadata(material, grassImpostorCaptureShader);
    attachShaderMetadata(material, grassImpostorCaptureDeclarationsShader);
    registerMaterialShaderHook(material, {
        id: 'grass.impostor.capture',
        variantKey: grassImpostorCaptureShader.variantKey + '|' + grassImpostorCaptureDeclarationsShader.variantKey,
        apply: shader => {
            const common = '#include <common>', uv = '#include <uv_vertex>', output = '#include <opaque_fragment>';
            if (!shader.vertexShader.includes(uv) || !shader.fragmentShader.includes(output))
                throw new Error('Grass impostor capture shader contract changed.');
            shader.vertexShader = shader.vertexShader.replace(common, common + '\n' + grassImpostorCaptureDeclarationsShader.vertexSource)
                .replace(uv, grassImpostorCaptureShader.vertexSource);
            shader.fragmentShader = shader.fragmentShader.replace(common, common + '\n' + grassImpostorCaptureDeclarationsShader.fragmentSource)
                .replace(output, grassImpostorCaptureShader.fragmentSource)
                .replace('#include <colorspace_fragment>', '');
            if (channel === 2) shader.fragmentShader = shader.fragmentShader.replace('#include <shadowmap_pars_fragment>',
                '#include <shadowmap_pars_fragment>\n#include <shadowmask_pars_fragment>');
        }
    });
    return material;
}

function saveRenderer(renderer) {
    return {
        target: renderer.getRenderTarget(), cubeFace: renderer.getActiveCubeFace(), mipLevel: renderer.getActiveMipmapLevel(),
        viewport: renderer.getViewport(new THREE.Vector4()), scissor: renderer.getScissor(new THREE.Vector4()), scissorTest: renderer.getScissorTest(),
        clearColor: renderer.getClearColor(new THREE.Color()), clearAlpha: renderer.getClearAlpha(),
        autoClear: renderer.autoClear, autoClearColor: renderer.autoClearColor, autoClearDepth: renderer.autoClearDepth, autoClearStencil: renderer.autoClearStencil,
        shadowEnabled: renderer.shadowMap.enabled, shadowAuto: renderer.shadowMap.autoUpdate, shadowUpdate: renderer.shadowMap.needsUpdate, shadowType: renderer.shadowMap.type,
        toneMapping: renderer.toneMapping, xr: renderer.xr.enabled,
        clippingPlanes: renderer.clippingPlanes, localClippingEnabled: renderer.localClippingEnabled
    };
}

function restoreRenderer(renderer, state) {
    renderer.setRenderTarget(state.target, state.cubeFace, state.mipLevel);
    renderer.setViewport(state.viewport); renderer.setScissor(state.scissor); renderer.setScissorTest(state.scissorTest);
    renderer.setClearColor(state.clearColor, state.clearAlpha);
    renderer.autoClear = state.autoClear; renderer.autoClearColor = state.autoClearColor;
    renderer.autoClearDepth = state.autoClearDepth; renderer.autoClearStencil = state.autoClearStencil;
    renderer.shadowMap.enabled = state.shadowEnabled; renderer.shadowMap.autoUpdate = state.shadowAuto; renderer.shadowMap.needsUpdate = state.shadowUpdate;
    renderer.shadowMap.type = state.shadowType;
    renderer.toneMapping = state.toneMapping; renderer.xr.enabled = state.xr;
    renderer.clippingPlanes = state.clippingPlanes; renderer.localClippingEnabled = state.localClippingEnabled;
}

/** @param {{renderer:THREE.WebGLRenderer,source:THREE.Mesh,material:THREE.MeshStandardMaterial,resolution?:number,shadowDirection?:THREE.Vector3|null,shadowResolution?:number}} options */
export async function createGrassDebugV2ImpostorCapture({ renderer, source, material, resolution = 512, shadowDirection = null, shadowResolution = 2048 }) {
    if (!renderer?.isWebGLRenderer || !source?.isMesh || !material?.isMeshStandardMaterial
        || !Number.isInteger(resolution) || resolution < 64 || resolution > renderer.capabilities.maxTextureSize)
        throw new Error('Grass impostor capture requires a mesh, standard material and supported texture resolution.');
    if (shadowDirection && (!shadowDirection.isVector3 || !Number.isFinite(shadowDirection.lengthSq()) || shadowDirection.lengthSq() < 1e-12))
        throw new Error('Grass impostor source shadow requires a finite sun direction.');
    if (!Number.isInteger(shadowResolution) || shadowResolution < 64 || shadowResolution > renderer.capabilities.maxTextureSize)
        throw new Error('Invalid grass impostor source shadow resolution.');
    shadowDirection = shadowDirection?.clone().normalize() ?? null;
    const geometry = source.geometry;
    for (const attribute of ['position', 'normal', 'uv']) if (!geometry.attributes[attribute])
        throw new Error('Grass impostor source is missing ' + attribute + '.');
    if (material.vertexColors && !geometry.attributes.color) throw new Error('Grass impostor source is missing vertex colors.');
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox.clone().intersect(new THREE.Box3(
        new THREE.Vector3(-.5, 0, -.5), new THREE.Vector3(.5, geometry.boundingBox.max.y, .5)));
    if (bounds.isEmpty() || bounds.max.y <= bounds.min.y) throw new Error('Grass impostor source has no above-ground content inside its tile.');
    const clippingPlanes = [
        new THREE.Plane(new THREE.Vector3(1, 0, 0), .5), new THREE.Plane(new THREE.Vector3(-1, 0, 0), .5),
        new THREE.Plane(new THREE.Vector3(0, 0, 1), .5), new THREE.Plane(new THREE.Vector3(0, 0, -1), .5)
    ];
    const materials = CHANNELS.map((_, index) => captureMaterial(material, index, clippingPlanes, !!geometry.attributes.grassFacingNormal));
    const scene = new THREE.Scene(), mesh = new THREE.Mesh(geometry, materials[0]);
    mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = !!shadowDirection; scene.add(mesh);
    const records = new Map(), center = bounds.getCenter(new THREE.Vector3());
    const distance = Math.max(2, bounds.getSize(new THREE.Vector3()).length() * 2);
    const corners = [];
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z]) corners.push(new THREE.Vector3(x, y, z));
    let disposed = false, shadowGenerationCount = 0;
    const shadowCasters = new THREE.Group(); shadowCasters.visible = false;
    let shadowLight = null, shadowMaterial = null;
    if (shadowDirection) {
        shadowMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide,
            map: material.map, alphaMap: material.alphaMap, alphaTest: material.alphaTest, clipShadows: false });
        for (let z = -1; z <= 1; z++) for (let x = -1; x <= 1; x++) {
            const caster = new THREE.Mesh(geometry, shadowMaterial); caster.position.set(x, 0, z);
            caster.castShadow = true; caster.receiveShadow = false; shadowCasters.add(caster);
        }
        shadowLight = new THREE.DirectionalLight(0xffffff, 1); shadowLight.name = 'GrassRuntimeImpostorSourceSun';
        shadowLight.position.copy(center).addScaledVector(shadowDirection.clone().normalize(), 6);
        shadowLight.target.position.copy(center); shadowLight.castShadow = true;
        shadowLight.shadow.mapSize.set(shadowResolution, shadowResolution);
        shadowLight.shadow.autoUpdate = false; shadowLight.shadow.needsUpdate = true;
        shadowLight.shadow.bias = -.00001; shadowLight.shadow.normalBias = .0002;
        scene.add(shadowCasters, shadowLight, shadowLight.target); scene.updateMatrixWorld(true);
        const shadowCamera = shadowLight.shadow.camera, shadowBounds = new THREE.Box3().setFromObject(shadowCasters), viewBounds = new THREE.Box3();
        shadowCamera.position.copy(shadowLight.position); shadowCamera.lookAt(center); shadowCamera.updateMatrixWorld(true);
        for (const x of [shadowBounds.min.x, shadowBounds.max.x]) for (const y of [shadowBounds.min.y, shadowBounds.max.y])
            for (const z of [shadowBounds.min.z, shadowBounds.max.z])
                viewBounds.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(shadowCamera.matrixWorldInverse));
        Object.assign(shadowCamera, { left: viewBounds.min.x - .01, right: viewBounds.max.x + .01,
            bottom: viewBounds.min.y - .01, top: viewBounds.max.y + .01,
            near: Math.max(.001, -viewBounds.max.z - .01), far: -viewBounds.min.z + .01 });
        shadowCamera.updateProjectionMatrix();
    }

    const createTarget = () => {
        if (disposed) throw new Error('Grass impostor capture is disposed.');
        const targets = CHANNELS.map(channel => {
            const target = new THREE.WebGLRenderTarget(resolution, resolution, {
                type: THREE.UnsignedByteType, format: THREE.RGBAFormat, colorSpace: THREE.NoColorSpace,
                depthBuffer: true, stencilBuffer: false, samples: 0,
                generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter
            });
            target.texture.name = 'GrassRuntimeImpostor-' + channel;
            target.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
            return target;
        });
        const depth = new THREE.DepthTexture(resolution, resolution, THREE.UnsignedIntType);
        depth.name = 'GrassRuntimeImpostor-depth'; depth.format = THREE.DepthFormat;
        depth.minFilter = depth.magFilter = THREE.NearestFilter; depth.generateMipmaps = false;
        targets.forEach(target => { target.depthTexture = depth; });
        const camera = new THREE.OrthographicCamera(-.5, .5, .5, -.5, .01, 4);
        const direction = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
        const inverseView = new THREE.Matrix4(), viewProjection = new THREE.Matrix4(), inverseViewProjection = new THREE.Matrix4();
        const state = { targets, ready: false, captures: 0 };
        const record = Object.freeze({
            albedo: targets[0].texture, normal: targets[1].texture, surface: targets[2].texture, depth,
            camera, inverseView, viewProjection, inverseViewProjection, bounds: bounds.clone(),
            center: center.clone(), right, up, forward: direction, direction, resolution,
            get width() { return camera.right - camera.left; }, get height() { return camera.top - camera.bottom; },
            get near() { return camera.near; }, get far() { return camera.far; },
            get ready() { return state.ready; }, get captures() { return state.captures; },
            selfShadows: !!shadowDirection,
            dispose() {
                if (!records.delete(record)) return;
                targets.forEach(target => { target.depthTexture = null; target.dispose(); });
                depth.dispose(); state.ready = false;
            }
        });
        records.set(record, state); return record;
    };

    const render = (record, direction) => {
        const state = records.get(record);
        if (disposed || !state || !direction?.isVector3 || !Number.isFinite(direction.lengthSq()) || direction.lengthSq() < 1e-12)
            throw new Error('Invalid grass impostor capture target or direction.');
        state.ready = false;
        const camera = record.camera, viewBounds = new THREE.Box3();
        record.direction.copy(direction).normalize(); camera.position.copy(center).addScaledVector(record.direction, distance);
        camera.up.set(0, 1, 0); if (Math.abs(record.direction.y) > .98) camera.up.set(0, 0, -1);
        camera.lookAt(center); camera.updateMatrixWorld(true);
        corners.forEach(corner => viewBounds.expandByPoint(corner.clone().applyMatrix4(camera.matrixWorldInverse)));
        Object.assign(camera, {
            left: viewBounds.min.x - .015, right: viewBounds.max.x + .015,
            bottom: viewBounds.min.y - .015, top: viewBounds.max.y + .015,
            near: Math.max(.001, -viewBounds.max.z - .015), far: -viewBounds.min.z + .015
        });
        camera.updateProjectionMatrix(); record.inverseView.copy(camera.matrixWorld);
        record.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        record.inverseViewProjection.copy(record.viewProjection).invert();
        record.right.setFromMatrixColumn(camera.matrixWorld, 0); record.up.setFromMatrixColumn(camera.matrixWorld, 1);
        const previous = saveRenderer(renderer);
        try {
            renderer.xr.enabled = false; renderer.autoClear = true; renderer.autoClearColor = true;
            renderer.autoClearDepth = true; renderer.autoClearStencil = true;
            renderer.toneMapping = THREE.NoToneMapping; renderer.shadowMap.enabled = false;
            renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false;
            renderer.clippingPlanes = []; renderer.localClippingEnabled = true; renderer.setClearColor(0, 0);
            for (let i = 0; i < CHANNELS.length; i++) {
                const captureShadows = i === 2 && !!shadowLight;
                renderer.shadowMap.enabled = captureShadows;
                shadowCasters.visible = captureShadows && shadowGenerationCount === 0;
                renderer.shadowMap.needsUpdate = shadowCasters.visible;
                if (captureShadows) renderer.shadowMap.type = THREE.PCFShadowMap;
                mesh.material = materials[i]; renderer.setRenderTarget(state.targets[i]);
                renderer.setViewport(0, 0, resolution, resolution); renderer.setScissorTest(false);
                renderer.render(scene, camera);
                if (shadowCasters.visible) { shadowGenerationCount++; shadowCasters.visible = false; }
            }
            state.ready = true; state.captures++;
        } finally { shadowCasters.visible = false; restoreRenderer(renderer, previous); }
        return record;
    };

    return Object.freeze({
        resolution, bounds: bounds.clone(), roughness: material.roughness, createTarget, render,
        capture: (direction, destination = createTarget()) => render(destination, direction),
        getSnapshot: () => ({ selfShadows: !!shadowDirection, shadowResolution: shadowDirection ? shadowResolution : 0,
            shadowGenerationCount, shadowSourceTiles: shadowDirection ? 9 : 0,
            shadowDirection: shadowDirection ? shadowDirection.clone().normalize().toArray() : null,
            estimatedShadowBytes: shadowDirection && shadowGenerationCount ? shadowResolution ** 2 * 8 : 0 }),
        dispose() {
            if (disposed) return;
            disposed = true; [...records.keys()].forEach(record => record.dispose());
            materials.forEach(entry => entry.dispose()); scene.remove(mesh);
            shadowLight?.shadow.dispose(); shadowMaterial?.dispose(); shadowCasters.clear();
        }
    });
}
