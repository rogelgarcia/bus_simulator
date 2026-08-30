// Resolves BF2 footprint-face arcs into plan-picker paths and authoring values.
// @ts-check

import {
    normalizeFootprintArcMetadata,
    resolveFootprintArcRun,
    sampleResolvedFootprintArc
} from '../../../app/buildings/footprint_curves/BuildingFootprintCurves.js';

export const FACE_CURVE_SWEEP_MIN_DEGREES = 5;
export const FACE_CURVE_SWEEP_MAX_DEGREES = 180;
export const FACE_CURVE_SWEEP_DEFAULT_DEGREES = 90;

function finitePoint(value) {
    const x = Number(value?.x);
    const z = Number(value?.z);
    return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
}

/**
 * @param {{ a?: {x?: number, z?: number}, b?: {x?: number, z?: number}, arc?: object|null }} segment
 * @returns {Array<{x: number, z: number}>}
 */
export function buildFacePlanPath(segment) {
    const a = finitePoint(segment?.a);
    const b = finitePoint(segment?.b);
    if (!a || !b) return [];

    const curve = resolveFootprintArcRun(a, b, segment?.arc);
    if (!curve) return [a, b];

    const points = [];
    for (let i = 0; i <= curve.segments; i++) {
        const sample = sampleResolvedFootprintArc(curve, curve.length * (i / curve.segments));
        if (sample) points.push({ x: sample.x, z: sample.z });
    }
    return points.length >= 2 ? points : [a, b];
}

/**
 * @param {Array<{x: number, z: number}>} path
 * @returns {{point: {x: number, z: number}, tangentStart: {x: number, z: number}, tangentEnd: {x: number, z: number}}|null}
 */
export function resolveFacePlanLabelAnchor(path) {
    if (!Array.isArray(path) || path.length < 2) return null;
    const sample = (path.length - 1) * 0.5;
    const lower = Math.floor(sample);
    const upper = Math.ceil(sample);
    const t = sample - lower;
    return {
        point: {
            x: path[lower].x + (path[upper].x - path[lower].x) * t,
            z: path[lower].z + (path[upper].z - path[lower].z) * t
        },
        tangentStart: path[Math.max(0, lower - 1)],
        tangentEnd: path[Math.min(path.length - 1, upper + 1)]
    };
}

/**
 * @param {{ arc?: object|null, outwardBulgeSign?: number }} segment
 * @returns {{ enabled: boolean, direction: 'outward'|'inward', sweepDegrees: number, segments?: number }}
 */
export function resolveFaceCurveUiState(segment) {
    const outwardBulgeSign = Number(segment?.outwardBulgeSign) < 0 ? -1 : 1;
    const arc = normalizeFootprintArcMetadata(segment?.arc);
    if (!arc) {
        return {
            enabled: false,
            direction: 'outward',
            sweepDegrees: FACE_CURVE_SWEEP_DEFAULT_DEGREES
        };
    }

    const sweepDegrees = Math.abs(4 * Math.atan(arc.bulge) * 180 / Math.PI);
    return {
        enabled: true,
        direction: Math.sign(arc.bulge) === outwardBulgeSign ? 'outward' : 'inward',
        sweepDegrees,
        ...('segments' in arc ? { segments: arc.segments } : {})
    };
}

/**
 * @param {{ sweepDegrees: number, direction?: 'outward'|'inward', outwardBulgeSign?: number, segments?: number }} value
 * @returns {{bulge: number, segments?: number}}
 */
export function createFaceArcMetadata(value) {
    const rawSweep = Number(value?.sweepDegrees);
    const sweepDegrees = Math.max(
        FACE_CURVE_SWEEP_MIN_DEGREES,
        Math.min(FACE_CURVE_SWEEP_MAX_DEGREES, Number.isFinite(rawSweep) ? Math.abs(rawSweep) : FACE_CURVE_SWEEP_DEFAULT_DEGREES)
    );
    const outwardBulgeSign = Number(value?.outwardBulgeSign) < 0 ? -1 : 1;
    const directionSign = value?.direction === 'inward' ? -1 : 1;
    const bulge = Math.tan((sweepDegrees * Math.PI / 180) / 4) * outwardBulgeSign * directionSign;
    const arc = normalizeFootprintArcMetadata({ bulge, ...('segments' in (value ?? {}) ? { segments: value.segments } : {}) });
    if (!arc) throw new Error('BF2 face curve: failed to resolve valid arc metadata.');
    return { ...arc };
}
