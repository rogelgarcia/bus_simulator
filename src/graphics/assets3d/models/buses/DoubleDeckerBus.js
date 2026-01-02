// src/graphics/assets3d/models/buses/DoubleDeckerBus.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createBusWheel } from './components/BusWheel.js';
import { WheelRig } from './components/WheelRig.js';
import { attachBusSkeleton } from '../../../../app/skeletons/buses/BusSkeleton.js';

const BUS_BODY_COLOR = 0xff0000;
const CITY_TARGET_LENGTH = 12.0 * 1.15;
const COACH_TARGET_LENGTH = 13.2;
const TARGET_LENGTH = (CITY_TARGET_LENGTH + COACH_TARGET_LENGTH) * 0.5;
const DEFAULT_WIDTH = 2.7;
const DEFAULT_WHEEL_RADIUS = 0.55;
const DEFAULT_WHEEL_WIDTH = 0.30;
const MODEL_YAW = 0;

const MODEL_URL = new URL(
    '../../../../../assets/double_decker_bus/dd_bus.glb',
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

function cloneMaterials(root) {
    root.traverse((o) => {
        if (!o.isMesh) return;
        if (Array.isArray(o.material)) {
            o.material = o.material.map((mat) => (mat ? mat.clone() : mat));
        } else if (o.material) {
            o.material = o.material.clone();
        }
    });
}

function loadBusModel() {
    if (modelTemplate) return Promise.resolve(modelTemplate);
    if (!modelPromise) {
        const loader = new GLTFLoader();
        modelPromise = loader.loadAsync(MODEL_URL).then((gltf) => {
            modelTemplate = gltf.scene;
            return modelTemplate;
        }).catch((err) => {
            console.error('Failed to load double decker GLB', err);
            modelPromise = null;
            modelTemplate = null;
            return null;
        });
    }
    return modelPromise;
}

function applyMaterialSettings(root) {
    const bodyColor = new THREE.Color(BUS_BODY_COLOR);
    root.traverse((o) => {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const mat of mats) {
            if (!mat) continue;
            const name = (mat.name || '').toLowerCase();
            if (mat.map) {
                mat.map.colorSpace = THREE.SRGBColorSpace;
                mat.map.needsUpdate = true;
            }
            if (mat.emissiveMap) {
                mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
                mat.emissiveMap.needsUpdate = true;
            }

            const isGlass = name.includes('glass');
            const isMirror = name.includes('mirror');
            const isBody = name.includes('dubledecker-body') || name.includes('dubledecker-red');

            if (isBody) {
                mat.color.set(bodyColor);
                mat.metalness = 0.12;
                mat.roughness = 0.62;
            }
            if (isGlass) {
                mat.color.set(0x1b1f24);
                mat.metalness = 0.0;
                mat.roughness = 0.28;
            }
            if (isMirror) {
                mat.metalness = 0.6;
                mat.roughness = 0.25;
            }

            mat.transparent = false;
            mat.opacity = 1.0;
            mat.needsUpdate = true;
        }
    });
}

function hasWheelToken(value) {
    return value.includes('wheel') || value.includes('tire') || value.includes('tyre') || value.includes('d_bus_');
}

function isBodyMesh(mesh) {
    const name = (mesh.name || '').toLowerCase();
    if (hasWheelToken(name)) return false;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    let hasBody = false;
    for (const mat of mats) {
        const matName = (mat?.name || '').toLowerCase();
        if (hasWheelToken(matName)) return false;
        if (matName.includes('dubledecker-body') || matName.includes('dubledecker-red') || matName.includes('dubledecker-glass')) {
            hasBody = true;
        }
    }
    return hasBody;
}

