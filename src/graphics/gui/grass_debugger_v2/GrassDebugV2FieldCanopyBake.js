// Capture a periodic source tile into opaque, relightable maps shared by every field copy.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2PatchBakeMaterial } from './GrassDebugV2PatchBakeMaterial.js';
import { grassPatchCaptureShader } from '../../shaders/materials/grass/GrassFloorBakeShaderLoader.js';
import { grassFieldCanopyCaptureShader } from '../../shaders/materials/grass/GrassFieldCanopyShaderLoader.js?v=lod4-patterns-1';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';

function periodicGroundMaterial(mesh, width, depth, phase, temporaryTextures) {
    const material = mesh.material.clone(), bounds = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
    const uv = mesh.geometry.attributes.uv, min = new THREE.Vector2(Infinity, Infinity), max = new THREE.Vector2(-Infinity, -Infinity);
    for (let i = 0; i < uv.count; i++) { min.min(new THREE.Vector2(uv.getX(i), uv.getY(i))); max.max(new THREE.Vector2(uv.getX(i), uv.getY(i))); }
    const span = max.clone().sub(min), center = min.clone().add(max).multiplyScalar(.5);
    for (const name of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap']) {
        const original = material[name]; if (!original) continue;
        const texture = original.clone(), repeatsX = original.repeat.x * span.x * width / bounds.x, repeatsY = original.repeat.y * span.y * depth / bounds.z;
        // Whole repeats across the capture make the background periodic too.
        // Preserve the source phase at the tile center and leave live soil untouched.
        texture.repeat.set(original.repeat.x * Math.max(1, Math.round(repeatsX)) / repeatsX,
            original.repeat.y * Math.max(1, Math.round(repeatsY)) / repeatsY);
        texture.offset.x += center.x * (original.repeat.x - texture.repeat.x) + phase;
        texture.offset.y += center.y * (original.repeat.y - texture.repeat.y) + phase;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        material[name] = texture; temporaryTextures.push(texture);
    }
    return material;
}

