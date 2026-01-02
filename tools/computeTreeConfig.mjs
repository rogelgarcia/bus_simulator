// tools/computeTreeConfig.mjs
// Computes tree orientation and size metadata from FBX files
// Stubs TextureLoader to avoid DOM image loading in Node.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const modelsRoot = path.join(root, 'assets', 'trees', 'Models');
const outputPath = path.join(root, 'src', 'graphics', 'assets3d', 'generators', 'TreeConfig.js');
const variants = 15;

const qualities = [
    { key: 'mobile', folder: 'Mobile', prefix: 'SM_M_Tree_' },
    { key: 'desktop', folder: 'Desktop', prefix: 'SM_H_Tree_' }
];

const box = new THREE.Box3();
const size = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3();
const mean = new THREE.Vector3();

THREE.TextureLoader.prototype.load = function (url, onLoad) {
    const tex = new THREE.Texture();
    if (typeof onLoad === 'function') onLoad(tex);
    return tex;
};

function normalizeAngle(a) {
    let v = a % (Math.PI * 2);
    if (v > Math.PI) v -= Math.PI * 2;
    if (v < -Math.PI) v += Math.PI * 2;
    return v;
}

function cleanNumber(v) {
    return Object.is(v, -0) ? 0 : v;
}

function roundValue(v) {
    return cleanNumber(Math.round(v * 1e6) / 1e6);
}

function computeTrunkAxis(model) {
    let n = 0;
    mean.set(0, 0, 0);
    let cxx = 0;
    let cxy = 0;
    let cxz = 0;
    let cyy = 0;
    let cyz = 0;
    let czz = 0;

    model.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        const matName = Array.isArray(o.material)
            ? o.material.map((m) => m?.name ?? '').join(' ')
            : (o.material?.name ?? '');
        const name = `${o.name} ${matName}`.toLowerCase();
        if (!name.includes('trunk')) return;
        const pos = o.geometry.attributes?.position;
        if (!pos) return;
        o.updateMatrixWorld(true);
        const step = Math.max(1, Math.floor(pos.count / 2000));
        for (let i = 0; i < pos.count; i += step) {
            tmp.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
            n += 1;
            const dx = tmp.x - mean.x;
            const dy = tmp.y - mean.y;
            const dz = tmp.z - mean.z;
            const inv = 1 / n;
            mean.x += dx * inv;
            mean.y += dy * inv;
            mean.z += dz * inv;
            cxx += dx * (tmp.x - mean.x);
            cxy += dx * (tmp.y - mean.y);
            cxz += dx * (tmp.z - mean.z);
            cyy += dy * (tmp.y - mean.y);
            cyz += dy * (tmp.z - mean.z);
            czz += dz * (tmp.z - mean.z);
        }
    });

    if (n < 3) return null;
    const inv = 1 / Math.max(1, n - 1);
    const m00 = cxx * inv;
    const m01 = cxy * inv;
    const m02 = cxz * inv;
    const m11 = cyy * inv;
    const m12 = cyz * inv;
    const m22 = czz * inv;

    const axis = new THREE.Vector3(1, 0, 0);
    for (let i = 0; i < 12; i++) {
        const x = m00 * axis.x + m01 * axis.y + m02 * axis.z;
        const y = m01 * axis.x + m11 * axis.y + m12 * axis.z;
        const z = m02 * axis.x + m12 * axis.y + m22 * axis.z;
        axis.set(x, y, z);
        const len = axis.length();
        if (len < 1e-8) break;
        axis.multiplyScalar(1 / len);
    }
    if (axis.lengthSq() < 1e-8) return null;
    if (axis.dot(up) < 0) axis.negate();
    return axis;
}

function collectTargetBox(model) {
    const trunkBox = new THREE.Box3();
    let found = false;
    model.traverse((o) => {
        if (!o.isMesh) return;
        const matName = Array.isArray(o.material)
            ? o.material.map((m) => m?.name ?? '').join(' ')
            : (o.material?.name ?? '');
        const name = `${o.name} ${matName}`.toLowerCase();
        if (!name.includes('trunk')) return;
        trunkBox.expandByObject(o);
        found = true;
    });
    if (found && !trunkBox.isEmpty()) return trunkBox;
    const fullBox = new THREE.Box3().setFromObject(model);
    if (fullBox.isEmpty()) return null;
    return fullBox;
}

function orientModel(model) {
    model.updateMatrixWorld(true);
    const axis = computeTrunkAxis(model);
    if (axis) {
        const q = new THREE.Quaternion().setFromUnitVectors(axis.clone().normalize(), up);
        model.quaternion.premultiply(q);
        model.updateMatrixWorld(true);
        const rot = new THREE.Euler().setFromQuaternion(model.quaternion, 'XYZ');
        box.setFromObject(model);
        box.getSize(size);
        const baseY = box.isEmpty() ? 0 : box.min.y;
        const height = box.isEmpty() ? 1 : size.y;
        return {
            rot: [
                roundValue(normalizeAngle(rot.x)),
                roundValue(normalizeAngle(rot.y)),
                roundValue(normalizeAngle(rot.z))
            ],
            baseY: roundValue(baseY),
            height: roundValue(height)
        };
    }

    const rot = new THREE.Euler(0, 0, 0, 'XYZ');
    let targetBox = collectTargetBox(model);
    if (!targetBox) {
        return {
            rot: [0, 0, 0],
            baseY: 0,
            height: 1
        };
    }
    for (let i = 0; i < 2; i++) {
        targetBox.getSize(size);
        if (size.y >= size.x && size.y >= size.z) break;
        if (size.x >= size.z) {
            const sign = targetBox.max.x >= -targetBox.min.x ? -1 : 1;
            model.rotation.z += sign * Math.PI / 2;
            rot.z += sign * Math.PI / 2;
        } else {
            const sign = targetBox.max.z >= -targetBox.min.z ? -1 : 1;
            model.rotation.x += sign * Math.PI / 2;
            rot.x += sign * Math.PI / 2;
        }
        model.updateMatrixWorld(true);
        targetBox = collectTargetBox(model);
        if (!targetBox) break;
    }
    if (targetBox && targetBox.max.y < -targetBox.min.y) {
        model.rotation.x += Math.PI;
        rot.x += Math.PI;
        model.updateMatrixWorld(true);
    }
    box.setFromObject(model);
    box.getSize(size);
    const baseY = box.isEmpty() ? 0 : box.min.y;
    const height = box.isEmpty() ? 1 : size.y;
    return {
        rot: [
            roundValue(normalizeAngle(rot.x)),
            roundValue(normalizeAngle(rot.y)),
            roundValue(normalizeAngle(rot.z))
        ],
        baseY: roundValue(baseY),
        height: roundValue(height)
    };
}

function readArrayBuffer(filePath) {
    const data = fs.readFileSync(filePath);
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}

const loader = new FBXLoader();
const config = {};

for (const quality of qualities) {
    const entries = [];
    for (let i = 1; i <= variants; i++) {
        const name = `${quality.prefix}${i}.FBX`;
        const filePath = path.join(modelsRoot, quality.folder, name);
        const model = loader.parse(readArrayBuffer(filePath), `${path.dirname(filePath)}${path.sep}`);
        const info = orientModel(model);
        entries.push({ name, ...info });
    }
    config[quality.key] = entries;
}

const output = `// src/graphics/assets3d/generators/TreeConfig.js
// Precomputed tree orientation and size data
export const TREE_CONFIG = ${JSON.stringify(config, null, 4)};
`;

fs.writeFileSync(outputPath, output, 'utf8');
console.log(`Wrote ${outputPath}`);
