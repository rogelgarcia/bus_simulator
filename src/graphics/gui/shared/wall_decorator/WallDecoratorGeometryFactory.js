// src/graphics/gui/shared/wall_decorator/WallDecoratorGeometryFactory.js
// Shared wall decorator geometry factory used by BF2 and wall-decoration debugger.
// @ts-check

import * as THREE from 'three';

function clamp(value, min, max, fallback = min) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function flipGeometryWinding(geometry) {
    const geo = geometry?.isBufferGeometry ? geometry : null;
    if (!geo) return;
    const index = geo.getIndex();
    if (index?.array) {
        const idx = index.array;
        for (let i = 0; i + 2 < idx.length; i += 3) {
            const t = idx[i + 1];
            idx[i + 1] = idx[i + 2];
            idx[i + 2] = t;
        }
        index.needsUpdate = true;
        return;
    }

    const attrs = geo.attributes ?? {};
    const keys = Object.keys(attrs);
    if (!keys.length) return;
    const vertexCount = Number(attrs.position?.count) || 0;
    if (vertexCount < 3) return;
    for (let i = 0; i + 2 < vertexCount; i += 3) {
        for (const key of keys) {
            const attr = attrs[key];
            const itemSize = Number(attr?.itemSize) || 0;
            const arr = attr?.array ?? null;
            if (!arr || itemSize <= 0) continue;
            for (let k = 0; k < itemSize; k += 1) {
                const a = (i + 1) * itemSize + k;
                const b = (i + 2) * itemSize + k;
                const t = arr[a];
                arr[a] = arr[b];
                arr[b] = t;
            }
            attr.needsUpdate = true;
        }
    }
}

function smoothNormalsBySharedPosition(geometry, {
    epsilon = 1e-5,
    maxSmoothingAngleDeg = 75.0,
    keepIndexed = false
} = {}) {
    const src = geometry?.isBufferGeometry ? geometry : null;
    if (!src) return src;
    const cosThreshold = Math.cos(clamp(maxSmoothingAngleDeg, 0.0, 180.0, 75.0) * Math.PI / 180.0);
    const invEps = 1.0 / Math.max(1e-8, Number(epsilon) || 1e-5);
    const makeKey = (x, y, z) => `${Math.round(x * invEps)}|${Math.round(y * invEps)}|${Math.round(z * invEps)}`;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const edge1 = new THREE.Vector3();
    const edge2 = new THREE.Vector3();
    const n = new THREE.Vector3();

    if (keepIndexed && src.getIndex()) {
        const geo = src;
        const pos = geo.getAttribute('position');
        const index = geo.getIndex();
        if (!pos || !index || pos.count < 3 || index.count < 3) return geo;

        const vertexCount = pos.count;
        const idx = index.array;
        const groups = new Map();
        for (let i = 0; i < vertexCount; i += 1) {
            const key = makeKey(pos.getX(i), pos.getY(i), pos.getZ(i));
            const list = groups.get(key);
            if (list) list.push(i);
            else groups.set(key, [i]);
        }

        const faceNormalsByVertex = Array.from({ length: vertexCount }, () => []);
        for (let i = 0; i + 2 < idx.length; i += 3) {
            const i0 = Number(idx[i]) || 0;
            const i1 = Number(idx[i + 1]) || 0;
            const i2 = Number(idx[i + 2]) || 0;
            a.fromBufferAttribute(pos, i0);
            b.fromBufferAttribute(pos, i1);
            c.fromBufferAttribute(pos, i2);
            edge1.subVectors(c, b);
            edge2.subVectors(a, b);
            n.crossVectors(edge1, edge2);
            if (n.lengthSq() <= 1e-16) continue;
            n.normalize();
            const normal = [n.x, n.y, n.z];
            faceNormalsByVertex[i0].push(normal);
            faceNormalsByVertex[i1].push(normal);
            faceNormalsByVertex[i2].push(normal);
        }

        const baseNormals = new Float32Array(vertexCount * 3);
        for (let i = 0; i < vertexCount; i += 1) {
            const normals = faceNormalsByVertex[i];
            let sx = 0.0;
            let sy = 0.0;
            let sz = 0.0;
            for (const fn of normals) {
                sx += fn[0];
                sy += fn[1];
                sz += fn[2];
            }
            const len = Math.hypot(sx, sy, sz);
            const base = i * 3;
            if (len <= 1e-8) continue;
            baseNormals[base] = sx / len;
            baseNormals[base + 1] = sy / len;
            baseNormals[base + 2] = sz / len;
        }

        const outNormals = new Float32Array(vertexCount * 3);
        for (const members of groups.values()) {
            for (const i of members) {
                const base = i * 3;
                const bx = baseNormals[base];
                const by = baseNormals[base + 1];
                const bz = baseNormals[base + 2];
                let sx = 0.0;
                let sy = 0.0;
                let sz = 0.0;
                for (const j of members) {
                    for (const fn of faceNormalsByVertex[j]) {
                        const nx = fn[0];
                        const ny = fn[1];
                        const nz = fn[2];
                        const dot = bx * nx + by * ny + bz * nz;
                        if (dot < cosThreshold) continue;
                        sx += nx;
                        sy += ny;
                        sz += nz;
                    }
                }
                const len = Math.hypot(sx, sy, sz);
                if (len <= 1e-8) {
                    outNormals[base] = bx;
                    outNormals[base + 1] = by;
                    outNormals[base + 2] = bz;
                    continue;
                }
                outNormals[base] = sx / len;
                outNormals[base + 1] = sy / len;
                outNormals[base + 2] = sz / len;
            }
        }
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(outNormals, 3));
        return geo;
    }

    let geo = src.getIndex() ? src.toNonIndexed() : src;
    const pos = geo.getAttribute('position');
    if (!pos || pos.count < 3) return geo;

    const vertexCount = pos.count;
    const faceNormals = new Float32Array(vertexCount * 3);
    const groups = new Map();

    for (let i = 0; i + 2 < vertexCount; i += 3) {
        a.fromBufferAttribute(pos, i);
        b.fromBufferAttribute(pos, i + 1);
        c.fromBufferAttribute(pos, i + 2);
        edge1.subVectors(c, b);
        edge2.subVectors(a, b);
        n.crossVectors(edge1, edge2);
        if (n.lengthSq() <= 1e-16) continue;
        n.normalize();
        for (let k = 0; k < 3; k += 1) {
            const idx = i + k;
            const base = idx * 3;
            faceNormals[base] = n.x;
            faceNormals[base + 1] = n.y;
            faceNormals[base + 2] = n.z;
            const key = makeKey(pos.getX(idx), pos.getY(idx), pos.getZ(idx));
            const list = groups.get(key);
            if (list) list.push(idx);
            else groups.set(key, [idx]);
        }
    }

    const outNormals = new Float32Array(vertexCount * 3);
    for (let i = 0; i < vertexCount; i += 1) {
        const base = i * 3;
        const bx = faceNormals[base];
        const by = faceNormals[base + 1];
        const bz = faceNormals[base + 2];
        const key = makeKey(pos.getX(i), pos.getY(i), pos.getZ(i));
        const members = groups.get(key) ?? [i];
        let sx = 0.0;
        let sy = 0.0;
        let sz = 0.0;
        for (const idx of members) {
            const ib = idx * 3;
            const nx = faceNormals[ib];
            const ny = faceNormals[ib + 1];
            const nz = faceNormals[ib + 2];
            const dot = bx * nx + by * ny + bz * nz;
            if (dot < cosThreshold) continue;
            sx += nx;
            sy += ny;
            sz += nz;
        }
        const len = Math.hypot(sx, sy, sz);
        if (len <= 1e-8) {
            outNormals[base] = bx;
            outNormals[base + 1] = by;
            outNormals[base + 2] = bz;
            continue;
        }
        outNormals[base] = sx / len;
        outNormals[base + 1] = sy / len;
        outNormals[base + 2] = sz / len;
    }

    geo.setAttribute('normal', new THREE.Float32BufferAttribute(outNormals, 3));
    return geo;
}