function getBodyBounds(root) {
    const box = new THREE.Box3();
    root.updateMatrixWorld(true);
    root.traverse((o) => {
        if (!o.isMesh) return;
        if (!isBodyMesh(o)) return;
        box.expandByObject(o);
    });
    return box;
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

function getBodyBoundsLocal(root, model) {
    const worldBox = new THREE.Box3();
    model.updateMatrixWorld(true);
    model.traverse((o) => {
        if (!o.isMesh) return;
        if (!isBodyMesh(o)) return;
        worldBox.expandByObject(o);
    });
    if (worldBox.isEmpty()) return worldBox;
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    return transformBox(worldBox, inv);
}

function getObjectBoundsLocal(root, object) {
    const worldBox = new THREE.Box3().setFromObject(object);
    if (worldBox.isEmpty()) return worldBox;
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    return transformBox(worldBox, inv);
}

function normalizeModel(root, targetLength) {
    root.updateMatrixWorld(true);
    let box = getBodyBounds(root);
    if (box.isEmpty()) box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    if (size.x > size.z) {
        root.rotation.y = Math.PI / 2;
        root.updateMatrixWorld(true);
        box = getBodyBounds(root);
        if (box.isEmpty()) box = new THREE.Box3().setFromObject(root);
    }
    const size2 = box.getSize(new THREE.Vector3());
    const scale = targetLength / Math.max(0.001, size2.z || 1);
    root.scale.setScalar(scale);
    root.updateMatrixWorld(true);
    box = getBodyBounds(root);
    if (box.isEmpty()) box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    root.position.x -= center.x;
    root.position.z -= center.z;
}

function collectWheelGroups(root) {
    const groups = new Set();
    root.traverse((o) => {
        if (!o.isMesh) return;
        const name = (o.name || '').toLowerCase();
        const parentName = (o.parent?.name || '').toLowerCase();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const matName = mats.map((m) => m?.name ?? '').join(' ').toLowerCase();
        if (hasWheelToken(name) || hasWheelToken(parentName) || hasWheelToken(matName)) {
            groups.add(o.parent ?? o);
        }
    });
    return Array.from(groups);
}

function alignModelToGround(root, wheelGroups) {
    root.updateMatrixWorld(true);
    let minY = null;
    if (wheelGroups.length) {
        const box = new THREE.Box3();
        for (const group of wheelGroups) {
            box.setFromObject(group);
            if (box.isEmpty()) continue;
            minY = minY === null ? box.min.y : Math.min(minY, box.min.y);
        }
    }
    if (minY === null) {
        const box = new THREE.Box3().setFromObject(root);
        if (box.isEmpty()) return;
        minY = box.min.y;
    }
    root.position.y -= minY;
}

function collectMeshesByMaterial(root, token) {
    const out = [];
    const t = token.toLowerCase();
    root.traverse((o) => {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const mat of mats) {
            const name = (mat?.name ?? '').toLowerCase();
            if (name.includes(t)) {
                out.push(o);
                break;
            }
        }
    });
    return out;
}

function setEmissive(meshes, color) {
    for (const mesh of meshes) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
            if (!mat || mat.emissive === undefined) continue;
            mat.emissive.set(color);
            mat.emissiveIntensity = 0.0;
            mat.needsUpdate = true;
        }
    }
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

function positionLightMeshes(lights, { width, length, wheelRadius, frontZ = null, rearZ = null }) {
    const rideHeight = wheelRadius * 1.15;
    const front = Number.isFinite(frontZ) ? frontZ : length / 2;
    const rear = Number.isFinite(rearZ) ? rearZ : -length / 2;
    lights.hl.position.set(-width * 0.28, rideHeight + 0.22, front - 0.04);
    lights.hr.position.set(width * 0.28, rideHeight + 0.22, front - 0.04);
    lights.bl.position.set(-width * 0.30, rideHeight + 0.32, rear + 0.05);
    lights.br.position.set(width * 0.30, rideHeight + 0.32, rear + 0.05);
}

