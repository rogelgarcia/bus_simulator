// src/graphics/assets3d/models/buses/CityBus.js
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { WheelRig } from './components/WheelRig.js';
import { attachBusSkeleton } from '../../../../app/skeletons/buses/BusSkeleton.js';

const TRANSPARENT_BUS = false;
const BUS_BODY_OPACITY = 0.4;
const BUS_LINER_OPACITY = 0.1;
const MODEL_SCALE = 1.15;

const OBJ_URL = new URL(
    '../../../../../assets/city_bus/obj/Obj/Bus.obj',
    import.meta.url
).toString();
const MTL_URL = new URL(
    '../../../../../assets/city_bus/obj/Obj/Bus.mtl',
    import.meta.url
).toString();
const RESOURCE_PATH = new URL(
    '../../../../../assets/city_bus/obj/Obj/',
    import.meta.url
).toString();

let modelPromise = null;
let modelTemplate = null;

function applyShadows(group) {
    group.traverse((o) => {
        if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
        }
    });
}

function loadBusModel() {
    if (modelTemplate) return Promise.resolve(modelTemplate);
    if (!modelPromise) {
        const mtlLoader = new MTLLoader();
        mtlLoader.setResourcePath(RESOURCE_PATH);
        modelPromise = mtlLoader.loadAsync(MTL_URL).then((materials) => {
            materials.preload();
            const objLoader = new OBJLoader();
            objLoader.setMaterials(materials);
            return objLoader.loadAsync(OBJ_URL);
        }).then((model) => {
            modelTemplate = model;
            return modelTemplate;
        }).catch((err) => {
            console.error('Failed to load city bus OBJ', err);
            modelPromise = null;
            modelTemplate = null;
            return null;
        });
    }
    return modelPromise;
}

function applyMaterialSettings(root) {
    root.traverse((o) => {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const mat of mats) {
            if (!mat) continue;
            const name = (mat.name || '').toLowerCase();
            if (mat.map) {
                mat.map.colorSpace = THREE.SRGBColorSpace;
                mat.map.needsUpdate = true;
                if (mat.color) {
                    const max = Math.max(mat.color.r, mat.color.g, mat.color.b);
                    if (max < 0.05) mat.color.set(0xffffff);
                }
            }
            if (name.includes('frontlight') || name === 'lights' || name.includes('sign')) {
                if (mat.color) mat.color.set(0xffffff);
                if (mat.emissive) mat.emissive.set(0xffffff);
                if ('emissiveIntensity' in mat) mat.emissiveIntensity = name.includes('frontlight') ? 0.6 : 0.15;
                if (!mat.userData) mat.userData = {};
                mat.userData.noTune = true;
            }
            if (!TRANSPARENT_BUS) {
                mat.transparent = false;
                mat.opacity = 1.0;
            } else {
                const isGlass = name.includes('glass') || name.includes('window');
                mat.transparent = true;
                mat.opacity = isGlass ? BUS_LINER_OPACITY : BUS_BODY_OPACITY;
            }
            mat.needsUpdate = true;
        }
    });
}

function normalizeModel(root, { targetLength, rideHeight }) {
    root.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    if (size.x > size.z) {
        root.rotation.y = Math.PI / 2;
        root.updateMatrixWorld(true);
        box = new THREE.Box3().setFromObject(root);
    }
    const size2 = box.getSize(new THREE.Vector3());
    const scale = targetLength / Math.max(0.001, size2.z || 1);
    root.scale.setScalar(scale);
    root.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    root.position.x -= center.x;
    root.position.z -= center.z;
    root.position.y += rideHeight - box.min.y;
}

function recenterBody(bus) {
    const skeleton = bus.userData?.bus;
    if (!skeleton?.bodyRoot || !skeleton?.bodyTiltPivot) return;
    const bodyRoot = skeleton.bodyRoot;
    const box = getObjectBoundsLocal(bodyRoot, bodyRoot);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    skeleton.bodyTiltPivot.position.copy(center);
    bodyRoot.position.set(-center.x, -center.y, -center.z);
    skeleton._bodyPivotBase.copy(skeleton.bodyTiltPivot.position);
    skeleton.bodyPivotBase.copy(skeleton._bodyPivotBase);
}

