// src/app/geometry/ConnectorPathSolver.js
import * as THREE from 'three';
import { DubinsPathType } from './dubins/DubinsCurves.js';
import { dubinsSolve, DUBINS_SEGMENTS_BY_TYPE } from './dubins/dubinsSolve.js';

const EPS = 1e-9;
const DEFAULT_FALLBACK_SCALES = [1, 0.85, 0.7, 0.55];

const DEFAULT_PATH_TYPES = [
    DubinsPathType.LSL,
    DubinsPathType.RSR,
    DubinsPathType.LSR,
    DubinsPathType.RSL,
    DubinsPathType.RLR,
    DubinsPathType.LRL
];

const PREFER_S_TYPES = [
    DubinsPathType.LSR,
    DubinsPathType.RSL,
    DubinsPathType.LSL,
    DubinsPathType.RSR,
    DubinsPathType.RLR,
    DubinsPathType.LRL
];

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

function normalizeDir(dir) {
    if (!dir || !Number.isFinite(dir.x) || !Number.isFinite(dir.y)) return null;
    const v = new THREE.Vector2(dir.x, dir.y);
    const len = v.length();
    if (len < EPS) return null;
    return v.multiplyScalar(1 / len);
}

function resolvePose(input) {
    if (!input) return null;
    const position = input.position ?? input.pos ?? null;
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return null;
    if (Number.isFinite(input.heading)) {
        const heading = input.heading;
        return {
            position: new THREE.Vector2(position.x, position.y),
            heading,
            direction: new THREE.Vector2(Math.cos(heading), Math.sin(heading))
        };
    }
    const dir = normalizeDir(input.direction ?? input.dir ?? null);
    if (!dir) return null;
    return {
        position: new THREE.Vector2(position.x, position.y),
        heading: Math.atan2(dir.y, dir.x),
        direction: dir
    };
}

function headingToDir(heading) {
    return new THREE.Vector2(Math.cos(heading), Math.sin(heading));
}

function leftNormal(dir) {
    return new THREE.Vector2(-dir.y, dir.x);
}

function buildRadiusCandidates(config) {
    const baseRadius = config.radius ?? config.R ?? null;
    const candidates = [];
    let policy = { mode: 'fixed', baseRadius, candidates: [] };
    let rawCandidates = null;

    if (Array.isArray(config.radiusCandidates) && config.radiusCandidates.length) {
        rawCandidates = config.radiusCandidates.slice();
        policy = { mode: 'candidates', baseRadius, candidates: rawCandidates.slice() };
    } else if (Array.isArray(config.radiusPolicy?.candidates) && config.radiusPolicy.candidates.length) {
        rawCandidates = config.radiusPolicy.candidates.slice();
        policy = { mode: 'candidates', baseRadius, candidates: rawCandidates.slice() };
    } else if (config.radiusPolicy?.mode === 'fallback' || config.allowFallback) {
        const scales = Array.isArray(config.radiusPolicy?.fallbackScales)
            ? config.radiusPolicy.fallbackScales.slice()
            : DEFAULT_FALLBACK_SCALES.slice();
        rawCandidates = scales.map((s) => (Number.isFinite(baseRadius) ? baseRadius * s : NaN));
        policy = {
            mode: 'fallback',
            baseRadius,
            fallbackScales: scales,
            candidates: rawCandidates.slice()
        };
    } else if (Number.isFinite(baseRadius)) {
        rawCandidates = [baseRadius];
        policy = { mode: 'fixed', baseRadius, candidates: rawCandidates.slice() };
    }

    for (const r of rawCandidates ?? []) {
        if (!Number.isFinite(r) || r <= EPS) continue;
        if (!candidates.some((v) => Math.abs(v - r) <= 1e-6)) candidates.push(r);
    }

    policy.candidates = candidates.slice();
    return { candidates, policy };
}

function buildSegments({ startPose, segmentTypes, segmentLengths, radius }) {
    const segments = [];
    const segmentHeadings = [];
    let heading = startPose.heading;
    let pos = startPose.position.clone();

    for (let i = 0; i < segmentTypes.length; i++) {
        const type = segmentTypes[i];
        const segLenNorm = segmentLengths[i] ?? 0;
        const headingStart = heading;
        if (type === 'S') {
            const length = segLenNorm * radius;
            const dir = headingToDir(heading);
            const startPoint = pos.clone();
            const endPoint = startPoint.clone().add(dir.clone().multiplyScalar(length));
            segments.push({
                type: 'STRAIGHT',
                startPoint,
                endPoint,
                direction: dir,
                length
            });
            pos = endPoint;
            segmentHeadings.push({ start: headingStart, end: headingStart });
        } else {
            const turnDir = type === 'L' ? 'L' : 'R';
            const sign = turnDir === 'L' ? 1 : -1;
            const deltaAngle = segLenNorm;
            const dir = headingToDir(heading);
            const center = pos.clone().add(leftNormal(dir).multiplyScalar(turnDir === 'L' ? radius : -radius));
            const startAngle = Math.atan2(pos.y - center.y, pos.x - center.x);
            const endAngle = startAngle + sign * deltaAngle;
            const endPoint = new THREE.Vector2(
                center.x + Math.cos(endAngle) * radius,
                center.y + Math.sin(endAngle) * radius
            );
            segments.push({
                type: 'ARC',
                center,
                radius,
                startPoint: pos.clone(),
                endPoint,
                startAngle,
                deltaAngle,
                turnDir,
                length: deltaAngle * radius
            });
            heading = heading + sign * deltaAngle;
            pos = endPoint;
            segmentHeadings.push({ start: headingStart, end: heading });
        }
    }

    return { segments, endPose: { position: pos, heading, direction: headingToDir(heading) }, segmentHeadings };
}

