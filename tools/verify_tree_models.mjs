// tools/verify_tree_models.mjs
// Offline verifier for tree model base alignment
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

function isFoliageName(name) {
    const s = String(name ?? '').toLowerCase();
    return s.includes('leaf') || s.includes('foliage') || s.includes('bush');
}

function isCollisionMeshName(name) {
    const s = String(name ?? '').toUpperCase();
    return s.startsWith('UCX_') || s.startsWith('UBX_') || s.startsWith('UCP_') || s.startsWith('USP_');
}

function bufferToArrayBuffer(buf) {
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function unionBounds(root, predicate) {
    const out = new THREE.Box3();
    let ok = false;
    root.traverse((o) => {
        if (!o?.isMesh) return;
        if (!predicate(o)) return;
        const b = new THREE.Box3().setFromObject(o);
        if (b.isEmpty()) return;
        if (!ok) out.copy(b);
        else out.union(b);
        ok = true;
    });
    return ok ? out : null;
}

function computeMinWorldYForMaterialIndices(mesh, indices) {
    const geom = mesh?.geometry;
    const pos = geom?.attributes?.position;
    if (!geom || !pos) return null;

    const groups = (Array.isArray(geom.groups) && geom.groups.length)
        ? geom.groups
        : [{ start: 0, count: geom.index ? geom.index.count : pos.count, materialIndex: 0 }];

    const posArr = pos.array;
    const idxArr = geom.index?.array ?? null;
    const m = mesh.matrixWorld.elements;
    const m1 = m[1];
    const m5 = m[5];
    const m9 = m[9];
    const m13 = m[13];

    let minY = Infinity;

    const scanVertex = (vi) => {
        const j = vi * 3;
        const x = posArr[j];
        const y = posArr[j + 1];
        const z = posArr[j + 2];
        const wy = m1 * x + m5 * y + m9 * z + m13;
        if (wy < minY) minY = wy;
    };

    for (const g of groups) {
        if (!indices.has(g.materialIndex)) continue;
        const start = Math.max(0, g.start | 0);
        const end = start + Math.max(0, g.count | 0);
        if (idxArr) {
            const max = idxArr.length;
            for (let i = start; i < end && i < max; i++) scanVertex(idxArr[i]);
        } else {
            const max = pos.count;
            for (let i = start; i < end && i < max; i++) scanVertex(i);
        }
    }

    return Number.isFinite(minY) ? minY : null;
}

function pickTrunkMaterialIndices(mesh) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const byName = new Set();
    const fallback = new Set();
    for (let i = 0; i < mats.length; i++) {
        const label = `${mesh.name} ${mats[i]?.name ?? ''}`.toLowerCase();
        if (label.includes('trunk') && !isFoliageName(label)) byName.add(i);
        if (!isFoliageName(label)) fallback.add(i);
    }
    return byName.size ? byName : fallback;
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_TARGET_HEIGHT = 9.6;

const originalTextureLoad = THREE.TextureLoader.prototype.load;
THREE.TextureLoader.prototype.load = function dummyLoad(url, onLoad) {
    const tex = new THREE.Texture();
    tex.name = String(url ?? '');
    if (typeof onLoad === 'function') {
        queueMicrotask(() => onLoad(tex));
    }
    return tex;
};

const originalWarn = console.warn;
console.warn = (...args) => {
    const msg = String(args?.[0] ?? '');
    if (msg.startsWith('FBXLoader: TGA loader not found')) return;
    originalWarn(...args);
};

async function loadModel({ filePath, rot }) {
    const buf = await fs.readFile(filePath);
    const loader = new FBXLoader();
    const model = loader.parse(bufferToArrayBuffer(buf), `${path.dirname(filePath)}${path.sep}`);
    const r = Array.isArray(rot) ? rot : [0, 0, 0];
    model.rotation.set(r[0] ?? 0, r[1] ?? 0, r[2] ?? 0);
    model.updateMatrixWorld(true);
    return model;
}

async function loadTreeConfig() {
    const cfgPath = path.join(ROOT, 'src', 'graphics', 'assets3d', 'generators', 'TreeConfig.js');
    const raw = await fs.readFile(cfgPath, 'utf8');
    const match = raw.match(/export\s+const\s+TREE_CONFIG\s*=\s*({[\s\S]*?})\s*;?\s*$/);
    if (!match) throw new Error(`Could not parse TREE_CONFIG from ${cfgPath}`);
    const body = match[1];
    try {
        return JSON.parse(body);
    } catch {
        return (0, eval)(`(${body})`);
    }
}

async function main() {
    const TREE_CONFIG = await loadTreeConfig();
    const rows = [];

    for (const quality of ['mobile', 'desktop']) {
        const entries = TREE_CONFIG?.[quality] ?? [];
        const folder = quality === 'desktop' ? 'Desktop' : 'Mobile';
        for (const entry of entries) {
            const name = entry?.name;
            if (!name) continue;
            const filePath = path.join(ROOT, 'assets', 'trees', 'Models', folder, name);
            let model = null;
            try {
                model = await loadModel({ filePath, rot: entry?.rot });
            } catch (err) {
                rows.push({ quality, name, ok: false, error: String(err?.message ?? err) });
                continue;
            }

            const full = unionBounds(model, (o) => o.isMesh && !isCollisionMeshName(o.name));
            const fullMinY = full?.min?.y;
            const fullMaxY = full?.max?.y;

            let trunkMinY = Infinity;
            model.traverse((o) => {
                if (!o?.isMesh) return;
                if (isCollisionMeshName(o.name)) return;
                const indices = pickTrunkMaterialIndices(o);
                if (!indices.size) return;
                const y = computeMinWorldYForMaterialIndices(o, indices);
                if (Number.isFinite(y) && y < trunkMinY) trunkMinY = y;
            });
            const trunkMinYResolved = Number.isFinite(trunkMinY) ? trunkMinY : fullMinY;
            const below = (Number.isFinite(trunkMinYResolved) && Number.isFinite(fullMinY)) ? (trunkMinYResolved - fullMinY) : null;
            const aboveHeight = (Number.isFinite(fullMaxY) && Number.isFinite(trunkMinYResolved)) ? (fullMaxY - trunkMinYResolved) : null;
            const scale = (Number.isFinite(aboveHeight) && aboveHeight > 0) ? (DEFAULT_TARGET_HEIGHT / aboveHeight) : null;
            const belowWorld = (Number.isFinite(below) && Number.isFinite(scale)) ? (below * scale) : null;

            rows.push({
                quality,
                name,
                ok: true,
                fullMinY,
                trunkMinY: trunkMinYResolved,
                below,
                aboveHeight,
                belowWorld
            });
        }
    }

    rows.sort((a, b) => {
        const aa = Number.isFinite(a?.belowWorld) ? a.belowWorld : -Infinity;
        const bb = Number.isFinite(b?.belowWorld) ? b.belowWorld : -Infinity;
        return bb - aa;
    });

    const ok = rows.filter((r) => r.ok);
    const bad = rows.filter((r) => !r.ok);

    const fmt = (v) => (Number.isFinite(v) ? v.toFixed(4) : '—');

    console.log('Tree model trunk-vs-full base (bush/foliage below trunk shows as "belowWorld")');
    console.log(`Assumed target height: ${DEFAULT_TARGET_HEIGHT} world units`);
    console.log('');

    for (const r of ok) {
        console.log(
            `${r.quality.padEnd(7)} ${r.name.padEnd(16)} fullMinY=${fmt(r.fullMinY)} trunkMinY=${fmt(r.trunkMinY)} belowWorld=${fmt(r.belowWorld)}`
        );
    }

    if (bad.length) {
        console.log('');
        console.log('Failed to load:');
        for (const r of bad) console.log(`${r.quality.padEnd(7)} ${r.name.padEnd(16)} ${r.error}`);
        process.exitCode = 1;
    }
}

main().finally(() => {
    console.warn = originalWarn;
    THREE.TextureLoader.prototype.load = originalTextureLoad;
});