function createCurvedRingGeometry({
    segmentWidthMeters = 1.0,
    diameterMeters = 1.0,
    longitudinalSegments = 1,
    miterStyle = 'outward',
    miterStart45 = false,
    miterEnd45 = false
} = {}) {
    const segmentWidth = Math.max(0.01, Number(segmentWidthMeters) || 1.0);
    const diameter = Math.max(0.01, Number(diameterMeters) || 1.0);
    const radius = diameter * 0.5;
    const arcSegments = Math.max(24, Math.min(256, Math.ceil(diameter * 200)));
    const sweepSteps = Math.max(1, Math.min(4096, Math.floor(Number(longitudinalSegments) || 1)));

    const profile = new THREE.Shape();
    profile.moveTo(0.0, -radius);
    for (let i = 0; i <= arcSegments; i += 1) {
        const t = -Math.PI * 0.5 + (Math.PI * i) / arcSegments;
        const x = radius * Math.cos(t);
        const y = radius * Math.sin(t);
        profile.lineTo(x, y);
    }
    profile.lineTo(0.0, radius);
    profile.lineTo(0.0, -radius);

    let geo = new THREE.ExtrudeGeometry(profile, {
        depth: segmentWidth,
        bevelEnabled: false,
        steps: sweepSteps,
        curveSegments: arcSegments
    });

    geo.translate(0.0, 0.0, -segmentWidth * 0.5);
    geo.rotateY(Math.PI * 0.5);
    geo.scale(1.0, 1.0, -1.0);

    if (miterStart45 || miterEnd45) {
        const pos = geo.attributes?.position ?? null;
        const arr = pos?.array ?? null;
        if (arr) {
            geo.computeBoundingBox();
            const box = geo.boundingBox ? geo.boundingBox.clone() : null;
            const minX = Number(box?.min?.x);
            const maxX = Number(box?.max?.x);
            const minZ = Number(box?.min?.z);
            if (Number.isFinite(minX) && Number.isFinite(maxX) && Number.isFinite(minZ)) {
                const edgeEps = 1e-4;
                const style = String(miterStyle ?? 'outward').trim().toLowerCase() === 'inward'
                    ? 'inward'
                    : 'outward';
                for (let i = 0; i < arr.length; i += 3) {
                    let x = Number(arr[i]) || 0.0;
                    const z = Number(arr[i + 2]) || 0.0;
                    const depthFromWall = Math.max(0.0, z - minZ);
                    if (miterStart45) {
                        if (style === 'outward') {
                            const isStartEdge = x <= (minX + edgeEps);
                            if (isStartEdge) x = minX - depthFromWall;
                        } else {
                            const cutMinX = minX + depthFromWall;
                            if (x < cutMinX) x = cutMinX;
                        }
                    }
                    if (miterEnd45) {
                        if (style === 'outward') {
                            const isEndEdge = x >= (maxX - edgeEps);
                            if (isEndEdge) x = maxX + depthFromWall;
                        } else {
                            const cutMaxX = maxX - depthFromWall;
                            if (x > cutMaxX) x = cutMaxX;
                        }
                    }
                    arr[i] = x;
                }
                pos.needsUpdate = true;
            }
        }
    }

    // Remove wall-facing triangles even when the source geometry is non-indexed.
    {
        const pos = geo.getAttribute('position');
        if (pos?.count >= 3) {
            geo.computeBoundingBox();
            const wallPlaneZ = Number(geo.boundingBox?.min?.z);
            if (Number.isFinite(wallPlaneZ)) {
                if (!geo.getIndex()) {
                    const seq = [];
                    for (let i = 0; i < pos.count; i += 1) seq.push(i);
                    geo.setIndex(seq);
                }
                const index = geo.getIndex();
                const idx = index?.array ?? null;
                if (idx?.length >= 3) {
                    const kept = [];
                    let removed = 0;
                    const eps = 1e-6;
                    for (let i = 0; i + 2 < idx.length; i += 3) {
                        const i0 = Number(idx[i]) || 0;
                        const i1 = Number(idx[i + 1]) || 0;
                        const i2 = Number(idx[i + 2]) || 0;
                        const z0 = Number(pos.getZ(i0)) || 0.0;
                        const z1 = Number(pos.getZ(i1)) || 0.0;
                        const z2 = Number(pos.getZ(i2)) || 0.0;
                        const isWallTri = Math.abs(z0 - wallPlaneZ) <= eps
                            && Math.abs(z1 - wallPlaneZ) <= eps
                            && Math.abs(z2 - wallPlaneZ) <= eps;
                        if (isWallTri) {
                            removed += 1;
                            continue;
                        }
                        kept.push(i0, i1, i2);
                    }
                    if (removed > 0) {
                        geo.setIndex(kept);
                        geo.clearGroups();
                        if (kept.length > 0) geo.addGroup(0, kept.length, 0);
                    }
                }
            }
        }
    }
    flipGeometryWinding(geo);

    geo.computeBoundingBox();
    const box = geo.boundingBox ? geo.boundingBox.clone() : new THREE.Box3();
    const center = box.getCenter(new THREE.Vector3());
    geo.translate(0.0, -center.y, -center.z);
    geo = smoothNormalsBySharedPosition(geo, {
        epsilon: 1e-5,
        maxSmoothingAngleDeg: 75.0,
        keepIndexed: true
    });
    geo.computeBoundingBox();

    const finalBox = geo.boundingBox ?? new THREE.Box3().setFromBufferAttribute(geo.attributes.position);
    const size = finalBox.getSize(new THREE.Vector3());
    return {
        geometry: geo,
        widthMeters: Math.max(0.01, size.x),
        heightMeters: Math.max(0.01, size.y),
        depthMeters: Math.max(0.005, size.z)
    };
}