function candidateStraightLength(segmentTypes, segmentLengths, radius) {
    let length = 0;
    for (let i = 0; i < segmentTypes.length; i++) {
        if (segmentTypes[i] === 'S') length += (segmentLengths[i] ?? 0) * radius;
    }
    return length;
}

function selectBestCandidate(candidates, options) {
    if (!candidates.length) return null;
    const {
        lengthEps = 1e-6,
        preferTypes = [],
        baseRadius = null
    } = options ?? {};
    let pool = candidates.slice();
    let minLength = Number.POSITIVE_INFINITY;
    for (const cand of pool) {
        if (cand.totalLength < minLength) minLength = cand.totalLength;
    }
    pool = pool.filter((cand) => cand.totalLength <= minLength + lengthEps);

    if (preferTypes.length) {
        let best = null;
        let bestIdx = Number.POSITIVE_INFINITY;
        for (const cand of pool) {
            const idx = preferTypes.indexOf(cand.type);
            const score = idx === -1 ? Number.POSITIVE_INFINITY : idx;
            if (!best || score < bestIdx) {
                best = cand;
                bestIdx = score;
            }
        }
        if (best) return best;
    }

    if (Number.isFinite(baseRadius)) {
        let best = null;
        let bestScore = Number.POSITIVE_INFINITY;
        for (const cand of pool) {
            const score = Math.abs(cand.radius - baseRadius);
            if (!best || score < bestScore) {
                best = cand;
                bestScore = score;
            }
        }
        if (best) return best;
    }

    return pool[0];
}

function buildCircles(pose, radius) {
    const left = leftNormal(pose.direction);
    return {
        left: {
            center: pose.position.clone().add(left.clone().multiplyScalar(radius)),
            radius
        },
        right: {
            center: pose.position.clone().add(left.clone().multiplyScalar(-radius)),
            radius
        }
    };
}

function metricsForPath({ segmentHeadings, endPose, targetPose }) {
    const targetDir = targetPose.direction;
    const actualDir = headingToDir(endPose.heading);
    const endPoseErrorPos = endPose.position.distanceTo(targetPose.position);
    const endPoseErrorDir = Math.acos(clamp(actualDir.dot(targetDir), -1, 1));
    const tangencyDotAtJoin0 = segmentHeadings[0] && segmentHeadings[1]
        ? headingToDir(segmentHeadings[0].end).dot(headingToDir(segmentHeadings[1].start))
        : null;
    const tangencyDotAtJoin1 = segmentHeadings[1] && segmentHeadings[2]
        ? headingToDir(segmentHeadings[1].end).dot(headingToDir(segmentHeadings[2].start))
        : null;

    return {
        endPoseErrorPos,
        endPoseErrorDir,
        tangencyDotAtJoin0,
        tangencyDotAtJoin1
    };
}

function summarizeRadiusChoice({ chosen, candidates, baseRadius, preferTypes }) {
    if (!chosen) return 'no-solution';
    if (candidates.length === 1) return 'only-candidate';
    const baseMatch = Number.isFinite(baseRadius) && Math.abs(chosen.radius - baseRadius) <= 1e-6;
    if (preferTypes?.length && preferTypes.includes(chosen.type)) {
        return baseMatch ? 'shortest-with-preferred-type' : 'shortest-with-preferred-type-fallback-radius';
    }
    return baseMatch ? 'shortest-length' : 'shortest-length-fallback-radius';
}

