// src/graphics/assets3d/generators/building_fabrication/RooftopPropGeometry.js
// Turns rooftop prop placements (AI 492) into building-local geometry.
//
// Props are procedural rather than mesh_fabrication assets: they are seen from
// street level at distance, so the budget matters far more than detail, and
// procedural parts merge straight into the building's material buckets without
// an asset load. Every part is a box or a low-segment cylinder and is emitted
// under one of the shared material roles, so a whole roof collapses into at
// most four merged meshes.
// @ts-check
import * as THREE from 'three';
import { ROOFTOP_PROP_MATERIAL_ROLE, ROOFTOP_PROP_TYPE } from '../../../../app/buildings/RooftopPropsModel.js';

const RADIAL_SEGMENTS_ROUND = 12;
const RADIAL_SEGMENTS_PIPE = 8;

const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _scale = new THREE.Vector3(1, 1, 1);

function pushBox({ parts, role, width, height, depth, x, y, z }) {
    const geo = new THREE.BoxGeometry(width, height, depth);
    geo.translate(x, y + (height * 0.5), z);
    parts.push({ role, geometry: geo });
}

function pushCylinder({ parts, role, radiusTop, radiusBottom, height, x, y, z, radialSegments, openEnded = false }) {
    const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments, 1, openEnded);
    geo.translate(x, y + (height * 0.5), z);
    parts.push({ role, geometry: geo });
}

// Strut between two arbitrary points: a box built along +Y, then rotated onto
// the strut direction. Splayed water tower legs need this.
function pushStrut({ parts, role, from, to, thickness }) {
    _dir.set(to.x - from.x, to.y - from.y, to.z - from.z);
    const length = _dir.length();
    if (!(length > 1e-4)) return;
    _dir.divideScalar(length);
    _quat.setFromUnitVectors(_up, _dir);
    _position.set(
        (from.x + to.x) * 0.5,
        (from.y + to.y) * 0.5,
        (from.z + to.z) * 0.5
    );
    const geo = new THREE.BoxGeometry(thickness, length, thickness);
    geo.applyMatrix4(_matrix.compose(_position, _quat, _scale));
    parts.push({ role, geometry: geo });
}

