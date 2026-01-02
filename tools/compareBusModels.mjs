// tools/compareBusModels.mjs
// Compares coach bus and city bus model offsets based on wheel centers
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const CITY_OBJ = path.join(ROOT, 'assets', 'city_bus', 'obj', 'Obj', 'Bus.obj');
const COACH_GLB = path.join(ROOT, 'assets', 'coach_bus', 'coach_bus.glb');

const CITY_TARGET_LENGTH = 12.0 * 1.15;
const COACH_TARGET_LENGTH = 13.2;
const COACH_EXTRA_YAW = Math.PI;

function makeBox() {
    const box = new THREE.Box3();
    box.makeEmpty();
    return box;
}

function expandBox(box, x, y, z) {
    box.expandByPoint(new THREE.Vector3(x, y, z));
}

function boxCenter(box) {
    const c = new THREE.Vector3();
    box.getCenter(c);
    return c;
}

function boxSize(box) {
    const s = new THREE.Vector3();
    box.getSize(s);
    return s;
}

function applyMatrixToBox(box, matrix) {
    const out = box.clone();
    out.applyMatrix4(matrix);
    return out;
}

function parseCityBus() {
    const text = fs.readFileSync(CITY_OBJ, 'utf8');
    const lines = text.split(/\r?\n/);
    let current = 'default';
    const boxes = new Map();
    const overall = makeBox();

    const getBox = (name) => {
        if (!boxes.has(name)) boxes.set(name, makeBox());
        return boxes.get(name);
    };

    for (const line of lines) {
        if (line.startsWith('o ') || line.startsWith('g ')) {
            current = line.slice(2).trim() || 'default';
            continue;
        }
        if (!line.startsWith('v ')) continue;
        const parts = line.trim().split(/\s+/);
        if (parts.length < 4) continue;
        const x = Number(parts[1]);
        const y = Number(parts[2]);
        const z = Number(parts[3]);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
        expandBox(overall, x, y, z);
        expandBox(getBox(current), x, y, z);
    }

    const wheelBoxes = {
        fl: makeBox(),
        fr: makeBox(),
        rl: makeBox(),
        rr: makeBox()
    };

    for (const [name, box] of boxes.entries()) {
        const lower = name.toLowerCase();
        if (lower.startsWith('fl')) wheelBoxes.fl.union(box);
        else if (lower.startsWith('fr')) wheelBoxes.fr.union(box);
        else if (lower.startsWith('rl')) wheelBoxes.rl.union(box);
        else if (lower.startsWith('rr')) wheelBoxes.rr.union(box);
    }

    const wheelCenters = [];
    for (const key of Object.keys(wheelBoxes)) {
        const box = wheelBoxes[key];
        if (box.isEmpty()) continue;
        wheelCenters.push(boxCenter(box));
    }

    return { bounds: overall, wheelCenters };
}

