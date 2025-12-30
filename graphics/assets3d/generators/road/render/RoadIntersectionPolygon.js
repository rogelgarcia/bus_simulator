// graphics/assets3d/generators/road/render/RoadIntersectionPolygon.js
import * as THREE from 'three';
import { applyWorldSpaceUV_XZ } from '../geometry/RoadGeometry.js';
import { getConnectorPoints } from '../connectors/ConnectorSampling.js';
import { angleColorHex } from '../math/RoadAngleUtils.js';
import { DEFAULT_COLOR_HEX } from '../RoadConstants.js';
import { pickLineRoad } from './RoadCurveRenderer.js';
import { distanceSq } from '../math/RoadIntersection.js';

export function renderIntersectionPolygons({
    roadData,
    curbConnectors,
    roadById,
    asphalt,
    roadY,
    laneWidth,
    curveSampleStep,
    asphaltDebug,
    tmpColor
}) {
    const connectionPoleGroups = new Map();
    for (const data of roadData) {
        const poles = data.road?.poles?.connection;
        if (!Array.isArray(poles)) continue;
        for (const pole of poles) {
            if (!pole || !Number.isFinite(pole.cut)) continue;
            const roadId = pole.roadId ?? data.roadId;
            if (roadId == null) continue;
            const key = `${roadId}:${pole.cut}`;
            let list = connectionPoleGroups.get(key);
            if (!list) {
                list = [];
                connectionPoleGroups.set(key, list);
            }
            list.push(pole);
        }
    }

    const siblingMap = new Map();
    for (const list of connectionPoleGroups.values()) {
        if (list.length < 2) continue;
        let left = null;
        let right = null;
        for (const pole of list) {
            if (pole?.side === 'left') left = pole;
            else if (pole?.side === 'right') right = pole;
        }
        let pair = null;
        if (left && right) {
            pair = [left, right];
        } else {
            let best = null;
            let bestDist = -Infinity;
            for (let i = 0; i < list.length; i++) {
                for (let j = i + 1; j < list.length; j++) {
                    const d2 = distanceSq(list[i], list[j]);
                    if (d2 > bestDist) {
                        bestDist = d2;
                        best = [list[i], list[j]];
                    }
                }
            }
            pair = best;
        }
        if (!pair) continue;
        siblingMap.set(pair[0], pair[1]);
        siblingMap.set(pair[1], pair[0]);
    }
    for (const data of roadData) {
        const endPoles = data.endPoles;
        if (!endPoles) continue;
        const startLeft = endPoles.start?.left ?? null;
        const startRight = endPoles.start?.right ?? null;
        if (startLeft && startRight) {
            siblingMap.set(startLeft, startRight);
            siblingMap.set(startRight, startLeft);
        }
        const endLeft = endPoles.end?.left ?? null;
        const endRight = endPoles.end?.right ?? null;
        if (endLeft && endRight) {
            siblingMap.set(endLeft, endRight);
            siblingMap.set(endRight, endLeft);
        }
    }

    const connectorByPole = new Map();
    const connectorPoints = new Map();

    for (const record of curbConnectors) {
        const tag = record?.tag ?? null;
        if (tag !== 'connection' && tag !== 'end') continue;
        const connector = record?.connector;
        if (!connector || !connector.ok) continue;
        const p0 = record.p0;
        const p1 = record.p1;
        if (!p0 || !p1) continue;
        if (tag === 'connection' && (!Number.isFinite(p0.cut) || !Number.isFinite(p1.cut))) continue;
        if (!connectorByPole.has(p0)) connectorByPole.set(p0, { record, other: p1 });
        if (!connectorByPole.has(p1)) connectorByPole.set(p1, { record, other: p0 });
    }

    const polePoint = (pole) => {
        if (!pole) return null;
        const y = Number.isFinite(pole.z) ? pole.z : pole.y;
        if (!Number.isFinite(pole.x) || !Number.isFinite(y)) return null;
        return { x: pole.x, y };
    };

    const polygonEpsSq = 1e-6;
    const appendPoint = (points, p) => {
        if (!p) return;
        const last = points[points.length - 1];
        if (last) {
            const dx = last.x - p.x;
            const dy = last.y - p.y;
            if (dx * dx + dy * dy <= polygonEpsSq) return;
        }
        points.push({ x: p.x, y: p.y });
    };

    const loops = [];
    const visited = new Set();
    const maxSteps = connectorByPole.size + 4;
    for (const pole of connectorByPole.keys()) {
        if (visited.has(pole)) continue;
        if (!siblingMap.has(pole)) {
            visited.add(pole);
            continue;
        }
        const startPoint = polePoint(pole);
        if (!startPoint) {
            visited.add(pole);
            continue;
        }
        let current = pole;
        const loopPoints = [];
        const loopPoles = new Set();
        appendPoint(loopPoints, startPoint);
        let ok = true;
        for (let step = 0; step < maxSteps; step++) {
            loopPoles.add(current);
            const info = connectorByPole.get(current);
            if (!info) {
                ok = false;
                break;
            }
            const record = info.record;
            const other = info.other;
            if (!record || !other) {
                ok = false;
                break;
            }
            let curvePoints = getConnectorPoints(record, curveSampleStep, connectorPoints);
            if (!curvePoints || curvePoints.length < 2) {
                ok = false;
                break;
            }
            if (current === record.p1) curvePoints = curvePoints.slice().reverse();
            for (let i = 1; i < curvePoints.length; i++) appendPoint(loopPoints, curvePoints[i]);
            loopPoles.add(other);
            const sibling = siblingMap.get(other);
            if (!sibling) {
                ok = false;
                break;
            }
            const siblingPoint = polePoint(sibling);
            if (!siblingPoint) {
                ok = false;
                break;
            }
            appendPoint(loopPoints, siblingPoint);
            loopPoles.add(sibling);
            current = sibling;
            if (current === pole) break;
        }
        for (const p of loopPoles) visited.add(p);
        if (!ok || current !== pole || loopPoints.length < 3) continue;
        loops.push({ points: loopPoints, poles: loopPoles });
    }

    for (const loop of loops) {
        const points = loop.points;
        if (!points || points.length < 3) continue;
        let loopRoad = null;
        for (const pole of loop.poles) {
            const road = roadById.get(pole.roadId);
            if (!road) continue;
            loopRoad = loopRoad ? pickLineRoad(loopRoad, road) : road;
        }
        const colorHex = (asphaltDebug && loopRoad)
            ? angleColorHex(loopRoad.angleIdx, tmpColor)
            : DEFAULT_COLOR_HEX;
        const shape = new THREE.Shape();
        shape.moveTo(points[0].x, -points[0].y);
        for (let i = 1; i < points.length; i++) shape.lineTo(points[i].x, -points[i].y);
        shape.closePath();
        const geo = new THREE.ShapeGeometry(shape);
        geo.rotateX(-Math.PI / 2);
        geo.translate(0, roadY, 0);
        applyWorldSpaceUV_XZ(geo, laneWidth);
        geo.computeVertexNormals();
        asphalt.addGeometry(geo, colorHex);
    }
}
