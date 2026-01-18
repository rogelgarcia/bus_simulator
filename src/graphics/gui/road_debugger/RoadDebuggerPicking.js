// src/graphics/gui/road_debugger/RoadDebuggerPicking.js
// Centralized picking (hover/click/drag start) for Road Debugger viewport + UI.

import * as THREE from 'three';

const tmpProjectVec = new THREE.Vector3();

export const ROAD_DEBUGGER_PICK_DEFAULTS = Object.freeze({
    junctionCandidateHoverRadiusPx: 20,
    junctionCandidateClickRadiusPx: 22,
    controlPointHoverRadiusPx: 16,
    controlPointClickRadiusPx: 18
});

function normalizedPointerToClient(view, rect) {
    const ndcX = Number(view?.pointer?.x) || 0;
    const ndcY = Number(view?.pointer?.y) || 0;
    const left = Number(rect?.left) || 0;
    const top = Number(rect?.top) || 0;
    const w = Number(rect?.width) || 1;
    const h = Number(rect?.height) || 1;
    return {
        clientX: left + (ndcX * 0.5 + 0.5) * w,
        clientY: top + (-ndcY * 0.5 + 0.5) * h
    };
}

function buildVisibleRoadMap(view) {
    const roads = view?._getRoadsForPipeline?.({ includeDraft: true }) ?? [];
    const visibleByRoadId = new Map();
    for (const road of roads) {
        if (!road?.id) continue;
        visibleByRoadId.set(road.id, road.visible !== false);
    }
    return (roadId) => {
        if (!roadId) return true;
        return visibleByRoadId.get(roadId) !== false;
    };
}

export class RoadDebuggerPicking {
    constructor(view) {
        this.view = view;
        this.debugEnabled = false;
        this._debugLastPick = null;
    }

    getDebugPick() {
        return this._debugLastPick;
    }

    pickHover() {
        return this._pick({ mode: 'hover' });
    }

    pickClick() {
        return this._pick({ mode: 'click' });
    }

    pickDragStart() {
        return this._pick({ mode: 'drag_start' });
    }

    formatPick(pick) {
        const p = pick ?? null;
        if (!p?.type) return 'background';
        if (p.type === 'point') return `point ${p.pointId ?? ''}`.trim();
        if (p.type === 'segment') return `segment ${p.segmentId ?? ''}`.trim();
        if (p.type === 'piece') return `piece ${p.pieceId ?? ''}`.trim();
        if (p.type === 'road') return `road ${p.roadId ?? ''}`.trim();
        if (p.type === 'junction') return `junction ${p.junctionId ?? ''}`.trim();
        if (p.type === 'junction_tat') return `tat ${p.tatType ?? ''} ${p.tatId ?? ''}`.trim();
        if (p.type === 'connector') return `connector ${p.connectorId ?? ''}`.trim();
        if (p.type === 'junction_candidate') return `candidate ${p.candidateId ?? ''}`.trim();
        return String(p.type);
    }

    _pick({ mode }) {
        const view = this.view;
        const camera = view?.camera ?? null;
        const canvas = view?.canvas ?? null;
        const raycaster = view?.raycaster ?? null;
        if (!camera || !canvas || !raycaster) return null;

        const rect = canvas.getBoundingClientRect?.() ?? null;
        if (!rect || !(rect.width > 1) || !(rect.height > 1)) return null;

        const junctionToolEnabled = view.getJunctionToolEnabled?.() ?? view?._junctionToolEnabled === true;
        if (junctionToolEnabled) {
            const candidateRadius = mode === 'hover'
                ? ROAD_DEBUGGER_PICK_DEFAULTS.junctionCandidateHoverRadiusPx
                : ROAD_DEBUGGER_PICK_DEFAULTS.junctionCandidateClickRadiusPx;
            const cand = this._pickJunctionCandidateAtPointer({ rect, radiusPx: candidateRadius });
            if (cand?.candidateId) {
                const out = { type: 'junction_candidate', candidateId: cand.candidateId, candidateKind: cand.candidateKind ?? null };
                return this._finalizeDebug(out);
            }
        }

        const pointRadius = mode === 'hover'
            ? ROAD_DEBUGGER_PICK_DEFAULTS.controlPointHoverRadiusPx
            : ROAD_DEBUGGER_PICK_DEFAULTS.controlPointClickRadiusPx;
        const pointPick = this._pickControlPointAtPointer({ rect, radiusPx: pointRadius });
        if (pointPick) return this._finalizeDebug(pointPick);

        raycaster.setFromCamera(view.pointer, camera);

        const junctionDebug = view.getJunctionDebugOptions?.() ?? view?._junctionDebug ?? {};
        if (mode === 'hover' && junctionDebug?.tat) {
            const tatObj = raycaster.intersectObjects(view._junctionTatPickMeshes ?? [], false)[0]?.object ?? null;
            if (tatObj?.userData?.junctionId && tatObj?.userData?.tatId) {
                return this._finalizeDebug({
                    type: 'junction_tat',
                    junctionId: tatObj.userData.junctionId,
                    tatId: tatObj.userData.tatId,
                    tatType: tatObj.userData.tatType ?? null
                });
            }
        }

        const connObj = raycaster.intersectObjects(view._connectorPickMeshes ?? [], false)[0]?.object ?? null;
        if (connObj?.userData?.connectorId) {
            return this._finalizeDebug({
                type: 'connector',
                connectorId: connObj.userData.connectorId,
                junctionId: connObj.userData.junctionId ?? null
            });
        }

        const junctionObj = raycaster.intersectObjects(view._junctionPickMeshes ?? [], false)[0]?.object ?? null;
        if (junctionObj?.userData?.junctionId) {
            return this._finalizeDebug({ type: 'junction', junctionId: junctionObj.userData.junctionId });
        }

        const segObj = raycaster.intersectObjects(view._segmentPickMeshes ?? [], false)[0]?.object ?? null;
        if (segObj?.userData?.roadId && segObj?.userData?.segmentId) {
            const out = { type: 'segment', roadId: segObj.userData.roadId, segmentId: segObj.userData.segmentId };
            return this._finalizeDebug(out);
        }

        if (mode !== 'hover') {
            const asphaltObj = raycaster.intersectObjects(view._asphaltMeshes ?? [], false)[0]?.object ?? null;
            if (asphaltObj?.userData?.roadId && asphaltObj?.userData?.segmentId && asphaltObj?.userData?.pieceId) {
                const out = {
                    type: 'piece',
                    roadId: asphaltObj.userData.roadId,
                    segmentId: asphaltObj.userData.segmentId,
                    pieceId: asphaltObj.userData.pieceId
                };
                return this._finalizeDebug(out);
            }
        }

        return this._finalizeDebug(null);
    }

