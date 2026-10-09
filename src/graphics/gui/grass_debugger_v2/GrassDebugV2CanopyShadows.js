// Cache external scene shadows independently from the repeating tile's baked self-shadows.
// @ts-check
import * as THREE from 'three';

/** @param {{renderer:THREE.WebGLRenderer,scene:THREE.Scene,sun:THREE.DirectionalLight,fields:object,canopy:object}} options */
export function createGrassDebugV2CanopyShadows({ renderer, scene, sun, fields, canopy }) {
    const resolution = 2048;
    const target = new THREE.WebGLRenderTarget(resolution, resolution, { depthBuffer: false, format: THREE.RedFormat, colorSpace: THREE.NoColorSpace });
    target.texture.name = 'GrassFieldCanopy-ShadowVisibility';
    target.texture.generateMipmaps = true;
    target.texture.minFilter = THREE.LinearMipmapLinearFilter;
    target.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const capture = new THREE.Scene(), camera = new THREE.OrthographicCamera();
    const light = sun.clone();
    capture.add(light, light.target);
    let generations = 0, casterCount = 0;
    canopy.shadowUniforms.grassCanopyShadowVisibility.value = target.texture;

    function update() {
        const { bounds, tiles } = fields.getSnapshot();
        const width = bounds.maxX - bounds.minX, depth = bounds.maxZ - bounds.minZ;
        const centerX = (bounds.minX + bounds.maxX) / 2, centerZ = (bounds.minZ + bounds.maxZ) / 2;
        canopy.shadowUniforms.grassCanopyShadowBounds.value.set(bounds.minX, bounds.maxZ, 1 / width, 1 / depth);
        Object.assign(camera, { left: -width / 2, right: width / 2, bottom: -depth / 2, top: depth / 2, near: .01, far: 4 });
        camera.position.set(centerX, 2, centerZ); camera.up.set(0, 0, -1); camera.lookAt(centerX, 0, centerZ);
        camera.updateProjectionMatrix(); camera.updateMatrixWorld(); scene.updateMatrixWorld(true);
        light.copy(sun); light.shadow.mapSize.set(resolution, resolution);
        light.shadow.autoUpdate = false; light.shadow.needsUpdate = true;
        light.target.position.copy(sun.target.position); light.updateMatrixWorld(); light.target.updateMatrixWorld();
        const meshes = [], casterMaterials = [];
        scene.traverseVisible(source => {
            if (!source.isMesh || !source.castShadow || source.userData.grassLeafCount != null || source.userData.grassCanopy) return;
            const mesh = source.clone(false);
            const material = original => { const copy = original.clone(); copy.colorWrite = false; copy.depthWrite = false; casterMaterials.push(copy); return copy; };
            mesh.material = Array.isArray(source.material) ? source.material.map(material) : material(source.material);
            mesh.matrix.copy(source.matrixWorld); mesh.matrixAutoUpdate = false; mesh.receiveShadow = false;
            capture.add(mesh); meshes.push(mesh);
        });
        const externalCasters = meshes.length;
        const receivers = fields.getCanopyMeshes ? fields.getCanopyMeshes() : tiles.filter(tile => tile.active).flatMap(tile => {
            const result = [];
            scene.getObjectByName('GrassFieldTile_' + (tile.index + 1)).traverse(source => {
                if (!source.userData.grassCanopy && !source.userData.grassCanopyWall) return;
                result.push(source);
            });
            return result;
        });
        for (const source of receivers) {
            const mesh = source.clone(false);
            mesh.matrix.copy(source.matrixWorld); mesh.matrixAutoUpdate = false; mesh.receiveShadow = true; mesh.castShadow = false;
            capture.add(mesh); meshes.push(mesh);
        }
        const previous = { target: renderer.getRenderTarget(), tone: renderer.toneMapping, autoClear: renderer.autoClear,
            color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(),
            viewport: renderer.getViewport(new THREE.Vector4()), scissor: renderer.getScissor(new THREE.Vector4()), scissorTest: renderer.getScissorTest(),
            shadowUpdate: renderer.shadowMap.needsUpdate, shadowAuto: renderer.shadowMap.autoUpdate };
        try {
            canopy.shadowUniforms.grassCanopyShadowVisibility.value = null;
            canopy.shadowUniforms.grassCanopyShadowPass.value = 1;
            renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
            renderer.toneMapping = THREE.NoToneMapping; renderer.autoClear = true; renderer.setScissorTest(false);
            renderer.setRenderTarget(target); renderer.setClearColor(0xffffff, 1); renderer.render(capture, camera);
            generations++; casterCount = externalCasters;
        } finally {
            renderer.setRenderTarget(previous.target); renderer.setViewport(previous.viewport); renderer.setScissor(previous.scissor); renderer.setScissorTest(previous.scissorTest);
            renderer.setClearColor(previous.color, previous.alpha); renderer.toneMapping = previous.tone; renderer.autoClear = previous.autoClear;
            renderer.shadowMap.needsUpdate = previous.shadowUpdate; renderer.shadowMap.autoUpdate = previous.shadowAuto;
            canopy.shadowUniforms.grassCanopyShadowPass.value = generations ? 2 : 0;
            canopy.shadowUniforms.grassCanopyShadowVisibility.value = target.texture;
            for (const mesh of meshes) { capture.remove(mesh); mesh.dispose?.(); }
            casterMaterials.forEach(material => material.dispose()); light.shadow.dispose(); light.shadow.map = null;
        }
    }
    return Object.freeze({ update, getSnapshot: () => ({ generations, resolution, estimatedTextureBytes: resolution * resolution * 4 / 3,
        externalOnly: true, externalCasters: casterCount, grassSelfShadows: 'periodic-tile' }),
        dispose() { target.dispose(); canopy.shadowUniforms.grassCanopyShadowVisibility.value = null; canopy.shadowUniforms.grassCanopyShadowPass.value = 0; } });
}
