// src/graphics/assets3d/generators/road/render/RoadCurveRenderer.js
import * as THREE from 'three';
import { applyWorldSpaceUV_XZ } from '../geometry/RoadGeometry.js';
import { sampleConnectorPoints } from '../connectors/ConnectorSampling.js';
import { angleColorHex } from '../math/RoadAngleUtils.js';
import { DEFAULT_COLOR_HEX, DASH_END_EPS, EDGE_MARK_MIN_SCALE, EPS, HALF } from '../RoadConstants.js';
import {
    directionFromPolyline,
    distanceSq,
    pointAlongPolyline,
    polylineDistances
} from '../math/RoadIntersection.js';

export function pickLineRoad(a, b) {
    if (!a) return b ?? null;
    if (!b) return a;
    if (a.totalLanes !== b.totalLanes) return a.totalLanes > b.totalLanes ? a : b;
    if (a.halfWidth !== b.halfWidth) return a.halfWidth > b.halfWidth ? a : b;
    const aId = a.roadId ?? 0;
    const bId = b.roadId ?? 0;
    return aId <= bId ? a : b;
}

export function renderCurveConnectors({
    curbConnectors,
    roadById,
    asphalt,
    markings,
    roadY,
    laneWidth,
    curbT,
    markLineW,
    markEdgeInset,
    markY,
    curveSampleStep,
    asphaltDebug,
    tmpColor
}) {
    const pickConnectorPair = (list) => {
        if (!Array.isArray(list) || list.length < 2) return null;
        if (list.length === 2) return list;
        let best = null;
        let bestDist = -Infinity;
        for (let i = 0; i < list.length; i++) {
            const a = list[i];
            const pa = a?.p0 ?? a?.p1;
            if (!pa) continue;
            for (let j = i + 1; j < list.length; j++) {
                const b = list[j];
                const pb = b?.p0 ?? b?.p1;
                if (!pb) continue;
                const d2 = distanceSq(pa, pb);
                if (d2 > bestDist) {
                    bestDist = d2;
                    best = [a, b];
                }
            }
        }
        return best;
    };

    const sampleCurvePoints = (record) => {
        const connector = record?.connector ?? record?.p0?.connector ?? null;
        return sampleConnectorPoints(connector, curveSampleStep);
    };

    const orientCurvePoints = (points, record, startRoadId) => {
        if (!points) return null;
        const p0Id = record?.p0?.roadId;
        const p1Id = record?.p1?.roadId;
        if (p0Id === startRoadId) return points;
        if (p1Id === startRoadId) return points.slice().reverse();
        return points;
    };

    const buildCenterlineFromEdges = (leftPoints, rightPoints) => {
        if (!leftPoints || !rightPoints || leftPoints.length < 2 || rightPoints.length < 2) return null;
        const leftDist = polylineDistances(leftPoints);
        const rightDist = polylineDistances(rightPoints);
        const leftLen = leftDist[leftDist.length - 1] ?? 0;
        const rightLen = rightDist[rightDist.length - 1] ?? 0;
        if (!(leftLen > EPS) || !(rightLen > EPS)) return null;
        const count = Math.max(leftPoints.length, rightPoints.length, 2);
        const points = new Array(count);
        let minHalfWidth = Infinity;
        for (let i = 0; i < count; i++) {
            const t = count === 1 ? 0 : i / (count - 1);
            const leftSample = pointAlongPolyline(leftPoints, leftDist, leftLen * t).point;
            const rightSample = pointAlongPolyline(rightPoints, rightDist, rightLen * t).point;
            const cx = (leftSample.x + rightSample.x) * HALF;
            const cy = (leftSample.y + rightSample.y) * HALF;
            points[i] = { x: cx, y: cy };
            const width = Math.hypot(leftSample.x - rightSample.x, leftSample.y - rightSample.y);
            if (width > EPS && width * HALF < minHalfWidth) minHalfWidth = width * HALF;
        }
        const tangents = new Array(points.length);
        for (let i = 0; i < points.length; i++) {
            const prev = points[i - 1] ?? points[i];
            const next = points[i + 1] ?? points[i];
            let dx = next.x - prev.x;
            let dy = next.y - prev.y;
            const len = Math.hypot(dx, dy);
            if (len > EPS) {
                dx /= len;
                dy /= len;
            } else {
                dx = 1;
                dy = 0;
            }
            tangents[i] = { x: dx, y: dy };
        }
        return { points, tangents, minHalfWidth };
    };

    const offsetCurvePoints = (points, tangents, offset) => {
        const out = new Array(points.length);
        for (let i = 0; i < points.length; i++) {
            const t = tangents[i];
            const nx = -t.y;
            const ny = t.x;
            out[i] = { x: points[i].x + nx * offset, y: points[i].y + ny * offset };
        }
        return out;
    };

    const addCurveSolidLine = (kind, points) => {
        if (!markings || !points || points.length < 2) return;
        for (let i = 0; i + 1 < points.length; i++) {
            const p0 = points[i];
            const p1 = points[i + 1];
            const dx = p1.x - p0.x;
            const dy = p1.y - p0.y;
            const len = Math.hypot(dx, dy);
            if (!(len > EPS)) continue;
            const mx = (p0.x + p1.x) * HALF;
            const my = (p0.y + p1.y) * HALF;
            const heading = Math.atan2(-dy, dx);
            if (kind === 'yellow') {
                markings.addYellow(mx, markY, my, len, markLineW, heading);
            } else {
                markings.addWhite(mx, markY, my, len, markLineW, heading);
            }
        }
    };

    const addCurveDashedLine = (kind, points, dashLen, dashGap) => {
        if (!markings || !points || points.length < 2) return;
        if (!(dashLen > EPS)) return;
        const distances = polylineDistances(points);
        const total = distances[distances.length - 1] ?? 0;
        if (!(total > EPS)) return;
        const step = dashLen + Math.max(0, dashGap);
        if (!(step > EPS)) return;
        const half = dashLen * HALF;
        const segmentLen = Math.max(0.2, Math.min(0.6, curveSampleStep * 1.1, dashLen * 0.5));
        const start = half;
        const end = total - half + DASH_END_EPS;
        for (let d = start; d <= end; d += step) {
            let s = d - half;
            const sEnd = d + half;
            while (s < sEnd - EPS) {
                const sNext = Math.min(s + segmentLen, sEnd);
                const p0 = pointAlongPolyline(points, distances, s).point;
                const p1 = pointAlongPolyline(points, distances, sNext).point;
                if (!p0 || !p1) {
                    s = sNext;
                    continue;
                }
                const dx = p1.x - p0.x;
                const dy = p1.y - p0.y;
                const len = Math.hypot(dx, dy);
                if (!(len > EPS)) {
                    s = sNext;
                    continue;
                }
                const mx = (p0.x + p1.x) * HALF;
                const my = (p0.y + p1.y) * HALF;
                const heading = Math.atan2(-dy, dx);
                if (kind === 'yellow') {
                    markings.addYellow(mx, markY, my, len, markLineW, heading);
                } else {
                    markings.addWhite(mx, markY, my, len, markLineW, heading);
                }
                s = sNext;
            }
        }
    };

    const curveGroups = new Map();
    for (const record of curbConnectors) {
        const connector = record?.connector ?? null;
        if (!connector || !connector.ok) continue;
        const p0 = record?.p0;
        const p1 = record?.p1;
        if (!p0 || !p1) continue;
        if (!p0.curveConnection || !p1.curveConnection) continue;
        const roadA = p0.roadId;
        const roadB = p1.roadId;
        if (roadA == null || roadB == null) continue;
        const endKey = p0.endKey ?? p1.endKey ?? '';
        const key = roadA <= roadB ? `${roadA}:${roadB}|${endKey}` : `${roadB}:${roadA}|${endKey}`;
        let entry = curveGroups.get(key);
        if (!entry) {
            entry = { roadA, roadB, endKey, connectors: [] };
            curveGroups.set(key, entry);
        }
        entry.connectors.push(record);
    }

    for (const entry of curveGroups.values()) {
        const pair = pickConnectorPair(entry.connectors);
        if (!pair) continue;
        const roadA = roadById.get(entry.roadA);
        const roadB = roadById.get(entry.roadB);
        const lineRoad = pickLineRoad(roadA, roadB);
        if (!lineRoad) continue;
        const pointsA = sampleCurvePoints(pair[0]);
        const pointsB = sampleCurvePoints(pair[1]);
        if (!pointsA || !pointsB) continue;
        const startRoadId = lineRoad.roadId;
        const orientedA = orientCurvePoints(pointsA, pair[0], startRoadId);
        const orientedB = orientCurvePoints(pointsB, pair[1], startRoadId);
        if (!orientedA || !orientedB || orientedA.length < 2 || orientedB.length < 2) continue;
        const dir = directionFromPolyline(orientedA) ?? directionFromPolyline(orientedB);
        if (!dir) continue;
        const nx = -dir.y;
        const ny = dir.x;
        const midX = (orientedA[0].x + orientedB[0].x) * HALF;
        const midY = (orientedA[0].y + orientedB[0].y) * HALF;
        const dot = (orientedA[0].x - midX) * nx + (orientedA[0].y - midY) * ny;
        const leftEdge = dot >= 0 ? orientedA : orientedB;
        const rightEdge = dot >= 0 ? orientedB : orientedA;
        const centerline = buildCenterlineFromEdges(leftEdge, rightEdge);
        if (!centerline) continue;
        const curbHalf = Number.isFinite(curbT) ? curbT * HALF : 0;
        const maxHalfWidth = Number.isFinite(centerline.minHalfWidth)
            ? Math.max(EPS, centerline.minHalfWidth - curbHalf)
            : lineRoad.halfWidth;
        const asphaltHalfWidth = Math.min(lineRoad.halfWidth, maxHalfWidth);
        const asphaltLeft = offsetCurvePoints(centerline.points, centerline.tangents, asphaltHalfWidth);
        const asphaltRight = offsetCurvePoints(centerline.points, centerline.tangents, -asphaltHalfWidth);
        const asphaltLeftGeo = asphaltLeft.map((p) => ({ x: p.x, y: -p.y }));
        const asphaltRightGeo = asphaltRight.map((p) => ({ x: p.x, y: -p.y }));
        const colorHex = asphaltDebug
            ? angleColorHex(lineRoad.angleIdx, tmpColor)
            : DEFAULT_COLOR_HEX;
        const shape = new THREE.Shape();
        shape.moveTo(asphaltLeftGeo[0].x, asphaltLeftGeo[0].y);
        for (let i = 1; i < asphaltLeftGeo.length; i++) shape.lineTo(asphaltLeftGeo[i].x, asphaltLeftGeo[i].y);
        for (let i = asphaltRightGeo.length - 1; i >= 0; i--) shape.lineTo(asphaltRightGeo[i].x, asphaltRightGeo[i].y);
        shape.closePath();
        const curveGeo = new THREE.ShapeGeometry(shape);
        curveGeo.rotateX(-Math.PI / 2);
        curveGeo.translate(0, roadY, 0);
        applyWorldSpaceUV_XZ(curveGeo, laneWidth);
        curveGeo.computeVertexNormals();
        asphalt.addGeometry(curveGeo, colorHex);

        if (!markings) continue;
        const laneLimit = asphaltHalfWidth - markEdgeInset;
        if (laneLimit > markLineW * EDGE_MARK_MIN_SCALE) {
            const leftLine = offsetCurvePoints(centerline.points, centerline.tangents, laneLimit);
            const rightLine = offsetCurvePoints(centerline.points, centerline.tangents, -laneLimit);
            addCurveSolidLine('white', leftLine);
            addCurveSolidLine('white', rightLine);
        }

        if (lineRoad.twoWay) {
            addCurveSolidLine('yellow', centerline.points);
            for (let lane = 1; lane < lineRoad.lanesF; lane++) {
                const offset = laneWidth * lane;
                if (offset > laneLimit + EPS) continue;
                const linePoints = offsetCurvePoints(centerline.points, centerline.tangents, offset);
                addCurveDashedLine('white', linePoints, lineRoad.dashLen, lineRoad.dashGap);
            }
            for (let lane = 1; lane < lineRoad.lanesB; lane++) {
                const offset = -laneWidth * lane;
                if (-offset > laneLimit + EPS) continue;
                const linePoints = offsetCurvePoints(centerline.points, centerline.tangents, offset);
                addCurveDashedLine('white', linePoints, lineRoad.dashLen, lineRoad.dashGap);
            }
        } else if (lineRoad.totalLanes > 1) {
            for (let lane = 1; lane < lineRoad.totalLanes; lane++) {
                const offset = (lane - lineRoad.totalLanes * HALF) * laneWidth;
                if (Math.abs(offset) > laneLimit + EPS) continue;
                const linePoints = offsetCurvePoints(centerline.points, centerline.tangents, offset);
                addCurveDashedLine('white', linePoints, lineRoad.dashLen, lineRoad.dashGap);
            }
        }
    }
}
