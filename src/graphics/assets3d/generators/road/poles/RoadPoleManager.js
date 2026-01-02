// src/graphics/assets3d/generators/road/poles/RoadPoleManager.js
import { clamp } from '../math/RoadMath.js';
import { buildRenderData, isInGaps } from '../render/RoadRenderData.js';
import { EPS, HALF } from '../RoadConstants.js';
import { offsetEndpoints } from '../geometry/RoadGeometryCalc.js';
import { alongForData, segmentIntersection } from '../math/RoadIntersection.js';

export function createPoleManager({
    roadPoles,
    connectionPolesByCollision,
    dedupDistSq,
    minRoadHalfWidth,
    nextPoleId
}) {
    const registerConnectionPoleByCollision = (pole, collisionId) => {
        if (!pole || collisionId == null) return;
        const roadId = pole.roadId;
        if (roadId == null) return;
        let entry = connectionPolesByCollision.get(collisionId);
        if (!entry) {
            entry = new Map();
            connectionPolesByCollision.set(collisionId, entry);
        }
        let list = entry.get(roadId);
        if (!list) {
            list = [];
            entry.set(roadId, list);
        }
        if (!list.includes(pole)) list.push(pole);
    };

    const addCollisionPole = (data, hit, otherRoadId, collisionId, along) => {
        const poles = roadPoles.get(data?.roadId);
        if (!poles) return null;
        const list = poles.collision;
        const base = data?.centerlineStart ?? data?.rawStart ?? null;
        const dir = data?.dir ?? null;
        const normal = data?.normal ?? null;
        const offset = Number.isFinite(data?.curbOffset) ? data.curbOffset : (data?.halfWidth ?? 0);
        const hitX = hit?.x;
        const hitY = hit?.y;
        let poleX = Number.isFinite(hitX) ? hitX : 0;
        let poleZ = Number.isFinite(hitY) ? hitY : 0;
        let alongValue = Number.isFinite(along) ? along : null;
        if (!Number.isFinite(alongValue) && hit && data) alongValue = alongForData(data, hit);
        if (base && dir && normal && Number.isFinite(alongValue)) {
            const cx = base.x + dir.x * alongValue;
            const cy = base.y + dir.y * alongValue;
            const dx = poleX - cx;
            const dz = poleZ - cy;
            const dot = dx * normal.x + dz * normal.y;
            const sideSign = dot >= 0 ? 1 : -1;
            poleX = cx + normal.x * sideSign * offset;
            poleZ = cy + normal.y * sideSign * offset;
        }
        for (const existing of list) {
            const dx = existing.x - poleX;
            const dz = existing.z - poleZ;
            if (dx * dx + dz * dz <= dedupDistSq) {
                if (!existing.otherRoadIds) existing.otherRoadIds = [];
                if (otherRoadId != null && !existing.otherRoadIds.includes(otherRoadId)) {
                    existing.otherRoadIds.push(otherRoadId);
                }
                if (data?.collisionById) data.collisionById.set(collisionId, existing);
                return existing;
            }
        }
        const pole = {
            id: collisionId,
            roadId: data?.roadId ?? null,
            x: poleX,
            z: poleZ,
            otherRoadIds: otherRoadId != null ? [otherRoadId] : [],
            otherRoadId: otherRoadId != null ? otherRoadId : null,
            along: Number.isFinite(alongValue) ? alongValue : null
        };
        list.push(pole);
        if (data?.collisionById) data.collisionById.set(collisionId, pole);
        return pole;
    };

    const addConnectionPole = (data, hit, side, collisionInfo, cutT) => {
        const poles = roadPoles.get(data?.roadId);
        if (!poles) return null;
        const list = poles.connection;
        for (const existing of list) {
            const dx = existing.x - hit.x;
            const dz = existing.z - hit.y;
            if (dx * dx + dz * dz <= dedupDistSq) {
                if (!Number.isFinite(existing.uid)) existing.uid = nextPoleId();
                if (collisionInfo?.collisionId != null) existing.collisionId = collisionInfo.collisionId;
                if (collisionInfo?.collisionPole) existing.collision = collisionInfo.collisionPole;
                if (collisionInfo?.otherRoadId != null) existing.otherRoadId = collisionInfo.otherRoadId;
                if (Number.isFinite(cutT)) existing.cut = cutT;
                registerConnectionPoleByCollision(existing, collisionInfo?.collisionId ?? null);
                return existing;
            }
        }
        const pole = {
            x: hit.x,
            z: hit.y,
            side,
            roadId: data?.roadId ?? null,
            collisionId: collisionInfo?.collisionId ?? null,
            collision: collisionInfo?.collisionPole ?? null,
            otherRoadId: collisionInfo?.otherRoadId ?? null,
            cut: Number.isFinite(cutT) ? cutT : null,
            uid: nextPoleId()
        };
        list.push(pole);
        registerConnectionPoleByCollision(pole, collisionInfo?.collisionId ?? null);
        if (collisionInfo?.collisionId != null && data?.connectionByCollision) {
            const entry = data.connectionByCollision.get(collisionInfo.collisionId) ?? { left: null, right: null };
            if (side === 'left') entry.left = pole;
            if (side === 'right') entry.right = pole;
            data.connectionByCollision.set(collisionInfo.collisionId, entry);
        }
        return pole;
    };

    const addConnectionPolesForRoad = (data, hits) => {
        if (!data || !Array.isArray(hits) || !hits.length) return;
        const maxT = data.length ?? 0;
        if (!(maxT > EPS)) return;
        const base = data.centerlineStart ?? data.rawStart;
        if (!base) return;
        const baseHalfWidth = data.halfWidth ?? 0;
        const uniformHalfWidth = Number.isFinite(minRoadHalfWidth) ? minRoadHalfWidth : baseHalfWidth;
        let minHalfWidth = uniformHalfWidth;
        let minAlong = Infinity;
        let maxAlong = -Infinity;
        let minHit = null;
        let maxHit = null;
        const leftHits = [];
        const rightHits = [];
        for (const hit of hits) {
            const along = hit?.along ?? null;
            if (!Number.isFinite(along)) continue;
            const hitHalfWidth = uniformHalfWidth;
            hit.halfWidth = hitHalfWidth;
            if (Number.isFinite(hitHalfWidth)) minHalfWidth = Math.min(minHalfWidth, hitHalfWidth);
            if (along < minAlong) {
                minAlong = along;
                minHit = hit;
            }
            if (along > maxAlong) {
                maxAlong = along;
                maxHit = hit;
            }
            const collision = hit?.collisionPole ?? null;
            const hx = collision?.x;
            const hz = collision?.z;
            if (!Number.isFinite(hx) || !Number.isFinite(hz)) continue;
            const cx = base.x + data.dir.x * along;
            const cy = base.y + data.dir.y * along;
            const dx = hx - cx;
            const dz = hz - cy;
            const dot = dx * data.normal.x + dz * data.normal.y;
            if (dot >= 0) leftHits.push(hit);
            else rightHits.push(hit);
        }
        if (!Number.isFinite(minAlong) || !Number.isFinite(maxAlong)) return;
        const pickMinHit = (list) => {
            let best = null;
            let bestAlong = Infinity;
            for (const entry of list) {
                const along = entry?.along ?? null;
                if (!Number.isFinite(along)) continue;
                if (along < bestAlong) {
                    bestAlong = along;
                    best = entry;
                }
            }
            return best;
        };
        const pickMaxHit = (list) => {
            let best = null;
            let bestAlong = -Infinity;
            for (const entry of list) {
                const along = entry?.along ?? null;
                if (!Number.isFinite(along)) continue;
                if (along > bestAlong) {
                    bestAlong = along;
                    best = entry;
                }
            }
            return best;
        };
        const leftMinHit = pickMinHit(leftHits) ?? null;
        const rightMinHit = pickMinHit(rightHits) ?? null;
        const leftMaxHit = pickMaxHit(leftHits) ?? null;
        const rightMaxHit = pickMaxHit(rightHits) ?? null;
        const collisionStart = clamp(minAlong, 0, maxT);
        const collisionEnd = clamp(maxAlong, 0, maxT);
        if (!data.collisionIntervals) data.collisionIntervals = [];
        data.collisionIntervals.push({ start: collisionStart, end: collisionEnd });
        const startHalfWidth = Number.isFinite(minHit?.halfWidth) ? minHit.halfWidth : minHalfWidth;
        const endHalfWidth = Number.isFinite(maxHit?.halfWidth) ? maxHit.halfWidth : minHalfWidth;
        const cutStart = clamp(minAlong - startHalfWidth, 0, maxT);
        const cutEnd = clamp(maxAlong + endHalfWidth, 0, maxT);
        if (!data.connectionCuts) data.connectionCuts = [];
        if (!data.connectionGaps) data.connectionGaps = [];
        data.connectionCuts.push(cutStart);
        data.connectionCuts.push(cutEnd);
        const gapStart = Math.min(cutStart, cutEnd);
        const gapEnd = Math.max(cutStart, cutEnd);
        if (gapEnd - gapStart > EPS) data.connectionGaps.push({ start: gapStart, end: gapEnd });
        const addConnectionPairAt = (cutT, collisionInfoLeft, collisionInfoRight) => {
            const mid = { x: base.x + data.dir.x * cutT, y: base.y + data.dir.y * cutT };
            const left = {
                x: mid.x + data.normal.x * data.curbOffset,
                y: mid.y + data.normal.y * data.curbOffset
            };
            const right = {
                x: mid.x - data.normal.x * data.curbOffset,
                y: mid.y - data.normal.y * data.curbOffset
            };
            addConnectionPole(data, left, 'left', collisionInfoLeft ?? collisionInfoRight, cutT);
            addConnectionPole(data, right, 'right', collisionInfoRight ?? collisionInfoLeft, cutT);
            if (!data.connectionPairs) data.connectionPairs = [];
            const midX = (left.x + right.x) * HALF;
            const midY = (left.y + right.y) * HALF;
            let ok = true;
            for (const existing of data.connectionPairs) {
                const el = existing?.left;
                const er = existing?.right;
                if (!el || !er) continue;
                const ex = (el.x + er.x) * HALF;
                const ey = ((el.z ?? el.y) + (er.z ?? er.y)) * HALF;
                const dx = ex - midX;
                const dz = ey - midY;
                if (dx * dx + dz * dz <= dedupDistSq) {
                    ok = false;
                    break;
                }
            }
            if (ok) {
                data.connectionPairs.push({
                    left: { x: left.x, z: left.y },
                    right: { x: right.x, z: right.y },
                    cut: cutT,
                    collisionId: collisionInfoLeft?.collisionId ?? collisionInfoRight?.collisionId ?? null,
                    otherRoadId: collisionInfoLeft?.otherRoadId ?? collisionInfoRight?.otherRoadId ?? null
                });
            }
        };
        addConnectionPairAt(cutStart, leftMinHit ?? minHit, rightMinHit ?? minHit);
        if (Math.abs(cutEnd - cutStart) > EPS) {
            addConnectionPairAt(cutEnd, leftMaxHit ?? maxHit, rightMaxHit ?? maxHit);
        }
    };

    return {
        registerConnectionPoleByCollision,
        addCollisionPole,
        addConnectionPole,
        addConnectionPolesForRoad
    };
}

