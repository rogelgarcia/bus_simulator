// Temporary density/silhouette experiment. The regular card study remains untouched and can be loaded with ?experiment=off.
// @ts-check
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GrassDebugV2Lighting } from './GrassDebugV2Lighting.js';
import { createGrassDebugV2Land } from './GrassDebugV2Land.js';
import { createGrassDebugV2Material } from './GrassDebugV2Material.js';
import { createGrassDebugV2DetailedBladeSurface } from './GrassDebugV2DetailedBladeSurface.js';
import { createGrassDebugV2Plant } from './GrassDebugV2Plant.js';

const definition = Object.freeze({ leaves: 1000, batchSize: 500, sizeMeters: 1, seed: 192406,
    heightScale: [0.85, 1.15], lengthScale: [0.9, 1.1], pitchDegrees: [-8, 8], rollDegrees: [-6, 6] });
const surfaceTuning = Object.freeze({ normalStrength: 0.4, roughnessOffset: 0.1 });
const poses = Object.freeze({
    three_quarter: { position: [1.35, 0.9, 1.6], target: [0, 0.055, 0] },
    side: { position: [1.4, 0.18, 1.45], target: [0, 0.055, 0] },
    elevated: { position: [0, 2, 0.001], target: [0, 0.04, 0] },
    crown_close: { position: [0, 0.11, 0.75], target: [0, 0.075, 0] }
});

