// src/graphics/visuals/atmosphere/SunDirection.js
// Sun direction helpers (azimuth/elevation in degrees).
// @ts-check

import * as THREE from 'three';

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

export function azimuthElevationDegToDir(azimuthDeg, elevationDeg) {
    const az = (Number(azimuthDeg) * Math.PI) / 180;
    const el = (Number(elevationDeg) * Math.PI) / 180;
    const cosEl = Math.cos(el);
    return new THREE.Vector3(
        Math.cos(az) * cosEl,
        Math.sin(el),
        Math.sin(az) * cosEl
    ).normalize();
}

export function dirToAzimuthElevationDeg(dir) {
    const d = dir?.isVector3 ? dir : null;
    if (!d) return { azimuthDeg: 45, elevationDeg: 35 };
    const x = Number(d.x);
    const y = Number(d.y);
    const z = Number(d.z);
    const len = Math.hypot(x, y, z);
    if (!(len > 1e-8)) return { azimuthDeg: 45, elevationDeg: 35 };
    const nx = x / len;
    const ny = y / len;
    const nz = z / len;
    const elevation = Math.asin(clamp(ny, -1, 1));
    const azimuth = Math.atan2(nz, nx);
    const azimuthDeg = ((azimuth * 180) / Math.PI + 360) % 360;
    const elevationDeg = clamp((elevation * 180) / Math.PI, 0, 89);
    return { azimuthDeg, elevationDeg };
}

