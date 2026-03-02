// Shared exploded-face utilities for wall decorator meshes.
import * as THREE from 'three';

const EXPLODED_CLOSE_THRESHOLD_M = 0.005; // 0.5cm
const EXPLODED_MAX_ITERATIONS = 64;
const EXPLODED_MOVE_EPSILON_M = 1e-6;
const EXPLODED_PAIR_EPSILON_M = 1e-8;
const EXPLODED_CURVED_RING_RADIAL_BASE_M = 0.006;
const EXPLODED_CURVED_RING_RADIAL_RANGE_M = 0.018;
const EXPLODED_CURVED_RING_SIDE_PUSH_M = 0.030;
const EXPLODED_CURVED_RING_NORMAL_PUSH_M = 0.0025;
const EXPLODED_CURVED_RING_SIDE_DOT_MIN = 0.50;
const EXPLODED_CURVED_RING_RADIAL_EXPONENT = 1.0;
const EXPLODED_CURVED_RING_SIDE_MIN_SCALE = 0.35;
const EXPLODED_CORNICE_ROUNDED_RADIAL_BASE_M = 0.004;
const EXPLODED_CORNICE_ROUNDED_RADIAL_RANGE_M = 0.013;
const EXPLODED_CORNICE_ROUNDED_SIDE_PUSH_M = 0.018;
const EXPLODED_CORNICE_ROUNDED_NORMAL_PUSH_M = 0.0018;
const EXPLODED_CORNICE_ROUNDED_SIDE_DOT_MIN = 0.42;
const EXPLODED_CORNICE_ROUNDED_RADIAL_EXPONENT = 0.75;
const EXPLODED_CORNICE_ROUNDED_SIDE_MIN_SCALE = 0.22;

function clamp(value, min, max, fallback = min) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function writeDeterministicPairAxis(indexA, indexB, target) {
    const out = target?.isVector3 ? target : new THREE.Vector3();
    const a = Math.max(0, Math.floor(Number(indexA) || 0));
    const b = Math.max(0, Math.floor(Number(indexB) || 0));
    const seed = (((a + 1) * 73856093) ^ ((b + 1) * 19349663)) >>> 0;
    const axis = seed % 3;
    if (axis === 0) out.set(1, 0, 0);
    else if (axis === 1) out.set(0, 1, 0);
    else out.set(0, 0, 1);
    if ((seed & 1) === 0) out.multiplyScalar(-1);
    return out;
}

function estimateTriangleVertexDistanceSq(vertsA, vertsB) {
    const a = Array.isArray(vertsA) ? vertsA : [];
    const b = Array.isArray(vertsB) ? vertsB : [];
    if (a.length < 3 || b.length < 3) return Number.POSITIVE_INFINITY;
    let minDistSq = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 3; i += 1) {
        const va = a[i];
        for (let j = 0; j < 3; j += 1) {
            const vb = b[j];
            const dx = (Number(va?.x) || 0.0) - (Number(vb?.x) || 0.0);
            const dy = (Number(va?.y) || 0.0) - (Number(vb?.y) || 0.0);
            const dz = (Number(va?.z) || 0.0) - (Number(vb?.z) || 0.0);
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < minDistSq) minDistSq = d2;
        }
    }
    return minDistSq;
}

export function getWallDecoratorExplodedDebugColor(index) {
    const idx = Math.max(0, Number(index) || 0);
    const hue = (idx * 0.618033988749895) % 1.0;
    const color = new THREE.Color();
    color.setHSL(hue, 0.72, 0.58);
    return color;
}