function readGlb(glbPath) {
    const buffer = fs.readFileSync(glbPath);
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    if (view.getUint32(0, true) !== 0x46546c67) throw new Error('Not a GLB');
    const length = view.getUint32(8, true);
    let offset = 12;
    let json = null;
    let bin = null;
    while (offset < length) {
        const chunkLength = view.getUint32(offset, true);
        const chunkType = view.getUint32(offset + 4, true);
        offset += 8;
        const chunk = buffer.slice(offset, offset + chunkLength);
        if (chunkType === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
        if (chunkType === 0x004e4942) bin = chunk;
        offset += chunkLength;
    }
    return { json, bin };
}

function accessorBounds(json, bin, accessorIndex) {
    const accessor = json.accessors[accessorIndex];
    if (accessor.min && accessor.max) {
        return new THREE.Box3(
            new THREE.Vector3(accessor.min[0], accessor.min[1], accessor.min[2]),
            new THREE.Vector3(accessor.max[0], accessor.max[1], accessor.max[2])
        );
    }

    const view = json.bufferViews[accessor.bufferView];
    const componentSize = {
        5120: 1,
        5121: 1,
        5122: 2,
        5123: 2,
        5125: 4,
        5126: 4
    }[accessor.componentType];
    const componentCount = {
        SCALAR: 1,
        VEC2: 2,
        VEC3: 3,
        VEC4: 4,
        MAT4: 16
    }[accessor.type];

    if (componentCount !== 3 || accessor.componentType !== 5126) {
        return makeBox();
    }

    const stride = view.byteStride || componentCount * componentSize;
    const offset = (view.byteOffset || 0) + (accessor.byteOffset || 0);
    const count = accessor.count;
    const data = new DataView(bin.buffer, bin.byteOffset + offset, stride * count);
    const box = makeBox();
    for (let i = 0; i < count; i++) {
        const base = i * stride;
        const x = data.getFloat32(base, true);
        const y = data.getFloat32(base + 4, true);
        const z = data.getFloat32(base + 8, true);
        expandBox(box, x, y, z);
    }
    return box;
}

function buildMeshBounds(json, bin) {
    const meshBounds = new Map();
    const meshes = json.meshes || [];
    for (let i = 0; i < meshes.length; i++) {
        const mesh = meshes[i];
        const box = makeBox();
        for (const prim of mesh.primitives || []) {
            const accessorIndex = prim.attributes?.POSITION;
            if (accessorIndex === undefined) continue;
            const primBox = accessorBounds(json, bin, accessorIndex);
            if (!primBox.isEmpty()) box.union(primBox);
        }
        meshBounds.set(i, box);
    }
    return meshBounds;
}

function nodeLocalMatrix(node) {
    if (node.matrix) {
        return new THREE.Matrix4().fromArray(node.matrix);
    }
    const t = node.translation || [0, 0, 0];
    const r = node.rotation || [0, 0, 0, 1];
    const s = node.scale || [1, 1, 1];
    const q = new THREE.Quaternion(r[0], r[1], r[2], r[3]);
    const m = new THREE.Matrix4();
    m.compose(new THREE.Vector3(t[0], t[1], t[2]), q, new THREE.Vector3(s[0], s[1], s[2]));
    return m;
}

function buildWorldMatrices(json) {
    const nodes = json.nodes || [];
    const parents = new Map();
    nodes.forEach((node, i) => {
        for (const child of node.children || []) parents.set(child, i);
    });

    const cache = new Map();

    const getWorld = (index) => {
        if (cache.has(index)) return cache.get(index);
        const node = nodes[index];
        const local = nodeLocalMatrix(node);
        const parent = parents.get(index);
        const world = parent === undefined ? local : new THREE.Matrix4().multiplyMatrices(getWorld(parent), local);
        cache.set(index, world);
        return world;
    };

    for (let i = 0; i < nodes.length; i++) getWorld(i);
    return { parents, getWorld };
}

function isWheelToken(value) {
    return value.includes('tier') || value.includes('tire') || value.includes('wheel') || value.includes('tyre');
}

function analyzeCoachBus() {
    const { json, bin } = readGlb(COACH_GLB);
    const meshBounds = buildMeshBounds(json, bin);
    const nodes = json.nodes || [];
    const meshes = json.meshes || [];
    const materials = json.materials || [];

    const meshWheel = meshes.map((mesh) => {
        const name = (mesh.name || '').toLowerCase();
        if (isWheelToken(name)) return true;
        for (const prim of mesh.primitives || []) {
            const mat = materials[prim.material] || null;
            const matName = (mat?.name || '').toLowerCase();
            if (isWheelToken(matName)) return true;
        }
        return false;
    });

    const { getWorld } = buildWorldMatrices(json);
    const nodeBoxes = new Map();
    const overall = makeBox();

    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node.mesh === undefined) continue;
        const base = meshBounds.get(node.mesh);
        if (!base || base.isEmpty()) continue;
        const world = getWorld(i);
        const box = applyMatrixToBox(base, world);
        nodeBoxes.set(i, box);
        overall.union(box);
    }

    const wheelGroups = [];
    const groupCandidates = nodes
        .map((node, index) => ({ node, index }))
        .filter((entry) => /^cylinder\.\d+$/i.test(entry.node.name || '') && entry.node.children?.length);

    const collectDescendants = (index, list) => {
        const node = nodes[index];
        for (const child of node.children || []) {
            if (nodes[child]?.mesh !== undefined) list.push(child);
            collectDescendants(child, list);
        }
    };

    for (const entry of groupCandidates) {
        const list = [];
        collectDescendants(entry.index, list);
        let isWheel = false;
        const groupBox = makeBox();
        for (const child of list) {
            const node = nodes[child];
            if (node.mesh === undefined) continue;
            if (meshWheel[node.mesh]) isWheel = true;
            const box = nodeBoxes.get(child);
            if (box) groupBox.union(box);
        }
        if (isWheel && !groupBox.isEmpty()) {
            wheelGroups.push(groupBox);
        }
    }

    if (!wheelGroups.length) {
        const wheelBoxes = [];
        for (const [nodeIndex, box] of nodeBoxes.entries()) {
            const node = nodes[nodeIndex];
            if (node.mesh === undefined) continue;
            if (!meshWheel[node.mesh]) continue;
            wheelBoxes.push(box);
        }
        const size = boxSize(overall);
        const threshold = Math.max(size.x, size.z) * 0.02;
        const centers = wheelBoxes.map((box) => boxCenter(box));
        const groups = [];
        for (const center of centers) {
            let group = null;
            for (const g of groups) {
                if (g.center.distanceToSquared(center) <= threshold * threshold) {
                    group = g;
                    break;
                }
            }
            if (!group) {
                group = { center: center.clone(), list: [center.clone()] };
                groups.push(group);
            } else {
                group.list.push(center.clone());
                const avg = new THREE.Vector3();
                for (const c of group.list) avg.add(c);
                avg.multiplyScalar(1 / group.list.length);
                group.center.copy(avg);
            }
        }
        for (const g of groups) wheelGroups.push(new THREE.Box3().setFromCenterAndSize(g.center, new THREE.Vector3(0, 0, 0)));
    }

    const wheelCenters = wheelGroups.map((box) => boxCenter(box));

    return { bounds: overall, wheelCenters };
}