export function solveConnectorPath(config = {}) {
    const startPose = resolvePose(config.start ?? { position: config.p0, direction: config.dir0, heading: config.heading0 });
    const endPose = resolvePose(config.end ?? { position: config.p1, direction: config.dir1, heading: config.heading1 });
    if (!startPose || !endPose) {
        return {
            ok: false,
            type: null,
            radius: null,
            totalLength: 0,
            segments: [],
            startLeftCircle: null,
            startRightCircle: null,
            endLeftCircle: null,
            endRightCircle: null,
            metrics: null,
            failure: { code: 'invalid-input', message: 'start/end pose missing position or direction' }
        };
    }

    const { candidates: radiusCandidates, policy: radiusPolicy } = buildRadiusCandidates(config);
    if (!radiusCandidates.length) {
        return {
            ok: false,
            type: null,
            radius: null,
            totalLength: 0,
            segments: [],
            startLeftCircle: null,
            startRightCircle: null,
            endLeftCircle: null,
            endRightCircle: null,
            metrics: null,
            failure: { code: 'bad-radius', message: 'no valid radius candidates' },
            radiusPolicy
        };
    }

    const allowedTypes = Array.isArray(config.allowedPathTypes) && config.allowedPathTypes.length
        ? config.allowedPathTypes.slice()
        : DEFAULT_PATH_TYPES.slice();
    const preferTypes = Array.isArray(config.preferPathTypes) && config.preferPathTypes.length
        ? config.preferPathTypes.slice()
        : (config.preferS ? PREFER_S_TYPES.slice() : DEFAULT_PATH_TYPES.slice());
    const baseRadius = radiusPolicy.baseRadius ?? (radiusCandidates[0] ?? null);

    const candidates = [];
    const bestByType = new Map();

    for (const radius of radiusCandidates) {
        for (const type of allowedTypes) {
            const result = dubinsSolve({
                start: { position: startPose.position, heading: startPose.heading },
                end: { position: endPose.position, heading: endPose.heading },
                radius,
                pathType: type
            });
            if (!result.ok || !result.segmentTypes) continue;
            const totalLength = result.segmentLengths.reduce((sum, v) => sum + v, 0) * radius;
            const straightLength = candidateStraightLength(result.segmentTypes, result.segmentLengths, radius);
            const candidate = {
                type,
                radius,
                segmentTypes: result.segmentTypes,
                segmentLengths: result.segmentLengths,
                totalLength,
                straightLength
            };
            candidates.push(candidate);
            const current = bestByType.get(type);
            if (!current || candidate.totalLength < current.totalLength) bestByType.set(type, candidate);
        }
    }

    if (!candidates.length) {
        return {
            ok: false,
            type: null,
            radius: null,
            totalLength: 0,
            segments: [],
            startLeftCircle: null,
            startRightCircle: null,
            endLeftCircle: null,
            endRightCircle: null,
            metrics: null,
            failure: { code: 'no-path', message: 'no dubins path found' },
            radiusPolicy
        };
    }

    const chosen = selectBestCandidate(candidates, {
        lengthEps: Number.isFinite(config.lengthEps) ? config.lengthEps : 1e-6,
        preferTypes,
        baseRadius
    });

    if (!chosen) {
        return {
            ok: false,
            type: null,
            radius: null,
            totalLength: 0,
            segments: [],
            startLeftCircle: null,
            startRightCircle: null,
            endLeftCircle: null,
            endRightCircle: null,
            metrics: null,
            failure: { code: 'no-path', message: 'no dubins path selected' },
            radiusPolicy
        };
    }

    const { segments, endPose: endPoseComputed, segmentHeadings } = buildSegments({
        startPose,
        segmentTypes: chosen.segmentTypes,
        segmentLengths: chosen.segmentLengths,
        radius: chosen.radius
    });

    const startCircles = buildCircles(startPose, chosen.radius);
    const endCircles = buildCircles(endPose, chosen.radius);
    const metrics = metricsForPath({
        segmentHeadings,
        endPose: endPoseComputed,
        targetPose: endPose
    });
    const chosenReason = summarizeRadiusChoice({
        chosen,
        candidates,
        baseRadius,
        preferTypes
    });

    const result = {
        ok: true,
        type: chosen.type,
        radius: chosen.radius,
        totalLength: chosen.totalLength,
        segments,
        startLeftCircle: startCircles.left,
        startRightCircle: startCircles.right,
        endLeftCircle: endCircles.left,
        endRightCircle: endCircles.right,
        metrics,
        failure: null,
        radiusPolicy: {
            ...radiusPolicy,
            chosenRadius: chosen.radius,
            chosenIndex: radiusCandidates.indexOf(chosen.radius),
            chosenReason
        },
        startPose,
        endPose,
        endPoseComputed
    };

    if (config.includeCandidates) {
        const candidatesByType = DEFAULT_PATH_TYPES.map((type) => {
            const cand = bestByType.get(type);
            if (!cand) return null;
            const built = buildSegments({
                startPose,
                segmentTypes: cand.segmentTypes,
                segmentLengths: cand.segmentLengths,
                radius: cand.radius
            });
            return {
                type: cand.type,
                radius: cand.radius,
                totalLength: cand.totalLength,
                segments: built.segments
            };
        });
        result.candidatesByType = candidatesByType;
        result.candidateTypes = DEFAULT_PATH_TYPES.slice();
    }

    return result;
}

export { DEFAULT_PATH_TYPES as CONNECTOR_PATH_TYPES, DUBINS_SEGMENTS_BY_TYPE };