export function buildWallDecoratorExplodedFaceEntries(
    meshes,
    {
        wireframe = false,
        colorResolver = getWallDecoratorExplodedDebugColor
    } = {}
) {
    const list = Array.isArray(meshes) ? meshes : [];
    const resolveColor = typeof colorResolver === 'function'
        ? colorResolver
        : getWallDecoratorExplodedDebugColor;

    const entries = [];
    const p0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    const p2 = new THREE.Vector3();
    const edgeA = new THREE.Vector3();
    const edgeB = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const centroid = new THREE.Vector3();

    for (const srcMesh of list) {
        const mesh = srcMesh?.isMesh ? srcMesh : null;
        const geo = mesh?.geometry?.isBufferGeometry ? mesh.geometry : null;
        if (!mesh || !geo) continue;

        const pos = geo.getAttribute('position');
        if (!pos || pos.count < 3) continue;

        mesh.updateMatrixWorld(true);
        const world = mesh.matrixWorld;
        const sourceInfo = {
            meshId: String(mesh.uuid ?? ''),
            faceId: String(mesh?.userData?.faceId ?? ''),
            role: String(mesh?.userData?.role ?? ''),
            geometryKind: String(mesh?.userData?.geometryKind ?? '').trim().toLowerCase(),
            worldOrigin: mesh.getWorldPosition(new THREE.Vector3()),
            worldAxisU: new THREE.Vector3(1, 0, 0).transformDirection(world),
            worldAxisN: new THREE.Vector3(0, 0, 1).transformDirection(world)
        };
        const idxAttr = geo.getIndex();
        const idx = idxAttr?.array ?? null;
        const triCount = idx ? Math.floor(idx.length / 3) : Math.floor(pos.count / 3);
        for (let tri = 0; tri < triCount; tri += 1) {
            const ia = idx ? (Number(idx[tri * 3]) || 0) : (tri * 3);
            const ib = idx ? (Number(idx[tri * 3 + 1]) || 0) : (tri * 3 + 1);
            const ic = idx ? (Number(idx[tri * 3 + 2]) || 0) : (tri * 3 + 2);
            p0.fromBufferAttribute(pos, ia).applyMatrix4(world);
            p1.fromBufferAttribute(pos, ib).applyMatrix4(world);
            p2.fromBufferAttribute(pos, ic).applyMatrix4(world);

            edgeA.subVectors(p1, p0);
            edgeB.subVectors(p2, p0);
            normal.crossVectors(edgeA, edgeB);
            const nLen = normal.length();
            if (!(nLen > 1e-8)) continue;
            normal.multiplyScalar(1 / nLen);

            centroid.copy(p0).add(p1).add(p2).multiplyScalar(1 / 3);
            const local0 = p0.clone().sub(centroid);
            const local1 = p1.clone().sub(centroid);
            const local2 = p2.clone().sub(centroid);
            const faceGeo = new THREE.BufferGeometry();
            faceGeo.setAttribute('position', new THREE.Float32BufferAttribute([
                local0.x, local0.y, local0.z,
                local1.x, local1.y, local1.z,
                local2.x, local2.y, local2.z
            ], 3));
            faceGeo.computeVertexNormals();
            const color = resolveColor(entries.length);
            const faceMat = new THREE.MeshStandardMaterial({
                color,
                roughness: 0.56,
                metalness: 0.02,
                side: THREE.FrontSide,
                wireframe: !!wireframe
            });
            const faceMesh = new THREE.Mesh(faceGeo, faceMat);
            faceMesh.name = `exploded_face_${String(entries.length).padStart(4, '0')}`;
            faceMesh.position.copy(centroid);
            faceMesh.castShadow = true;
            faceMesh.receiveShadow = true;
            faceMesh.frustumCulled = true;
            faceMesh.userData = {
                role: 'exploded_face',
                sourceRole: String(mesh?.userData?.role ?? ''),
                sourceFaceId: String(mesh?.userData?.faceId ?? '')
            };
            entries.push({
                mesh: faceMesh,
                centroid: centroid.clone(),
                normal: normal.clone(),
                worldVertices: [p0.clone(), p1.clone(), p2.clone()],
                source: sourceInfo
            });
        }
    }
    return entries;
}

function areWallDecoratorExplodedEntriesKindOnly(entries, targetKind) {
    const list = Array.isArray(entries) ? entries : [];
    if (!list.length) return false;
    const target = String(targetKind ?? '').trim().toLowerCase();
    if (!target) return false;
    let hasTarget = false;
    for (const entry of list) {
        const kind = String(entry?.source?.geometryKind ?? '').trim().toLowerCase();
        if (kind !== target) return false;
        hasTarget = true;
    }
    return hasTarget;
}

export function areWallDecoratorExplodedEntriesCurvedRingOnly(entries) {
    return areWallDecoratorExplodedEntriesKindOnly(entries, 'curved_ring');
}

export function areWallDecoratorExplodedEntriesCorniceRoundedOnly(entries) {
    return areWallDecoratorExplodedEntriesKindOnly(entries, 'cornice_rounded_block');
}