function appendWaterTowerParts({ parts, placement }) {
    const width = placement.widthMeters;
    const total = placement.heightMeters;
    const legHeight = total * 0.42;
    const tankHeight = total * 0.46;
    const coneHeight = total - legHeight - tankHeight;
    const tankRadius = width * 0.46;
    const legBase = width * 0.5;
    const legTop = tankRadius * 0.86;
    const legThickness = Math.max(0.09, width * 0.045);

    const cornerAt = (signX, signZ, t) => ({
        x: signX * (legBase + ((legTop - legBase) * t)),
        y: legHeight * t,
        z: signZ * (legBase + ((legTop - legBase) * t))
    });
    const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];

    // splayed leg frame + horizontal braces
    for (const [sx, sz] of corners) {
        pushStrut({
            parts,
            role: ROOFTOP_PROP_MATERIAL_ROLE.FRAME,
            from: cornerAt(sx, sz, 0),
            to: cornerAt(sx, sz, 1),
            thickness: legThickness
        });
    }
    for (const braceT of [0.36, 0.74]) {
        for (let i = 0; i < corners.length; i++) {
            const a = cornerAt(corners[i][0], corners[i][1], braceT);
            const b = cornerAt(corners[(i + 1) % corners.length][0], corners[(i + 1) % corners.length][1], braceT);
            pushStrut({
                parts,
                role: ROOFTOP_PROP_MATERIAL_ROLE.FRAME,
                from: a,
                to: b,
                thickness: legThickness * 0.7
            });
        }
    }
    pushBox({
        parts,
        role: ROOFTOP_PROP_MATERIAL_ROLE.FRAME,
        width: tankRadius * 2.1,
        height: 0.1,
        depth: tankRadius * 2.1,
        x: 0,
        y: legHeight - 0.1,
        z: 0
    });

    // wooden tank + conical cap, banded by two steel hoops
    pushCylinder({
        parts,
        role: ROOFTOP_PROP_MATERIAL_ROLE.TANK,
        radiusTop: tankRadius,
        radiusBottom: tankRadius,
        height: tankHeight,
        x: 0,
        y: legHeight,
        z: 0,
        radialSegments: RADIAL_SEGMENTS_ROUND
    });
    for (const hoopT of [0.25, 0.72]) {
        pushCylinder({
            parts,
            role: ROOFTOP_PROP_MATERIAL_ROLE.FRAME,
            radiusTop: tankRadius * 1.035,
            radiusBottom: tankRadius * 1.035,
            height: Math.max(0.08, tankHeight * 0.045),
            x: 0,
            y: legHeight + (tankHeight * hoopT),
            z: 0,
            radialSegments: RADIAL_SEGMENTS_ROUND,
            openEnded: true
        });
    }
    pushCylinder({
        parts,
        role: ROOFTOP_PROP_MATERIAL_ROLE.TANK,
        radiusTop: tankRadius * 0.06,
        radiusBottom: tankRadius * 1.08,
        height: coneHeight,
        x: 0,
        y: legHeight + tankHeight,
        z: 0,
        radialSegments: RADIAL_SEGMENTS_ROUND
    });
    pushBox({
        parts,
        role: ROOFTOP_PROP_MATERIAL_ROLE.FRAME,
        width: 0.1,
        height: coneHeight * 0.35,
        depth: 0.1,
        x: 0,
        y: legHeight + tankHeight + coneHeight,
        z: 0
    });
}

function appendRoofBulkheadParts({ parts, placement }) {
    const width = placement.widthMeters;
    const depth = placement.depthMeters;
    const height = placement.heightMeters;
    const capHeight = 0.14;
    const bodyHeight = height - capHeight;

    pushBox({
        parts,
        role: ROOFTOP_PROP_MATERIAL_ROLE.BULKHEAD,
        width,
        height: bodyHeight,
        depth,
        x: 0,
        y: 0,
        z: 0
    });
    pushBox({
        parts,
        role: ROOFTOP_PROP_MATERIAL_ROLE.FRAME,
        width: width + 0.18,
        height: capHeight,
        depth: depth + 0.18,
        x: 0,
        y: bodyHeight,
        z: 0
    });

    // door face: leaf plus a surround reveal, on the prop's local +Z side
    const doorWidth = Math.min(1.0, width * 0.42);
    const doorHeight = Math.min(2.1, bodyHeight * 0.78);
    pushBox({
        parts,
        role: ROOFTOP_PROP_MATERIAL_ROLE.BULKHEAD,
        width: doorWidth + 0.16,
        height: doorHeight + 0.1,
        depth: 0.05,
        x: 0,
        y: 0,
        z: (depth * 0.5) + 0.005
    });
    pushBox({
        parts,
        role: ROOFTOP_PROP_MATERIAL_ROLE.FRAME,
        width: doorWidth,
        height: doorHeight,
        depth: 0.05,
        x: 0,
        y: 0,
        z: (depth * 0.5) + 0.045
    });
}

