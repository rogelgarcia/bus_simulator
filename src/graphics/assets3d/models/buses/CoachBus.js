// src/graphics/assets3d/models/buses/CoachBus.js
// Loads the coach bus GLB model and attaches the wheel rig
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createBusWheel } from './components/BusWheel.js';
import { WheelRig } from './components/WheelRig.js';
import { attachBusSkeleton } from '../../../../app/skeletons/buses/BusSkeleton.js';

const TRANSPARENT_BUS = false;
const BUS_BODY_OPACITY = 0.4;
const BUS_LINER_OPACITY = 0.1;

const TARGET_LENGTH = 13.2;
const DEFAULT_WIDTH = 2.6;
const DEFAULT_WHEEL_RADIUS = 0.55;
const DEFAULT_WHEEL_WIDTH = 0.32;
const MODEL_YAW = Math.PI;

const MODEL_URL = new URL(
    '../../../../../assets/coach_bus/coach_bus.glb',
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
            console.error('Failed to load coach bus GLB', err);
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
            }
            if (mat.emissiveMap) {
                mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
                mat.emissiveMap.needsUpdate = true;
            }
            if (name.includes('bus_body')) {
                mat.metalness = 0.12;
                mat.roughness = 0.62;
                mat.color.set(0xffffff);
            }
            if (name.includes('glass')) {
                mat.metalness = 0.0;
                mat.roughness = 0.18;
                mat.color.set(0xffffff);
            }
            if (!TRANSPARENT_BUS) {
                mat.transparent = false;
                mat.opacity = 1.0;
            } else {
                const isGlass = name.includes('glass');
                const isBody = isGlass || name.includes('bus_body');
                if (isGlass) {
                    mat.transparent = true;
                    mat.opacity = BUS_LINER_OPACITY;
                } else if (isBody) {
                    mat.transparent = true;
                    mat.opacity = BUS_BODY_OPACITY;
                } else {
                    mat.transparent = false;
                    mat.opacity = 1.0;
                }
            }
            mat.needsUpdate = true;
        }
    });
}