function createAngledSupportProfileGeometry({
    segmentWidthMeters = 1.0,
    offsetMeters = 0.10,
    shiftMeters = 0.0,
    returnHeightMeters = 0.20,
    miterTopAngleDeg = 45.0,
    miterBottomAngleDeg = 45.0,
    miterStart45 = false,
    miterEnd45 = false
} = {}) {
    const segmentWidth = Math.max(0.01, Number(segmentWidthMeters) || 1.0);
    const offset = Math.max(0.005, Number(offsetMeters) || 0.10);
    const shift = Number(shiftMeters) || 0.0;
    const returnHeight = Math.max(0.01, Number(returnHeightMeters) || 0.20);

    const shape = new THREE.Shape();
    shape.moveTo(0.0, 0.0);
    shape.lineTo(0.0, returnHeight);
    shape.lineTo(offset, returnHeight + shift);
    shape.lineTo(offset, shift);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
        depth: segmentWidth,
        bevelEnabled: false,
        steps: 1,
        curveSegments: 2
    });
    geo.translate(0.0, 0.0, -segmentWidth * 0.5);
    geo.rotateY(Math.PI * 0.5);
    geo.scale(1.0, 1.0, -1.0);

    const pos = geo.attributes?.position;
    const arr = pos?.array ?? null;
    if (arr) {
        const rawBox = new THREE.Box3().setFromBufferAttribute(pos);
        const minX = rawBox.min.x;
        const maxX = rawBox.max.x;
        const minY = rawBox.min.y;
        const maxY = rawBox.max.y;
        const spanY = Math.max(1e-6, maxY - minY);
        const topAngle = clamp(miterTopAngleDeg, 10.0, 80.0, 45.0) * Math.PI / 180.0;
        const bottomAngle = clamp(miterBottomAngleDeg, 10.0, 80.0, 45.0) * Math.PI / 180.0;
        for (let i = 0; i < arr.length; i += 3) {
            let x = Number(arr[i]) || 0.0;
            const y = Number(arr[i + 1]) || 0.0;
            const z = Number(arr[i + 2]) || 0.0;
            const zDepth = Math.max(0.0, z);
            const tY = Math.max(0.0, Math.min(1.0, (y - minY) / spanY));
            const angle = bottomAngle + (topAngle - bottomAngle) * tY;
            const miterScale = Math.tan(angle);
            if (miterStart45) {
                const cutMinX = minX + zDepth * miterScale;
                if (x < cutMinX) x = cutMinX;
            }
            if (miterEnd45) {
                const cutMaxX = maxX - zDepth * miterScale;
                if (x > cutMaxX) x = cutMaxX;
            }
            arr[i] = x;
        }
        pos.needsUpdate = true;
    }

    // Remove always-hidden faces:
    // 1) wall-facing back face (flush against wall plane),
    // 2) horizontal top cap on the main block (occluded by angled-cap geometry).
    {
        const positionAttr = geo.getAttribute('position');
        if (positionAttr?.count >= 3) {
            geo.computeBoundingBox();
            const wallPlaneZ = Number(geo.boundingBox?.min?.z);
            const topPlaneY = Number(geo.boundingBox?.max?.y);
            if (Number.isFinite(wallPlaneZ) && Number.isFinite(topPlaneY)) {
                if (!geo.getIndex()) {
                    const seq = [];
                    for (let i = 0; i < positionAttr.count; i += 1) seq.push(i);
                    geo.setIndex(seq);
                }
                const index = geo.getIndex();
                const idx = index?.array ?? null;
                if (idx?.length >= 3) {
                    const kept = [];
                    let removed = 0;
                    const eps = 1e-6;
                    for (let i = 0; i + 2 < idx.length; i += 3) {
                        const i0 = Number(idx[i]) || 0;
                        const i1 = Number(idx[i + 1]) || 0;
                        const i2 = Number(idx[i + 2]) || 0;
                        const y0 = Number(positionAttr.getY(i0)) || 0.0;
                        const y1 = Number(positionAttr.getY(i1)) || 0.0;
                        const y2 = Number(positionAttr.getY(i2)) || 0.0;
                        const z0 = Number(positionAttr.getZ(i0)) || 0.0;
                        const z1 = Number(positionAttr.getZ(i1)) || 0.0;
                        const z2 = Number(positionAttr.getZ(i2)) || 0.0;

                        const isWallFacingTri = Math.abs(z0 - wallPlaneZ) <= eps
                            && Math.abs(z1 - wallPlaneZ) <= eps
                            && Math.abs(z2 - wallPlaneZ) <= eps;
                        const isOccludedHorizontalTopTri = Math.abs(y0 - topPlaneY) <= eps
                            && Math.abs(y1 - topPlaneY) <= eps
                            && Math.abs(y2 - topPlaneY) <= eps;
                        if (isWallFacingTri || isOccludedHorizontalTopTri) {
                            removed += 1;
                            continue;
                        }

                        kept.push(i0, i1, i2);
                    }
                    if (removed > 0) {
                        geo.setIndex(kept);
                        geo.clearGroups();
                        if (kept.length > 0) geo.addGroup(0, kept.length, 0);
                    }
                }
            }
        }
    }
    flipGeometryWinding(geo);

    geo.computeBoundingBox();
    const box = geo.boundingBox ? geo.boundingBox.clone() : new THREE.Box3();
    const center = box.getCenter(new THREE.Vector3());
    geo.translate(-center.x, -center.y, -center.z);
    geo.computeBoundingBox();
    geo.computeVertexNormals();

    const finalBox = geo.boundingBox ?? new THREE.Box3().setFromBufferAttribute(geo.attributes.position);
    const size = finalBox.getSize(new THREE.Vector3());
    return {
        geometry: geo,
        widthMeters: Math.max(0.01, size.x),
        heightMeters: Math.max(0.01, size.y),
        depthMeters: Math.max(0.005, size.z)
    };
}

