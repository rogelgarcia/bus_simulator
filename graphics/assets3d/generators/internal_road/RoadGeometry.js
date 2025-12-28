// graphics/assets3d/generators/internal_road/RoadGeometry.js
import * as THREE from 'three';

export function ensureNonIndexedWithUV(g) {
    const gg = g.index ? g.toNonIndexed() : g;
    if (!gg.attributes.uv) {
        const pos = gg.attributes.position;
        const uv = new Float32Array(pos.count * 2);
        gg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }
    return gg;
}

export function mergeBufferGeometries(geoms) {
    if (!geoms || geoms.length === 0) return null;

    let totalVerts = 0;
    let hasColor = false;
    for (const g0 of geoms) {
        const g = ensureNonIndexedWithUV(g0);
        totalVerts += g.attributes.position.count;
        if (g.attributes.color) hasColor = true;
    }

    const outPos = new Float32Array(totalVerts * 3);
    const outNor = new Float32Array(totalVerts * 3);
    const outUv = new Float32Array(totalVerts * 2);
    const outColor = hasColor ? new Float32Array(totalVerts * 3) : null;

    let v = 0;
    for (const g0 of geoms) {
        const g = ensureNonIndexedWithUV(g0);
        outPos.set(g.attributes.position.array, v * 3);
        outNor.set(g.attributes.normal.array, v * 3);
        outUv.set(g.attributes.uv.array, v * 2);
        if (outColor) {
            if (g.attributes.color) {
                outColor.set(g.attributes.color.array, v * 3);
            } else {
                outColor.fill(1, v * 3, (v + g.attributes.position.count) * 3);
            }
        }
        v += g.attributes.position.count;
    }

    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(outPos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(outNor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(outUv, 2));
    if (outColor) out.setAttribute('color', new THREE.BufferAttribute(outColor, 3));
    out.computeBoundingSphere?.();
    return out;
}

export function applyQuadrantMirrorNonIndexed(geom, signX, signZ) {
    const g = geom.index ? geom.toNonIndexed() : geom;

    const m = new THREE.Matrix4().makeScale(signX, 1, signZ);
    g.applyMatrix4(m);

    if (signX * signZ < 0) {
        const pos = g.attributes.position.array;
        const nor = g.attributes.normal?.array;
        const uv = g.attributes.uv?.array;

        for (let i = 0; i < pos.length; i += 9) {
            for (let k = 0; k < 3; k++) {
                const a = i + 3 + k;
                const b = i + 6 + k;
                const tmp = pos[a];
                pos[a] = pos[b];
                pos[b] = tmp;
            }

            if (nor) {
                for (let k = 0; k < 3; k++) {
                    const a = i + 3 + k;
                    const b = i + 6 + k;
                    const tmp = nor[a];
                    nor[a] = nor[b];
                    nor[b] = tmp;
                }
            }

            if (uv) {
                const tri = (i / 9) | 0;
                const u = tri * 6;

                for (let k = 0; k < 2; k++) {
                    const a = u + 2 + k;
                    const b = u + 4 + k;
                    const tmp = uv[a];
                    uv[a] = uv[b];
                    uv[b] = tmp;
                }
            }
        }

        g.attributes.position.needsUpdate = true;
        if (g.attributes.normal) g.attributes.normal.needsUpdate = true;
        if (g.attributes.uv) g.attributes.uv.needsUpdate = true;

        g.computeVertexNormals?.();
    }

    return g;
}

export function applyWorldSpaceUV_XZ(geometry, metersPerRepeat = 4.0) {
    if (!geometry?.attributes?.position) return geometry;
    const pos = geometry.attributes.position;
    const scale = 1 / Math.max(0.0001, metersPerRepeat);
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
        uv[i * 2] = pos.getX(i) * scale;
        uv[i * 2 + 1] = pos.getZ(i) * scale;
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.attributes.uv.needsUpdate = true;
    return geometry;
}