function isBodyMesh(mesh) {
    const name = (mesh.name || '').toLowerCase();
    if (hasWheelToken(name)) return false;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    let hasBody = false;
    for (const mat of mats) {
        const matName = (mat?.name || '').toLowerCase();
        if (hasWheelToken(matName)) return false;
        if (matName.includes('light') || matName.includes('blink')) return false;
        if (matName.includes('bus_body') || matName.includes('glass')) hasBody = true;
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
    const box = new THREE.Box3();
    model.traverse((o) => {
        if (!o.isMesh) return;
        if (!isBodyMesh(o)) return;
        const localBox = getMeshBoundsLocal(root, o);
        if (!localBox.isEmpty()) box.union(localBox);
    });
    return box;
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

function hasWheelToken(value) {
    return value.includes('tier') || value.includes('tire') || value.includes('wheel') || value.includes('tyre');
}

function collectWheelGroups(root) {
    const groups = new Set();
    root.traverse((o) => {
        if (!o.isMesh) return;
        const name = (o.name || '').toLowerCase();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const matName = mats.map((m) => m?.name ?? '').join(' ').toLowerCase();
        if (hasWheelToken(name) || hasWheelToken(matName)) {
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
    for (const group of wheelGroups) {
        const meshes = [];
        group.traverse((o) => {
            if (!o.isMesh) return;
            const name = (o.name || '').toLowerCase();
            const parentName = (o.parent?.name || '').toLowerCase();
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            const matName = mats.map((m) => m?.name ?? '').join(' ').toLowerCase();
            if (hasWheelToken(name) || hasWheelToken(parentName) || hasWheelToken(matName)) meshes.push(o);
        });
        if (!meshes.length) continue;

        const box = new THREE.Box3();
        for (const mesh of meshes) {
            const localBox = getMeshBoundsLocal(wheelsRoot, mesh);
            if (!localBox.isEmpty()) box.union(localBox);
        }
        if (box.isEmpty()) continue;
        const centerLocal = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        data.push({ group, meshes, centerLocal, size });
    }
    if (!data.length) return null;

    const radii = data.map((d) => Math.max(d.size.x, d.size.y, d.size.z) * 0.5).filter((r) => Number.isFinite(r) && r > 0);
    const avgRadius = radii.length ? (radii.reduce((a, b) => a + b, 0) / radii.length) : null;
    const zTol = Math.max(0.01, (avgRadius ?? DEFAULT_WHEEL_RADIUS) * 0.7);

    const sorted = [...data].sort((a, b) => (a.centerLocal.z - b.centerLocal.z));
    const clusters = [];
    for (const item of sorted) {
        const last = clusters[clusters.length - 1];
        if (!last || Math.abs(item.centerLocal.z - last.z) > zTol) {
            clusters.push({ z: item.centerLocal.z, items: [item] });
        } else {
            last.items.push(item);
            last.z = last.items.reduce((sum, it) => sum + it.centerLocal.z, 0) / last.items.length;
        }
    }

    const hasBothSides = (cluster) => {
        let left = false;
        let right = false;
        for (const it of cluster.items) {
            if (it.centerLocal.x < 0) left = true;
            if (it.centerLocal.x > 0) right = true;
        }
        return left && right;
    };

    const axleClusters = clusters.filter(hasBothSides);
    const rearCluster = axleClusters[0] ?? null;
    const frontCluster = axleClusters[axleClusters.length - 1] ?? null;
    if (!frontCluster || !rearCluster) return null;

    const pickSide = (cluster, side) => {
        const candidates = cluster.items.filter((it) => (side === 'l' ? it.centerLocal.x < 0 : it.centerLocal.x > 0));
        if (!candidates.length) return null;
        return candidates.reduce((best, cur) => {
            if (!best) return cur;
            return side === 'l'
                ? (cur.centerLocal.x < best.centerLocal.x ? cur : best)
                : (cur.centerLocal.x > best.centerLocal.x ? cur : best);
        }, null);
    };

    const selections = [
        { axle: 'front', side: 'l', item: pickSide(frontCluster, 'l'), isFront: true },
        { axle: 'front', side: 'r', item: pickSide(frontCluster, 'r'), isFront: true },
        { axle: 'rear', side: 'l', item: pickSide(rearCluster, 'l'), isFront: false },
        { axle: 'rear', side: 'r', item: pickSide(rearCluster, 'r'), isFront: false }
    ].filter((s) => !!s.item);

    const attachedRadii = [];

    for (const sel of selections) {
        const item = sel.item;
        const node = makeWheelNode(`wheel_${sel.axle}_${sel.side}`);
        if (sel.side === 'l') node.root.rotation.y = Math.PI;
        wheelsRoot.add(node.root);
        node.root.position.copy(item.centerLocal);

        const meshes = item.meshes ?? [];
        for (const mesh of meshes) node.rollPivot.attach(mesh);
        node.rollPivot.updateMatrixWorld(true);

        const pivotBox = new THREE.Box3();
        for (const mesh of meshes) {
            const localBox = getMeshBoundsLocal(node.rollPivot, mesh);
            if (!localBox.isEmpty()) pivotBox.union(localBox);
        }
        if (!pivotBox.isEmpty()) {
            const center = pivotBox.getCenter(new THREE.Vector3());
            if (center.lengthSq() > 1e-8) {
                for (const mesh of meshes) mesh.position.sub(center);
            }
            const size = pivotBox.getSize(new THREE.Vector3());
            const r = Math.max(size.x, size.y, size.z) * 0.5;
            if (Number.isFinite(r) && r > 0) attachedRadii.push(r);
        }

        rig.addWheel({
            rollPivot: node.rollPivot,
            steerPivot: sel.isFront ? node.steerPivot : null,
            isFront: sel.isFront
        });
    }

    const finalRadius = attachedRadii.length
        ? (attachedRadii.reduce((a, b) => a + b, 0) / attachedRadii.length)
        : avgRadius;
    if (Number.isFinite(finalRadius) && finalRadius > 0) rig.wheelRadius = finalRadius;
    return { wheelRadius: finalRadius };
}

function hideWheelMeshes(root) {
    root.traverse((o) => {
        if (!o.isMesh) return;
        const name = (o.name || '').toLowerCase();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const matName = mats.map((m) => m?.name ?? '').join(' ').toLowerCase();
        if (hasWheelToken(name) || hasWheelToken(matName)) o.visible = false;
    });
}

function removeWheelMeshes(root) {
    const toRemove = [];
    root.traverse((o) => {
        if (!o.isMesh) return;
        const name = (o.name || '').toLowerCase();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const matName = mats.map((m) => m?.name ?? '').join(' ').toLowerCase();
        if (hasWheelToken(name) || hasWheelToken(matName)) toRemove.push(o);
    });
    for (const mesh of toRemove) {
        if (mesh.parent) mesh.parent.remove(mesh);
    }
}

function addProceduralWheels(bus, rig, { width, length, wheelRadius }) {
    const wheelR = wheelRadius ?? DEFAULT_WHEEL_RADIUS;
    const wheelW = DEFAULT_WHEEL_WIDTH;
    const axleFront = length * 0.29;
    const axleRear = -length * 0.225;
    const wheelX = (width / 2) + (wheelW / 2) - 0.30;

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
    const origin = parent.userData?.origin ?? 'floor';
    const skeleton = bus.userData?.bus ?? null;
    const target = origin === 'center' ? (skeleton?.bodyRoot ?? bus) : bus;
    const box = getObjectBoundsLocal(parent, target);
    if (box.isEmpty()) return;
    if (origin === 'center') {
        const center = box.getCenter(new THREE.Vector3());
        bus.position.sub(center);
    } else {
        bus.position.y -= box.min.y;
    }
}

export function createCoachBus(spec) {
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

        const headMeshes = collectMeshesByMaterial(model, 'lights2');
        const brakeMeshes = collectMeshesByMaterial(model, 'red_lights');
        setEmissive(headMeshes, 0xffffff);
        setEmissive(brakeMeshes, 0xff2222);
        const parts = bus.userData?.parts;
        if (parts) {
            if (headMeshes.length) {
                parts.headlights.length = 0;
                parts.headlights.push(...headMeshes);
                lights.hl.visible = false;
                lights.hr.visible = false;
            }
            if (brakeMeshes.length) {
                parts.brakeLights.length = 0;
                parts.brakeLights.push(...brakeMeshes);
                lights.bl.visible = false;
                lights.br.visible = false;
            }
        }

        alignAnchoredBus(bus);
    }).finally(() => {
        bus.userData.ready = true;
        if (resolveReady) resolveReady(bus);
    });

    applyShadows(bus);
    return bus;
}