function normalizeMetrics({ bounds, wheelCenters }, targetLength, extraYaw = 0) {
    let box = bounds.clone();
    const centers = wheelCenters.map((c) => c.clone());

    const size = boxSize(box);
    let rotate = 0;
    if (size.x > size.z) rotate = Math.PI / 2;
    if (rotate !== 0) {
        const rot = new THREE.Matrix4().makeRotationY(rotate);
        box = applyMatrixToBox(box, rot);
        for (const c of centers) c.applyMatrix4(rot);
    }

    const size2 = boxSize(box);
    const scale = targetLength / Math.max(0.001, size2.z || 1);
    const scaleMat = new THREE.Matrix4().makeScale(scale, scale, scale);
    box = applyMatrixToBox(box, scaleMat);
    for (const c of centers) c.applyMatrix4(scaleMat);

    const center = boxCenter(box);
    const translate = new THREE.Matrix4().makeTranslation(-center.x, 0, -center.z);
    box = applyMatrixToBox(box, translate);
    for (const c of centers) c.applyMatrix4(translate);

    if (extraYaw !== 0) {
        const yaw = new THREE.Matrix4().makeRotationY(extraYaw);
        box = applyMatrixToBox(box, yaw);
        for (const c of centers) c.applyMatrix4(yaw);
    }

    const zs = centers.map((c) => c.z);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const midZ = (minZ + maxZ) * 0.5;

    return { box, wheelCenters: centers, wheelMidZ: midZ };
}

function report(name, metrics) {
    const size = boxSize(metrics.box);
    const center = boxCenter(metrics.box);
    return {
        name,
        size: [size.x, size.y, size.z],
        center: [center.x, center.y, center.z],
        wheelMidZ: metrics.wheelMidZ
    };
}

const city = parseCityBus();
const coach = analyzeCoachBus();

const cityMetrics = normalizeMetrics(city, CITY_TARGET_LENGTH, 0);
const coachMetrics = normalizeMetrics(coach, COACH_TARGET_LENGTH, COACH_EXTRA_YAW);

const cityReport = report('city', cityMetrics);
const coachReport = report('coach', coachMetrics);

const deltaZ = cityReport.wheelMidZ - coachReport.wheelMidZ;

console.log(JSON.stringify({ city: cityReport, coach: coachReport, deltaZ }, null, 4));