function createMiteredBoxGeometry({
    widthMeters = 1.0,
    heightMeters = 1.0,
    depthMeters = 0.1,
    miterStyle = 'inward',
    removeTopFace = false,
    removeBottomFace = false,
    removeStartFace = false,
    removeEndFace = false,
    removeOuterFace = false,
    removeWallFace = false,
    miterStart45 = false,
    miterEnd45 = false
} = {}) {
    const width = Math.max(0.01, Number(widthMeters) || 1.0);
    const height = Math.max(0.01, Number(heightMeters) || 1.0);
    const depth = Math.max(0.005, Number(depthMeters) || 0.1);
    const geo = new THREE.BoxGeometry(width, height, depth);
    if (miterStart45 || miterEnd45) {
        const pos = geo.attributes?.position;
        const arr = pos?.array ?? null;
        if (arr) {
            const style = String(miterStyle ?? 'inward').trim().toLowerCase() === 'outward' ? 'outward' : 'inward';
            const minX = -width * 0.5;
            const maxX = width * 0.5;
            const halfDepth = depth * 0.5;
            const edgeEps = 1e-4;
            for (let i = 0; i < arr.length; i += 3) {
                let x = Number(arr[i]) || 0.0;
                const z = Number(arr[i + 2]) || 0.0;
                const zDepth = Math.max(0.0, z + halfDepth);
                if (miterStart45) {
                    if (style === 'outward') {
                        const isStartEdge = x <= (minX + edgeEps);
                        if (isStartEdge) x = minX - zDepth;
                    } else {
                        const cutMinX = minX + zDepth;
                        if (x < cutMinX) x = cutMinX;
                    }
                }
                if (miterEnd45) {
                    if (style === 'outward') {
                        const isEndEdge = x >= (maxX - edgeEps);
                        if (isEndEdge) x = maxX + zDepth;
                    } else {
                        const cutMaxX = maxX - zDepth;
                        if (x > cutMaxX) x = cutMaxX;
                    }
                }
                arr[i] = x;
            }
            pos.needsUpdate = true;
        }
    }

    {
        const removeMaterialIndices = new Set();
        if (removeEndFace) removeMaterialIndices.add(0); // +X
        if (removeStartFace) removeMaterialIndices.add(1); // -X
        if (removeTopFace) removeMaterialIndices.add(2); // +Y
        if (removeBottomFace) removeMaterialIndices.add(3); // -Y
        if (removeOuterFace) removeMaterialIndices.add(4); // +Z
        if (removeWallFace) removeMaterialIndices.add(5); // -Z
        const index = geo.getIndex();
        const groups = Array.isArray(geo.groups) ? geo.groups : [];
        if (removeMaterialIndices.size > 0 && index && groups.length > 0) {
            const kept = [];
            const arr = index.array;
            for (const group of groups) {
                const materialIndex = Number(group?.materialIndex) || 0;
                if (removeMaterialIndices.has(materialIndex)) continue;
                const start = Math.max(0, Number(group?.start) || 0);
                const count = Math.max(0, Number(group?.count) || 0);
                for (let i = start; i < start + count && i < arr.length; i += 1) {
                    kept.push(Number(arr[i]) || 0);
                }
            }
            if (kept.length > 0) {
                geo.setIndex(kept);
                geo.clearGroups();
                geo.addGroup(0, kept.length, 0);
            }
        }
    }

    geo.computeBoundingBox();
    const box = geo.boundingBox ? geo.boundingBox.clone() : new THREE.Box3();
    const center = box.getCenter(new THREE.Vector3());
    const style = String(miterStyle ?? 'inward').trim().toLowerCase() === 'outward' ? 'outward' : 'inward';
    geo.translate(style === 'outward' ? 0.0 : -center.x, -center.y, -center.z);
    geo.computeBoundingBox();
    geo.computeVertexNormals();

    const finalBox = geo.boundingBox ?? new THREE.Box3().setFromBufferAttribute(geo.attributes.position);
    const size = finalBox.getSize(new THREE.Vector3());
    return {
        geometry: geo,
        widthMeters: Math.max(0.01, size.x),
        heightMeters: Math.max(0.01, size.y),
        depthMeters: Math.max(0.005, size.z)
    };
}

function createCorniceBlockGeometry({
    widthMeters = 0.10,
    heightMeters = 0.10,
    depthMeters = 0.10,
    frontBottomLiftMeters = 0.0
} = {}) {
    const width = Math.max(0.01, Number(widthMeters) || 0.10);
    const height = Math.max(0.01, Number(heightMeters) || 0.10);
    const depth = Math.max(0.005, Number(depthMeters) || 0.10);
    const lift = clamp(frontBottomLiftMeters, 0.0, height, 0.0);
    const geo = new THREE.BoxGeometry(width, height, depth);

    if (lift > 1e-6) {
        const pos = geo.getAttribute('position');
        const arr = pos?.array ?? null;
        if (arr) {
            const halfHeight = height * 0.5;
            const halfDepth = depth * 0.5;
            const eps = 1e-4;
            for (let i = 0; i < arr.length; i += 3) {
                const y = Number(arr[i + 1]) || 0.0;
                const z = Number(arr[i + 2]) || 0.0;
                const isBottom = y <= (-halfHeight + eps);
                const isFront = z >= (halfDepth - eps);
                if (!isBottom || !isFront) continue;
                arr[i + 1] = Math.min(halfHeight, y + lift);
            }
            pos.needsUpdate = true;
        }
    }

    // Wall-facing back face is always hidden against facade and should not be generated.
    {
        const index = geo.getIndex();
        const groups = Array.isArray(geo.groups) ? geo.groups : [];
        if (index && groups.length > 0) {
            const kept = [];
            const arr = index.array;
            for (const group of groups) {
                const materialIndex = Number(group?.materialIndex) || 0;
                if (materialIndex === 5) continue; // -Z wall-facing face in BoxGeometry
                const start = Math.max(0, Number(group?.start) || 0);
                const count = Math.max(0, Number(group?.count) || 0);
                for (let i = start; i < start + count && i < arr.length; i += 1) {
                    kept.push(Number(arr[i]) || 0);
                }
            }
            if (kept.length > 0) {
                geo.setIndex(kept);
                geo.clearGroups();
                geo.addGroup(0, kept.length, 0);
            }
        }
    }

    geo.computeBoundingBox();
    geo.computeVertexNormals();
    const size = (geo.boundingBox ?? new THREE.Box3().setFromBufferAttribute(geo.getAttribute('position'))).getSize(new THREE.Vector3());
    return {
        geometry: geo,
        widthMeters: Math.max(0.01, size.x),
        heightMeters: Math.max(0.01, size.y),
        depthMeters: Math.max(0.005, size.z)
    };
}

export function normalizeCorniceRoundedCurvature(value) {
    const raw = String(value ?? '').trim().toLowerCase();
    if (raw === 'concave') return 'concave';
    return 'convex';
}