export function initializeRoadPoles({ roadData, roadPoles, nextPoleId, addPoleDot }) {
    for (const data of roadData) {
        const centerlineStart = data.centerlineStart ?? data.rawStart;
        const centerlineEnd = data.centerlineEnd ?? data.rawEnd;
        const poles = { end: [], collision: [], connection: [], adjustedEnd: [] };
        data.road.poles = poles;
        roadPoles.set(data.roadId, poles);
        data.connectionCuts = [];
        data.connectionPairs = [];
        data.connectionGaps = [];
        data.collisionIntervals = [];
        data.collisionById = new Map();
        data.connectionByCollision = new Map();

        const leftEdge = offsetEndpoints(centerlineStart, centerlineEnd, data.normal, data.halfWidth);
        const rightEdge = offsetEndpoints(centerlineStart, centerlineEnd, data.normal, -data.halfWidth);
        const leftPoleEdge = offsetEndpoints(centerlineStart, centerlineEnd, data.normal, data.curbOffset);
        const rightPoleEdge = offsetEndpoints(centerlineStart, centerlineEnd, data.normal, -data.curbOffset);
        const startLeft = { x: leftPoleEdge.start.x, z: leftPoleEdge.start.y, side: 'left', end: 'start', endKey: data.startKey, roadId: data.roadId, uid: nextPoleId() };
        const startRight = { x: rightPoleEdge.start.x, z: rightPoleEdge.start.y, side: 'right', end: 'start', endKey: data.startKey, roadId: data.roadId, uid: nextPoleId() };
        const endLeft = { x: leftPoleEdge.end.x, z: leftPoleEdge.end.y, side: 'left', end: 'end', endKey: data.endKey, roadId: data.roadId, uid: nextPoleId() };
        const endRight = { x: rightPoleEdge.end.x, z: rightPoleEdge.end.y, side: 'right', end: 'end', endKey: data.endKey, roadId: data.roadId, uid: nextPoleId() };
        poles.end = [startLeft, startRight, endLeft, endRight];
        data.endPoles = {
            start: {
                left: startLeft,
                right: startRight
            },
            end: {
                left: endLeft,
                right: endRight
            }
        };
        const adjustedEnd = poles.adjustedEnd;
        if (data.sharedTrimStart > 0 && data.sharedOriginalStart && data.sharedOriginalEnd) {
            const origLeft = offsetEndpoints(data.sharedOriginalStart, data.sharedOriginalEnd, data.normal, data.curbOffset);
            const origRight = offsetEndpoints(data.sharedOriginalStart, data.sharedOriginalEnd, data.normal, -data.curbOffset);
            const sharedStartIds = data.sharedStartRoadIds?.slice?.() ?? [];
            startLeft.sharedRoadIds = sharedStartIds;
            startRight.sharedRoadIds = sharedStartIds;
            startLeft.adjusted = true;
            startRight.adjusted = true;
            startLeft.original = { x: origLeft.start.x, z: origLeft.start.y };
            startRight.original = { x: origRight.start.x, z: origRight.start.y };
            adjustedEnd.push({
                adjusted: { x: leftPoleEdge.start.x, z: leftPoleEdge.start.y },
                original: { x: origLeft.start.x, z: origLeft.start.y },
                sharedRoadIds: sharedStartIds,
                endKey: data.startKey,
                end: 'start',
                side: 'left'
            });
            adjustedEnd.push({
                adjusted: { x: rightPoleEdge.start.x, z: rightPoleEdge.start.y },
                original: { x: origRight.start.x, z: origRight.start.y },
                sharedRoadIds: sharedStartIds,
                endKey: data.startKey,
                end: 'start',
                side: 'right'
            });
        }
        if (data.sharedTrimEnd > 0 && data.sharedOriginalStart && data.sharedOriginalEnd) {
            const origLeft = offsetEndpoints(data.sharedOriginalStart, data.sharedOriginalEnd, data.normal, data.curbOffset);
            const origRight = offsetEndpoints(data.sharedOriginalStart, data.sharedOriginalEnd, data.normal, -data.curbOffset);
            const sharedEndIds = data.sharedEndRoadIds?.slice?.() ?? [];
            endLeft.sharedRoadIds = sharedEndIds;
            endRight.sharedRoadIds = sharedEndIds;
            endLeft.adjusted = true;
            endRight.adjusted = true;
            endLeft.original = { x: origLeft.end.x, z: origLeft.end.y };
            endRight.original = { x: origRight.end.x, z: origRight.end.y };
            adjustedEnd.push({
                adjusted: { x: leftPoleEdge.end.x, z: leftPoleEdge.end.y },
                original: { x: origLeft.end.x, z: origLeft.end.y },
                sharedRoadIds: sharedEndIds,
                endKey: data.endKey,
                end: 'end',
                side: 'left'
            });
            adjustedEnd.push({
                adjusted: { x: rightPoleEdge.end.x, z: rightPoleEdge.end.y },
                original: { x: origRight.end.x, z: origRight.end.y },
                sharedRoadIds: sharedEndIds,
                endKey: data.endKey,
                end: 'end',
                side: 'right'
            });
        }
        addPoleDot(leftPoleEdge.start);
        addPoleDot(leftPoleEdge.end);
        addPoleDot(rightPoleEdge.start);
        addPoleDot(rightPoleEdge.end);
        data.collisionEdges = [
            { a: leftEdge.start, b: leftEdge.end },
            { a: rightEdge.start, b: rightEdge.end },
            { a: leftEdge.start, b: rightEdge.start },
            { a: leftEdge.end, b: rightEdge.end }
        ];
    }
}

