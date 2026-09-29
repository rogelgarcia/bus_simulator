// Author one upright leaf; explicit paired, row and patch layouts retain the earlier reference studies.
// @ts-check
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GrassDebugV2Lighting } from './GrassDebugV2Lighting.js';
import { createGrassDebugV2Land } from './GrassDebugV2Land.js';
import { createGrassDebugV2Material } from './GrassDebugV2Material.js';
import { createGrassDebugV2DetailedBladeSurface } from './GrassDebugV2DetailedBladeSurface.js';
import { GRASS_V2_SHOOT_APPEARANCE } from './GrassDebugV2ShootAppearance.js';
import { createGrassDebugV2SoilIntegration } from './GrassDebugV2SoilIntegration.js';
import { createGrassDebugV2LeafSoil } from './GrassDebugV2LeafSoil.js';
import { createGrassDebugV2PlantRow } from './GrassDebugV2PlantRow.js';
import { createGrassDebugV2SingleLeaf } from './GrassDebugV2SingleLeaf.js';
import { createGrassDebugV2RibbonShoot } from './GrassDebugV2RibbonShoot.js?v=lod2-color-1';
import { createGrassDebugV2TriangleWireframe } from './GrassDebugV2TriangleWireframe.js';
import { createGrassDebugV2PlantCards } from './GrassDebugV2PlantCards.js';
import { createGrassDebugV2PlantPatch } from './GrassDebugV2PlantPatch.js';
import { createGrassDebugV2Authoring } from './GrassDebugV2Authoring.js';
import { createGrassDebugV2StudyPipeline } from './GrassDebugV2StudyPipeline.js';
import { createGrassDebugV2PatchHover } from './GrassDebugV2PatchHover.js';
import { GrassDebugV2CameraInput } from './GrassDebugV2CameraInput.js';

// Retain the root-contact mesh for authoring, but render the flat terrain for now.
const ROOT_SOIL_ENABLED = false;

