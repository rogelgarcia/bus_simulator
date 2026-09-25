// Review four same-side leaves in two shared-root V pairs; ?layout=patch restores the field and ?layout=row the historical paired authoring source.
// @ts-check
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GrassDebugV2Lighting } from './GrassDebugV2Lighting.js';
import { createGrassDebugV2Land } from './GrassDebugV2Land.js';
import { createGrassDebugV2Material } from './GrassDebugV2Material.js';
import { createGrassDebugV2DetailedBladeSurface } from './GrassDebugV2DetailedBladeSurface.js';
import { createGrassDebugV2SoilIntegration } from './GrassDebugV2SoilIntegration.js';
import { createGrassDebugV2PlantRow } from './GrassDebugV2PlantRow.js';
import { createGrassDebugV2PlantCards } from './GrassDebugV2PlantCards.js';
import { createGrassDebugV2PlantPatch } from './GrassDebugV2PlantPatch.js';

// Retain the root-contact mesh for authoring, but render the flat terrain for now.
const ROOT_SOIL_ENABLED = false;

const threeQuarterPose = Object.freeze({ position: [0.48, 0.40, 0.54], target: [0, 0.018, 0.012] });
const poses = Object.freeze({
    three_quarter: threeQuarterPose,
    far: { ...threeQuarterPose, fitSquare: true },
    two_meters: { ...threeQuarterPose, fitSquare: true, heightMeters: 2, horizontalBeyondFarMeters: 1 },
    four_meters: { ...threeQuarterPose, fitSquare: true, heightMeters: 4, horizontalBeyondFarMeters: 2 },
    side: { position: [0.62, 0.12, 0.075], target: [0, 0.018, 0.012] },
    elevated: { position: [0.035, 0.90, 0.1016], target: [0, 0.018, 0.012], up: [1, 0, 0] },
    crown_close: { position: [0.053, 0.039, 0.055], target: [0.011, 0.006, 0] }
});

