// Live study projection of grass into relightable floor maps; no persistent production bake.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2PeriodicSource } from './GrassDebugV2PeriodicSource.js';
import { grassFloorProjectionShader } from '../../shaders/materials/grass/GrassFloorBakeShaderLoader.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { createGrassDebugV2PatchBakeMaterial } from './GrassDebugV2PatchBakeMaterial.js';

/** @param {{renderer:THREE.WebGLRenderer, source:THREE.Group, ground:THREE.Mesh, resolution?:number, elevationDegrees?:number, azimuthDegrees?:number, planeHeight?:number, shadowDirection?:THREE.Vector3|null}} options */
export async function createGrassDebugV2FloorBake({ renderer, source, ground, resolution = 2048, elevationDegrees = 90, azimuthDegrees = 0, planeHeight = 0, shadowDirection = null }) {
    if (!Number.isInteger(resolution) || resolution < 256 || resolution > 4096) throw new Error('Floor bake resolution must be 256–4096.');
    if (!Number.isFinite(elevationDegrees) || elevationDegrees < 30 || elevationDegrees > 90
        || !Number.isFinite(azimuthDegrees) || !Number.isFinite(planeHeight) || planeHeight < 0) throw new Error('Invalid floor capture view.');
    if (shadowDirection && (!shadowDirection.toArray().every(Number.isFinite) || shadowDirection.lengthSq() === 0))
        throw new Error('Capture shadow direction must be a finite nonzero vector.');
    const sourceHeight = Math.max(0.0001, new THREE.Box3().setFromObject(source).max.y);
    const elevation = THREE.MathUtils.degToRad(elevationDegrees), azimuth = THREE.MathUtils.degToRad(azimuthDegrees);
    // Oblique rays can hit neighboring blades well beyond the square, even when their roots do not cross its edge.
    const paddingMeters = elevationDegrees === 90 ? 0 : sourceHeight / Math.tan(elevation) + 0.1;
    const periodic = createGrassDebugV2PeriodicSource(source, paddingMeters);
    const scene = new THREE.Scene(), copies = periodic.group, groundCopy = ground.clone();
    const groundMaterial = ground.material.clone(), groundTextures = [];
    groundCopy.material = groundMaterial;
    for (const slot of ['map', 'normalMap', 'roughnessMap']) if (groundMaterial[slot]) {
        const texture = groundMaterial[slot].clone();
        const { width, height } = ground.geometry.parameters;
        texture.repeat.set(width * Math.max(1, Math.round(texture.repeat.x / width)),
            height * Math.max(1, Math.round(texture.repeat.y / height)));
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.needsUpdate = true; groundTextures.push(texture); groundMaterial[slot] = texture;
    }
    copies.visible = true; groundCopy.visible = true; scene.add(groundCopy, copies);
    const shadowLight = shadowDirection ? new THREE.DirectionalLight(0xffffff, 1) : null;
    if (shadowLight) {
        shadowLight.position.copy(shadowDirection).normalize().multiplyScalar(3); shadowLight.castShadow = true;
        shadowLight.shadow.mapSize.set(2048, 2048);
        Object.assign(shadowLight.shadow.camera, { left: -1.3, right: 1.3, bottom: -1.3, top: 1.3, near: 0.01, far: 6 });
        shadowLight.shadow.bias = -0.00001; shadowLight.shadow.normalBias = 0.0001;
        shadowLight.shadow.camera.updateProjectionMatrix();
        copies.traverse(mesh => { if (mesh.isMesh) mesh.castShadow = mesh.receiveShadow = true; });
        groundCopy.receiveShadow = true; scene.add(shadowLight, shadowLight.target);
    }
    const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.01, 10);
    if (elevationDegrees === 90) { camera.position.set(0, 3 + planeHeight, 0); camera.up.set(0, 0, -1); }
    else camera.position.set(Math.sin(azimuth) * Math.cos(elevation) * 3, planeHeight + Math.sin(elevation) * 3, Math.cos(azimuth) * Math.cos(elevation) * 3);
    camera.lookAt(0, planeHeight, 0); camera.updateMatrixWorld(true);
    if (elevationDegrees !== 90) {
        const viewBounds = new THREE.Box3();
        // Include the 8 cm neighborhood sampled by the canopy-shade pass.
        for (const x of [-0.6, 0.6]) for (const z of [-0.6, 0.6])
            viewBounds.expandByPoint(new THREE.Vector3(x, planeHeight, z).applyMatrix4(camera.matrixWorldInverse));
        camera.left = viewBounds.min.x; camera.right = viewBounds.max.x;
        camera.bottom = viewBounds.min.y; camera.top = viewBounds.max.y; camera.updateProjectionMatrix();
    }
    const projection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const captured = new THREE.WebGLRenderTarget(resolution, resolution, { samples: 4, colorSpace: THREE.NoColorSpace });
    const geometry = new THREE.PlaneGeometry(2, 2), outputScene = new THREE.Scene(), outputCamera = new THREE.Camera();
    const projectionMaterial = new THREE.ShaderMaterial({
        vertexShader: grassFloorProjectionShader.vertexSource, fragmentShader: grassFloorProjectionShader.fragmentSource,
        uniforms: { captureMap: { value: captured.texture }, albedoMap: { value: null }, heightMap: { value: null }, bakeProjection: { value: projection }, planeHeight: { value: planeHeight }, channel: { value: 0 } },
        depthTest: false, depthWrite: false, toneMapped: false
    });
    attachShaderMetadata(projectionMaterial, grassFloorProjectionShader);
    outputScene.add(new THREE.Mesh(geometry, projectionMaterial));
    const meshes = []; scene.traverse(object => { if (object.isMesh) meshes.push({ mesh: object, source: object.material }); });
    const previous = { target: renderer.getRenderTarget(), color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(),
        autoClear: renderer.autoClear, toneMapping: renderer.toneMapping, viewport: renderer.getViewport(new THREE.Vector4()),
        scissor: renderer.getScissor(new THREE.Vector4()), scissorTest: renderer.getScissorTest(), shadows: renderer.shadowMap.enabled,
        shadowAuto: renderer.shadowMap.autoUpdate, shadowUpdate: renderer.shadowMap.needsUpdate };
    const targets = {}, temporaryMaterials = [];
    try {
        renderer.autoClear = true; renderer.toneMapping = THREE.NoToneMapping; renderer.shadowMap.enabled = false; renderer.setScissorTest(false);
        const channels = [[3, 'height'], [0, 'albedo'], [1, 'normal'], [2, 'roughness']];
        if (shadowLight) channels.push([4, 'visibility']);
        for (const [channel, name] of channels) {
            const materials = new Map();
            for (const { mesh, source: original } of meshes) {
                if (!materials.has(original)) {
                    const material = createGrassDebugV2PatchBakeMaterial(original, name, true, sourceHeight);
                    materials.set(original, material); temporaryMaterials.push(material);
                }
                mesh.material = materials.get(original);
            }
            renderer.shadowMap.enabled = name === 'visibility';
            if (name === 'visibility') {
                renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true; shadowLight.shadow.needsUpdate = true;
            }
            renderer.setRenderTarget(captured); renderer.setClearColor(0, 1); renderer.clear(); renderer.render(scene, camera);
            renderer.setRenderTarget(null);
            const target = new THREE.WebGLRenderTarget(resolution, resolution, { depthBuffer: false, colorSpace: THREE.NoColorSpace });
            target.texture.name = 'GrassV2Floor' + name; target.texture.generateMipmaps = true;
            target.texture.userData.grassSoilContributions = name === 'roughness';
            target.texture.userData.grassCanopyHeight = name === 'albedo';
            target.texture.wrapS = target.texture.wrapT = THREE.RepeatWrapping;
            target.texture.minFilter = THREE.LinearMipmapLinearFilter; target.texture.magFilter = THREE.LinearFilter;
            target.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
            targets[name] = target; projectionMaterial.uniforms.channel.value = channel;
            if (name === 'albedo') projectionMaterial.uniforms.heightMap.value = targets.height.texture;
            if (name === 'normal' || name === 'roughness') projectionMaterial.uniforms.albedoMap.value = targets.albedo.texture;
            renderer.setRenderTarget(target); renderer.render(outputScene, outputCamera); renderer.setRenderTarget(null);
        }
        targets.height.dispose(); delete targets.height;
    } catch (error) { Object.values(targets).forEach(target => target.dispose()); throw error; }
    finally {
        renderer.setRenderTarget(previous.target); renderer.setViewport(previous.viewport); renderer.setScissor(previous.scissor);
        renderer.setScissorTest(previous.scissorTest); renderer.setClearColor(previous.color, previous.alpha);
        renderer.autoClear = previous.autoClear; renderer.toneMapping = previous.toneMapping; renderer.shadowMap.enabled = previous.shadows;
        renderer.shadowMap.autoUpdate = previous.shadowAuto; renderer.shadowMap.needsUpdate = previous.shadowUpdate;
        shadowLight?.shadow.map?.dispose();
        periodic.dispose(); groundMaterial.dispose(); groundTextures.forEach(texture => texture.dispose());
        temporaryMaterials.forEach(material => material.dispose()); captured.dispose(); geometry.dispose(); projectionMaterial.dispose();
    }
    await new Promise(resolve => requestAnimationFrame(resolve));
    return Object.freeze({
        textures: Object.freeze(Object.fromEntries(Object.entries(targets).map(([name, target]) => [name, target.texture]))),
        readPixels: name => {
            if (!Object.hasOwn(targets, name)) throw new Error('Unknown floor bake channel.');
            const pixels = new Uint8Array(resolution * resolution * 4);
            renderer.readRenderTargetPixels(targets[name], 0, 0, resolution, resolution, pixels);
            return pixels;
        },
        getSnapshot: () => ({ resolution, sourceView: elevationDegrees === 90 ? 'top' : 'oblique', elevationDegrees, azimuthDegrees, planeHeight, projectionType: 'orthographic', footprintMeters: 1, cameraPosition: camera.position.toArray(),
            cameraTarget: [0, planeHeight, 0], projection: projection.toArray(), normalSpace: 'floor-tangent-X-negativeZ-Y',
            channels: Object.keys(targets), sunBaked: false, shadowsBaked: !!shadowLight, shadowDirection: shadowDirection?.toArray() ?? null,
            canopyShadeBaked: true, leafHeightBaked: true, sourceHeight, soilMinVisibility: 0.08, shadeDensityAttenuation: 8, shadeRadiusMeters: 0.08,
            periodic: periodic.getSnapshot(), soilPeriodMeters: 1 }),
        dispose: () => Object.values(targets).forEach(target => target.dispose())
    });
}
