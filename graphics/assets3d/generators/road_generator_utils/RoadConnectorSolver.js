// graphics/assets3d/generators/road_generator_utils/RoadConnectorSolver.js - Connector path solving helpers.
// Solves curb connector paths and assigns connector metadata.
import { solveConnectorPath } from '../../../../src/geometry/ConnectorPathSolver.js';
import { EPS } from './RoadConstants.js';
import { distanceSq } from './RoadIntersection.js';
import { pickClosestEndPole, pickEndPole, pickSharedRoadOnSide } from './RoadPoleLinking.js';

export function createConnectorSolver({ curbT, roadById, connectorPairs }) {
    const computeConnectorRadius = (p0, p1) => {
        if (!p0 || !p1) return null;
        const curbReduce = Number.isFinite(curbT) ? curbT : 0;
        const curbWidth = Number.isFinite(curbT) ? curbT : 1;
        const curveConnector = !!(p0?.curveConnection || p1?.curveConnection);
        if (curveConnector) {
            const ax = p0.x;
            const bx = p1.x;
            const az = Number.isFinite(p0.z) ? p0.z : p0.y;
            const bz = Number.isFinite(p1.z) ? p1.z : p1.y;
            if (!Number.isFinite(ax) || !Number.isFinite(bx) || !Number.isFinite(az) || !Number.isFinite(bz)) return null;
            const dx = Math.abs(bx - ax);
            const dz = Math.abs(bz - az);
            const minAxis = Math.min(dx, dz);
            if (minAxis > EPS) {
                const reduced = minAxis - curbReduce;
                return reduced > EPS ? reduced : null;
            }
            const dist = Math.hypot(dx, dz);
            const reduced = dist - curbReduce;
            return reduced > EPS ? reduced : null;
        }
        const resolveCollision = (pole) => {
            const col = pole?.collision ?? null;
            if (col && Number.isFinite(col.x) && (Number.isFinite(col.z) || Number.isFinite(col.y))) return col;
            const road = pole?.roadId != null ? roadById.get(pole.roadId) : null;
            if (!road?.collisionById || pole?.collisionId == null) return null;
            return road.collisionById.get(pole.collisionId) ?? null;
        };
        const distToCollision = (pole) => {
            const col = resolveCollision(pole);
            if (!col) return null;
            const ax = pole.x;
            const az = Number.isFinite(pole.z) ? pole.z : pole.y;
            const bx = col.x;
            const bz = Number.isFinite(col.z) ? col.z : col.y;
            if (!Number.isFinite(ax) || !Number.isFinite(az) || !Number.isFinite(bx) || !Number.isFinite(bz)) return null;
            const dx = bx - ax;
            const dz = bz - az;
            const dist = Math.hypot(dx, dz);
            const reduced = dist - curbReduce;
            return reduced > EPS ? reduced : null;
        };
        const collisionLimit = (pole) => {
            const col = resolveCollision(pole);
            if (!col) return null;
            const ax = pole.x;
            const az = Number.isFinite(pole.z) ? pole.z : pole.y;
            const bx = col.x;
            const bz = Number.isFinite(col.z) ? col.z : col.y;
            if (!Number.isFinite(ax) || !Number.isFinite(az) || !Number.isFinite(bx) || !Number.isFinite(bz)) return null;
            const dx = bx - ax;
            const dz = bz - az;
            const dist = Math.hypot(dx, dz);
            const reduced = dist - curbWidth;
            return reduced > EPS ? reduced : 1;
        };
        const limit0 = collisionLimit(p0);
        const limit1 = collisionLimit(p1);
        let limit = null;
        if (Number.isFinite(limit0) && Number.isFinite(limit1)) limit = Math.min(limit0, limit1);
        else if (Number.isFinite(limit0)) limit = limit0;
        else if (Number.isFinite(limit1)) limit = limit1;
        const d0 = distToCollision(p0);
        const d1 = distToCollision(p1);
        if (Number.isFinite(d0) || Number.isFinite(d1)) {
            const dist = Number.isFinite(d0) && Number.isFinite(d1) ? Math.min(d0, d1) : (Number.isFinite(d0) ? d0 : d1);
            return Number.isFinite(limit) ? Math.min(dist, limit) : dist;
        }
        const ax = p0.x;
        const bx = p1.x;
        const az = Number.isFinite(p0.z) ? p0.z : p0.y;
        const bz = Number.isFinite(p1.z) ? p1.z : p1.y;
        if (!Number.isFinite(ax) || !Number.isFinite(bx) || !Number.isFinite(az) || !Number.isFinite(bz)) return null;
        const dx = Math.abs(bx - ax);
        const dz = Math.abs(bz - az);
        const minAxis = Math.min(dx, dz);
        const dist = Math.hypot(dx, dz);
        const base = minAxis > EPS ? minAxis : dist;
        if (!(base > EPS)) return null;
        const reduced = base - curbReduce;
        if (!(reduced > EPS)) return null;
        return Number.isFinite(limit) ? Math.min(reduced, limit) : reduced;
    };

    const solveCurbConnector = (p0, p1, dir0, dir1) => {
        if (!p0 || !p1 || !dir0 || !dir1) return null;
        const radius = computeConnectorRadius(p0, p1);
        if (!Number.isFinite(radius) || radius <= EPS) return null;
        const isConnection = (p0?.collisionId != null || p1?.collisionId != null || p0?.cut != null || p1?.cut != null);
        const isCurve = !!(p0?.curveConnection || p1?.curveConnection);
        const connector = solveConnectorPath({
            start: { position: { x: p0.x, y: p0.z }, direction: { x: dir0.x, y: dir0.z } },
            end: { position: { x: p1.x, y: p1.z }, direction: { x: dir1.x, y: dir1.z } },
            radius,
            allowFallback: !(isConnection || isCurve),
            preferS: true
        });
        if (connector && connector.ok) return connector;
        return null;
    };

    const getPoleFlowDir = (pole) => {
        if (!pole) return null;
        const road = roadById.get(pole.roadId);
        if (!road) return null;
        const dir = { x: road.dir.x, z: road.dir.y };
        if (pole.flow === 'enter') return dir;
        if (pole.flow === 'exit') return { x: -dir.x, z: -dir.z };
        if (pole.end === 'start') return dir;
        if (pole.end === 'end') return { x: -dir.x, z: -dir.z };
        return null;
    };

    const getArrowDir = (pole, sign) => {
        const flowDir = getPoleFlowDir(pole);
        if (!flowDir) return null;
        if (sign < 0) return { x: flowDir.x, z: flowDir.z };
        return { x: -flowDir.x, z: -flowDir.z };
    };

    const pickConnectorRoles = (pole, targetPole) => {
        let p0 = pole;
        let p1 = targetPole;
        const flow0 = pole?.flow ?? null;
        const flow1 = targetPole?.flow ?? null;
        if (flow0 === 'enter' && flow1 === 'exit') {
            p0 = targetPole;
            p1 = pole;
        }
        return { p0, p1 };
    };

    const shouldCreateConnector = (pole, targetPole) => {
        if (!pole || !targetPole) return false;
        const id0 = pole.uid;
        const id1 = targetPole.uid;
        if (Number.isFinite(id0) && Number.isFinite(id1)) {
            const key = id0 <= id1 ? `${id0}:${id1}` : `${id1}:${id0}`;
            if (connectorPairs.has(key)) return false;
            connectorPairs.add(key);
            return true;
        }
        const keyA = `${pole.x},${pole.z}`;
        const keyB = `${targetPole.x},${targetPole.z}`;
        const key = keyA <= keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;
        if (connectorPairs.has(key)) return false;
        connectorPairs.add(key);
        return true;
    };

    return {
        computeConnectorRadius,
        solveCurbConnector,
        getPoleFlowDir,
        getArrowDir,
        pickConnectorRoles,
        shouldCreateConnector
    };
}