export function detectCollisionPoles({
    roadData,
    addCollisionPole,
    addConnectionPolesForRoad,
    collisionMarkers,
    dedupDistSq,
    collisionIdRef
}) {
    for (let i = 0; i < roadData.length; i++) {
        const a = roadData[i];
        const aEdges = a.collisionEdges;
        if (!aEdges) continue;
        for (let j = i + 1; j < roadData.length; j++) {
            const b = roadData[j];
            if (a.roadId === b.roadId) continue;
            const bEdges = b.collisionEdges;
            if (!bEdges) continue;
            const pairHits = [];
            for (const e0 of aEdges) {
                for (const e1 of bEdges) {
                    const hit = segmentIntersection(e0.a, e0.b, e1.a, e1.b);
                    if (!hit) continue;
                    let ok = true;
                    for (const existing of pairHits) {
                        const dx = existing.x - hit.x;
                        const dz = existing.y - hit.y;
                        if (dx * dx + dz * dz <= dedupDistSq) {
                            ok = false;
                            break;
                        }
                    }
                    if (ok) pairHits.push(hit);
                }
            }
            if (!pairHits.length) continue;
            const hitInfosA = [];
            const hitInfosB = [];
            for (const hit of pairHits) {
                const id = collisionIdRef.value;
                collisionIdRef.value += 1;
                const alongA = alongForData(a, hit);
                const alongB = alongForData(b, hit);
                const poleA = addCollisionPole(a, hit, b.roadId, id, alongA);
                const poleB = addCollisionPole(b, hit, a.roadId, id, alongB);
                hitInfosA.push({
                    along: alongA,
                    collisionId: id,
                    collisionPole: poleA,
                    otherRoadId: b.roadId
                });
                hitInfosB.push({
                    along: alongB,
                    collisionId: id,
                    collisionPole: poleB,
                    otherRoadId: a.roadId
                });
                let ok = true;
                for (const existing of collisionMarkers) {
                    const dx = existing.x - hit.x;
                    const dz = existing.z - hit.y;
                    if (dx * dx + dz * dz <= dedupDistSq) {
                        ok = false;
                        break;
                    }
                }
                if (ok) collisionMarkers.push({ x: hit.x, z: hit.y });
            }
            addConnectionPolesForRoad(a, hitInfosA);
            addConnectionPolesForRoad(b, hitInfosB);
        }
    }
}