function buildCorniceRoundedArcPoints({
    startZ = 0.0,
    startY = 0.0,
    endZ = 0.0,
    endY = 0.0,
    segments = 3,
    curvature = 'convex'
} = {}) {
    const sx = Number(startZ) || 0.0;
    const sy = Number(startY) || 0.0;
    const ex = Number(endZ) || 0.0;
    const ey = Number(endY) || 0.0;
    const segCount = Math.max(1, Math.floor(Number(segments) || 1));
    const dx = ex - sx;
    const dy = ey - sy;
    const chord = Math.hypot(dx, dy);
    if (chord <= 1e-6) return [];

    const radius = Math.max(Math.abs(dx), Math.abs(dy), chord * 0.5 + 1e-6);
    const halfChord = chord * 0.5;
    const centerOffset = Math.sqrt(Math.max(0.0, radius * radius - halfChord * halfChord));
    const midX = (sx + ex) * 0.5;
    const midY = (sy + ey) * 0.5;
    const nx = -dy / chord;
    const ny = dx / chord;
    const candidates = [
        { x: midX + nx * centerOffset, y: midY + ny * centerOffset },
        { x: midX - nx * centerOffset, y: midY - ny * centerOffset }
    ];

    const sampleShortestArc = (center) => {
        const cx = Number(center?.x) || 0.0;
        const cy = Number(center?.y) || 0.0;
        const startA = Math.atan2(sy - cy, sx - cx);
        let endA = Math.atan2(ey - cy, ex - cx);
        let delta = endA - startA;
        while (delta > Math.PI) delta -= Math.PI * 2.0;
        while (delta < -Math.PI) delta += Math.PI * 2.0;
        endA = startA + delta;
        const points = [];
        for (let i = 1; i < segCount; i += 1) {
            const t = i / segCount;
            const a = startA + (endA - startA) * t;
            points.push({
                z: cx + Math.cos(a) * radius,
                y: cy + Math.sin(a) * radius
            });
        }
        return points;
    };

    const variants = candidates.map((center) => {
        const points = sampleShortestArc(center);
        let avgZ = 0.0;
        for (const p of points) avgZ += Number(p?.z) || 0.0;
        avgZ = points.length > 0 ? (avgZ / points.length) : ((sx + ex) * 0.5);
        return { points, avgZ };
    });
    if (!variants.length) return [];
    variants.sort((a, b) => (Number(a?.avgZ) || 0.0) - (Number(b?.avgZ) || 0.0));
    const mode = normalizeCorniceRoundedCurvature(curvature);
    return mode === 'concave'
        ? (variants[0]?.points ?? [])
        : (variants[variants.length - 1]?.points ?? []);
}

function createCorniceRoundedGeometry({
    widthMeters = 0.10,
    heightMeters = 0.10,
    depthMeters = 0.10,
    curvature = 'convex',
    longitudinalSegments = 1
} = {}) {
    const width = Math.max(0.01, Number(widthMeters) || 0.10);
    const height = Math.max(0.01, Number(heightMeters) || 0.10);
    const depth = Math.max(0.005, Number(depthMeters) || 0.10);
    const curveMode = normalizeCorniceRoundedCurvature(curvature);

    const halfHeight = height * 0.5;
    const halfDepth = depth * 0.5;
    const reducedFrontHeight = Math.max(1e-4, height * 0.10);
    const reducedBottomDepth = Math.max(1e-4, depth * 0.10);
    const frontBottomY = halfHeight - reducedFrontHeight;
    const bottomRightZ = -halfDepth + reducedBottomDepth;
    const blockSizeCm = Math.max(0.01, Math.max(width, height, depth)) * 100.0;
    const arcSegments = Math.max(8, Math.min(128, Math.ceil(blockSizeCm * 1.5)));
    const sweepSteps = Math.max(1, Math.min(4096, Math.floor(Number(longitudinalSegments) || 1)));

    const arcPoints = buildCorniceRoundedArcPoints({
        startZ: halfDepth,
        startY: frontBottomY,
        endZ: bottomRightZ,
        endY: -halfHeight,
        segments: arcSegments,
        curvature: curveMode
    });

    const profile = new THREE.Shape();
    profile.moveTo(-halfDepth, halfHeight);
    profile.lineTo(halfDepth, halfHeight);
    profile.lineTo(halfDepth, frontBottomY);
    for (const p of arcPoints) profile.lineTo(Number(p?.z) || 0.0, Number(p?.y) || 0.0);
    profile.lineTo(bottomRightZ, -halfHeight);
    profile.lineTo(-halfDepth, -halfHeight);
    profile.closePath();

    let geo = new THREE.ExtrudeGeometry(profile, {
        depth: width,
        bevelEnabled: false,
        steps: sweepSteps,
        curveSegments: Math.max(3, arcSegments)
    });
    geo.translate(0.0, 0.0, -width * 0.5);
    geo.rotateY(Math.PI * 0.5);
    geo.scale(1.0, 1.0, -1.0);

    // The back wall-facing cover is always hidden against the facade; omit it.
    {
        const pos = geo.getAttribute('position');
        if (pos?.count >= 3) {
            geo.computeBoundingBox();
            const wallPlaneZ = Number(geo.boundingBox?.min?.z);
            if (Number.isFinite(wallPlaneZ)) {
                if (!geo.getIndex()) {
                    const seq = [];
                    for (let i = 0; i < pos.count; i += 1) seq.push(i);
                    geo.setIndex(seq);
                }
                const index = geo.getIndex();
                const idx = index?.array ?? null;
                if (idx?.length >= 3) {
                    const kept = [];
                    let removed = 0;
                    const eps = 1e-6;
                    for (let i = 0; i + 2 < idx.length; i += 3) {
                        const i0 = Number(idx[i]) || 0;
                        const i1 = Number(idx[i + 1]) || 0;
                        const i2 = Number(idx[i + 2]) || 0;
                        const z0 = Number(pos.getZ(i0)) || 0.0;
                        const z1 = Number(pos.getZ(i1)) || 0.0;
                        const z2 = Number(pos.getZ(i2)) || 0.0;
                        const isWallTri = Math.abs(z0 - wallPlaneZ) <= eps
                            && Math.abs(z1 - wallPlaneZ) <= eps
                            && Math.abs(z2 - wallPlaneZ) <= eps;
                        if (isWallTri) {
                            removed += 1;
                            continue;
                        }
                        kept.push(i0, i1, i2);
                    }
                    if (removed > 0) {
                        geo.setIndex(kept);
                        geo.clearGroups();
                        if (kept.length > 0) geo.addGroup(0, kept.length, 0);
                    }
                }
            }
        }
    }

    flipGeometryWinding(geo);
    geo.computeBoundingBox();
    const center = (geo.boundingBox ?? new THREE.Box3().setFromBufferAttribute(geo.getAttribute('position'))).getCenter(new THREE.Vector3());
    geo.translate(-center.x, -center.y, -center.z);
    geo = smoothNormalsBySharedPosition(geo, {
        epsilon: 1e-5,
        maxSmoothingAngleDeg: 75.0
    });
    geo.computeBoundingBox();

    const size = (geo.boundingBox ?? new THREE.Box3().setFromBufferAttribute(geo.getAttribute('position'))).getSize(new THREE.Vector3());
    return {
        geometry: geo,
        widthMeters: Math.max(0.01, size.x),
        heightMeters: Math.max(0.01, size.y),
        depthMeters: Math.max(0.005, size.z)
    };
}