async function start() {
    const leafCountLabel = definition.leaves.toLocaleString('en-US');
    document.querySelector('h1').textContent = `${leafCountLabel} Leaf Study`;
    document.querySelector('[aria-label="Representation"]').hidden = true;
    document.querySelector('#card-bounds').closest('label').hidden = true;
    document.querySelector('#plant-canvas').setAttribute('aria-label', `${leafCountLabel} randomly oriented LOD0 leaves in one square metre`);
    const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#plant-canvas'), antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.001, 100);
    const lighting = new GrassDebugV2Lighting({ renderer, scene, camera });
    const controls = new OrbitControls(camera, renderer.domElement); controls.minDistance = 0.02; controls.maxDistance = 6;
    const [land] = await Promise.all([createGrassDebugV2Land(renderer, { width: 20, depth: 20, centerX: 0, centerZ: 0 }), lighting.loadEnvironment()]);
    land.setSurface('brown_mud'); scene.add(land.ground);
    const surface = createGrassDebugV2DetailedBladeSurface();
    for (const map of [surface.normalMap, surface.roughnessMap]) map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const roughnessData = surface.roughnessMap.image.data;
    for (let i = 0; i < roughnessData.length; i += 4) for (let c = 0; c < 3; c++) {
        roughnessData[i + c] = Math.min(255, roughnessData[i + c] + Math.round(surfaceTuning.roughnessOffset * 255));
    }
    const material = createGrassDebugV2Material({ vertexColors: true, normalMap: surface.normalMap,
        normalScale: new THREE.Vector2(surfaceTuning.normalStrength, surfaceTuning.normalStrength),
        roughnessMap: surface.roughnessMap, roughness: 1 });
    const source = createGrassDebugV2Plant({ material });
    const field = new THREE.Group(); field.name = 'GrassV2SpikeExperiment'; scene.add(field);
    let seed = definition.seed;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const range = ([min, max]) => THREE.MathUtils.lerp(min, max, random());
    const transform = new THREE.Matrix4(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3(), origin = new THREE.Vector3();
    const rotatedBounds = new THREE.Box3(), bounds = new THREE.Box3();
    for (let offset = 0; offset < definition.leaves; offset += definition.batchSize) {
        const geometry = source.leaves[(offset / definition.batchSize) % source.leaves.length].geometry;
        const mesh = new THREE.InstancedMesh(geometry, material, Math.min(definition.batchSize, definition.leaves - offset));
        for (let i = 0; i < mesh.count; i++) {
            rotation.setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(range(definition.pitchDegrees)), random() * Math.PI * 2,
                THREE.MathUtils.degToRad(range(definition.rollDegrees)), 'YXZ'));
            scale.set(1, range(definition.heightScale), range(definition.lengthScale));
            transform.compose(origin.set(0, 0, 0), rotation, scale);
            rotatedBounds.copy(geometry.boundingBox).applyMatrix4(transform);
            origin.set(THREE.MathUtils.lerp(-0.5 - rotatedBounds.min.x, 0.5 - rotatedBounds.max.x, random()), 0,
                THREE.MathUtils.lerp(-0.5 - rotatedBounds.min.z, 0.5 - rotatedBounds.max.z, random()));
            transform.setPosition(origin); mesh.setMatrixAt(i, transform);
            bounds.union(rotatedBounds.translate(origin));
        }
        mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere();
        mesh.castShadow = mesh.receiveShadow = true; field.add(mesh);
    }
    const squareBounds = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.5, 0.002, -0.5), new THREE.Vector3(0.5, 0.002, -0.5),
        new THREE.Vector3(0.5, 0.002, 0.5), new THREE.Vector3(-0.5, 0.002, 0.5)
    ]), new THREE.LineBasicMaterial({ color: new THREE.Color('#348fff').multiplyScalar(1 / renderer.toneMappingExposure),
        depthTest: false, depthWrite: false, toneMapped: false }));
    squareBounds.renderOrder = 11; scene.add(squareBounds);
    const sun = lighting.sun; sun.target.position.set(0, 0, 0); sun.position.copy(lighting.sunRef.direction).multiplyScalar(2);
    sun.shadow.mapSize.set(4096, 4096);
    Object.assign(sun.shadow.camera, { left: -1, right: 1, bottom: -1, top: 1, near: 0.01, far: 4 });
    sun.shadow.camera.updateProjectionMatrix(); sun.shadow.normalBias = 0.0001; sun.shadow.bias = -0.00001;
    renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
    lighting.applyEnvironment(); lighting.resize(innerWidth, innerHeight);
    const leafTriangles = field.children.reduce((sum, mesh) => sum + mesh.count * mesh.geometry.index.count / 3, 0);
    document.querySelector('#plant-counts').textContent = `${leafCountLabel} leaves · ${leafTriangles.toLocaleString('en-US')} tris`;
    document.querySelector('#square-bounds').checked = true;
    let pendingFrame = 0;
    const render = () => { if (pendingFrame) cancelAnimationFrame(pendingFrame); pendingFrame = 0; lighting.render(0); };
    const scheduleRender = () => { if (!pendingFrame) pendingFrame = requestAnimationFrame(render); };
    const setPose = name => {
        if (!Object.hasOwn(poses, name)) throw new Error('Unknown experiment camera.');
        camera.up.set(0, 1, 0); camera.position.fromArray(poses[name].position); controls.target.fromArray(poses[name].target);
        controls.update(); scheduleRender();
    };
    setPose('three_quarter'); await renderer.compileAsync(scene, camera); render();
    controls.addEventListener('change', scheduleRender);
    document.querySelectorAll('[data-pose]').forEach(button => button.addEventListener('click', () => setPose(button.dataset.pose)));
    document.querySelector('#square-bounds').addEventListener('change', event => { squareBounds.visible = event.target.checked; scheduleRender(); });
    document.querySelectorAll('button, input').forEach(element => { element.disabled = false; });
    document.querySelector('#plant-loading').hidden = true;
    addEventListener('resize', () => { renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight, false);
        camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); lighting.resize(innerWidth, innerHeight); scheduleRender(); });
    return Object.freeze({ renderer, scene, camera, controls, field, squareBounds, setPose, render,
        getSnapshot: () => ({ definition, surfaceTuning, leaves: definition.leaves, leafTriangles, batches: field.children.length,
            bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, lighting: lighting.getSnapshot(), land: land.getSnapshot() }) });
}

if (new URLSearchParams(location.search).get('experiment') === 'off') {
    await import('./GrassDebugV2PlantStudy.js');
} else {
    window.__grassSpikeReadiness = start().then(study => { window.__grassSpikeStudy = study; return true; }).catch(error => {
        document.querySelector('#plant-loading').textContent = `Failed to load: ${error.message}`; throw error;
    });
}