function separateWallDecoratorExplodedRadialFaces(
    entries,
    {
        radialBaseMeters = 0.0,
        radialRangeMeters = 0.0,
        sidePushMeters = 0.0,
        normalPushMeters = 0.0,
        sideDotMin = 0.5,
        radialExponent = 1.0,
        sideMinScale = 0.35
    } = {}
) {
    const list = Array.isArray(entries) ? entries : [];
    if (!list.length) return;

    const groups = new Map();
    for (const entry of list) {
        const source = entry?.source ?? null;
        if (!source) continue;
        const key = String(source.meshId ?? '');
        let group = groups.get(key);
        if (!group) {
            group = {
                origin: source.worldOrigin?.isVector3 ? source.worldOrigin.clone() : new THREE.Vector3(),
                axisU: source.worldAxisU?.isVector3
                    ? source.worldAxisU.clone().normalize()
                    : new THREE.Vector3(1, 0, 0),
                axisN: source.worldAxisN?.isVector3
                    ? source.worldAxisN.clone().normalize()
                    : new THREE.Vector3(0, 0, 1),
                entries: [],
                maxRadial: 0.0
            };
            if (group.axisU.lengthSq() <= 1e-10) group.axisU.set(1, 0, 0);
            if (group.axisN.lengthSq() <= 1e-10) group.axisN.set(0, 0, 1);
            groups.set(key, group);
        }
        group.entries.push(entry);
    }

    const rel = new THREE.Vector3();
    const radial = new THREE.Vector3();
    const move = new THREE.Vector3();
    const sidePushVec = new THREE.Vector3();
    const projectedNormal = new THREE.Vector3();

    for (const group of groups.values()) {
        for (const entry of group.entries) {
            rel.copy(entry.centroid).sub(group.origin);
            const u = rel.dot(group.axisU);
            radial.copy(group.axisU).multiplyScalar(-u).add(rel);
            const radialLen = radial.length();
            if (radialLen > group.maxRadial) group.maxRadial = radialLen;
        }
    }

    const safeRadialBase = Math.max(0.0, Number(radialBaseMeters) || 0.0);
    const safeRadialRange = Math.max(0.0, Number(radialRangeMeters) || 0.0);
    const safeSidePush = Math.max(0.0, Number(sidePushMeters) || 0.0);
    const safeNormalPush = Math.max(0.0, Number(normalPushMeters) || 0.0);
    const safeSideDotMin = clamp(sideDotMin, 0.0, 1.0, 0.5);
    const safeRadialExp = clamp(radialExponent, 0.25, 4.0, 1.0);
    const safeSideMinScale = clamp(sideMinScale, 0.0, 1.0, 0.35);

    for (const group of groups.values()) {
        const radialSpan = Math.max(1e-6, group.maxRadial);
        for (const entry of group.entries) {
            rel.copy(entry.centroid).sub(group.origin);
            const u = rel.dot(group.axisU);

            radial.copy(group.axisU).multiplyScalar(-u).add(rel);
            const radialLen = radial.length();
            if (radialLen > 1e-8) {
                radial.multiplyScalar(1.0 / radialLen);
            } else {
                projectedNormal.copy(entry.normal);
                const dotU = projectedNormal.dot(group.axisU);
                projectedNormal.addScaledVector(group.axisU, -dotU);
                if (projectedNormal.lengthSq() <= 1e-10) projectedNormal.copy(group.axisN);
                projectedNormal.normalize();
                radial.copy(projectedNormal);
            }

            const radialT = Math.max(0.0, Math.min(1.0, radialLen / radialSpan));
            const radialPush = safeRadialBase + Math.pow(radialT, safeRadialExp) * safeRadialRange;
            move.copy(radial).multiplyScalar(radialPush);

            const normalDotU = Math.abs(entry.normal.dot(group.axisU));
            if (normalDotU >= safeSideDotMin) {
                const normalizedSide = Math.max(
                    0.0,
                    Math.min(
                        1.0,
                        (normalDotU - safeSideDotMin)
                        / Math.max(1e-6, 1.0 - safeSideDotMin)
                    )
                );
                let sideSign = Math.sign(u);
                if (sideSign === 0) {
                    const nd = entry.normal.dot(group.axisU);
                    sideSign = nd >= 0.0 ? 1 : -1;
                }
                const sidePush = safeSidePush * (safeSideMinScale + normalizedSide * (1.0 - safeSideMinScale));
                sidePushVec.copy(group.axisU).multiplyScalar(sideSign * sidePush);
                move.add(sidePushVec);
            }

            move.addScaledVector(entry.normal, safeNormalPush);
            entry.centroid.add(move);
            for (const v of entry.worldVertices) v.add(move);
        }
    }
}

export function separateWallDecoratorExplodedCurvedRingFaces(
    entries,
    {
        radialBaseMeters = EXPLODED_CURVED_RING_RADIAL_BASE_M,
        radialRangeMeters = EXPLODED_CURVED_RING_RADIAL_RANGE_M,
        sidePushMeters = EXPLODED_CURVED_RING_SIDE_PUSH_M,
        normalPushMeters = EXPLODED_CURVED_RING_NORMAL_PUSH_M,
        sideDotMin = EXPLODED_CURVED_RING_SIDE_DOT_MIN
    } = {}
) {
    separateWallDecoratorExplodedRadialFaces(entries, {
        radialBaseMeters,
        radialRangeMeters,
        sidePushMeters,
        normalPushMeters,
        sideDotMin,
        radialExponent: EXPLODED_CURVED_RING_RADIAL_EXPONENT,
        sideMinScale: EXPLODED_CURVED_RING_SIDE_MIN_SCALE
    });
}