async function start() {
    const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#plant-canvas'), antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.001, 100);
    const lighting = new GrassDebugV2Lighting({ renderer, scene, camera });
    const controls = new OrbitControls(camera, renderer.domElement); controls.minDistance = 0.012; controls.maxDistance = 3;
    const terrain = { width: 20, depth: 20, centerX: 0, centerZ: 0.1 };
    const [land] = await Promise.all([createGrassDebugV2Land(renderer, terrain), lighting.loadEnvironment()]);
    land.setSurface('brown_mud');
    const surface = createGrassDebugV2DetailedBladeSurface();
    for (const map of [surface.normalMap, surface.roughnessMap]) map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const leafMaterial = createGrassDebugV2Material({ vertexColors: true, normalMap: surface.normalMap, roughnessMap: surface.roughnessMap, roughness: 1 });
    const layout = new URLSearchParams(location.search).get('layout') ?? 'tuft';
    if (!['tuft', 'patch', 'row'].includes(layout)) throw new Error('Unknown plant study layout.');
    const rowLayout = layout === 'row', fieldLayout = layout === 'patch', singleTuftLayout = layout === 'tuft';
    const tuftQuarterPose = { position: [0.30, 0.36, 0.39], target: [0, 0.035, 0.012] };
    const activePoses = singleTuftLayout ? {
        ...poses, three_quarter: tuftQuarterPose,
        side: { position: [0.48, 0.10, 0.09], target: [0, 0.038, 0.012] },
        elevated: { position: [0, 0.78, 0.012], target: [0, 0, 0.012], up: [0, 0, -1] },
        far: { ...poses.far, ...tuftQuarterPose },
        two_meters: { ...poses.two_meters, ...tuftQuarterPose },
        four_meters: { ...poses.four_meters, ...tuftQuarterPose }
    } : poses;
    const plant = createGrassDebugV2PlantRow({ material: leafMaterial, pairs: rowLayout ? 10 : singleTuftLayout ? 2 : 5, sameSide: singleTuftLayout });
    const cards = createGrassDebugV2PlantCards(renderer, plant, { nested: singleTuftLayout });
    const source = plant.getSnapshot();
    const patch = fieldLayout ? createGrassDebugV2PlantPatch(plant, cards) : null;
    const displayed = patch?.getSnapshot() ?? source;
    const sourceTriangles = (displayed.leafTriangles + displayed.crownTriangles).toLocaleString('en-US');
    const lod0 = patch?.lod0 ?? plant.group;
    const representations = patch?.representations ?? Object.freeze({ refined: cards.refined, detailed: cards.detailed, curved: cards.curved, split: cards.split });
    const cardCounts = patch?.getSnapshot().variants ?? cards.getSnapshot().variants;
    for (const [name, counts] of Object.entries(cardCounts)) {
        const button = document.querySelector('[data-mode="' + name + '"]');
        const total = patch ? counts.cardsPerTuft : counts.cards;
        button.textContent = 'LOD3 · ' + total;
        button.title = total + (patch ? ' inclined cards per five-leaf tuft' : ' shared cards for all ' + source.leaves + ' leaves');
    }
    const soil = createGrassDebugV2SoilIntegration({ material: land.ground.material, terrain, rootProfile: 'crown',
        ...(patch ? { rootCenters: patch.roots } : { rootCentersX: plant.roots }) });
    soil.group.visible = ROOT_SOIL_ENABLED;
    land.ground.visible = !ROOT_SOIL_ENABLED;
    scene.add(soil.group, land.ground, lod0, ...Object.values(representations).map(variant => variant.group));
    renderer.domElement.setAttribute('aria-label', singleTuftLayout ? 'One four-leaf grass tuft with two same-side shared-root V pairs comparing LOD0 and LOD3 cards'
        : fieldLayout ? 'Eighty randomly placed five-leaf grass tufts, 400 leaves in a one meter square' : 'Twenty grass leaves comparing LOD0 and LOD3 cards');
    const squareGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 0, -0.5),
        new THREE.Vector3(0.5, 0, 0.5), new THREE.Vector3(-0.5, 0, 0.5)
    ]);
    const squareBounds = new THREE.LineLoop(squareGeometry, new THREE.LineBasicMaterial({
        color: new THREE.Color('#348fff').multiplyScalar(1 / renderer.toneMappingExposure),
        depthTest: false, depthWrite: false, toneMapped: false
    }));
    squareBounds.name = 'GrassV2SquareBounds';
    const displayBounds = new THREE.Box3().setFromObject(lod0);
    squareBounds.position.set((displayBounds.min.x + displayBounds.max.x) / 2, 0.002,
        (displayBounds.min.z + displayBounds.max.z) / 2);
    if (fieldLayout) squareBounds.position.set(0, 0.002, 0);
    squareBounds.renderOrder = 11; squareBounds.visible = false; scene.add(squareBounds);
    const sun = lighting.sun; sun.target.position.set(0, 0, 0); sun.position.copy(sun.target.position).addScaledVector(lighting.sunRef.direction, fieldLayout ? 2 : 0.8);
    sun.shadow.mapSize.set(4096, 4096);
    Object.assign(sun.shadow.camera, { left: -0.35, right: 0.35, bottom: -0.35, top: 0.35, near: 0.01, far: 2 });
    if (fieldLayout) Object.assign(sun.shadow.camera, { left: -0.85, right: 0.85, bottom: -0.85, top: 0.85, far: 4 });
    sun.shadow.camera.updateProjectionMatrix(); sun.shadow.normalBias = 0.0001; sun.shadow.bias = -0.00001;
    renderer.shadowMap.autoUpdate = false; lighting.applyEnvironment(); lighting.resize(innerWidth, innerHeight);
    let mode = 'LOD0';
    const render = () => lighting.render(0);
    const setMode = value => {
        if (value !== 'LOD0' && !Object.hasOwn(representations, value)) throw new Error('Unknown plant representation.');
        mode = value; lod0.visible = mode === 'LOD0';
        for (const [name, variant] of Object.entries(representations)) variant.group.visible = name === mode;
        document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
        document.querySelector('#plant-counts').textContent = mode === 'LOD0' ? `${displayed.leaves} leaves · ${sourceTriangles} tris`
            : `${displayed.leaves} leaves · ${cardCounts[mode].cards} cards · ${cardCounts[mode].triangles} tris`;
        renderer.shadowMap.needsUpdate = true; sun.shadow.needsUpdate = true; render();
    };
    const fitSquareBounds = () => {
        const center = squareBounds.position.clone(), direction = camera.position.clone().sub(controls.target).normalize();
        const inverseRotation = camera.quaternion.clone().invert(), corner = new THREE.Vector3();
        const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tanX = tanY * camera.aspect;
        let distance = camera.position.distanceTo(controls.target);
        for (let i = 0; i < squareGeometry.attributes.position.count; i++) {
            corner.fromBufferAttribute(squareGeometry.attributes.position, i).applyQuaternion(inverseRotation);
            distance = Math.max(distance, corner.z + 1.15 * Math.max(Math.abs(corner.x) / tanX, Math.abs(corner.y) / tanY));
        }
        controls.maxDistance = Math.max(controls.maxDistance, distance);
        controls.target.copy(center); camera.position.copy(center).addScaledVector(direction, distance); controls.update();
    };
    const setPose = name => {
        if (!Object.hasOwn(activePoses, name)) throw new Error('Unknown plant camera.');
        camera.position.fromArray(activePoses[name].position); camera.up.fromArray(activePoses[name].up ?? [0, 1, 0]);
        controls.target.fromArray(activePoses[name].target); camera.lookAt(controls.target); controls.update();
        if (patch && name === 'crown_close') {
            const tuft = lod0.children[0];
            tuft.updateMatrixWorld(true);
            camera.position.x += plant.roots[0]; controls.target.x += plant.roots[0];
            camera.position.applyMatrix4(tuft.matrixWorld); controls.target.applyMatrix4(tuft.matrixWorld);
            controls.update();
        } else if (activePoses[name].fitSquare || fieldLayout) {
            fitSquareBounds();
        }
        if (activePoses[name].heightMeters) {
            // Start from the freshly fitted Far pose so repeated clicks never accumulate offsets.
            const horizontal = camera.position.clone().sub(controls.target).setY(0);
            const distance = horizontal.length() + activePoses[name].horizontalBeyondFarMeters;
            camera.position.copy(controls.target).addScaledVector(horizontal.normalize(), distance);
            camera.position.y = land.ground.position.y + activePoses[name].heightMeters;
            controls.maxDistance = Math.max(controls.maxDistance, camera.position.distanceTo(controls.target));
            controls.update();
        }
        render();
    };
    const setBoundaries = value => { for (const variant of Object.values(representations)) {
        for (const boundary of Array.isArray(variant.boundaries) ? variant.boundaries : [variant.boundaries]) boundary.visible = !!value;
    }
        document.querySelector('#card-bounds').checked = !!value; render(); };
    const setSquareBounds = value => {
        squareBounds.visible = !!value;
        document.querySelector('#square-bounds').checked = !!value;
        if (squareBounds.visible) fitSquareBounds();
        render();
    };
    const setNormalFacing = value => {
        cards.setNormalFacing(value); document.querySelector('#normal-facing').checked = !!value; render();
    };
    const setAlphaCoverage = value => {
        cards.setAlphaCoverage(value); document.querySelector('#alpha-coverage').checked = !!value;
        renderer.shadowMap.needsUpdate = true; sun.shadow.needsUpdate = true; render();
    };
    setPose('three_quarter'); if (fieldLayout) setSquareBounds(true); setMode('LOD0'); await renderer.compileAsync(scene, camera); render();
    controls.addEventListener('change', render);
    document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
    document.querySelectorAll('[data-pose]').forEach(button => button.addEventListener('click', () => setPose(button.dataset.pose)));
    document.querySelector('#card-bounds').addEventListener('change', event => setBoundaries(event.target.checked));
    document.querySelector('#square-bounds').addEventListener('change', event => setSquareBounds(event.target.checked));
    document.querySelector('#normal-facing').addEventListener('change', event => setNormalFacing(event.target.checked));
    document.querySelector('#alpha-coverage').addEventListener('change', event => setAlphaCoverage(event.target.checked));
    document.querySelectorAll('button, input').forEach(element => { element.disabled = false; });
    document.querySelector('#plant-loading').hidden = true;
    addEventListener('resize', () => { renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight, false);
        camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); lighting.resize(innerWidth, innerHeight); render(); });
    const capture = (value, pose, boundaries = false) => { setPose(pose); setBoundaries(boundaries); setMode(value); render(); return renderer.domElement.toDataURL('image/png'); };
    return Object.freeze({ renderer, scene, camera, lighting, controls, plant, cards, patch, soil, squareBounds, capture, setMode, setPose, setBoundaries, setSquareBounds,
        setNormalFacing, setAlphaCoverage,
        getSnapshot: () => ({ mode, layout, ...cards.getSnapshot(), source, poses: activePoses, rootSoilEnabled: ROOT_SOIL_ENABLED, patch: patch?.getSnapshot() ?? null,
            squareBounds: { visible: squareBounds.visible, sizeMeters: 1, center: squareBounds.position.toArray() },
            lighting: lighting.getSnapshot(), land: land.getSnapshot() }) });
}

window.__plantCardsReadiness = start().then(study => { window.__plantCardsStudy = study; return true; }).catch(error => {
    document.querySelector('#plant-loading').textContent = `Failed to load: ${error.message}`;
    throw error;
});