function createLightMeshes({ width, length, wheelRadius }, mats) {
    const headGeo = new THREE.BoxGeometry(0.22, 0.14, 0.08);
    const hl = new THREE.Mesh(headGeo, mats.headLightMat);
    hl.name = 'headlight_L';
    const hr = hl.clone();
    hr.name = 'headlight_R';

    const brakeGeo = new THREE.BoxGeometry(0.20, 0.12, 0.06);
    const bl = new THREE.Mesh(brakeGeo, mats.brakeLightMat);
    bl.name = 'brakelight_L';
    const br = bl.clone();
    br.name = 'brakelight_R';

    const lights = { hl, hr, bl, br };
    positionLightMeshes(lights, { width, length, wheelRadius });
    return lights;
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

function attachWheelGroups(bus, wheelGroups, rig) {
    if (!wheelGroups.length) return null;
    bus.updateMatrixWorld(true);

    const wheelsRoot = bus.userData?.bus?.wheelsRoot ?? bus;
    wheelsRoot.updateMatrixWorld(true);

    const data = [];
    const box = new THREE.Box3();
    for (const group of wheelGroups) {
        box.setFromObject(group);
        if (box.isEmpty()) continue;
        const centerWorld = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const centerLocal = wheelsRoot.worldToLocal(centerWorld.clone());
        data.push({ group, centerLocal, size });
    }
    if (!data.length) return null;

    const radii = data.map((d) => Math.max(d.size.x, d.size.y, d.size.z) * 0.5);
    const avgRadius = radii.reduce((a, b) => a + b, 0) / radii.length;
    const maxZ = Math.max(...data.map((d) => d.centerLocal.z));
    const minZ = Math.min(...data.map((d) => d.centerLocal.z));
    const zTol = Math.max(0.01, avgRadius * 0.6);

    const frontSet = new Set(data.filter((d) => Math.abs(d.centerLocal.z - maxZ) <= zTol));
    const rearSet = new Set(data.filter((d) => Math.abs(d.centerLocal.z - minZ) <= zTol));

    for (const item of data) {
        const side = item.centerLocal.x >= 0 ? 'r' : 'l';
        const isFront = frontSet.has(item);
        const axle = isFront ? 'front' : (rearSet.has(item) ? 'rear' : 'mid');
        const node = makeWheelNode(`wheel_${axle}_${side}`);
        if (side === 'l') node.root.rotation.y = Math.PI;
        wheelsRoot.add(node.root);
        node.root.position.copy(item.centerLocal);
        node.rollPivot.attach(item.group);
        rig.addWheel({
            rollPivot: node.rollPivot,
            steerPivot: isFront ? node.steerPivot : null,
            isFront
        });
    }

    if (Number.isFinite(avgRadius) && avgRadius > 0) rig.wheelRadius = avgRadius;
    return { wheelRadius: avgRadius };
}

function hideWheelMeshes(root) {
    root.traverse((o) => {
        if (!o.isMesh) return;
        const name = (o.name || '').toLowerCase();
        const parentName = (o.parent?.name || '').toLowerCase();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const matName = mats.map((m) => m?.name ?? '').join(' ').toLowerCase();
        if (hasWheelToken(name) || hasWheelToken(parentName) || hasWheelToken(matName)) o.visible = false;
    });
}

function removeWheelMeshes(root) {
    const toRemove = [];
    root.traverse((o) => {
        if (!o.isMesh) return;
        const name = (o.name || '').toLowerCase();
        const parentName = (o.parent?.name || '').toLowerCase();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const matName = mats.map((m) => m?.name ?? '').join(' ').toLowerCase();
        if (hasWheelToken(name) || hasWheelToken(parentName) || hasWheelToken(matName)) toRemove.push(o);
    });
    for (const mesh of toRemove) {
        if (mesh.parent) mesh.parent.remove(mesh);
    }
}

function addProceduralWheels(bus, rig, { width, length, wheelRadius }) {
    const wheelR = wheelRadius ?? DEFAULT_WHEEL_RADIUS;
    const wheelW = DEFAULT_WHEEL_WIDTH;
    const axleFront = length * 0.28;
    const axleRear = -length * 0.28;
    const wheelX = (width / 2) - (wheelW / 2) + 0.02;

    const wheelsRoot = bus.userData?.bus?.wheelsRoot ?? bus;

    const wFR = createBusWheel({ radius: wheelR, width: wheelW });
    wFR.root.position.set(wheelX, wheelR, axleFront);
    wheelsRoot.add(wFR.root);
    rig.addWheel({ rollPivot: wFR.rollPivot, steerPivot: wFR.steerPivot, isFront: true });

    const wRR = createBusWheel({ radius: wheelR, width: wheelW });
    wRR.root.position.set(wheelX, wheelR, axleRear);
    wheelsRoot.add(wRR.root);
    rig.addWheel({ rollPivot: wRR.rollPivot, isFront: false });

    const wFL = createBusWheel({ radius: wheelR, width: wheelW });
    wFL.root.position.set(-wheelX, wheelR, axleFront);
    wFL.root.rotation.y = Math.PI;
    wheelsRoot.add(wFL.root);
    rig.addWheel({ rollPivot: wFL.rollPivot, steerPivot: wFL.steerPivot, isFront: true });

    const wRL = createBusWheel({ radius: wheelR, width: wheelW });
    wRL.root.position.set(-wheelX, wheelR, axleRear);
    wRL.root.rotation.y = Math.PI;
    wheelsRoot.add(wRL.root);
    rig.addWheel({ rollPivot: wRL.rollPivot, isFront: false });
}

function recenterBody(bus, bounds = null) {
    const skeleton = bus.userData?.bus;
    if (!skeleton?.bodyRoot || !skeleton?.bodyTiltPivot) return;
    const bodyRoot = skeleton.bodyRoot;
    let box = bounds;
    if (!box || box.isEmpty()) box = getObjectBoundsLocal(bodyRoot, bodyRoot);
    if (!box || box.isEmpty()) return;
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

export function createDoubleDeckerBus(spec) {
    const bus = new THREE.Group();
    bus.userData.type = 'bus';
    bus.userData.id = spec.id;
    bus.name = `bus_${spec.id}`;
    let resolveReady = null;
    bus.userData.ready = false;
    bus.userData.readyPromise = new Promise((resolve) => {
        resolveReady = resolve;
    });

    const rig = new WheelRig({ wheelRadius: DEFAULT_WHEEL_RADIUS });
    bus.userData.wheelRig = rig;

    const mats = makeLightMaterials();
    const lights = createLightMeshes(
        { width: DEFAULT_WIDTH, length: TARGET_LENGTH, wheelRadius: DEFAULT_WHEEL_RADIUS },
        mats
    );

    lights.hl.visible = false;
    lights.hr.visible = false;
    lights.bl.visible = false;
    lights.br.visible = false;
    bus.add(lights.hl, lights.hr, lights.bl, lights.br);

    bus.userData.parts = {
        headlights: [lights.hl, lights.hr],
        brakeLights: [lights.bl, lights.br]
    };

    attachBusSkeleton(bus, { wheelRig: rig, parts: bus.userData.parts });

    loadBusModel().then((template) => {
        if (!template) return;
        const model = template.clone(true);
        cloneMaterials(model);
        applyMaterialSettings(model);
        normalizeModel(model, TARGET_LENGTH);
        model.rotation.y += MODEL_YAW;
        model.updateMatrixWorld(true);
        const wheelGroups = collectWheelGroups(model);
        alignModelToGround(model, wheelGroups);
        applyShadows(model);

        const skeleton = bus.userData?.bus;
        const bodyRoot = skeleton?.bodyRoot ?? bus;
        bodyRoot.add(model);
        const bodyBoundsLocal = getBodyBoundsLocal(bodyRoot, model);
        const localBounds = bodyBoundsLocal.isEmpty()
            ? getObjectBoundsLocal(bodyRoot, model)
            : bodyBoundsLocal;
        recenterBody(bus, localBounds);
        bus.updateMatrixWorld(true);

        const wheelsAttached = attachWheelGroups(bus, wheelGroups, rig);
        if (!wheelsAttached) {
            hideWheelMeshes(model);
            removeWheelMeshes(model);
            const size = localBounds.getSize(new THREE.Vector3());
            addProceduralWheels(bus, rig, {
                width: size.x || DEFAULT_WIDTH,
                length: size.z || TARGET_LENGTH,
                wheelRadius: rig.wheelRadius || DEFAULT_WHEEL_RADIUS
            });
        }

        const localSize = localBounds.getSize(new THREE.Vector3());
        positionLightMeshes(lights, {
            width: localSize.x || DEFAULT_WIDTH,
            length: localSize.z || TARGET_LENGTH,
            wheelRadius: rig.wheelRadius || DEFAULT_WHEEL_RADIUS,
            frontZ: localBounds.max.z,
            rearZ: localBounds.min.z
        });

        const headMeshes = collectMeshesByMaterial(model, 'bulb');
        setEmissive(headMeshes, 0xffffff);
        const parts = bus.userData?.parts;
        if (parts && headMeshes.length) {
            parts.headlights.length = 0;
            parts.headlights.push(...headMeshes);
            lights.hl.visible = false;
            lights.hr.visible = false;
        }

        alignAnchoredBus(bus);
    }).finally(() => {
        bus.userData.ready = true;
        if (resolveReady) resolveReady(bus);
    });

    applyShadows(bus);
    return bus;
}