function createAwningSlantedPlaneGeometry({
    spanWidthMeters = 1.0,
    projectionMeters = 0.80,
    slopeDropMeters = 0.20
} = {}) {
    const width = Math.max(0.01, Number(spanWidthMeters) || 1.0);
    const projection = Math.max(0.05, Number(projectionMeters) || 0.80);
    const drop = Math.max(0.0, Number(slopeDropMeters) || 0.0);
    const halfWidth = width * 0.5;
    const halfProjection = projection * 0.5;
    const halfDrop = drop * 0.5;

    const positions = [
        -halfWidth, halfDrop, -halfProjection,
        halfWidth, -halfDrop, halfProjection,
        halfWidth, halfDrop, -halfProjection,
        -halfWidth, halfDrop, -halfProjection,
        -halfWidth, -halfDrop, halfProjection,
        halfWidth, -halfDrop, halfProjection
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const pos = geo.getAttribute('position');
    const uv = [];
    for (let i = 0; i < pos.count; i += 1) {
        const x = Number(pos.getX(i)) || 0.0;
        const z = Number(pos.getZ(i)) || 0.0;
        const u = (x + halfWidth) / Math.max(1e-6, width);
        const v = 1.0 - ((z + halfProjection) / Math.max(1e-6, projection));
        uv.push(u, v);
    }
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeBoundingBox();
    geo.computeVertexNormals();
    return {
        geometry: geo,
        widthMeters: width,
        heightMeters: Math.max(0.01, Math.hypot(projection, drop)),
        depthMeters: 0.0
    };
}

function createAwningFrontQuadGeometry({
    spanWidthMeters = 1.0,
    faceHeightMeters = 0.30
} = {}) {
    const width = Math.max(0.01, Number(spanWidthMeters) || 1.0);
    const height = Math.max(0.01, Number(faceHeightMeters) || 0.30);
    const halfWidth = width * 0.5;
    const halfHeight = height * 0.5;

    const positions = [
        -halfWidth, halfHeight, 0.0,
        halfWidth, -halfHeight, 0.0,
        halfWidth, halfHeight, 0.0,
        -halfWidth, halfHeight, 0.0,
        -halfWidth, -halfHeight, 0.0,
        halfWidth, -halfHeight, 0.0
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const pos = geo.getAttribute('position');
    const uv = [];
    for (let i = 0; i < pos.count; i += 1) {
        const x = Number(pos.getX(i)) || 0.0;
        const y = Number(pos.getY(i)) || 0.0;
        const u = (x + halfWidth) / Math.max(1e-6, width);
        const v = (y + halfHeight) / Math.max(1e-6, height);
        uv.push(u, v);
    }
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeBoundingBox();
    geo.computeVertexNormals();
    return {
        geometry: geo,
        widthMeters: width,
        heightMeters: height,
        depthMeters: 0.0
    };
}

function createAwningSupportRodGeometry({
    startU = 0.0,
    startV = 0.0,
    startOutsetMeters = 0.0,
    endU = 0.0,
    endV = 0.0,
    endOutsetMeters = 0.0,
    radiusMeters = 0.015,
    radialSegments = 10
} = {}) {
    const radius = Math.max(0.001, Number(radiusMeters) || 0.015);
    const segments = Math.max(3, Math.min(32, Math.floor(Number(radialSegments) || 10)));
    const start = new THREE.Vector3(
        Number(startU) || 0.0,
        Number(startV) || 0.0,
        Number(startOutsetMeters) || 0.0
    );
    const end = new THREE.Vector3(
        Number(endU) || 0.0,
        Number(endV) || 0.0,
        Number(endOutsetMeters) || 0.0
    );
    const axis = end.clone().sub(start);
    const length = Math.max(1e-4, axis.length());
    const geo = new THREE.CylinderGeometry(radius, radius, length, segments, 1, false);

    const up = new THREE.Vector3(0, 1, 0);
    if (axis.lengthSq() <= 1e-8) axis.copy(up);
    axis.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(up, axis);
    const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
    const mid = start.clone().add(end).multiplyScalar(0.5);
    m.setPosition(mid);
    geo.applyMatrix4(m);
    geo.computeBoundingBox();
    geo.computeVertexNormals();

    return {
        geometry: geo,
        widthMeters: Math.max(0.01, Math.PI * 2.0 * radius),
        heightMeters: Math.max(0.01, length),
        depthMeters: Math.max(0.005, radius * 2.0)
    };
}

function createFlatCapGeometry({
    spanWidthMeters = 1.0,
    capDepthMeters = 0.05,
    cornerBridgeStartMeters = 0.0,
    cornerBridgeEndMeters = 0.0,
    faceDown = false,
    wallEdgeYOffsetMeters = 0.0
} = {}) {
    const width = Math.max(0.01, Number(spanWidthMeters) || 1.0);
    const depth = Math.max(0.005, Number(capDepthMeters) || 0.05);
    const bridgeStart = Math.max(0.0, Number(cornerBridgeStartMeters) || 0.0);
    const bridgeEnd = Math.max(0.0, Number(cornerBridgeEndMeters) || 0.0);
    const wallEdgeYOffset = Number(wallEdgeYOffsetMeters) || 0.0;
    const halfWidth = width * 0.5;
    const halfDepth = depth * 0.5;
    const positions = [];
    const invertWinding = !!faceDown;

    const pushTri = (ax, az, bx, bz, cx, cz) => {
        const ay = az <= 0.0 ? wallEdgeYOffset : 0.0;
        const by = bz <= 0.0 ? wallEdgeYOffset : 0.0;
        const cy = cz <= 0.0 ? wallEdgeYOffset : 0.0;
        if (invertWinding) {
            positions.push(ax, ay, az, cx, cy, cz, bx, by, bz);
            return;
        }
        positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    };

    pushTri(-halfWidth, -halfDepth, halfWidth, halfDepth, halfWidth, -halfDepth);
    pushTri(-halfWidth, -halfDepth, -halfWidth, halfDepth, halfWidth, halfDepth);

    if (bridgeEnd > 1e-6) {
        const edgeX = halfWidth + bridgeEnd;
        pushTri(halfWidth, -halfDepth, halfWidth, halfDepth, edgeX, halfDepth);
    }
    if (bridgeStart > 1e-6) {
        const edgeX = -halfWidth - bridgeStart;
        pushTri(-halfWidth, -halfDepth, edgeX, halfDepth, -halfWidth, halfDepth);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const pos = geo.getAttribute('position');
    const box = new THREE.Box3().setFromBufferAttribute(pos);
    const minX = Number(box.min.x) || 0.0;
    const maxX = Number(box.max.x) || 0.0;
    const minZ = Number(box.min.z) || 0.0;
    const maxZ = Number(box.max.z) || 0.0;
    const spanX = Math.max(1e-6, maxX - minX);
    const spanZ = Math.max(1e-6, maxZ - minZ);
    const uv = [];
    for (let i = 0; i < pos.count; i += 1) {
        const x = Number(pos.getX(i)) || 0.0;
        const z = Number(pos.getZ(i)) || 0.0;
        uv.push(
            (x - minX) / spanX,
            (z - minZ) / spanZ
        );
    }
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));

    geo.computeBoundingBox();
    geo.computeVertexNormals();

    const size = (geo.boundingBox ?? new THREE.Box3().setFromBufferAttribute(pos)).getSize(new THREE.Vector3());
    return {
        geometry: geo,
        widthMeters: Math.max(0.01, size.x),
        heightMeters: Math.max(0.005, size.z),
        depthMeters: depth
    };
}

function createFlatSideCapGeometry({
    spanDepthMeters = 0.05,
    spanHeightMeters = 0.20,
    wallEdgeTopYOffsetMeters = 0.0,
    wallEdgeBottomYOffsetMeters = 0.0,
    wallEdgeFlip = false
} = {}) {
    const depth = Math.max(0.005, Number(spanDepthMeters) || 0.05);
    const height = Math.max(0.01, Number(spanHeightMeters) || 0.20);
    const topYOffset = Number(wallEdgeTopYOffsetMeters) || 0.0;
    const bottomYOffset = Number(wallEdgeBottomYOffsetMeters) || 0.0;
    const wallAtPositive = !!wallEdgeFlip;
    const halfDepth = depth * 0.5;
    const halfHeight = height * 0.5;
    const wallZ = wallAtPositive ? halfDepth : -halfDepth;
    const outerZ = -wallZ;
    const invertWinding = wallAtPositive;

    const positions = [];
    const pushTri = (ay, az, by, bz, cy, cz) => {
        if (invertWinding) {
            positions.push(0.0, ay, az, 0.0, cy, cz, 0.0, by, bz);
            return;
        }
        positions.push(0.0, ay, az, 0.0, by, bz, 0.0, cy, cz);
    };
    pushTri(-halfHeight + bottomYOffset, wallZ, halfHeight + topYOffset, wallZ, halfHeight, outerZ);
    pushTri(-halfHeight + bottomYOffset, wallZ, halfHeight, outerZ, -halfHeight, outerZ);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const pos = geo.getAttribute('position');
    const box = new THREE.Box3().setFromBufferAttribute(pos);
    const minY = Number(box.min.y) || 0.0;
    const maxY = Number(box.max.y) || 0.0;
    const minZ = Number(box.min.z) || 0.0;
    const maxZ = Number(box.max.z) || 0.0;
    const spanY = Math.max(1e-6, maxY - minY);
    const spanZ = Math.max(1e-6, maxZ - minZ);
    const uv = [];
    for (let i = 0; i < pos.count; i += 1) {
        const y = Number(pos.getY(i)) || 0.0;
        const z = Number(pos.getZ(i)) || 0.0;
        uv.push((z - minZ) / spanZ, (y - minY) / spanY);
    }
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));

    geo.computeBoundingBox();
    geo.computeVertexNormals();
    const size = (geo.boundingBox ?? new THREE.Box3().setFromBufferAttribute(pos)).getSize(new THREE.Vector3());
    return {
        geometry: geo,
        widthMeters: Math.max(0.005, size.z),
        heightMeters: Math.max(0.01, size.y),
        depthMeters: 0.0
    };
}