    _finalizeDebug(pick) {
        if (this.debugEnabled) this._debugLastPick = pick;
        return pick;
    }

    _pickJunctionCandidateAtPointer({ rect, radiusPx }) {
        const view = this.view;
        if (!view?.canvas) return null;
        const { clientX, clientY } = normalizedPointerToClient(view, rect);
        return this._pickJunctionCandidateAtClient(clientX, clientY, { rect, radiusPx });
    }

    _pickJunctionCandidateAtClient(clientX, clientY, { rect, radiusPx }) {
        const view = this.view;
        const derived = view?._derived ?? null;
        const candidates = derived?.junctionCandidates ?? null;
        if (!candidates) return null;

        const isRoadVisible = buildVisibleRoadMap(view);

        const r = Number(radiusPx) || 0;
        const radiusSq = r * r;
        const rectObj = rect ?? (view.canvas?.getBoundingClientRect?.() ?? null);
        if (!rectObj || !(rectObj.width > 1) || !(rectObj.height > 1)) return null;

        const w = Number(rectObj.width) || 1;
        const h = Number(rectObj.height) || 1;
        const left = Number(rectObj.left) || 0;
        const top = Number(rectObj.top) || 0;
        const y = (Number(view?._groundY) || 0) + 0.055;

        let best = null;
        let bestDistSq = radiusSq;

        const tryCandidate = (cand, kind) => {
            if (!cand?.id || !cand?.world) return;
            if (!isRoadVisible(cand.roadId ?? null)) return;

            tmpProjectVec.set(Number(cand.world.x) || 0, y, Number(cand.world.z) || 0);
            tmpProjectVec.project(view.camera);
            if (!(tmpProjectVec.z >= -1 && tmpProjectVec.z <= 1)) return;
            const sx = left + (tmpProjectVec.x * 0.5 + 0.5) * w;
            const sy = top + (-tmpProjectVec.y * 0.5 + 0.5) * h;
            const dx = sx - clientX;
            const dy = sy - clientY;
            const d2 = dx * dx + dy * dy;
            if (d2 > bestDistSq) return;
            bestDistSq = d2;
            best = { candidateId: cand.id, candidateKind: kind };
        };

        const endpoints = candidates?.endpoints ?? [];
        for (const endpoint of endpoints) tryCandidate(endpoint, 'endpoint');

        const corners = candidates?.corners ?? [];
        for (const corner of corners) tryCandidate(corner, 'corner');

        return best;
    }

    _pickControlPointAtPointer({ rect, radiusPx }) {
        const view = this.view;
        if (!view?.canvas) return null;
        const { clientX, clientY } = normalizedPointerToClient(view, rect);
        return this._pickControlPointAtClient(clientX, clientY, { rect, radiusPx });
    }

    _pickControlPointAtClient(clientX, clientY, { rect, radiusPx }) {
        const view = this.view;
        if (!view?.canvas) return null;
        const r = Number(radiusPx) || 0;
        const radiusSq = r * r;
        const rectObj = rect ?? (view.canvas?.getBoundingClientRect?.() ?? null);
        if (!rectObj || !(rectObj.width > 1) || !(rectObj.height > 1)) return null;
        const w = Number(rectObj.width) || 1;
        const h = Number(rectObj.height) || 1;
        const left = Number(rectObj.left) || 0;
        const top = Number(rectObj.top) || 0;

        let best = null;
        let bestDistSq = radiusSq;

        const meshes = view?._controlPointMeshes ?? [];
        for (const mesh of meshes) {
            const roadId = mesh?.userData?.roadId ?? null;
            const pointId = mesh?.userData?.pointId ?? null;
            if (!roadId || !pointId) continue;
            if (!mesh?.position) continue;

            tmpProjectVec.copy(mesh.position);
            tmpProjectVec.project(view.camera);
            if (!(tmpProjectVec.z >= -1 && tmpProjectVec.z <= 1)) continue;
            const sx = left + (tmpProjectVec.x * 0.5 + 0.5) * w;
            const sy = top + (-tmpProjectVec.y * 0.5 + 0.5) * h;
            const dx = sx - clientX;
            const dy = sy - clientY;
            const d2 = dx * dx + dy * dy;
            if (d2 > bestDistSq) continue;
            bestDistSq = d2;
            best = { roadId, pointId };
        }

        if (!best) return null;
        return { type: 'point', roadId: best.roadId, pointId: best.pointId };
    }
}