export function assignConnectionPoleFlows({ roadData }) {
    for (const data of roadData) {
        const poles = data.road?.poles;
        const connectionPoles = poles?.connection;
        if (!Array.isArray(connectionPoles) || !connectionPoles.length) continue;
        const renderData = buildRenderData(data);
        const length = renderData.length ?? 0;
        const gaps = renderData.gaps ?? [];
        if (!(length > EPS)) continue;
        const boundaryTol = Math.max(EPS * 100, Math.min(0.05, data.halfWidth * 0.2));
        for (const pole of connectionPoles) {
            const cutT = pole?.cut;
            if (!Number.isFinite(cutT)) continue;
            let hasBefore = false;
            let hasAfter = false;
            let matchedBoundary = false;
            for (const gap of gaps) {
                const start = gap?.start;
                const end = gap?.end;
                if (Number.isFinite(start) && Math.abs(cutT - start) <= boundaryTol) {
                    hasBefore = true;
                    hasAfter = false;
                    matchedBoundary = true;
                    break;
                }
                if (Number.isFinite(end) && Math.abs(cutT - end) <= boundaryTol) {
                    hasBefore = false;
                    hasAfter = true;
                    matchedBoundary = true;
                    break;
                }
            }
            if (!matchedBoundary) {
                const beforeT = cutT - boundaryTol;
                const afterT = cutT + boundaryTol;
                hasBefore = beforeT > EPS && !isInGaps(beforeT, gaps);
                hasAfter = afterT < length - EPS && !isInGaps(afterT, gaps);
            }
            pole.renderBefore = hasBefore;
            pole.renderAfter = hasAfter;
            pole.flow = (hasBefore && !hasAfter) ? 'exit' : (!hasBefore && hasAfter ? 'enter' : null);
        }
    }
}