function appendMechBoxParts({ parts, placement }) {
    const width = placement.widthMeters;
    const depth = placement.depthMeters;
    const height = placement.heightMeters;
    const curbHeight = 0.12;
    const bodyHeight = height - curbHeight;
    const fanRadius = Math.min(width, depth) * 0.26;
    const fanHeight = Math.max(0.12, height * 0.2);
    const fanCount = width > 2.2 ? 2 : 1;

    pushBox({
        parts,
        role: ROOFTOP_PROP_MATERIAL_ROLE.FRAME,
        width: width + 0.12,
        height: curbHeight,
        depth: depth + 0.12,
        x: 0,
        y: 0,
        z: 0
    });
    pushBox({
        parts,
        role: ROOFTOP_PROP_MATERIAL_ROLE.MECH,
        width,
        height: bodyHeight,
        depth,
        x: 0,
        y: curbHeight,
        z: 0
    });

    // roof fan housings with a slatted grille cap
    for (let i = 0; i < fanCount; i++) {
        const fanX = fanCount === 1 ? 0 : (i === 0 ? -width * 0.22 : width * 0.22);
        pushCylinder({
            parts,
            role: ROOFTOP_PROP_MATERIAL_ROLE.MECH,
            radiusTop: fanRadius,
            radiusBottom: fanRadius,
            height: fanHeight,
            x: fanX,
            y: height,
            z: 0,
            radialSegments: RADIAL_SEGMENTS_PIPE
        });
        for (let slat = 0; slat < 3; slat++) {
            pushBox({
                parts,
                role: ROOFTOP_PROP_MATERIAL_ROLE.FRAME,
                width: fanRadius * 1.7,
                height: 0.03,
                depth: 0.04,
                x: fanX,
                y: height + fanHeight,
                z: (slat - 1) * fanRadius * 0.55
            });
        }
    }

    // side grille louvres so the box is not a bare cube in close-ups
    for (let i = 0; i < 3; i++) {
        pushBox({
            parts,
            role: ROOFTOP_PROP_MATERIAL_ROLE.FRAME,
            width: width * 0.72,
            height: 0.04,
            depth: 0.03,
            x: 0,
            y: curbHeight + (bodyHeight * (0.28 + (i * 0.2))),
            z: (depth * 0.5) + 0.015
        });
    }
}

function appendVentPipeParts({ parts, placement }) {
    const width = placement.widthMeters;
    const height = placement.heightMeters;
    const hoodHeight = 0.1;
    const pipeRadius = width * 0.26;

    pushCylinder({
        parts,
        role: ROOFTOP_PROP_MATERIAL_ROLE.FRAME,
        radiusTop: pipeRadius,
        radiusBottom: pipeRadius,
        height: height - hoodHeight,
        x: 0,
        y: 0,
        z: 0,
        radialSegments: RADIAL_SEGMENTS_PIPE
    });
    pushCylinder({
        parts,
        role: ROOFTOP_PROP_MATERIAL_ROLE.FRAME,
        radiusTop: pipeRadius * 1.45,
        radiusBottom: pipeRadius * 1.15,
        height: hoodHeight,
        x: 0,
        y: height - hoodHeight,
        z: 0,
        radialSegments: RADIAL_SEGMENTS_PIPE
    });
}

const PROP_PART_BUILDERS = Object.freeze({
    [ROOFTOP_PROP_TYPE.WATER_TOWER]: appendWaterTowerParts,
    [ROOFTOP_PROP_TYPE.ROOF_BULKHEAD]: appendRoofBulkheadParts,
    [ROOFTOP_PROP_TYPE.MECH_BOX]: appendMechBoxParts,
    [ROOFTOP_PROP_TYPE.VENT_PIPE]: appendVentPipeParts
});

/**
 * Builds one placement's geometry, already rotated and moved onto the roof.
 *
 * @param {{ placement: object, baseY?: number }} args
 * @returns {Array<{ role: string, geometry: THREE.BufferGeometry }>}
 */
export function buildRooftopPropParts({ placement, baseY = 0 }) {
    const builder = PROP_PART_BUILDERS[placement?.type] ?? null;
    if (!builder) return [];

    const parts = [];
    builder({ parts, placement });

    const rotation = (Number(placement.rotationDegrees) || 0) * (Math.PI / 180);
    for (const part of parts) {
        if (rotation) part.geometry.rotateY(rotation);
        part.geometry.translate(placement.x, baseY, placement.z);
        part.geometry.computeVertexNormals();
    }
    return parts;
}
