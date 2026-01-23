// src/graphics/visuals/city/RoadMarkingsMeshes.js
// Builds THREE meshes for road markings (lines, crosswalks, arrows) from RoadMarkingsBuilder mesh data.

import * as THREE from 'three';

const EPS = 1e-9;

function clampNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function buildUpNormals(positionArray) {
    const positions = positionArray instanceof Float32Array ? positionArray : null;
    if (!positions || positions.length % 3 !== 0) return null;
    const normals = new Float32Array(positions.length);
    for (let i = 0; i + 2 < normals.length; i += 3) {
        normals[i] = 0;
        normals[i + 1] = 1;
        normals[i + 2] = 0;
    }
    return normals;
}

function addUpNormals(geo) {
    if (!geo || geo.getAttribute?.('normal')) return;
    const pos = geo.getAttribute?.('position') ?? null;
    const normals = buildUpNormals(pos?.array ?? null);
    if (!normals) return;
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
}

function buildThickLinePositions(lineSegments, { halfWidth }) {
    const segs = lineSegments instanceof Float32Array ? lineSegments : (Array.isArray(lineSegments) ? new Float32Array(lineSegments) : null);
    if (!segs?.length) return null;

    const half = clampNumber(halfWidth, 0);
    if (!(half > EPS)) return null;

    const positions = [];
    for (let i = 0; i + 5 < segs.length; i += 6) {
        const x0 = Number(segs[i]) || 0;
        const y0 = Number(segs[i + 1]) || 0;
        const z0 = Number(segs[i + 2]) || 0;
        const x1 = Number(segs[i + 3]) || 0;
        const y1 = Number(segs[i + 4]) || 0;
        const z1 = Number(segs[i + 5]) || 0;
        const dx = x1 - x0;
        const dz = z1 - z0;
        const len = Math.hypot(dx, dz);
        if (!(len > 1e-6)) continue;
        const inv = 1 / len;
        const nx = dz * inv;
        const nz = -dx * inv;

        const ax0 = x0 + nx * half;
        const az0 = z0 + nz * half;
        const bx0 = x0 - nx * half;
        const bz0 = z0 - nz * half;
        const ax1 = x1 + nx * half;
        const az1 = z1 + nz * half;
        const bx1 = x1 - nx * half;
        const bz1 = z1 - nz * half;

        positions.push(
            ax0, y0, az0,
            bx0, y0, bz0,
            bx1, y1, bz1,
            ax0, y0, az0,
            bx1, y1, bz1,
            ax1, y1, az1
        );
    }

    return positions.length ? new Float32Array(positions) : null;
}

function buildTriangleGeometryFromPositions(positionArray) {
    const positions = positionArray instanceof Float32Array ? positionArray : null;
    if (!positions?.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    addUpNormals(geo);
    geo.computeBoundingSphere();
    return geo;
}

function buildThickLineGeometry(lineSegments, { laneWidth, widthFactor = 0.07, minWidth = 0.02 } = {}) {
    const lw = Math.max(EPS, clampNumber(laneWidth, 4.8));
    const width = Math.max(clampNumber(minWidth, 0), lw * clampNumber(widthFactor, 0.07));
    const positions = buildThickLinePositions(lineSegments, { halfWidth: width * 0.5 });
    return buildTriangleGeometryFromPositions(positions);
}

export function createRoadMarkingsMeshesFromData(
    data,
    {
        laneWidth = 4.8,
        materials = null,
        renderOrder = null,
        includeArrowTangents = false,
        userData = null
    } = {}
) {
    const mats = materials && typeof materials === 'object' ? materials : {};
    const meta = userData && typeof userData === 'object' ? userData : {};

    const whiteMat = mats.white ?? mats.arrow ?? null;
    const yellowMat = mats.yellow ?? null;
    const crosswalkMat = mats.crosswalk ?? whiteMat;
    const arrowMat = mats.arrow ?? whiteMat;
    const arrowTangentMat = mats.arrowTangent ?? null;
    const orders = renderOrder && typeof renderOrder === 'object' ? renderOrder : null;

    const applyRenderOrder = (mesh, key) => {
        if (!mesh || !orders || !Object.prototype.hasOwnProperty.call(orders, key)) return;
        const n = Number(orders[key]);
        if (Number.isFinite(n)) mesh.renderOrder = n;
    };

    const out = {
        markingsWhite: null,
        markingsYellow: null,
        crosswalks: null,
        arrows: null,
        arrowTangents: null
    };

    const whiteSegs = data?.whiteLineSegments ?? null;
    if (whiteMat && whiteSegs?.length) {
        const geo = buildThickLineGeometry(whiteSegs, { laneWidth });
        if (geo) {
            const mesh = new THREE.Mesh(geo, whiteMat);
            mesh.name = 'MarkingsWhite';
            mesh.userData = meta.white != null ? meta.white : { type: 'lane_markings_white' };
            applyRenderOrder(mesh, 'white');
            out.markingsWhite = mesh;
        }
    }

    const yellowSegs = data?.yellowLineSegments ?? null;
    if (yellowMat && yellowSegs?.length) {
        const geo = buildThickLineGeometry(yellowSegs, { laneWidth });
        if (geo) {
            const mesh = new THREE.Mesh(geo, yellowMat);
            mesh.name = 'MarkingsYellow';
            mesh.userData = meta.yellow != null ? meta.yellow : { type: 'lane_markings_centerline' };
            applyRenderOrder(mesh, 'yellow');
            out.markingsYellow = mesh;
        }
    }

    const crosswalkPositions = data?.crosswalkPositions ?? null;
    if (crosswalkMat && crosswalkPositions?.length) {
        const geo = buildTriangleGeometryFromPositions(crosswalkPositions instanceof Float32Array ? crosswalkPositions : new Float32Array(crosswalkPositions));
        if (geo) {
            const mesh = new THREE.Mesh(geo, crosswalkMat);
            mesh.name = 'Crosswalks';
            mesh.userData = meta.crosswalk != null ? meta.crosswalk : { type: 'crosswalks' };
            applyRenderOrder(mesh, 'crosswalk');
            out.crosswalks = mesh;
        }
    }

    const arrowPositions = data?.arrowPositions ?? null;
    if (arrowMat && arrowPositions?.length) {
        const geo = buildTriangleGeometryFromPositions(arrowPositions instanceof Float32Array ? arrowPositions : new Float32Array(arrowPositions));
        if (geo) {
            const mesh = new THREE.Mesh(geo, arrowMat);
            mesh.name = 'LaneArrows';
            mesh.userData = meta.arrow != null ? meta.arrow : { type: 'lane_arrows' };
            applyRenderOrder(mesh, 'arrow');
            out.arrows = mesh;
        }
    }

    const arrowTangentSegments = data?.arrowTangentSegments ?? null;
    if (includeArrowTangents && arrowTangentMat && arrowTangentSegments?.length) {
        const segs = arrowTangentSegments instanceof Float32Array ? arrowTangentSegments : new Float32Array(arrowTangentSegments);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(segs, 3));
        geo.computeBoundingSphere();
        const lines = new THREE.LineSegments(geo, arrowTangentMat);
        lines.name = 'ArrowTangents';
        lines.userData = meta.arrowTangent != null ? meta.arrowTangent : { type: 'arrow_tangents' };
        applyRenderOrder(lines, 'arrowTangent');
        out.arrowTangents = lines;
    }

    return out;
}