export function buildCurbConnectors({ roadData, roadById, curbConnectors, connectorSolver }) {
    for (const data of roadData) {
        const endPoles = data.endPoles;
        const poles = data.road?.poles;
        if (endPoles) {
            const endEntries = [
                { pos: endPoles.start.left, side: 'left', end: 'start', endKey: data.startKey },
                { pos: endPoles.start.right, side: 'right', end: 'start', endKey: data.startKey },
                { pos: endPoles.end.left, side: 'left', end: 'end', endKey: data.endKey },
                { pos: endPoles.end.right, side: 'right', end: 'end', endKey: data.endKey }
            ];
            for (const entry of endEntries) {
                const pole = entry.pos;
                if (!pole) continue;
                const side = entry.side;
                const linked = pole.linkedTarget ?? null;
                const otherRoadId = linked?.roadId ?? pickSharedRoadOnSide(roadById, data, entry.endKey, side);
                let targetPole = null;
                let side1 = null;
                if (linked?.pole) {
                    targetPole = linked.pole;
                    side1 = targetPole.side ?? side;
                }
                if (!targetPole && otherRoadId != null) {
                    const other = roadById.get(otherRoadId);
                    if (other) {
                        const otherPole = pickEndPole(other, entry.endKey, side) ?? pickClosestEndPole(other, side, pole);
                        if (otherPole) {
                            targetPole = otherPole;
                            side1 = otherPole.side ?? side;
                        }
                    }
                }
                const { p0, p1 } = connectorSolver.pickConnectorRoles(pole, targetPole);
                const dir0 = p0 ? connectorSolver.getArrowDir(p0, 1) : null;
                const dir1 = p1 ? connectorSolver.getArrowDir(p1, -1) : null;
                const allowConnector = p0 && p1 && dir0 && dir1 && connectorSolver.shouldCreateConnector(p0, p1);
                if (p0 && p1 && dir0 && dir1 && !allowConnector) continue;
                const connector = allowConnector ? connectorSolver.solveCurbConnector(p0, p1, dir0, dir1) : null;
                const targetRoadId = p1?.roadId ?? null;
                if (p0) {
                    p0.otherRoadId = targetRoadId;
                    p0.connector = connector;
                    p0.connectorTarget = p1
                        ? { roadId: targetRoadId, x: p1.x, z: p1.z, side: p1.side ?? side1 }
                        : null;
                    p0.connectorDir = dir0;
                    p0.arrowSign = 1;
                    p0.arrowRole = 'p0';
                    p0.arrowDir = dir0;
                }
                if (p1) {
                    p1.arrowSign = -1;
                    p1.arrowRole = 'p1';
                    p1.arrowDir = dir1;
                }
                curbConnectors.push({
                    tag: 'end',
                    roadId: p0?.roadId ?? data.roadId,
                    otherRoadId: targetRoadId,
                    p0,
                    p1,
                    dir0,
                    dir1,
                    side0: p0?.side ?? side,
                    side1: p1?.side ?? side1,
                    connector
                });
            }
        }
        const connectionPoles = poles?.connection;
        if (Array.isArray(connectionPoles)) {
            for (const pole of connectionPoles) {
                if (!pole || !Number.isFinite(pole.x) || !Number.isFinite(pole.z)) continue;
                const side = pole.side === 'right' ? 'right' : 'left';
                const linked = pole.linkedTarget ?? null;
                const otherRoadId = linked?.roadId ?? pole.otherRoadId ?? pole.collision?.otherRoadId ?? null;
                let targetPole = null;
                let side1 = null;
                if (linked?.pole) {
                    targetPole = linked.pole;
                    side1 = targetPole.side ?? side;
                }
                if (!targetPole && otherRoadId != null) {
                    const other = roadById.get(otherRoadId);
                    const collisionId = pole.collisionId;
                    if (other && collisionId != null) {
                        const entry = other.connectionByCollision?.get(collisionId);
                        const candidates = [];
                        if (entry?.left) candidates.push(entry.left);
                        if (entry?.right) candidates.push(entry.right);
                        if (!candidates.length) {
                            const fallbackRef = pole.collision?.x != null && pole.collision?.z != null
                                ? { x: pole.collision.x, z: pole.collision.z }
                                : { x: pole.x, z: pole.z };
                            const fallbackPole = pickClosestEndPole(other, side, fallbackRef);
                            if (fallbackPole) candidates.push(fallbackPole);
                        }
                        if (candidates.length) {
                            let best = null;
                            let bestDist = Infinity;
                            for (const cand of candidates) {
                                const d2 = distanceSq(pole, cand);
                                if (d2 < bestDist - EPS) {
                                    bestDist = d2;
                                    best = cand;
                                }
                            }
                            if (best) {
                                targetPole = best;
                                side1 = best.side ?? side;
                            }
                        }
                    }
                }
                const { p0, p1 } = connectorSolver.pickConnectorRoles(pole, targetPole);
                const dir0 = p0 ? connectorSolver.getArrowDir(p0, 1) : null;
                const dir1 = p1 ? connectorSolver.getArrowDir(p1, -1) : null;
                const allowConnector = p0 && p1 && dir0 && dir1 && connectorSolver.shouldCreateConnector(p0, p1);
                if (p0 && p1 && dir0 && dir1 && !allowConnector) continue;
                const connector = allowConnector ? connectorSolver.solveCurbConnector(p0, p1, dir0, dir1) : null;
                const targetRoadId = p1?.roadId ?? otherRoadId ?? null;
                if (p0) {
                    p0.connector = connector;
                    p0.connectorTarget = p1
                        ? { roadId: targetRoadId, x: p1.x, z: p1.z, side: p1.side ?? side1 }
                        : null;
                    p0.connectorDir = dir0;
                    p0.arrowSign = 1;
                    p0.arrowRole = 'p0';
                    p0.arrowDir = dir0;
                }
                if (p1) {
                    p1.arrowSign = -1;
                    p1.arrowRole = 'p1';
                    p1.arrowDir = dir1;
                }
                curbConnectors.push({
                    tag: 'connection',
                    roadId: p0?.roadId ?? data.roadId,
                    otherRoadId: targetRoadId,
                    p0,
                    p1,
                    dir0,
                    dir1,
                    side0: p0?.side ?? side,
                    side1: p1?.side ?? side1,
                    connector
                });
            }
        }
    }
}
