// Render catalog thumbnails without changing the study camera or allocating another WebGL context.
// @ts-check
import * as THREE from 'three';

/** @param {THREE.WebGLRenderer} renderer @param {ReturnType<import('./GrassDebugV2TuftCatalog.js').createGrassDebugV2TuftCatalog>} catalog */
export function createGrassDebugV2TuftThumbnails(renderer, catalog) {
    const width = 224, height = 144, target = new THREE.WebGLRenderTarget(width, height, { depthBuffer: true });
    target.texture.colorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#22332c');
    scene.add(new THREE.HemisphereLight(0xe9f3ff, 0x495033, 2.2));
    const sun = new THREE.DirectionalLight(0xfff0d7, 3.0); sun.position.set(-1, 2, 1); scene.add(sun);
    const camera = new THREE.PerspectiveCamera(30, width / height, 0.001, 10);
    const previousTarget = renderer.getRenderTarget(), previousShadow = renderer.shadowMap.enabled;
    const previousAutoClear = renderer.autoClear, previousExposure = renderer.toneMappingExposure, previousToneMapping = renderer.toneMapping;
    const result = new Map();
    try {
        renderer.shadowMap.enabled = false; renderer.autoClear = true;
        renderer.toneMappingExposure = 1; renderer.toneMapping = THREE.NeutralToneMapping;
        for (const definition of catalog.definitions) {
            const tuft = catalog.createTuft(definition.id); tuft.setMode('LOD0'); scene.add(tuft.group);
            const bounds = new THREE.Box3().setFromObject(tuft.group), center = bounds.getCenter(new THREE.Vector3());
            const size = bounds.getSize(new THREE.Vector3());
            const distance = Math.max(size.x, size.y, size.z) * 2.9;
            camera.position.copy(center).addScaledVector(new THREE.Vector3(0.85, 0.75, 1).normalize(), distance);
            camera.lookAt(center); renderer.setRenderTarget(target); renderer.render(scene, camera);
            const pixels = new Uint8Array(width * height * 4); renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
            const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
            const context = canvas.getContext('2d'), data = context.createImageData(width, height);
            for (let y = 0; y < height; y++) data.data.set(pixels.subarray((height - y - 1) * width * 4, (height - y) * width * 4), y * width * 4);
            context.putImageData(data, 0, 0); result.set(definition.id, canvas.toDataURL('image/png'));
            scene.remove(tuft.group); tuft.dispose();
        }
    } finally {
        renderer.setRenderTarget(previousTarget); renderer.shadowMap.enabled = previousShadow;
        renderer.autoClear = previousAutoClear; renderer.toneMappingExposure = previousExposure; renderer.toneMapping = previousToneMapping; target.dispose();
    }
    return result;
}