export function separateWallDecoratorExplodedCorniceRoundedFaces(
    entries,
    {
        radialBaseMeters = EXPLODED_CORNICE_ROUNDED_RADIAL_BASE_M,
        radialRangeMeters = EXPLODED_CORNICE_ROUNDED_RADIAL_RANGE_M,
        sidePushMeters = EXPLODED_CORNICE_ROUNDED_SIDE_PUSH_M,
        normalPushMeters = EXPLODED_CORNICE_ROUNDED_NORMAL_PUSH_M,
        sideDotMin = EXPLODED_CORNICE_ROUNDED_SIDE_DOT_MIN
    } = {}
) {
    separateWallDecoratorExplodedRadialFaces(entries, {
        radialBaseMeters,
        radialRangeMeters,
        sidePushMeters,
        normalPushMeters,
        sideDotMin,
        radialExponent: EXPLODED_CORNICE_ROUNDED_RADIAL_EXPONENT,
        sideMinScale: EXPLODED_CORNICE_ROUNDED_SIDE_MIN_SCALE
    });
}

export function separateWallDecoratorExplodedFacesIterative(
    entries,
    {
        closeThresholdMeters = EXPLODED_CLOSE_THRESHOLD_M,
        maxIterations = EXPLODED_MAX_ITERATIONS,
        moveEpsilonMeters = EXPLODED_MOVE_EPSILON_M,
        pairEpsilonMeters = EXPLODED_PAIR_EPSILON_M,
        sameSourceMeshOnly = true
    } = {}
) {
    const list = Array.isArray(entries) ? entries : [];
    const count = list.length;
    if (count < 2) return;

    const threshold = Math.max(1e-6, Number(closeThresholdMeters) || EXPLODED_CLOSE_THRESHOLD_M);
    const thresholdSq = threshold * threshold;
    const maxIters = Math.max(1, Math.floor(Number(maxIterations) || EXPLODED_MAX_ITERATIONS));
    const moveEps = Math.max(1e-10, Number(moveEpsilonMeters) || EXPLODED_MOVE_EPSILON_M);
    const pairEps = Math.max(1e-12, Number(pairEpsilonMeters) || EXPLODED_PAIR_EPSILON_M);
    const localOnly = sameSourceMeshOnly !== false;
    const accum = Array.from({ length: count }, () => new THREE.Vector3());
    const delta = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const normalMix = new THREE.Vector3();
    const maxStepPerIteration = threshold * 2.0;

    for (let iteration = 0; iteration < maxIters; iteration += 1) {
        for (const v of accum) v.set(0, 0, 0);

        let hasClosePair = false;
        for (let i = 0; i < count - 1; i += 1) {
            const a = list[i];
            for (let j = i + 1; j < count; j += 1) {
                const b = list[j];
                if (localOnly) {
                    const meshIdA = String(a?.source?.meshId ?? '');
                    const meshIdB = String(b?.source?.meshId ?? '');
                    if (meshIdA && meshIdB && meshIdA !== meshIdB) continue;
                }
                const minDistSq = estimateTriangleVertexDistanceSq(a.worldVertices, b.worldVertices);
                if (!(minDistSq < thresholdSq)) continue;
                hasClosePair = true;
                const dist = Math.sqrt(Math.max(0.0, minDistSq));

                delta.copy(b.centroid).sub(a.centroid);
                if (delta.lengthSq() > pairEps) {
                    dir.copy(delta).normalize();
                } else {
                    normalMix.copy(a.normal).sub(b.normal);
                    if (normalMix.lengthSq() > pairEps) {
                        dir.copy(normalMix).normalize();
                    } else {
                        writeDeterministicPairAxis(i, j, dir).normalize();
                    }
                }

                const overlap = Math.max(0.0, threshold - dist);
                const push = overlap * 0.55 + moveEps;
                accum[i].addScaledVector(dir, -push);
                accum[j].addScaledVector(dir, push);
            }
        }

        if (!hasClosePair) break;

        let maxMoved = 0.0;
        for (let i = 0; i < count; i += 1) {
            const move = accum[i];
            const len = move.length();
            if (!(len > 0.0)) continue;
            if (len > maxStepPerIteration) move.multiplyScalar(maxStepPerIteration / len);

            list[i].centroid.add(move);
            for (const v of list[i].worldVertices) v.add(move);
            const moved = move.length();
            if (moved > maxMoved) maxMoved = moved;
        }
        if (!(maxMoved > moveEps)) break;
    }
}
