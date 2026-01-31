// src/graphics/engine3d/grass/GrassGeometry.js
// Procedural grass geometries for GPU instancing.
// @ts-check

import * as THREE from 'three';
import { makeRng } from './GrassRng.js';

function clamp(value, min, max, fallback = min) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function pushColoredQuad({ positions, colors, yawRad, offsetX, offsetZ, width = 1.0, height = 1.0, bottom = 0.6, top = 1.0 } = {}) {
    const c = Math.cos(Number(yawRad) || 0);
    const s = Math.sin(Number(yawRad) || 0);
    const ox = Number(offsetX) || 0;
    const oz = Number(offsetZ) || 0;

    const half = (Number(width) || 1.0) * 0.5;
    const h = Number(height) || 1.0;

    const bl = { x: -half, y: 0, z: 0, t: bottom };
    const br = { x: half, y: 0, z: 0, t: bottom };
    const tl = { x: -half, y: h, z: 0, t: top };
    const tr = { x: half, y: h, z: 0, t: top };

    const rot = (v) => ({ x: v.x * c - v.z * s + ox, y: v.y, z: v.x * s + v.z * c + oz, t: v.t });
    const a = rot(bl);
    const b = rot(tl);
    const c0 = rot(br);
    const d = rot(tr);

    const push = (v) => {
        positions.push(v.x, v.y, v.z);
        colors.push(v.t, v.t, v.t);
    };

    push(a);
    push(b);
    push(c0);
    push(c0);
    push(b);
    push(d);
}

function pushColoredTriangle({ positions, colors, yawRad, offsetX = 0, offsetZ = 0, width = 1.0, height = 1.0, bottom = 0.6, top = 1.0, tipOffset = 0.0 } = {}) {
    const c = Math.cos(Number(yawRad) || 0);
    const s = Math.sin(Number(yawRad) || 0);
    const ox = Number(offsetX) || 0;
    const oz = Number(offsetZ) || 0;

    const half = (Number(width) || 1.0) * 0.5;
    const h = Number(height) || 1.0;
    const tip = clamp(tipOffset, -0.65, 0.65, 0.0);

    const rot = (x, z) => ({
        x: x * c - z * s + ox,
        z: x * s + z * c + oz
    });

    const bl = rot(-half, 0);
    const br = rot(half, 0);
    const tp = rot(0, tip);

    positions.push(
        bl.x, 0, bl.z,
        br.x, 0, br.z,
        tp.x, h, tp.z
    );

    colors.push(
        bottom, bottom, bottom,
        bottom, bottom, bottom,
        top, top, top
    );
}

export function createGrassCrossGeometry() {
    const positions = [];
    const colors = [];
    pushColoredQuad({ positions, colors, yawRad: 0 });
    pushColoredQuad({ positions, colors, yawRad: Math.PI * 0.5 });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
}

export function createGrassStarGeometry() {
    const positions = [];
    const colors = [];
    const a0 = 0;
    const a1 = Math.PI / 3;
    const a2 = (Math.PI * 2) / 3;
    pushColoredQuad({ positions, colors, yawRad: a0 });
    pushColoredQuad({ positions, colors, yawRad: a1 });
    pushColoredQuad({ positions, colors, yawRad: a2 });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
}

export function createGrassBladeGeometry() {
    const positions = [];
    const colors = [];
    pushColoredTriangle({ positions, colors, yawRad: 0, width: 1.0, height: 1.0, bottom: 0.55, top: 1.0, tipOffset: 0.18 });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
}

export function createGrassBladeTuftGeometry({ bladesPerTuft = 9, radius = 0.09, seed = 'tuft' } = {}) {
    const count = Math.max(1, Math.round(clamp(bladesPerTuft, 1, 64, 9)));
    const r = clamp(radius, 0.0, 6.0, 0.09);
    const rng = makeRng(`${String(seed)}|blades:${count}|r:${r.toFixed(4)}`);

    const positions = [];
    const colors = [];

    const bases = [];
    const minDist = r > 1e-6 ? (r * 0.85 / Math.sqrt(count)) : 0;
    const minDist2 = minDist * minDist;

    for (let i = 0; i < count; i++) {
        let ox = 0;
        let oz = 0;
        for (let tries = 0; tries < 32; tries++) {
            const angle = rng() * Math.PI * 2;
            const offset = Math.sqrt(rng()) * r;
            const cx = Math.cos(angle) * offset;
            const cz = Math.sin(angle) * offset;

            let ok = true;
            if (minDist2 > 0 && bases.length) {
                for (let j = 0; j < bases.length; j++) {
                    const dx = cx - bases[j].x;
                    const dz = cz - bases[j].z;
                    if (dx * dx + dz * dz < minDist2) {
                        ok = false;
                        break;
                    }
                }
            }

            ox = cx;
            oz = cz;
            if (ok) break;
        }
        bases.push({ x: ox, z: oz });

        const yaw = rng() * Math.PI * 2;
        const width = 0.9 + rng() * 0.25;
        const height = 0.88 + rng() * 0.28;
        const bottom = 0.48 + rng() * 0.16;
        const top = 0.96 + rng() * 0.09;
        const tipOffset = (rng() - 0.5) * 0.35;
        pushColoredTriangle({ positions, colors, yawRad: yaw, offsetX: ox, offsetZ: oz, width, height, bottom, top, tipOffset });
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
}