/** @param {{renderer:THREE.WebGLRenderer, source:THREE.Object3D, shadowSource:THREE.Object3D, shadowDirection:THREE.Vector3, soil:THREE.Mesh, litter:THREE.Object3D, width:number, depth:number, sourceHeight:number, resolution?:number, mapResolutions?:Partial<Record<'albedo'|'normal'|'roughness'|'visibility',number>>, anisotropy?:number,mapResolutionProfiles?:Record<string,Partial<Record<'albedo'|'normal'|'roughness',number>>>, onProgress?:(message:string)=>void, shadowResolution?:number,layers?:string[],yieldBetweenChannels?:boolean}} options */
export async function createGrassDebugV2FieldCanopyBake({ renderer, source, shadowSource, shadowDirection, soil, litter, width, depth, sourceHeight, resolution = 4096, mapResolutions = {}, mapResolutionProfiles = {}, shadowResolution = 8192, anisotropy = 8, layers = ['all', 'grass'], yieldBetweenChannels = true, onProgress = () => {} }) {
    if (!Number.isInteger(anisotropy) || anisotropy < 1) throw new Error('Canopy anisotropy must be a positive integer.');
    if (!(width > 0 && depth > 0 && Number.isFinite(sourceHeight) && sourceHeight > 0) || !Number.isInteger(resolution) || resolution < 256 || resolution > 4096
        || resolution > renderer.capabilities.maxTextureSize) throw new Error('Invalid canopy capture dimensions.');
    if (!Number.isInteger(shadowResolution) || shadowResolution < 256 || shadowResolution > 8192
        || shadowResolution > renderer.capabilities.maxTextureSize || !layers.length || layers.some(layer => !['all','grass'].includes(layer))) throw new Error('Invalid canopy shadow resolution or capture layers.');
    const channelResolutions = Object.freeze({ albedo: resolution, normal: resolution, roughness: resolution, visibility: resolution, ...mapResolutions });
    if (Object.hasOwn(mapResolutionProfiles, 'default')) throw new Error('The default canopy profile is configured by mapResolutions.');
    const profileResolutions = { default: channelResolutions, ...Object.fromEntries(Object.entries(mapResolutionProfiles)
        .map(([name, sizes]) => [name, Object.freeze({ ...channelResolutions, ...sizes })])) };
    if (Object.values(profileResolutions).some(sizes => Object.entries(sizes).some(([name, size]) => !['albedo', 'normal', 'roughness', 'visibility'].includes(name)
        || !Number.isInteger(size) || size < 256 || size > resolution || !Number.isInteger(Math.log2(size)))))
        throw new Error('Canopy map resolutions must be powers of two from 256 through the capture resolution.');
    const started = performance.now(), scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-width/2, width/2, depth/2, -depth/2, .01, 4);
    camera.position.set(0, 2, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
    const entries = [], temporaryTextures = [], groundMaterials = [];
    for (const root of [soil, litter, source]) {
        root.updateWorldMatrix(true, true);
        root.traverse(original => {
            if (!original.isMesh) return;
            if (root !== source) {
                const bounds = new THREE.Box3().setFromObject(original);
                if (bounds.max.x <= -width/2 || bounds.min.x >= width/2 || bounds.max.z <= -depth/2 || bounds.min.z >= depth/2) return;
            }
            const mesh = original.clone(false);
            mesh.matrix.copy(original.matrixWorld); mesh.matrixAutoUpdate = false; mesh.renderOrder = original.renderOrder;
            mesh.castShadow = false; mesh.receiveShadow = true;
            // Keep the source material phase centered on the periodic capture.
            const material = root === source ? original.material : periodicGroundMaterial(original, width, depth, root === litter ? .5 : 0, temporaryTextures);
            if (root !== source) groundMaterials.push(material);
            scene.add(mesh); entries.push({ mesh, original: material, leaf: root === source, litter: root === litter });
        });
    }
    const shadowLight = new THREE.DirectionalLight(0xffffff, 1), shadowMaterials = [], shadowCasters = [];
    shadowLight.position.copy(shadowDirection).normalize().multiplyScalar(3); shadowLight.castShadow = true;
    shadowLight.shadow.mapSize.set(shadowResolution, shadowResolution);
    shadowSource.updateWorldMatrix(true, true);
    scene.add(shadowLight, shadowLight.target); scene.updateMatrixWorld(true);
    const shadowBounds = new THREE.Box3().setFromObject(shadowSource);
    shadowBounds.expandByPoint(new THREE.Vector3(-width/2, 0, -depth/2));
    shadowBounds.expandByPoint(new THREE.Vector3(width/2, sourceHeight, depth/2));
    const lightCamera = shadowLight.shadow.camera, lightBounds = new THREE.Box3();
    lightCamera.position.copy(shadowLight.position); lightCamera.lookAt(0, 0, 0); lightCamera.updateMatrixWorld(true);
    for (const x of [shadowBounds.min.x, shadowBounds.max.x]) for (const y of [shadowBounds.min.y, shadowBounds.max.y])
        for (const z of [shadowBounds.min.z, shadowBounds.max.z]) lightBounds.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(lightCamera.matrixWorldInverse));
    Object.assign(lightCamera, { left: lightBounds.min.x-.01, right: lightBounds.max.x+.01, bottom: lightBounds.min.y-.01,
        top: lightBounds.max.y+.01, near: -lightBounds.max.z-.01, far: -lightBounds.min.z+.01 });
    lightCamera.updateProjectionMatrix(); shadowLight.shadow.bias = -.00001; shadowLight.shadow.normalBias = .0001;
    shadowSource.traverse(original => {
        if (!original.isMesh) return;
        const mesh = original.clone(false), material = original.material.clone();
        material.colorWrite = false; material.depthWrite = false; shadowMaterials.push(material);
        mesh.material = material; mesh.matrix.copy(original.matrixWorld); mesh.matrixAutoUpdate = false;
        mesh.castShadow = true; mesh.receiveShadow = false; scene.add(mesh); shadowCasters.push(mesh);
    });
    const previous = { target: renderer.getRenderTarget(), color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(),
        viewport: renderer.getViewport(new THREE.Vector4()), scissor: renderer.getScissor(new THREE.Vector4()), scissorTest: renderer.getScissorTest(),
        toneMapping: renderer.toneMapping, autoClear: renderer.autoClear, shadowEnabled: renderer.shadowMap.enabled,
        shadowAuto: renderer.shadowMap.autoUpdate, shadowUpdate: renderer.shadowMap.needsUpdate, xr: renderer.xr.enabled };
    const temporary = [], profileTextures = Object.fromEntries(Object.keys(profileResolutions).map(profile =>
        [profile, Object.fromEntries(layers.map(layer => [layer, {}]))])), targets = [], captured = new THREE.WebGLRenderTarget(resolution, resolution, { samples: 4, colorSpace: THREE.NoColorSpace });
    captured.texture.generateMipmaps = Object.values(profileResolutions).some(sizes => Object.values(sizes).some(size => size < resolution));
    captured.texture.minFilter = captured.texture.generateMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    const resolveScene = new THREE.Scene(), resolveCamera = new THREE.Camera(), resolveGeometry = new THREE.PlaneGeometry(2, 2);
    const resolveMaterial = new THREE.MeshBasicMaterial({ map: captured.texture, depthTest: false, depthWrite: false, toneMapped: false,
        transparent: true, blending: THREE.NoBlending });
    resolveScene.add(new THREE.Mesh(resolveGeometry, resolveMaterial));
    let capturedShadowResolution = null;
    try {
        renderer.xr.enabled = false; renderer.toneMapping = THREE.NoToneMapping; renderer.autoClear = true;
        renderer.shadowMap.enabled = false; renderer.setScissorTest(false);
        renderer.shadowMap.autoUpdate = false;
        for (const layer of layers) for (const [channel, name] of ['albedo', 'normal', 'roughness', 'visibility'].entries()) {
            onProgress('Capturing LOD4 · ' + layer + ' · ' + name);
            renderer.shadowMap.enabled = name === 'visibility';
            shadowCasters.forEach(mesh => { mesh.visible = name === 'visibility'; });
            if (name === 'visibility') { renderer.shadowMap.needsUpdate = !capturedShadowResolution; shadowLight.shadow.needsUpdate = !capturedShadowResolution; }
            const materials = new Map();
            for (const entry of entries) {
                entry.mesh.visible = layer === 'all' || !entry.litter;
                if (!materials.has(entry.original)) {
                    const material = createGrassDebugV2PatchBakeMaterial(entry.original, name === 'visibility' ? 'visibility' : 'albedo', true);
                    // Alpha stores channel data, so it must not control MSAA sample coverage.
                    material.alphaToCoverage = false;
                    material.defines = { ...material.defines, GRASS_FIELD_CANOPY_SOURCE_HEIGHT: sourceHeight.toFixed(9), GRASS_FIELD_CANOPY_CHANNEL: channel,
                        GRASS_FIELD_CANOPY_LEAF: entry.leaf ? '1.0' : '0.0' };
                    material.polygonOffset = entry.original.polygonOffset; material.polygonOffsetFactor = entry.original.polygonOffsetFactor; material.polygonOffsetUnits = entry.original.polygonOffsetUnits;
                    attachShaderMetadata(material, grassFieldCanopyCaptureShader);
                    registerMaterialShaderHook(material, { id: 'grass.field-canopy.capture', priority: 20, variantKey: grassFieldCanopyCaptureShader.variantKey,
                        apply: shader => {
                            if (!shader.fragmentShader.includes(grassPatchCaptureShader.fragmentSource)) throw new Error('Missing canopy capture anchor.');
                            shader.fragmentShader = shader.fragmentShader.replace(grassPatchCaptureShader.fragmentSource, grassFieldCanopyCaptureShader.fragmentSource);
                        }
                    });
                    materials.set(entry.original, material); temporary.push(material);
                }
                entry.mesh.material = materials.get(entry.original);
            }
            renderer.setRenderTarget(captured); renderer.setClearColor(0, 1); renderer.clear(); renderer.render(scene, camera);
            if (name === 'visibility') capturedShadowResolution = shadowLight.shadow.map.width;
            for (const size of new Set(Object.values(profileResolutions).map(sizes => sizes[name]))) {
                const target = new THREE.WebGLRenderTarget(size, size, { depthBuffer: false,
                    format: name === 'visibility' ? THREE.RedFormat : THREE.RGBAFormat, colorSpace: THREE.NoColorSpace });
                targets.push(target);
                target.texture.name = 'GrassFieldCanopy-' + layer + '-' + name + '-' + size;
                target.texture.generateMipmaps = true; target.texture.minFilter = THREE.LinearMipmapLinearFilter;
                target.texture.wrapS = target.texture.wrapT = THREE.RepeatWrapping;
                target.texture.anisotropy = Math.min(anisotropy, renderer.capabilities.getMaxAnisotropy());
                target.texture.userData.grassSoilContributions = name === 'roughness';
                renderer.setRenderTarget(null);
                if (name === 'visibility' || size !== resolution) { renderer.setRenderTarget(target); renderer.render(resolveScene, resolveCamera); renderer.setRenderTarget(null); }
                else { renderer.initRenderTarget(target); renderer.copyTextureToTexture(captured.texture, target.texture); }
                for (const [profile, sizes] of Object.entries(profileResolutions)) if (sizes[name] === size)
                    profileTextures[profile][layer][name] = target.texture;
            }
            if (yieldBetweenChannels) await new Promise(resolve => requestAnimationFrame(resolve));
        }
    } catch(error) { targets.forEach(target => target.dispose()); throw error; }
    finally {
        renderer.setRenderTarget(previous.target); renderer.setViewport(previous.viewport); renderer.setScissor(previous.scissor); renderer.setScissorTest(previous.scissorTest);
        renderer.setClearColor(previous.color, previous.alpha); renderer.toneMapping = previous.toneMapping; renderer.autoClear = previous.autoClear;
        renderer.shadowMap.enabled = previous.shadowEnabled; renderer.xr.enabled = previous.xr;
        renderer.shadowMap.autoUpdate = previous.shadowAuto; renderer.shadowMap.needsUpdate = previous.shadowUpdate;
        shadowLight.shadow.dispose(); shadowMaterials.forEach(material => material.dispose());
        resolveGeometry.dispose(); resolveMaterial.dispose();
        temporary.forEach(material => material.dispose()); captured.dispose();
        groundMaterials.forEach(material => material.dispose()); temporaryTextures.forEach(texture => texture.dispose());
        entries.forEach(({mesh}) => { if (mesh.isInstancedMesh) mesh.dispose(); });
    }
    const milliseconds = performance.now() - started;
    const residentTextureBytes = targets.reduce((sum, target) => sum + (target.width * target.height * 4 - 1) / 3
        * (target.texture.format === THREE.RedFormat ? 1 : 4), 0);
    const profiles = Object.fromEntries(Object.entries(profileResolutions).map(([profile, sizes]) => [profile, Object.freeze({
        textures: profileTextures[profile], getSnapshot: () => ({ resolution, mapResolutions: sizes, footprint: [width, depth], channels: ['albedo-height', 'normal-leaf-mask', 'roughness-soil', 'self-shadow-visibility'],
            layerVariants: layers.length, residentTextureBytes, estimatedTextureBytes: Object.entries(sizes).reduce((sum, [name, size]) =>
                sum + (size * size * 4 - 1) / 3 * (name === 'visibility' ? 1 : 4), 0) * layers.length, sunBaked: false,
            selfShadowsBaked: true, shadowResolution: capturedShadowResolution, shadowDirection: shadowDirection.clone().normalize().toArray(), shadowTargetReleased: true,
            sourceLod: 'LOD2', sourceHeight, milliseconds }),
        readPixels(layer, name) {
            const target = targets.find(target => target.texture === profileTextures[profile][layer]?.[name]);
            if (!target) throw new Error('Unknown canopy capture channel: ' + layer + '/' + name);
            const pixels = new Uint8Array(target.width * target.height * (name === 'visibility' ? 1 : 4));
            renderer.readRenderTargetPixels(target, 0, 0, target.width, target.height, pixels); return pixels;
        }
    })]));
    return Object.freeze({ ...profiles.default, profiles: Object.freeze(profiles),
        dispose: () => targets.forEach(target => target.dispose())
    });
}