const threeQuarterPose = Object.freeze({ position: [0.48, 0.40, 0.54], target: [0, 0.018, 0.012] });
const poses = Object.freeze({
    three_quarter: threeQuarterPose,
    far: { ...threeQuarterPose, fitSquare: true },
    two_meters: { ...threeQuarterPose, fitSquare: true, heightMeters: 2, horizontalBeyondFarMeters: 1 },
    four_meters: { ...threeQuarterPose, fitSquare: true, heightMeters: 4, horizontalBeyondFarMeters: 2 },
    ten_meters_rear: { position: [-0.48, 0.40, -0.516], target: [0, 0.018, 0.012], distanceMeters: 10 },
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
    const requestedLayout = new URLSearchParams(location.search).get('layout') ?? 'leaf';
    const layout = requestedLayout === 'tuft' ? 'leaf' : requestedLayout;
    if (!['leaf', 'shoot', 'paired', 'patch', 'row', 'random'].includes(layout)) throw new Error('Unknown plant study layout.');
    const randomLayout = layout === 'random', shootLayout = layout === 'shoot';
    if (randomLayout) { camera.far = 2000; camera.updateProjectionMatrix(); controls.maxDistance = 150; }
    const terrain = { width: randomLayout ? 100 : 20, depth: randomLayout ? 100 : 20, centerX: 0, centerZ: 0.1 };
    const [land] = await Promise.all([createGrassDebugV2Land(renderer, terrain), lighting.loadEnvironment()]);
    land.setSurface('brown_mud');
    const surface = createGrassDebugV2DetailedBladeSurface(shootLayout ? GRASS_V2_SHOOT_APPEARANCE : undefined);
    for (const map of [surface.normalMap, surface.roughnessMap]) map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const leafMaterial = createGrassDebugV2Material({ vertexColors: true, normalMap: surface.normalMap,
        ...(shootLayout ? { defines: { GRASS_LEAF_TRANSLUCENCY: 1, USE_UV: 1 } } : {}),
        roughnessMap: surface.roughnessMap, roughness: shootLayout ? GRASS_V2_SHOOT_APPEARANCE.roughness : 1,
        normalScale: new THREE.Vector2().setScalar(shootLayout ? GRASS_V2_SHOOT_APPEARANCE.normalStrength : 1) });
    const rowLayout = layout === 'row', fieldLayout = layout === 'patch' || randomLayout, singleTuftLayout = layout === 'paired', singleLeafLayout = layout === 'leaf' || randomLayout;
    document.title = shootLayout ? 'Grass · Leaf Growth' : randomLayout ? 'Grass · 4K Leaf Patch' : singleLeafLayout ? 'Grass · Leaf Study' : 'Grass · Card Study';
    document.querySelector('.plant-study-panel h1').textContent = shootLayout ? 'Leaf Growth · Reference' : randomLayout ? '4K Leaf Patch' : singleLeafLayout ? 'Leaf Study' : 'LOD3 Study';
    const tuftQuarterPose = { position: [0.30, 0.36, 0.39], target: [0, 0.035, 0.012] };
    const leafQuarterPose = { position: [0.24, 0.23, 0.35], target: [0, 0.095, -0.045] };
    const activePoses = shootLayout ? {
        ...poses,
        front: { position: [0.0175, 0.050, 0.17], target: [0.0175, 0.032, 0] },
        three_quarter: { position: [-0.05, 0.050, 0.15], target: [0.0175, 0.032, 0] },
        side: { position: [0.15, 0.05, 0.085], target: [0.0175, 0.032, 0] },
        elevated: { position: [0.0175, 0.19, 0], target: [0.0175, 0.032, 0], up: [0, 0, -1] },
        crown_close: { position: [0.013, 0.03, 0.045], target: [0.035, 0.014, 0] }
    } : singleLeafLayout && !randomLayout ? {
        ...poses, three_quarter: leafQuarterPose,
        side: { position: [0.42, 0.14, -0.045], target: [0, 0.095, -0.045] },
        elevated: { position: [0.01, 0.52, -0.055], target: [0, 0.06, -0.055], up: [0, 0, -1] },
        crown_close: { position: [0.035, 0.034, 0.065], target: [0, 0.012, -0.006] },
        far: { ...poses.far, ...leafQuarterPose },
        two_meters: { ...poses.two_meters, ...leafQuarterPose },
        four_meters: { ...poses.four_meters, ...leafQuarterPose }
    } : singleTuftLayout ? {
        ...poses, three_quarter: tuftQuarterPose,
        side: { position: [0.48, 0.10, 0.09], target: [0, 0.038, 0.012] },
        elevated: { position: [0, 0.78, 0.012], target: [0, 0, 0.012], up: [0, 0, -1] },
        far: { ...poses.far, ...tuftQuarterPose },
        two_meters: { ...poses.two_meters, ...tuftQuarterPose },
        four_meters: { ...poses.four_meters, ...tuftQuarterPose }
    } : poses;
    const generateAssets = (options = {}) => createGrassDebugV2StudyPipeline({ renderer, material: leafMaterial, ground: land.ground,
        rootSoil: { material: land.ground.material, terrain }, shadowDirection: lighting.sunRef.direction, ...options });
    const generated = randomLayout ? await generateAssets() : null;
    const plant = generated?.plant ?? (shootLayout ? createGrassDebugV2RibbonShoot({ material: leafMaterial }) : singleLeafLayout ? createGrassDebugV2SingleLeaf({ material: leafMaterial })
        : createGrassDebugV2PlantRow({ material: leafMaterial, pairs: rowLayout ? 10 : singleTuftLayout ? 2 : 5, sameSide: singleTuftLayout }));
    const cards = shootLayout ? null : generated?.cards ?? createGrassDebugV2PlantCards(renderer, plant, { nested: singleTuftLayout || singleLeafLayout,
        rootSoil: singleLeafLayout ? { material: land.ground.material, terrain } : null });
    const patch = generated?.patch ?? (fieldLayout ? createGrassDebugV2PlantPatch(plant, cards) : null);
    const comparison = generated?.comparison ?? null;
    if (comparison) scene.add(comparison.group);
    const largeField = generated?.largeField ?? null;
    if (largeField) scene.add(largeField.group);
    document.querySelector('#field-cameras').hidden = !largeField;
    const hoverFields = comparison ? [...comparison.getSnapshot().fields.map(field => ({
        ...field, getPatchDetails: () => comparison.getPatchDetails(field.id)
    })), {
        id: 'large-field', x: largeField.bounds.getCenter(new THREE.Vector3()).x,
        z: largeField.bounds.getCenter(new THREE.Vector3()).z, textureLeaves: largeField.getSnapshot().textureLeavesPerSquare,
        widthMeters: largeField.getSnapshot().widthMeters, depthMeters: largeField.getSnapshot().depthMeters,
        get visible() { return largeField.group.visible; },
        getPatchDetails: (x, z) => largeField.getPatchDetails(x, z)
    }] : [];
    const patchHover = comparison ? createGrassDebugV2PatchHover({ canvas: renderer.domElement, camera, fields: hoverFields }) : null;
    document.querySelector('#patch-labels').parentElement.hidden = !comparison;
    const rootSoilEnabled = shootLayout || (singleLeafLayout && !randomLayout) || ROOT_SOIL_ENABLED;
    const soil = singleLeafLayout || shootLayout ? createGrassDebugV2LeafSoil({ material: land.ground.material, terrain })
        : createGrassDebugV2SoilIntegration({ material: land.ground.material, terrain, rootProfile: 'crown',
            ...(patch ? { rootCenters: patch.roots } : { rootCentersX: plant.roots }) });
    if (shootLayout) {
        soil.setRoots(plant.roots.map(x => ({ x, z: 0, scale: 1, burialMeters: 0 })));
        plant.trimAtSoil(soil.getHeightAt);
    }
    const shootLods = shootLayout ? Object.freeze({
        LOD0: plant, ...Object.fromEntries(['LOD0_SMART', 'LOD1', 'LOD2'].map(lod => [lod, createGrassDebugV2RibbonShoot({ material: leafMaterial, lod })]))
    }) : null;
    if (shootLods) for (const lod of ['LOD0_SMART', 'LOD1', 'LOD2']) shootLods[lod].trimAtSoil(soil.getHeightAt);
    const wireframes = Object.fromEntries(Object.entries(shootLods ?? {}).map(([lod, leaf]) =>
        [lod, createGrassDebugV2TriangleWireframe({ meshes: leaf.bakeMeshes })]));
    const source = plant.getSnapshot();
    const perLeafCounts = document.querySelector('#leaf-counts');
    perLeafCounts.hidden = !shootLayout;
    const displayed = patch?.getSnapshot() ?? source;
    const sourceTriangles = (displayed.leafTriangles + displayed.crownTriangles).toLocaleString('en-US');
    const leafLabel = displayed.leaves === 1 ? 'leaf' : 'leaves';
    const lod0 = patch?.lod0 ?? plant.group;
    const representations = shootLayout ? Object.freeze(Object.fromEntries(['LOD0_SMART', 'LOD1', 'LOD2'].map(lod => [lod, { group: shootLods[lod].group, boundaries: [] }]))) : patch?.representations ?? (cards ? Object.freeze({ refined: cards.refined, detailed: cards.detailed, curved: cards.curved, split: cards.split }) : Object.freeze({}));
    const cardCounts = patch?.getSnapshot().variants ?? cards?.getSnapshot().variants ?? {};
    for (const [name, counts] of Object.entries(cardCounts)) {
        const button = document.querySelector('[data-mode="' + name + '"]');
        const total = patch ? counts.cardsPerTuft : counts.cards;
        button.textContent = 'LOD3 · ' + total;
        button.title = total + (randomLayout ? ' cards per leaf' : patch ? ' inclined cards per five-leaf tuft' : ' cards for ' + source.leaves + (source.leaves === 1 ? ' leaf' : ' leaves'));
    }
    soil.group.visible = rootSoilEnabled;
    land.ground.visible = !rootSoilEnabled;
    scene.add(soil.group, land.ground, lod0, ...Object.values(representations).map(variant => variant.group));
    renderer.domElement.setAttribute('aria-label', shootLayout ? 'A straight reference leaf on the left and two outward-inclined blades on the right, emerging directly from the soil without a sheath or axial twist' : randomLayout ? 'Eight grass comparison squares and a 20 m wide, 30 m deep field with a 4K grass texture and 1K live leaves per square metre' : singleLeafLayout ? 'One upright grass leaf for LOD0 shape authoring' : singleTuftLayout ? 'One four-leaf grass tuft with two same-side shared-root V pairs comparing LOD0 and LOD3 cards'
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
    if (comparison) {
        sun.target.position.copy(comparison.bounds.getCenter(new THREE.Vector3())).setY(0);
        sun.position.copy(sun.target.position).addScaledVector(lighting.sunRef.direction, 5);
        Object.assign(sun.shadow.camera, { left: -2.2, right: 2.2, bottom: -2.2, top: 2.2, far: 9 });
    }
    if (shootLayout) Object.assign(sun.shadow.camera, { left: -0.08, right: 0.08, bottom: -0.08, top: 0.08 });
    sun.shadow.camera.updateProjectionMatrix(); sun.shadow.normalBias = shootLayout ? 0 : 0.0001; sun.shadow.bias = shootLayout ? -0.00008 : -0.00001;
    renderer.shadowMap.autoUpdate = false; lighting.applyEnvironment(); lighting.resize(innerWidth, innerHeight);
    let mode = 'LOD0', authoring = null, fieldFocused = false;
    const render = () => { authoring?.updateOverlay(); comparison?.updateLabels(camera, renderer.domElement); patchHover?.update(); lighting.render(0); };
    const setMode = value => {
        if (value !== 'LOD0' && !Object.hasOwn(representations, value)) throw new Error('Unknown plant representation.');
        mode = value; const editing = authoring?.hasStarted();
        lod0.visible = !editing && mode === 'LOD0';
        for (const [name, variant] of Object.entries(representations)) variant.group.visible = !editing && name === mode;
        authoring?.setMode(mode); comparison?.setMode(mode); largeField?.setMode(mode);
        if (largeField) {
            const field = largeField.getSnapshot();
            document.querySelector('#field-counts').textContent = [
                ...field.lods.map(lod => lod.label + ': ' + lod.leaves.toLocaleString('en-US') + ' leaves · ' + lod.triangles.toLocaleString('en-US') + ' tris'),
                'Floor: ' + field.floorTriangles.toLocaleString('en-US') + ' tris'
            ].join('\n');
        }
        soil.group.visible = rootSoilEnabled && (shootLayout || mode === 'LOD0');
        land.ground.visible = !soil.group.visible;
        document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
        const authored = authoring?.getCounts();
        const shoot = shootLods?.[mode].getSnapshot();
        if (shoot) {
            document.querySelector('.plant-study-panel h1').textContent = 'Leaf Growth · ' + (mode === 'LOD0' ? 'Reference' : mode === 'LOD0_SMART' ? 'LOD0' : mode);
            perLeafCounts.textContent = shoot.trianglesPerLeaf
                .map((count, index) => ['Single leaf', 'Pair left', 'Pair right'][index] + ': ' + count + ' tris').join('\n');
        }
        document.querySelector('#plant-counts').textContent = shoot ? shoot.leaves + ' leaves · ' + shoot.leafTriangles + ' tris' : authored
            ? (mode === 'LOD0' ? `${authored.leaves} ${authored.leaves === 1 ? 'leaf' : 'leaves'} · ${authored.triangles.toLocaleString('en-US')} tris`
                : `${authored.leaves} ${authored.leaves === 1 ? 'leaf' : 'leaves'} · ${authored.cards} cards · ${authored.triangles} tris`)
            : (mode === 'LOD0' ? `${displayed.leaves} ${leafLabel} · ${sourceTriangles} tris`
                : `${displayed.leaves} ${leafLabel} · ${cardCounts[mode].cards} cards · ${cardCounts[mode].triangles} tris`);
        renderer.shadowMap.needsUpdate = true; sun.shadow.needsUpdate = true; render();
    };
    const fitSquareBounds = (requestedBounds = null) => {
        const fitBounds = requestedBounds ?? comparison?.bounds ?? new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5),
            new THREE.Vector3(0.5, randomLayout ? displayed.bounds.max[1] : 0, 0.5));
        const center = requestedBounds || comparison ? fitBounds.getCenter(new THREE.Vector3()) : squareBounds.position.clone();
        const direction = camera.position.clone().sub(controls.target).normalize();
        const inverseRotation = camera.quaternion.clone().invert(), corner = new THREE.Vector3();
        const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tanX = tanY * camera.aspect;
        let distance = camera.position.distanceTo(controls.target);
        for (const x of [fitBounds.min.x, fitBounds.max.x]) for (const y of [fitBounds.min.y, fitBounds.max.y]) for (const z of [fitBounds.min.z, fitBounds.max.z]) {
            corner.set(x, y, z); if (requestedBounds || comparison) corner.sub(center);
            corner.applyQuaternion(inverseRotation);
            distance = Math.max(distance, corner.z + 1.15 * Math.max(Math.abs(corner.x) / tanX, Math.abs(corner.y) / tanY));
        }
        controls.maxDistance = Math.max(controls.maxDistance, distance);
        controls.target.copy(center); camera.position.copy(center).addScaledVector(direction, distance); controls.update();
    };
    const focusShadows = field => {
        if (!largeField || fieldFocused === field) return;
        fieldFocused = field;
        const targetBounds = field ? largeField.bounds : comparison.bounds;
        sun.target.position.copy(targetBounds.getCenter(new THREE.Vector3())).setY(0);
        sun.position.copy(sun.target.position).addScaledVector(lighting.sunRef.direction, field ? 45 : 5);
        const radius = field ? targetBounds.getSize(new THREE.Vector3()).length() * 0.55 : 2.2;
        Object.assign(sun.shadow.camera, { left: -radius, right: radius, bottom: -radius, top: radius, far: field ? 90 : 9 });
        sun.shadow.camera.updateProjectionMatrix(); renderer.shadowMap.needsUpdate = true; sun.shadow.needsUpdate = true;
    };
    const setFieldPose = name => {
        if (!largeField || !['overview', 'top', 'two_meters', 'four_meters'].includes(name)) throw new Error('Unknown field camera.');
        camera.near = 0.1; camera.updateProjectionMatrix();
        const center = largeField.bounds.getCenter(new THREE.Vector3());
        camera.up.set(0, 1, 0);
        if (name === 'overview' || name === 'top') {
            controls.target.copy(center);
            if (name === 'top') { camera.up.set(0, 0, -1); camera.position.copy(center).add(new THREE.Vector3(0, 1, 0)); }
            else camera.position.copy(center).add(new THREE.Vector3(0.8, 0.7, 1));
            camera.lookAt(controls.target); controls.update(); fitSquareBounds(largeField.bounds);
        } else {
            controls.target.set(center.x, 0.05, largeField.bounds.max.z - 6);
            camera.position.set(center.x + 4, name === 'two_meters' ? 2 : 4, largeField.bounds.max.z + 3);
            camera.lookAt(controls.target); controls.update();
        }
        focusShadows(true);
        document.querySelectorAll('[data-field-pose]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.fieldPose === name)));
        render();
    };
    const setPose = name => {
        camera.near = 0.001; camera.updateProjectionMatrix();
        focusShadows(false);
        document.querySelectorAll('[data-field-pose]').forEach(button => button.setAttribute('aria-pressed', 'false'));
        if (!Object.hasOwn(activePoses, name)) throw new Error('Unknown plant camera.');
        camera.position.fromArray(activePoses[name].position); camera.up.fromArray(activePoses[name].up ?? [0, 1, 0]);
        controls.target.fromArray(activePoses[name].target); camera.lookAt(controls.target); controls.update();
        if (randomLayout && name === 'crown_close') {
            const matrix = new THREE.Matrix4(); lod0.children[0].getMatrixAt(0, matrix);
            camera.position.applyMatrix4(matrix); controls.target.applyMatrix4(matrix); controls.update();
        } else if (patch && name === 'crown_close') {
            const tuft = lod0.children[0];
            tuft.updateMatrixWorld(true);
            camera.position.x += plant.roots[0]; controls.target.x += plant.roots[0];
            camera.position.applyMatrix4(tuft.matrixWorld); controls.target.applyMatrix4(tuft.matrixWorld);
            controls.update();
        } else if (!activePoses[name].distanceMeters && (activePoses[name].fitSquare || fieldLayout)) {
            fitSquareBounds();
        }
        if (activePoses[name].distanceMeters) {
            const direction = camera.position.clone().sub(controls.target).normalize();
            if (comparison) controls.target.copy(comparison.bounds.getCenter(new THREE.Vector3()));
            controls.maxDistance = Math.max(controls.maxDistance, activePoses[name].distanceMeters);
            camera.position.copy(controls.target).addScaledVector(direction, activePoses[name].distanceMeters);
            controls.update();
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
        authoring?.setBoundaries(value);
        document.querySelector('#card-bounds').checked = !!value; render(); };
    const setSquareBounds = value => {
        squareBounds.visible = !!value; comparison?.setSquareBounds(!!value); largeField?.setSquareBounds(!!value);
        document.querySelector('#square-bounds').checked = !!value;
        if (squareBounds.visible) fitSquareBounds(fieldFocused ? largeField.bounds : null);
        render();
    };
    const setFieldVisible = value => {
        largeField?.setVisible(value);
        document.querySelector('#field-visible').checked = !!value;
        renderer.shadowMap.needsUpdate = true; sun.shadow.needsUpdate = true; render();
    };
    const setWireframe = value => {
        Object.values(wireframes).forEach(wireframe => wireframe.setVisible(value));
        document.querySelector('#leaf-wireframe').checked = !!value; render();
    };
    const setNormalFacing = value => {
        cards?.setNormalFacing(value); if (randomLayout) patch.setNormalFacing(value); comparison?.setNormalFacing(value); document.querySelector('#normal-facing').checked = !!value; render();
    };
    const setAlphaCoverage = value => {
        cards?.setAlphaCoverage(value); if (randomLayout) patch.setAlphaCoverage(value); comparison?.setAlphaCoverage(value); document.querySelector('#alpha-coverage').checked = !!value;
        renderer.shadowMap.needsUpdate = true; sun.shadow.needsUpdate = true; render();
    };
    setPose(shootLayout ? 'front' : 'three_quarter'); setSquareBounds(false); setMode(randomLayout ? 'refined' : 'LOD0'); await renderer.compileAsync(scene, camera); render();
    controls.addEventListener('change', render);
    document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
    document.querySelectorAll('[data-pose]').forEach(button => button.addEventListener('click', () => setPose(button.dataset.pose)));
    document.querySelectorAll('[data-field-pose]').forEach(button => button.addEventListener('click', () => setFieldPose(button.dataset.fieldPose)));
    document.querySelector('#field-visible').addEventListener('change', event => setFieldVisible(event.target.checked));
    document.querySelector('#leaf-wireframe').addEventListener('change', event => setWireframe(event.target.checked));
    document.querySelector('#card-bounds').addEventListener('change', event => setBoundaries(event.target.checked));
    document.querySelector('#square-bounds').addEventListener('change', event => setSquareBounds(event.target.checked));
    document.querySelector('#patch-labels').addEventListener('change', event => { comparison?.setLabelsVisible(event.target.checked); render(); });
    document.querySelector('#normal-facing').addEventListener('change', event => setNormalFacing(event.target.checked));
    document.querySelector('#alpha-coverage').addEventListener('change', event => setAlphaCoverage(event.target.checked));
    document.querySelectorAll('.plant-study-panel button, .plant-study-panel input').forEach(element => { element.disabled = false; });
    if (shootLayout) {
        document.querySelector('#leaf-wireframe').parentElement.hidden = false;
        document.querySelector('[data-pose="front"]').hidden = false;
        document.querySelector('[data-mode="LOD0"]').textContent = 'Reference';
        for (const lod of ['LOD0_SMART', 'LOD1', 'LOD2']) document.querySelector('[data-mode="' + lod + '"]').hidden = false;
        document.querySelectorAll('[data-mode]:not([data-mode="LOD0"]):not([data-mode="LOD1"]):not([data-mode="LOD2"]):not([data-mode="LOD0_SMART"])').forEach(button => { button.hidden = true; button.disabled = true; });
        document.querySelector('[aria-label="LOD3 corrections"]').hidden = true;
        document.querySelector('#card-bounds').parentElement.hidden = true;
    }
    document.querySelector('#plant-loading').hidden = true;
    const resizeViewport = () => {
        const { width, height } = renderer.domElement.getBoundingClientRect();
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(width, height, false);
        camera.aspect = width / height; camera.updateProjectionMatrix(); lighting.resize(width, height); render();
    };
    if (!randomLayout && (singleTuftLayout || singleLeafLayout)) authoring = createGrassDebugV2Authoring({
        scene, camera, renderer, controls, plant, cards, squareBounds,
        sourceObjects: [lod0, ...Object.values(representations).map(variant => variant.group)],
        render, onChange: () => {
            if (singleLeafLayout && authoring?.hasStarted()) soil.setRoots(authoring.exportConfiguration().tufts.map(tuft => ({
                x: tuft.position[0], z: tuft.position[2], scale: tuft.scale, burialMeters: tuft.burialMeters
            })));
            setMode(mode);
        },
        onOpen: () => {
            sun.target.position.copy(squareBounds.position).setY(0);
            sun.position.copy(sun.target.position).addScaledVector(lighting.sunRef.direction, 2);
            Object.assign(sun.shadow.camera, { left: -1.2, right: 1.2, bottom: -1.2, top: 1.2, near: 0.01, far: 4 });
            sun.shadow.camera.updateProjectionMatrix();
            renderer.shadowMap.needsUpdate = true; sun.shadow.needsUpdate = true;
            resizeViewport(); fitSquareBounds();
        }
    });
    const cameraMovement = new GrassDebugV2CameraInput({
        camera, minHeight: 0.01,
        get enabled() { return controls.enabled && !document.body.classList.contains('grass-authoring-open'); },
        panWorld: (x, y, z) => { camera.position.add(new THREE.Vector3(x, y, z)); controls.target.add(new THREE.Vector3(x, y, z)); controls.update(); }
    }, { speed: 0.6, horizontal: true });
    let movementFrame = 0, lastMovementTime = performance.now();
    const updateMovement = now => {
        cameraMovement.update(Math.min(0.05, (now - lastMovementTime) / 1000)); lastMovementTime = now;
        movementFrame = requestAnimationFrame(updateMovement);
    };
    movementFrame = requestAnimationFrame(updateMovement);
    window.addEventListener('pagehide', () => { cancelAnimationFrame(movementFrame); cameraMovement.dispose(); patchHover?.dispose(); Object.values(wireframes).forEach(wireframe => wireframe.dispose()); generated?.dispose(); if (shootLayout) Object.values(shootLods).forEach(leaf => leaf.dispose()); }, { once: true });
    const resizeObserver = new ResizeObserver(resizeViewport); resizeObserver.observe(renderer.domElement);
    addEventListener('resize', resizeViewport); render();
    const capture = (value, pose, boundaries = false) => { setPose(pose); setBoundaries(boundaries); setMode(value); render(); return renderer.domElement.toDataURL('image/png'); };
    return Object.freeze({ renderer, scene, camera, lighting, controls, cameraMovement, plant, shootLods, cards, patch, comparison, largeField, soil, squareBounds, capture, setMode, setPose, setFieldPose, setFieldVisible, setBoundaries, setSquareBounds,
        setNormalFacing, setAlphaCoverage, setWireframe, authoring, generateAssets, pipeline: generated?.pipeline ?? null,
        getSnapshot: () => ({ mode, layout, wireframe: wireframes[mode]?.getSnapshot() ?? null, pipeline: generated?.pipeline.getSnapshot() ?? null, largeField: largeField?.getSnapshot() ?? null, comparison: comparison?.getSnapshot() ?? null, authoring: authoring?.getSnapshot() ?? null, ...(cards?.getSnapshot() ?? { specimens: source.specimens, sourceLeaves: source.leaves, variants: {} }), source: shootLods?.[mode].getSnapshot() ?? source, poses: activePoses, rootSoilEnabled: soil.group.visible, patch: patch?.getSnapshot() ?? null,
            squareBounds: { visible: squareBounds.visible, sizeMeters: 1, center: squareBounds.position.toArray() },
            lighting: lighting.getSnapshot(), land: land.getSnapshot() }) });
}

window.__plantCardsReadiness = start().then(study => { window.__plantCardsStudy = study; return true; }).catch(error => {
    document.querySelector('#plant-loading').textContent = `Failed to load: ${error.message}`;
    throw error;
});