function alignAnchoredBus(bus) {
    const parent = bus.parent;
    if (!parent || parent.userData?.model !== bus) return;
    bus.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(bus);
    if (box.isEmpty()) return;
    bus.position.y -= box.min.y;
}

function makeLightMaterials() {
    const headLightMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.0,
        roughness: 0.18,
        metalness: 0.0
    });

    const brakeLightMat = new THREE.MeshStandardMaterial({
        color: 0x2a0b0b,
        emissive: 0xff2222,
        emissiveIntensity: 0.0,
        roughness: 0.35,
        metalness: 0.0
    });

    return { headLightMat, brakeLightMat };
}

function makeWheelNode(name) {
    const root = new THREE.Group();
    root.name = `${name}_root`;
    const steerPivot = new THREE.Group();
    steerPivot.name = `${name}_steer`;
    const rollPivot = new THREE.Group();
    rollPivot.name = `${name}_roll`;
    root.add(steerPivot);
    steerPivot.add(rollPivot);
    return { root, steerPivot, rollPivot };
}

function collectWheelMeshes(root) {
    const map = { fl: [], fr: [], rl: [], rr: [] };
    root.traverse((o) => {
        if (!o.isMesh) return;
        const name = (o.name || '').toLowerCase();
        const match = name.match(/^(fl|fr|rl|rr)/);
        if (!match) return;
        map[match[1]].push(o);
    });
    return map;
}

function transformBox(box, matrix) {
    if (box.isEmpty()) return new THREE.Box3();
    const out = new THREE.Box3();
    const points = [
        new THREE.Vector3(box.min.x, box.min.y, box.min.z),
        new THREE.Vector3(box.min.x, box.min.y, box.max.z),
        new THREE.Vector3(box.min.x, box.max.y, box.min.z),
        new THREE.Vector3(box.min.x, box.max.y, box.max.z),
        new THREE.Vector3(box.max.x, box.min.y, box.min.z),
        new THREE.Vector3(box.max.x, box.min.y, box.max.z),
        new THREE.Vector3(box.max.x, box.max.y, box.min.z),
        new THREE.Vector3(box.max.x, box.max.y, box.max.z)
    ];
    for (const p of points) {
        p.applyMatrix4(matrix);
        out.expandByPoint(p);
    }
    return out;
}

function getMeshBoundsLocal(root, mesh) {
    if (!mesh.geometry) return new THREE.Box3();
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const localBox = mesh.geometry.boundingBox;
    if (!localBox) return new THREE.Box3();
    root.updateMatrixWorld(true);
    mesh.updateMatrixWorld(true);
    const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(mesh.matrixWorld);
    return transformBox(localBox, toRoot);
}

function getObjectBoundsLocal(root, object) {
    const box = new THREE.Box3();
    object.traverse((o) => {
        if (!o.isMesh) return;
        const localBox = getMeshBoundsLocal(root, o);
        if (!localBox.isEmpty()) box.union(localBox);
    });
    return box;
}

function attachWheelMeshes(bus, wheelNodes, wheelMeshes, rig) {
    const info = {};
    const wheelSpaceRoot = bus.userData?.bus?.wheelsRoot ?? bus;
    bus.updateMatrixWorld(true);

    for (const key of Object.keys(wheelNodes)) {
        const meshes = wheelMeshes[key] ?? [];
        if (!meshes.length) continue;
        const box = new THREE.Box3();
        for (const mesh of meshes) {
            const localBox = getMeshBoundsLocal(wheelSpaceRoot, mesh);
            if (!localBox.isEmpty()) box.union(localBox);
        }
        if (box.isEmpty()) continue;
        const center = box.getCenter(new THREE.Vector3());
        wheelNodes[key].root.position.copy(center);
        info[key] = { meshes, box };
    }

    bus.updateMatrixWorld(true);

    const radii = [];
    for (const key of Object.keys(info)) {
        const node = wheelNodes[key];
        const { meshes, box } = info[key];
        for (const mesh of meshes) node.rollPivot.attach(mesh);
        const size = box.getSize(new THREE.Vector3());
        const radius = Math.max(size.y, size.z) * 0.5;
        if (Number.isFinite(radius) && radius > 0) radii.push(radius);
    }

    if (radii.length) {
        rig.wheelRadius = radii.reduce((a, b) => a + b, 0) / radii.length;
    }
}