export function createWallDecoratorGeometryFromSpec(spec, {
    fallbackToBox = true
} = {}) {
    const geometryKind = String(spec?.geometryKind ?? '').trim().toLowerCase();
    const widthMeters = clamp(spec?.widthMeters, 0.01, 100.0, 1.0);
    const heightMeters = clamp(spec?.heightMeters, 0.01, 100.0, 0.2);
    const depthMeters = clamp(spec?.depthMeters, 0.005, 10.0, 0.08);
    const centerU = Number(spec?.centerU) || 0.0;
    const centerV = Number(spec?.centerV) || 0.0;
    const outsetMeters = Math.max(0.0, Number(spec?.outsetMeters ?? spec?.surfaceOffsetMeters) || 0.0);

    let geometry = null;
    let surfaceWidthMeters = widthMeters;
    let surfaceHeightMeters = heightMeters;
    let placementDepthMeters = depthMeters;

    if (geometryKind === 'flat_panel') {
        geometry = new THREE.PlaneGeometry(widthMeters, heightMeters);
        placementDepthMeters = 0.0;
    } else if (geometryKind === 'flat_panel_side_cap') {
        const sideCap = createFlatSideCapGeometry({
            spanDepthMeters: widthMeters,
            spanHeightMeters: heightMeters,
            wallEdgeTopYOffsetMeters: clamp(spec?.wallEdgeTopYOffsetMeters, -4.0, 4.0, 0.0),
            wallEdgeBottomYOffsetMeters: clamp(spec?.wallEdgeBottomYOffsetMeters, -4.0, 4.0, 0.0),
            wallEdgeFlip: spec?.wallEdgeFlip === true
        });
        geometry = sideCap.geometry;
        surfaceWidthMeters = sideCap.widthMeters;
        surfaceHeightMeters = sideCap.heightMeters;
        placementDepthMeters = 0.0;
    } else if (geometryKind === 'flat_panel_cap') {
        const capSide = String(spec?.capSide ?? '').trim().toLowerCase();
        const cap = createFlatCapGeometry({
            spanWidthMeters: widthMeters,
            capDepthMeters: depthMeters,
            cornerBridgeStartMeters: clamp(spec?.cornerBridgeStartMeters, 0.0, 10.0, 0.0),
            cornerBridgeEndMeters: clamp(spec?.cornerBridgeEndMeters, 0.0, 10.0, 0.0),
            faceDown: capSide === 'bottom',
            wallEdgeYOffsetMeters: clamp(spec?.wallEdgeYOffsetMeters, -4.0, 4.0, 0.0)
        });
        geometry = cap.geometry;
        surfaceWidthMeters = cap.widthMeters;
        surfaceHeightMeters = cap.heightMeters;
        placementDepthMeters = cap.depthMeters;
    } else if (geometryKind === 'curved_ring' || geometryKind === 'half_dome') {
        const legacyMiter = String(spec?.cornerMiter45 ?? '').trim().toLowerCase();
        const ring = createCurvedRingGeometry({
            segmentWidthMeters: widthMeters,
            diameterMeters: heightMeters,
            longitudinalSegments: Math.max(1, Math.floor(Number(spec?.longitudinalSegments) || 1)),
            miterStyle: String(spec?.miterStyle ?? '').trim().toLowerCase() === 'inward' ? 'inward' : 'outward',
            miterStart45: spec?.miterStart45 === true || legacyMiter === 'negative_u',
            miterEnd45: spec?.miterEnd45 === true || legacyMiter === 'positive_u'
        });
        geometry = ring.geometry;
        surfaceWidthMeters = ring.widthMeters;
        surfaceHeightMeters = ring.heightMeters;
        placementDepthMeters = ring.depthMeters;
    } else if (geometryKind === 'edge_brick_chain_course') {
        const mitered = createMiteredBoxGeometry({
            widthMeters,
            heightMeters,
            depthMeters,
            miterStyle: String(spec?.miterStyle ?? '').trim().toLowerCase() === 'inward' ? 'inward' : 'outward',
            removeTopFace: spec?.edgeChainRemoveTopFace !== false,
            removeBottomFace: spec?.edgeChainRemoveBottomFace !== false,
            removeStartFace: spec?.edgeChainRemoveStartFace === true,
            removeEndFace: spec?.edgeChainRemoveEndFace === true,
            removeOuterFace: spec?.edgeChainRemoveOuterFace === true,
            removeWallFace: spec?.edgeChainRemoveWallFace === true,
            miterStart45: spec?.miterStart45 === true,
            miterEnd45: spec?.miterEnd45 === true
        });
        geometry = mitered.geometry;
        surfaceWidthMeters = mitered.widthMeters;
        surfaceHeightMeters = mitered.heightMeters;
        placementDepthMeters = mitered.depthMeters;
    } else if (geometryKind === 'angled_support_profile') {
        const profile = createAngledSupportProfileGeometry({
            segmentWidthMeters: widthMeters,
            offsetMeters: clamp(spec?.profileOffsetMeters ?? depthMeters, 0.005, 10.0, depthMeters),
            shiftMeters: clamp(spec?.profileShiftMeters, -10.0, 10.0, 0.0),
            returnHeightMeters: clamp(spec?.profileReturnHeightMeters ?? heightMeters, 0.01, 10.0, heightMeters),
            miterTopAngleDeg: clamp(spec?.miterTopAngleDeg, 10.0, 80.0, 45.0),
            miterBottomAngleDeg: clamp(spec?.miterBottomAngleDeg, 10.0, 80.0, 45.0),
            miterStart45: spec?.miterStart45 === true,
            miterEnd45: spec?.miterEnd45 === true
        });
        geometry = profile.geometry;
        surfaceWidthMeters = profile.widthMeters;
        surfaceHeightMeters = profile.heightMeters;
        placementDepthMeters = profile.depthMeters;
    } else if (geometryKind === 'cornice_block') {
        const corniceBlock = createCorniceBlockGeometry({
            widthMeters,
            heightMeters,
            depthMeters,
            frontBottomLiftMeters: clamp(spec?.corniceFrontBottomLiftMeters, 0.0, heightMeters, 0.0)
        });
        geometry = corniceBlock.geometry;
        surfaceWidthMeters = corniceBlock.widthMeters;
        surfaceHeightMeters = corniceBlock.heightMeters;
        placementDepthMeters = corniceBlock.depthMeters;
    } else if (geometryKind === 'cornice_rounded_block') {
        const corniceRounded = createCorniceRoundedGeometry({
            widthMeters,
            heightMeters,
            depthMeters,
            curvature: normalizeCorniceRoundedCurvature(spec?.corniceRoundedCurvature),
            longitudinalSegments: Math.max(1, Math.floor(Number(spec?.longitudinalSegments) || 1))
        });
        geometry = corniceRounded.geometry;
        surfaceWidthMeters = corniceRounded.widthMeters;
        surfaceHeightMeters = corniceRounded.heightMeters;
        placementDepthMeters = corniceRounded.depthMeters;
    } else if (geometryKind === 'awning_slanted_plane') {
        const awningSlanted = createAwningSlantedPlaneGeometry({
            spanWidthMeters: widthMeters,
            projectionMeters: clamp(spec?.awningProjectionMeters ?? depthMeters, 0.05, 10.0, depthMeters),
            slopeDropMeters: clamp(spec?.awningSlopeDropMeters, 0.0, 10.0, 0.0)
        });
        geometry = awningSlanted.geometry;
        surfaceWidthMeters = awningSlanted.widthMeters;
        surfaceHeightMeters = awningSlanted.heightMeters;
        placementDepthMeters = awningSlanted.depthMeters;
    } else if (geometryKind === 'awning_front_quad') {
        const awningFront = createAwningFrontQuadGeometry({
            spanWidthMeters: widthMeters,
            faceHeightMeters: heightMeters
        });
        geometry = awningFront.geometry;
        surfaceWidthMeters = awningFront.widthMeters;
        surfaceHeightMeters = awningFront.heightMeters;
        placementDepthMeters = awningFront.depthMeters;
    } else if (geometryKind === 'awning_support_rod') {
        const rodStartU = Number.isFinite(Number(spec?.rodStartU)) ? Number(spec.rodStartU) : centerU;
        const rodStartV = Number.isFinite(Number(spec?.rodStartV)) ? Number(spec.rodStartV) : centerV;
        const rodStartOutsetMeters = Number.isFinite(Number(spec?.rodStartOutsetMeters))
            ? Number(spec.rodStartOutsetMeters)
            : outsetMeters;
        const rodEndU = Number.isFinite(Number(spec?.rodEndU)) ? Number(spec.rodEndU) : centerU;
        const rodEndV = Number.isFinite(Number(spec?.rodEndV)) ? Number(spec.rodEndV) : centerV;
        const rodEndOutsetMeters = Number.isFinite(Number(spec?.rodEndOutsetMeters))
            ? Number(spec.rodEndOutsetMeters)
            : outsetMeters;
        const awningRod = createAwningSupportRodGeometry({
            startU: rodStartU - centerU,
            startV: rodStartV - centerV,
            startOutsetMeters: rodStartOutsetMeters - outsetMeters,
            endU: rodEndU - centerU,
            endV: rodEndV - centerV,
            endOutsetMeters: rodEndOutsetMeters - outsetMeters,
            radiusMeters: clamp(spec?.rodRadiusMeters, 0.001, 0.5, 0.015),
            radialSegments: 10
        });
        geometry = awningRod.geometry;
        surfaceWidthMeters = awningRod.widthMeters;
        surfaceHeightMeters = awningRod.heightMeters;
        placementDepthMeters = 0.0;
    } else {
        const wantsGenericMiter = spec?.miterStart45 === true || spec?.miterEnd45 === true;
        if (wantsGenericMiter) {
            const mitered = createMiteredBoxGeometry({
                widthMeters,
                heightMeters,
                depthMeters,
                miterStart45: spec?.miterStart45 === true,
                miterEnd45: spec?.miterEnd45 === true
            });
            geometry = mitered.geometry;
            surfaceWidthMeters = mitered.widthMeters;
            surfaceHeightMeters = mitered.heightMeters;
            placementDepthMeters = mitered.depthMeters;
        } else if (fallbackToBox) {
            geometry = new THREE.BoxGeometry(widthMeters, heightMeters, depthMeters);
            surfaceWidthMeters = widthMeters;
            surfaceHeightMeters = heightMeters;
            placementDepthMeters = depthMeters;
        }
    }

    return {
        geometry,
        geometryKind,
        surfaceWidthMeters,
        surfaceHeightMeters,
        placementDepthMeters
    };
}