export function createCityBus(spec) {
    const width = 2.60 * MODEL_SCALE;
    const height = 3.20 * MODEL_SCALE;
    const length = 12.00 * MODEL_SCALE;

    const wheelR = 0.55 * MODEL_SCALE;
    const wheelW = 0.32 * MODEL_SCALE;

    const axleFront = length * 0.29;
    const axleRear = -length * 0.225;

    const wheelX = (width / 2) + (wheelW / 2) - (0.30 * MODEL_SCALE);

    const rideHeight = wheelR * 1.15;

    const bus = new THREE.Group();
    bus.userData.type = 'bus';
    bus.userData.id = spec.id;
    bus.name = `bus_${spec.id}`;
    let resolveReady = null;
    bus.userData.ready = false;
    bus.userData.readyPromise = new Promise((resolve) => {
        resolveReady = resolve;
    });

    const mats = makeLightMaterials();

    const headGeo = new THREE.BoxGeometry(0.22 * MODEL_SCALE, 0.14 * MODEL_SCALE, 0.08 * MODEL_SCALE);

    const hl = new THREE.Mesh(headGeo, mats.headLightMat);
    hl.name = 'headlight_L';
    hl.position.set(-width * 0.28, rideHeight + (0.22 * MODEL_SCALE), length / 2 - (0.04 * MODEL_SCALE));

    const hr = hl.clone();
    hr.name = 'headlight_R';
    hr.position.x = width * 0.28;

    bus.add(hl, hr);

    const brakeGeo = new THREE.BoxGeometry(0.20 * MODEL_SCALE, 0.12 * MODEL_SCALE, 0.06 * MODEL_SCALE);

    const bl = new THREE.Mesh(brakeGeo, mats.brakeLightMat);
    bl.name = 'brakelight_L';
    bl.position.set(-width * 0.30, rideHeight + (0.32 * MODEL_SCALE), -length / 2 + (0.05 * MODEL_SCALE));

    const br = bl.clone();
    br.name = 'brakelight_R';
    br.position.x = width * 0.30;

    bus.add(bl, br);

    const rig = new WheelRig({ wheelRadius: wheelR });

    const nodes = {
        fr: makeWheelNode('wheel_fr'),
        rr: makeWheelNode('wheel_rr'),
        fl: makeWheelNode('wheel_fl'),
        rl: makeWheelNode('wheel_rl')
    };

    nodes.fl.root.rotation.y = Math.PI;
    nodes.rl.root.rotation.y = Math.PI;
    nodes.fr.root.position.set(wheelX, wheelR, axleFront);
    nodes.rr.root.position.set(wheelX, wheelR, axleRear);
    nodes.fl.root.position.set(-wheelX, wheelR, axleFront);
    nodes.rl.root.position.set(-wheelX, wheelR, axleRear);

    bus.add(nodes.fr.root, nodes.rr.root, nodes.fl.root, nodes.rl.root);

    rig.addWheel({ rollPivot: nodes.fr.rollPivot, steerPivot: nodes.fr.steerPivot, isFront: true });
    rig.addWheel({ rollPivot: nodes.rr.rollPivot, isFront: false });
    rig.addWheel({ rollPivot: nodes.fl.rollPivot, steerPivot: nodes.fl.steerPivot, isFront: true });
    rig.addWheel({ rollPivot: nodes.rl.rollPivot, isFront: false });

    bus.userData.wheelRig = rig;
    bus.userData.parts = {
        headlights: [hl, hr],
        brakeLights: [bl, br]
    };

    attachBusSkeleton(bus, { wheelRig: rig, parts: bus.userData.parts });

    loadBusModel().then((template) => {
        if (!template) return;
        const model = template.clone(true);
        applyMaterialSettings(model);
        normalizeModel(model, { targetLength: length, rideHeight });
        applyShadows(model);
        const skeleton = bus.userData?.bus;
        const bodyRoot = skeleton?.bodyRoot ?? bus;
        bodyRoot.add(model);
        recenterBody(bus);
        bus.updateMatrixWorld(true);
        const wheelMeshes = collectWheelMeshes(model);
        attachWheelMeshes(bus, nodes, wheelMeshes, rig);
        alignAnchoredBus(bus);
    }).finally(() => {
        bus.userData.ready = true;
        if (resolveReady) resolveReady(bus);
    });

    applyShadows(bus);
    return bus;
}
