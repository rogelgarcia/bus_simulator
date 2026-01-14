// src/graphics/gui/road_debugger/RoadDebuggerUI.js
// Builds the Road Debugger UI (roads table, view toggles, and creation controls).

function clampInt(v, lo, hi) {
    const n = Number(v);
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n | 0));
}

function clamp(v, lo, hi) {
    const n = Number(v);
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n));
}

function makeButton(label) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'road-debugger-btn';
    btn.textContent = label;
    return btn;
}

function makeToggleRow(labelText) {
    const row = document.createElement('label');
    row.className = 'road-debugger-row';
    const label = document.createElement('span');
    label.className = 'road-debugger-label';
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'road-debugger-checkbox';
    row.appendChild(label);
    row.appendChild(input);
    return { row, input };
}

function fmt(v, digits = 2) {
    return Number.isFinite(v) ? v.toFixed(digits) : '--';
}

function fmtInt(v) {
    return Number.isFinite(v) ? String(v | 0) : '--';
}

function outputInfo(view) {
    const derived = view.getDerived?.() ?? view._derived ?? null;
    const hover = view._hover ?? {};
    const sel = view._selection ?? {};

    const summarizeJunction = (junctionId) => {
        const junction = derived?.junctions?.find?.((j) => j?.id === junctionId) ?? null;
        if (!junction) return { label: `Junction ${junctionId ?? '--'}`, world: null, approaches: 0 };
        const endpoints = junction?.endpoints ?? [];
        const pos = endpoints.reduce(
            (acc, endpoint) => {
                const w = endpoint?.world ?? null;
                if (!w) return acc;
                acc.x += Number(w.x) || 0;
                acc.z += Number(w.z) || 0;
                acc.n += 1;
                return acc;
            },
            { x: 0, z: 0, n: 0 }
        );
        const world = pos.n > 0 ? { x: pos.x / pos.n, z: pos.z / pos.n } : null;
        return { label: `Junction ${junction.id}`, world, approaches: endpoints.length };
    };

    const hoverLines = [];
    const hoverIssueId = view.getHoverIssueId?.() ?? view._hoverIssueId ?? null;
    const hoverIssue = hoverIssueId ? (view.getIssueById?.(hoverIssueId) ?? null) : null;
    const hoverCandidate = view._junctionToolHoverCandidateId ?? null;
    if (hoverIssue) {
        hoverLines.push(`issue: ${hoverIssue.issueId}`);
        hoverLines.push(`${hoverIssue.severity}: ${hoverIssue.label}`);
    } else if (hoverCandidate) {
        hoverLines.push(`candidate: ${hoverCandidate}`);
    } else if (hover.connectorId) {
        hoverLines.push(`connector: ${hover.connectorId}`);
    } else if (hover.approachId) {
        hoverLines.push(`approach: ${hover.approachId}`);
        if (hover.junctionId) hoverLines.push(`junction: ${hover.junctionId}`);
    } else if (hover.junctionId) {
        const j = summarizeJunction(hover.junctionId);
        hoverLines.push(j.label);
        hoverLines.push(`approaches: ${fmtInt(j.approaches)}`);
        if (j.world) hoverLines.push(`world: ${fmt(j.world.x, 1)}, ${fmt(j.world.z, 1)}`);
    } else if (hover.pointId) {
        hoverLines.push(`point: ${hover.pointId}`);
        if (hover.roadId) hoverLines.push(`road: ${hover.roadId}`);
    } else if (hover.segmentId) {
        const seg = derived?.segments?.find?.((s) => s?.id === hover.segmentId) ?? null;
        hoverLines.push(`segment: ${hover.segmentId}`);
        if (seg?.roadId) hoverLines.push(`road: ${seg.roadId}`);
        if (Number.isFinite(seg?.length)) hoverLines.push(`length: ${fmt(seg.length, 2)}m`);
    } else if (hover.roadId) {
        const road = derived?.roads?.find?.((r) => r?.id === hover.roadId) ?? null;
        hoverLines.push(`road: ${road?.name ?? hover.roadId}`);
        if (road?.id && road.id !== hover.roadId) hoverLines.push(`id: ${road.id}`);
    }

    const selectedLines = [];
    if (sel.type === 'road') {
        const road = derived?.roads?.find?.((r) => r?.id === sel.roadId) ?? null;
        selectedLines.push(`road: ${road?.name ?? sel.roadId ?? '--'}`);
    } else if (sel.type === 'segment') {
        selectedLines.push(`segment: ${sel.segmentId ?? '--'}`);
    } else if (sel.type === 'piece') {
        selectedLines.push(`piece: ${sel.pieceId ?? '--'}`);
        if (sel.segmentId) selectedLines.push(`segment: ${sel.segmentId}`);
    } else if (sel.type === 'point') {
        selectedLines.push(`point: ${sel.pointId ?? '--'}`);
        if (sel.roadId) selectedLines.push(`road: ${sel.roadId}`);
    } else if (sel.type === 'junction') {
        const j = summarizeJunction(sel.junctionId);
        selectedLines.push(j.label);
        selectedLines.push(`approaches: ${fmtInt(j.approaches)}`);
    } else if (sel.type === 'connector') {
        selectedLines.push(`connector: ${sel.connectorId ?? '--'}`);
        if (sel.junctionId) selectedLines.push(`junction: ${sel.junctionId}`);
    } else if (sel.type === 'approach') {
        selectedLines.push(`approach: ${sel.approachId ?? '--'}`);
        if (sel.junctionId) selectedLines.push(`junction: ${sel.junctionId}`);
    }

    const hoverText = hoverLines.length ? hoverLines.join('\n') : '—';
    const selectedText = selectedLines.length ? selectedLines.join('\n') : '—';
    return {
        title: 'Hover',
        text: `Hovered\n${hoverText}\n\nSelected\n${selectedText}`
    };
}

function highlightInfo(view) {
    const sel = view._selection ?? {};
    const hover = view._hover ?? {};
    const derived = view.getDerived?.() ?? view._derived ?? null;
    const settings = derived?.settings ?? null;
    const laneWidth = settings?.laneWidth ?? view._laneWidth ?? 4.8;
    const marginFactor = settings?.marginFactor ?? view._marginFactor ?? 0.1;
    const margin = laneWidth * marginFactor;

    const schemaRoads = (() => {
        const draft = view.getDraftRoad?.() ?? view._draft ?? null;
        const roads = view.getRoads?.() ?? view._roads ?? [];
        return draft ? [draft, ...roads] : roads;
    })();

    const schemaRoadById = (roadId) => schemaRoads.find((r) => r?.id === roadId) ?? null;

    const junctionToolText = (() => {
        const enabled = view.getJunctionToolEnabled?.() ?? view._junctionToolEnabled === true;
        if (!enabled) return null;
        const candidates = derived?.junctionCandidates ?? null;
        const endpoints = candidates?.endpoints ?? [];
        const corners = candidates?.corners ?? [];

        const byId = new Map();
        for (const endpoint of endpoints) {
            const id = endpoint?.id ?? null;
            if (!id) continue;
            byId.set(id, { kind: 'endpoint', value: endpoint });
        }
        for (const corner of corners) {
            const id = corner?.id ?? null;
            if (!id) continue;
            byId.set(id, { kind: 'corner', value: corner });
        }

        const selected = view.getJunctionToolSelection?.() ?? Array.from(view._junctionToolSelectedCandidateIds ?? []).sort();
        const hoverId = view._junctionToolHoverCandidateId ?? null;

        const counts = { endpoints: 0, corners: 0 };
        for (const id of selected) {
            const entry = byId.get(id) ?? null;
            if (entry?.kind === 'corner') counts.corners += 1;
            else counts.endpoints += 1;
        }

        const lines = [];
        lines.push(`selected: ${fmtInt(selected.length)} (endpoints ${fmtInt(counts.endpoints)}, corners ${fmtInt(counts.corners)})`);

        if (hoverId) {
            const entry = byId.get(hoverId) ?? null;
            if (entry?.kind === 'endpoint') {
                const endpoint = entry.value ?? null;
                lines.push(`hover: endpoint ${hoverId}`);
                lines.push(`hoverRoad: ${endpoint?.roadId ?? '--'} · seg ${endpoint?.segmentId ?? '--'} · piece ${endpoint?.pieceId ?? '--'} · ${endpoint?.end ?? '--'}`);
                lines.push(`hoverWorld: ${fmt(endpoint?.world?.x, 2)}, ${fmt(endpoint?.world?.z, 2)}`);
            } else if (entry?.kind === 'corner') {
                const corner = entry.value ?? null;
                const angleDeg = (Number(corner?.angleRad) || 0) * 57.2958;
                lines.push(`hover: corner ${hoverId}`);
                lines.push(`hoverRoad: ${corner?.roadId ?? '--'} · pt ${corner?.pointId ?? '--'} · ang ${fmt(angleDeg, 1)}°`);
                lines.push(`hoverWorld: ${fmt(corner?.world?.x, 2)}, ${fmt(corner?.world?.z, 2)}`);
            } else {
                lines.push(`hover: ${hoverId}`);
            }
        }

        const selectedWorld = [];
        for (const id of selected) {
            const entry = byId.get(id) ?? null;
            const world = entry?.value?.world ?? null;
            if (!world) continue;
            selectedWorld.push({ id, x: Number(world.x) || 0, z: Number(world.z) || 0 });
        }
        if (selectedWorld.length === 2) {
            const dx = selectedWorld[1].x - selectedWorld[0].x;
            const dz = selectedWorld[1].z - selectedWorld[0].z;
            lines.push(`distance: ${fmt(Math.hypot(dx, dz), 2)}m`);
        } else if (selectedWorld.length > 2) {
            let minX = Infinity;
            let minZ = Infinity;
            let maxX = -Infinity;
            let maxZ = -Infinity;
            for (const pt of selectedWorld) {
                minX = Math.min(minX, pt.x);
                minZ = Math.min(minZ, pt.z);
                maxX = Math.max(maxX, pt.x);
                maxZ = Math.max(maxZ, pt.z);
            }
            const span = Math.hypot(maxX - minX, maxZ - minZ);
            lines.push(`span: ${fmt(span, 2)}m · bounds x ${fmt(minX, 1)}→${fmt(maxX, 1)} z ${fmt(minZ, 1)}→${fmt(maxZ, 1)}`);
        }

        if (selected.length) {
            const shown = selected.slice(0, 6);
            const suffix = selected.length > shown.length ? ` +${selected.length - shown.length} more` : '';
            lines.push(`ids: ${shown.join(', ')}${suffix}`);
        }

        return lines.join('\n');
    })();

    const appendJunctionToolInfo = (info) => {
        if (!junctionToolText) return info;
        const base = info ?? { title: 'Info', text: '—' };
        const baseText = base?.text ?? '—';
        if (baseText === '—') return { title: 'Junction tool', text: junctionToolText };
        return { title: base?.title ?? 'Info', text: `${baseText}\n\nJunction tool:\n${junctionToolText}` };
    };

    const highlight = sel?.type
        ? {
            source: 'Selected',
            type: sel.type,
            roadId: sel.roadId ?? null,
            segmentId: sel.segmentId ?? null,
            pointId: sel.pointId ?? null,
            pieceId: sel.pieceId ?? null,
            junctionId: sel.junctionId ?? null,
            connectorId: sel.connectorId ?? null,
            approachId: sel.approachId ?? null
        }
        : hover?.connectorId
            ? { source: 'Hovered', type: 'connector', roadId: null, segmentId: null, pointId: null, pieceId: null, junctionId: hover.junctionId ?? null, connectorId: hover.connectorId ?? null }
            : hover?.approachId
                ? { source: 'Hovered', type: 'approach', roadId: null, segmentId: null, pointId: null, pieceId: null, junctionId: hover.junctionId ?? null, connectorId: null, approachId: hover.approachId ?? null }
            : hover?.junctionId
                ? { source: 'Hovered', type: 'junction', roadId: null, segmentId: null, pointId: null, pieceId: null, junctionId: hover.junctionId ?? null, connectorId: null, approachId: null }
                : hover?.pointId
                    ? { source: 'Hovered', type: 'point', roadId: hover.roadId ?? null, segmentId: null, pointId: hover.pointId ?? null, pieceId: null, junctionId: null, connectorId: null, approachId: null }
                : hover?.segmentId
                    ? { source: 'Hovered', type: 'segment', roadId: hover.roadId ?? null, segmentId: hover.segmentId ?? null, pointId: null, pieceId: null, junctionId: null, connectorId: null, approachId: null }
                    : hover?.roadId
                        ? { source: 'Hovered', type: 'road', roadId: hover.roadId ?? null, segmentId: null, pointId: null, pieceId: null, junctionId: null, connectorId: null, approachId: null }
                        : null;

    if (!highlight) return appendJunctionToolInfo({ title: 'Info', text: '—' });

    if (highlight.type === 'road') {
        const road = derived?.roads?.find?.((r) => r?.id === highlight.roadId) ?? null;
        if (!road) return appendJunctionToolInfo({ title: `${highlight.source}: Road`, text: `Road: ${highlight.roadId ?? '--'}` });
        const lanesF = Number(road.lanesF) || 0;
        const lanesB = Number(road.lanesB) || 0;
        const wR = lanesF * laneWidth + margin;
        const wL = lanesB * laneWidth + margin;
        const total = wL + wR;
        const segCount = derived?.segments?.filter?.((s) => s?.roadId === road.id)?.length ?? 0;
        const ptCount = road?.points?.length ?? 0;
        const schemaRoad = schemaRoadById(road.id);
        const visible = schemaRoad?.visible !== false;
        return appendJunctionToolInfo({
            title: `${highlight.source}: Road`,
            text: [
                `name: ${road.name}`,
                `id: ${road.id}`,
                `visible: ${visible ? 'yes' : 'no'}`,
                `lanesF/B: ${fmtInt(lanesF)} / ${fmtInt(lanesB)}`,
                `points: ${fmtInt(ptCount)}`,
                `segments: ${fmtInt(segCount)}`,
                `asphalt L/R: ${fmt(wL, 2)} / ${fmt(wR, 2)}`,
                `asphalt total: ${fmt(total, 2)}`
            ].join('\n')
        });
    }

    if (highlight.type === 'segment') {
        const seg = derived?.segments?.find?.((s) => s?.id === highlight.segmentId) ?? null;
        if (!seg) return appendJunctionToolInfo({ title: `${highlight.source}: Segment`, text: `Segment: ${highlight.segmentId ?? '--'}` });
        const wL = seg.asphaltObb?.halfWidthLeft ?? null;
        const wR = seg.asphaltObb?.halfWidthRight ?? null;
        const wTotal = (Number(wL) || 0) + (Number(wR) || 0);
        const removedCount = seg.trimRemoved?.length ?? 0;
        const keptCount = seg.keptPieces?.length ?? 0;
        const droppedCount = seg.droppedPieces?.length ?? 0;
        const trimEnabled = derived?.trim?.enabled !== false;
        const trimThreshold = derived?.trim?.threshold ?? null;
        const trimDebug = view.getTrimDebugOptions?.() ?? view._trimDebug ?? {};

        const lines = [
            `id: ${seg.id}`,
            `road: ${seg.roadId}`,
            `index: ${fmtInt(seg.index)}`,
            `a: ${fmt(seg.aWorld?.x, 2)}, ${fmt(seg.aWorld?.z, 2)} (${seg.aPointId})`,
            `b: ${fmt(seg.bWorld?.x, 2)}, ${fmt(seg.bWorld?.z, 2)} (${seg.bPointId})`,
            `dir: ${fmt(seg.dir?.x, 3)}, ${fmt(seg.dir?.z, 3)}`,
            `length: ${fmt(seg.length, 2)}`,
            `laneWidth: ${fmt(seg.laneWidth, 2)} · margin: ${fmt(seg.margin, 2)}`,
            `lanesF/B: ${fmtInt(seg.lanesF)} / ${fmtInt(seg.lanesB)}`,
            `asphalt L/R: ${fmt(wL, 2)} / ${fmt(wR, 2)} (total ${fmt(wTotal, 2)})`,
            `trim: removed ${fmtInt(removedCount)} · kept ${fmtInt(keptCount)} · dropped ${fmtInt(droppedCount)}`
        ];

        if (trimEnabled && Number.isFinite(trimThreshold)) {
            lines.push(`trim threshold: ${fmt(trimThreshold, 3)}`);
        }

        if (trimDebug.intervals && removedCount) {
            for (const it of seg.trimRemoved ?? []) {
                lines.push(`removed: t ${fmt(it.t0, 3)} → ${fmt(it.t1, 3)}`);
            }
        }

        if (trimDebug.overlaps) {
            const overlaps = derived?.trim?.overlaps ?? [];
            for (const ov of overlaps) {
                if (ov?.aSegmentId !== seg.id && ov?.bSegmentId !== seg.id) continue;
                const other = ov?.aSegmentId === seg.id ? ov?.bSegmentId : ov?.aSegmentId;
                const it = ov?.aSegmentId === seg.id ? ov?.aInterval : ov?.bInterval;
                if (it) lines.push(`overlap: ${other} · t ${fmt(it.t0, 3)} → ${fmt(it.t1, 3)}`);
            }
        }

        if (trimDebug.keptPieces && keptCount) {
            for (const piece of seg.keptPieces ?? []) {
                lines.push(`kept: ${piece.id} · t ${fmt(piece.t0, 3)} → ${fmt(piece.t1, 3)} · ${fmt(piece.length, 2)}m`);
            }
        }

        if (trimDebug.droppedPieces && droppedCount) {
            for (const piece of seg.droppedPieces ?? []) {
                lines.push(`dropped: ${piece.id} · t ${fmt(piece.t0, 3)} → ${fmt(piece.t1, 3)} · ${fmt(piece.length, 2)}m`);
            }
        }

        return appendJunctionToolInfo({ title: `${highlight.source}: Segment`, text: lines.join('\n') });
    }

    if (highlight.type === 'junction') {
        const junction = derived?.junctions?.find?.((j) => j?.id === highlight.junctionId) ?? null;
        if (!junction) return appendJunctionToolInfo({ title: `${highlight.source}: Junction`, text: `Junction: ${highlight.junctionId ?? '--'}` });
        const roads = Array.isArray(junction.roadIds) ? junction.roadIds : [];
        const endpoints = Array.isArray(junction.endpoints) ? junction.endpoints : [];
        const connectors = Array.isArray(junction.connectors) ? junction.connectors : [];
        const missing = Array.isArray(junction.missingCandidateIds) ? junction.missingCandidateIds : [];
        const source = junction.source ?? 'auto';
        const mergedCount = connectors.filter((c) => c?.mergedIntoRoad).length;
        const activeCount = connectors.length - mergedCount;
        const lines = [
            `id: ${junction.id}`,
            `source: ${source}`,
            `asphaltVisible: ${junction.asphaltVisible !== false ? 'yes' : 'no'}`,
            `roads: ${roads.length ? roads.join(', ') : '--'}`,
            `endpoints: ${fmtInt(endpoints.length)}`,
            `connectors: ${fmtInt(connectors.length)} (active ${fmtInt(activeCount)}, merged ${fmtInt(mergedCount)})`,
            `center: ${fmt(junction.center?.x, 2)}, ${fmt(junction.center?.z, 2)}`
        ];
        if (missing.length) lines.push(`missing: ${missing.join(', ')}`);

        for (const ep of endpoints) {
            const dx = Number(ep?.dirOut?.x) || 0;
            const dz = Number(ep?.dirOut?.z) || 0;
            const ang = (Math.atan2(dz, dx) * 180) / Math.PI;
            lines.push(`approach: ${ep.id} · road ${ep.roadId} · seg ${ep.segmentId} · piece ${ep.pieceId} · ${ep.end} · w ${fmt(ep.world?.x, 2)}, ${fmt(ep.world?.z, 2)} · ang ${fmt(ang, 1)}°`);
        }

        return appendJunctionToolInfo({ title: `${highlight.source}: Junction`, text: lines.join('\n') });
    }

    if (highlight.type === 'approach') {
        const junction = derived?.junctions?.find?.((j) => j?.id === highlight.junctionId) ?? null;
        const ep = junction?.endpoints?.find?.((e) => e?.id === highlight.approachId) ?? null;
        if (!junction || !ep) return appendJunctionToolInfo({ title: `${highlight.source}: Approach`, text: `Approach: ${highlight.approachId ?? '--'}` });
        const dx = Number(ep?.dirOut?.x) || 0;
        const dz = Number(ep?.dirOut?.z) || 0;
        const ang = (Math.atan2(dz, dx) * 180) / Math.PI;
        return appendJunctionToolInfo({
            title: `${highlight.source}: Approach`,
            text: [
                'Approach: a road piece endpoint participating in this junction.',
                `id: ${ep.id}`,
                `junction: ${junction.id}`,
                `road: ${ep.roadId ?? '--'}`,
                `segment: ${ep.segmentId ?? '--'} (${ep.end ?? '--'})`,
                `piece: ${ep.pieceId ?? '--'}`,
                `world: ${fmt(ep.world?.x, 2)}, ${fmt(ep.world?.z, 2)}`,
                `dirOut: ${fmt(ep.dirOut?.x, 3)}, ${fmt(ep.dirOut?.z, 3)} · ang ${fmt(ang, 1)}°`
            ].join('\n')
        });
    }

    if (highlight.type === 'connector') {
        const junctions = derived?.junctions ?? [];
        let junction = null;
        let conn = null;
        for (const j of junctions) {
            const hit = j?.connectors?.find?.((c) => c?.id === highlight.connectorId) ?? null;
            if (hit) {
                junction = j;
                conn = hit;
                break;
            }
        }
        if (!conn) return appendJunctionToolInfo({ title: `${highlight.source}: Connector`, text: `Connector: ${highlight.connectorId ?? '--'}` });
        const aEp = junction?.endpoints?.find?.((e) => e?.id === conn.aEndpointId) ?? null;
        const bEp = junction?.endpoints?.find?.((e) => e?.id === conn.bEndpointId) ?? null;
        const allowed = conn.allowAToB && conn.allowBToA
            ? 'A↔B'
            : conn.allowAToB
                ? 'A→B'
                : conn.allowBToA
                    ? 'A←B'
                    : 'none';
        const mergeAvailable = !!(conn.sameRoad && !conn.mergedIntoRoad);
        const lines = [
            'Movement: a connector edge between two approaches (topology). It does not create separate asphalt.',
            `id: ${conn.id}`,
            `junction: ${conn.junctionId ?? junction?.id ?? '--'}`,
            `roads: ${conn.aRoadId ?? '--'} ↔ ${conn.bRoadId ?? '--'}`,
            `segments: ${conn.aSegmentId ?? '--'} ↔ ${conn.bSegmentId ?? '--'}`,
            `distance: ${fmt(conn.distance, 2)}`,
            `sameRoad: ${conn.sameRoad ? 'yes' : 'no'}`,
            `movement: ${allowed}`,
            `mergedIntoRoad: ${conn.mergedIntoRoad ? 'yes' : 'no'}`
        ];
        if (mergeAvailable) {
            lines.push('merge: available (Merge into road)');
            lines.push('mergeEffect: hides this movement and treats continuity as part of the road (asphalt mesh is unchanged).');
        }
        if (aEp && bEp) {
            const dx = (Number(bEp.world?.x) || 0) - (Number(aEp.world?.x) || 0);
            const dz = (Number(bEp.world?.z) || 0) - (Number(aEp.world?.z) || 0);
            const bearing = (Math.atan2(dz, dx) * 180) / Math.PI;
            lines.push(`a: ${aEp.id} · ${fmt(aEp.world?.x, 2)}, ${fmt(aEp.world?.z, 2)}`);
            lines.push(`b: ${bEp.id} · ${fmt(bEp.world?.x, 2)}, ${fmt(bEp.world?.z, 2)}`);
            lines.push(`bearing: ${fmt(bearing, 1)}°`);
        }
        return appendJunctionToolInfo({ title: `${highlight.source}: Movement`, text: lines.join('\n') });
    }

    if (highlight.type === 'piece') {
        const seg = derived?.segments?.find?.((s) => s?.id === highlight.segmentId) ?? null;
        if (!seg) return appendJunctionToolInfo({ title: `${highlight.source}: Piece`, text: `Piece: ${highlight.pieceId ?? '--'}` });
        const piece = seg.keptPieces?.find?.((p) => p?.id === highlight.pieceId) ?? null;
        if (!piece) return appendJunctionToolInfo({ title: `${highlight.source}: Piece`, text: `Piece: ${highlight.pieceId ?? '--'}` });
        return appendJunctionToolInfo({
            title: `${highlight.source}: Piece`,
            text: [
                `id: ${piece.id}`,
                `segment: ${seg.id}`,
                `road: ${seg.roadId}`,
                `t: ${fmt(piece.t0, 3)} → ${fmt(piece.t1, 3)}`,
                `length: ${fmt(piece.length, 2)}`
            ].join('\n')
        });
    }

    if (highlight.type === 'point') {
        const road = derived?.roads?.find?.((r) => r?.id === highlight.roadId) ?? null;
        const pt = road?.points?.find?.((p) => p?.id === highlight.pointId) ?? null;
        if (!pt) return appendJunctionToolInfo({ title: `${highlight.source}: Point`, text: `Point: ${highlight.pointId ?? '--'}` });
        const w = pt?.world ?? null;
        const tileSize = Number(derived?.settings?.tileSize) || Number(view?._tileSize) || 24;
        const offsetU = Number(pt.offsetU) || 0;
        const offsetV = Number(pt.offsetV) || 0;
        return appendJunctionToolInfo({
            title: `${highlight.source}: Point`,
            text: [
                `id: ${pt.id}`,
                `road: ${road?.id ?? highlight.roadId ?? '--'}`,
                `tile: ${fmtInt(pt.tileX)}, ${fmtInt(pt.tileY)}`,
                `offsetUV: ${fmt(offsetU, 3)}, ${fmt(offsetV, 3)}`,
                `offsetM: ${fmt(offsetU * tileSize, 2)}, ${fmt(offsetV * tileSize, 2)}`,
                `world: ${fmt(w?.x, 2)}, ${fmt(w?.z, 2)}`,
                `tangentFactor: ${fmt(pt.tangentFactor, 2)}`
            ].join('\n')
        });
    }

    return appendJunctionToolInfo({ title: `${highlight.source}`, text: '—' });
}

export function setupUI(view) {
    if (view.ui?.root) return;

    const root = document.createElement('div');
    root.className = 'road-debugger-ui';

    const left = document.createElement('div');
    left.className = 'road-debugger-panel road-debugger-panel-left';

    const header = document.createElement('div');
    header.className = 'road-debugger-header';

    const title = document.createElement('div');
    title.className = 'road-debugger-title';
    title.textContent = 'Road Debugger';
    header.appendChild(title);

    const helpBtn = makeButton('Help');
    helpBtn.classList.add('road-debugger-help-btn');
    helpBtn.title = 'Open the Road Debugger help panel.';
    header.appendChild(helpBtn);

    left.appendChild(header);

    const vizSection = document.createElement('div');
    vizSection.className = 'road-debugger-section';

    const vizTitle = document.createElement('div');
    vizTitle.className = 'road-debugger-section-title';
    vizTitle.textContent = 'Visualize';
    vizSection.appendChild(vizTitle);

    const viz = document.createElement('div');
    viz.className = 'road-debugger-viz';
    vizSection.appendChild(viz);

    const vizTabs = document.createElement('div');
    vizTabs.className = 'road-debugger-viz-tabs';
    viz.appendChild(vizTabs);

    const vizBody = document.createElement('div');
    vizBody.className = 'road-debugger-viz-body';
    viz.appendChild(vizBody);

    const vizTabRoads = makeButton('R');
    vizTabRoads.classList.add('road-debugger-viz-tab');
    vizTabRoads.title = 'Road overlays';
    vizTabs.appendChild(vizTabRoads);

    const vizTabJunctions = makeButton('J');
    vizTabJunctions.classList.add('road-debugger-viz-tab');
    vizTabJunctions.title = 'Junction overlays';
    vizTabs.appendChild(vizTabJunctions);

    const vizTabSegments = makeButton('S');
    vizTabSegments.classList.add('road-debugger-viz-tab');
    vizTabSegments.title = 'Segment + trim debug overlays';
    vizTabs.appendChild(vizTabSegments);

    const vizTabGrid = makeButton('▦');
    vizTabGrid.classList.add('road-debugger-viz-tab');
    vizTabGrid.title = 'Grid overlay';
    vizTabs.appendChild(vizTabGrid);

    let vizMode = 'roads';

    const makeVizSubhead = (text) => {
        const el = document.createElement('div');
        el.className = 'road-debugger-viz-subhead';
        el.textContent = text;
        return el;
    };

    const makeVizPanel = (mode) => {
        const panel = document.createElement('div');
        panel.className = 'road-debugger-viz-panel';
        panel.dataset.viz = mode;
        vizBody.appendChild(panel);
        return panel;
    };

    const roadsPanel = makeVizPanel('roads');
    const junctionsVizPanel = makeVizPanel('junctions');
    const segmentsPanel = makeVizPanel('segments');
    const gridPanel = makeVizPanel('grid');

    const gridRow = makeToggleRow('Grid');
    gridRow.row.title = 'Show the world tile grid (visual reference for snapping and offsets).';

    const asphaltRow = makeToggleRow('Asphalt');
    asphaltRow.row.title = 'Render the asphalt surface polygons (uses trimmed kept pieces).';
    const markingsRow = makeToggleRow('Markings');
    markingsRow.row.title = 'Render lane markings and direction arrows along kept asphalt pieces.';
    const arrowTangentRow = makeToggleRow('Arrow tangents');
    arrowTangentRow.row.title = 'Render short tangent lines at lane arrow centers to validate orientation.';
    const dividerRow = makeToggleRow('Divider');
    dividerRow.row.title = 'Show the road divider centerline (reference line).';
    const dirCenterRow = makeToggleRow('Direction lines');
    dirCenterRow.row.title = 'Show per-direction lane centerlines (direction preview).';
    const edgesRow = makeToggleRow('Edges');
    edgesRow.row.title = 'Show lane edges and asphalt edges derived from lane counts + margin.';
    const pointsRow = makeToggleRow('Points');
    pointsRow.row.title = 'Show road control points (handles). Hover and selection can temporarily override this.';

    const junctionEnabledRow = makeToggleRow('Junctions');
    junctionEnabledRow.row.title = 'Show junction overlay visuals. Junctions still compute for selection/editing.';
    const junctionEndpointsRow = makeToggleRow('Endpoints');
    junctionEndpointsRow.row.title = 'Show junction endpoint markers (centerline endpoints of kept pieces).';
    const junctionBoundaryRow = makeToggleRow('Boundary');
    junctionBoundaryRow.row.title = 'Show the stitched junction boundary polyline.';
    const junctionConnectorsRow = makeToggleRow('Connectors');
    junctionConnectorsRow.row.title = 'Show connector edge lines for each junction (movement graph preview).';
    const junctionEdgeOrderRow = makeToggleRow('Edge order');
    junctionEdgeOrderRow.row.title = 'Show the endpoint ordering used to stitch the junction boundary.';

    const roadsLogical = document.createElement('div');
    roadsLogical.className = 'road-debugger-viz-group';
    roadsLogical.appendChild(makeVizSubhead('Logical'));
    const roadsLogicalGrid = document.createElement('div');
    roadsLogicalGrid.className = 'road-debugger-toggle-grid';
    roadsLogicalGrid.appendChild(asphaltRow.row);
    roadsLogicalGrid.appendChild(markingsRow.row);
    roadsLogical.appendChild(roadsLogicalGrid);
    roadsPanel.appendChild(roadsLogical);

    const roadsGeometry = document.createElement('div');
    roadsGeometry.className = 'road-debugger-viz-group';
    roadsGeometry.appendChild(makeVizSubhead('Geometry'));
    const roadsGeomGrid = document.createElement('div');
    roadsGeomGrid.className = 'road-debugger-toggle-grid';
    roadsGeomGrid.appendChild(dividerRow.row);
    roadsGeomGrid.appendChild(dirCenterRow.row);
    roadsGeomGrid.appendChild(edgesRow.row);
    roadsGeomGrid.appendChild(pointsRow.row);
    roadsGeomGrid.appendChild(arrowTangentRow.row);
    roadsGeometry.appendChild(roadsGeomGrid);
    roadsPanel.appendChild(roadsGeometry);

    const junctionLogical = document.createElement('div');
    junctionLogical.className = 'road-debugger-viz-group';
    junctionLogical.appendChild(makeVizSubhead('Logical'));
    const junctionLogicalGrid = document.createElement('div');
    junctionLogicalGrid.className = 'road-debugger-toggle-grid';
    junctionLogicalGrid.appendChild(junctionEnabledRow.row);
    junctionLogical.appendChild(junctionLogicalGrid);
    junctionsVizPanel.appendChild(junctionLogical);

    const junctionGeometry = document.createElement('div');
    junctionGeometry.className = 'road-debugger-viz-group';
    junctionGeometry.appendChild(makeVizSubhead('Geometry'));
    const junctionGeomGrid = document.createElement('div');
    junctionGeomGrid.className = 'road-debugger-toggle-grid';
    junctionGeomGrid.appendChild(junctionEndpointsRow.row);
    junctionGeomGrid.appendChild(junctionBoundaryRow.row);
    junctionGeomGrid.appendChild(junctionConnectorsRow.row);
    junctionGeomGrid.appendChild(junctionEdgeOrderRow.row);
    junctionGeometry.appendChild(junctionGeomGrid);
    junctionsVizPanel.appendChild(junctionGeometry);

    const trimTitle = document.createElement('div');
    trimTitle.className = 'road-debugger-viz-subhead';
    trimTitle.textContent = 'Trim debug';
    segmentsPanel.appendChild(trimTitle);

    const trimThresholdRow = document.createElement('div');
    trimThresholdRow.className = 'road-debugger-tangent';
    trimThresholdRow.title = 'Crossing threshold for near-overlaps (as a fraction of laneWidth). Higher values treat close strips as overlapping.';
    const trimThresholdLabel = document.createElement('div');
    trimThresholdLabel.className = 'road-debugger-tangent-label';
    trimThresholdLabel.textContent = 'threshold × laneWidth';
    const trimThresholdInputs = document.createElement('div');
    trimThresholdInputs.className = 'road-debugger-tangent-inputs';
    const trimThresholdRange = document.createElement('input');
    trimThresholdRange.type = 'range';
    trimThresholdRange.min = '0';
    trimThresholdRange.max = '5';
    trimThresholdRange.step = '0.01';
    trimThresholdRange.className = 'road-debugger-tangent-range';
    const trimThresholdNumber = document.createElement('input');
    trimThresholdNumber.type = 'number';
    trimThresholdNumber.min = '0';
    trimThresholdNumber.max = '5';
    trimThresholdNumber.step = '0.01';
    trimThresholdNumber.className = 'road-debugger-tangent-number';
    trimThresholdInputs.appendChild(trimThresholdRange);
    trimThresholdInputs.appendChild(trimThresholdNumber);
    trimThresholdRow.appendChild(trimThresholdLabel);
    trimThresholdRow.appendChild(trimThresholdInputs);

    const trimToggles = document.createElement('div');
    trimToggles.className = 'road-debugger-toggle-grid';
    segmentsPanel.appendChild(trimToggles);

    const trimRawRow = makeToggleRow('Raw segments');
    trimRawRow.row.title = 'Visualize the untrimmed asphalt OBB per segment.';
    trimToggles.appendChild(trimRawRow.row);
    const trimStripsRow = makeToggleRow('Strips');
    trimStripsRow.row.title = 'Visualize expanded strips used for near-overlap detection.';
    trimToggles.appendChild(trimStripsRow.row);
    const trimOverlapsRow = makeToggleRow('Overlaps');
    trimOverlapsRow.row.title = 'Visualize overlap polygons computed by convex clipping.';
    trimToggles.appendChild(trimOverlapsRow.row);
    const trimIntervalsRow = makeToggleRow('Intervals');
    trimIntervalsRow.row.title = 'Show removed [t0,t1] intervals along each segment centerline.';
    trimToggles.appendChild(trimIntervalsRow.row);
    const trimRemovedRow = makeToggleRow('Removed pieces');
    trimRemovedRow.row.title = 'Visualize the removed intervals as asphalt polygons (the cut-out pieces).';
    trimToggles.appendChild(trimRemovedRow.row);
    const trimKeptRow = makeToggleRow('Kept pieces');
    trimKeptRow.row.title = 'Visualize kept pieces after trimming/splitting.';
    trimToggles.appendChild(trimKeptRow.row);
    const trimDroppedRow = makeToggleRow('Dropped pieces');
    trimDroppedRow.row.title = 'Visualize dropped tiny pieces (kept pieces shorter than snap step tileSize/10). For cut-out pieces, use Removed pieces.';
    trimToggles.appendChild(trimDroppedRow.row);
    const trimHighlightRow = makeToggleRow('Highlight');
    trimHighlightRow.row.title = 'Show AABB/OBB bounds and selected kept piece outline.';
    trimToggles.appendChild(trimHighlightRow.row);

    const settingsSection = document.createElement('div');
    settingsSection.className = 'road-debugger-section';
    const settingsTitle = document.createElement('div');
    settingsTitle.className = 'road-debugger-section-title';
    settingsTitle.textContent = 'Settings';
    settingsSection.appendChild(settingsTitle);

    const settingsGrid = document.createElement('div');
    settingsGrid.className = 'road-debugger-toggle-grid';
    settingsSection.appendChild(settingsGrid);

    const snapRow = makeToggleRow('Snap');
    snapRow.row.title = 'Snap point movement/placement to tile/10 grid. Hold Alt to temporarily disable. Hold Shift to axis-lock.';
    settingsGrid.appendChild(snapRow.row);

    const pickDebugRow = makeToggleRow('Pick debug');
    pickDebugRow.row.title = 'Show picking debug overlay (hover type + id).';
    settingsGrid.appendChild(pickDebugRow.row);
    settingsSection.appendChild(trimThresholdRow);

    gridPanel.appendChild(gridRow.row);

    left.appendChild(vizSection);
    left.appendChild(settingsSection);

    const editSection = document.createElement('div');
    editSection.className = 'road-debugger-section';
    const editTitle = document.createElement('div');
    editTitle.className = 'road-debugger-section-title';
    editTitle.textContent = 'Edit';
    editSection.appendChild(editTitle);

    const editButtons = document.createElement('div');
    editButtons.className = 'road-debugger-edit-buttons';
    const undoBtn = makeButton('Undo');
    undoBtn.title = 'Undo last edit (point move, lane change, road creation).';
    const redoBtn = makeButton('Redo');
    redoBtn.title = 'Redo last undone edit.';
    const exportBtn = makeButton('Export');
    exportBtn.title = 'Export current roads schema as JSON (includes draft).';
    const importBtn = makeButton('Import');
    importBtn.title = 'Import schema JSON (replaces current roads).';
    editButtons.appendChild(undoBtn);
    editButtons.appendChild(redoBtn);
    editButtons.appendChild(exportBtn);
    editButtons.appendChild(importBtn);
    editSection.appendChild(editButtons);
    left.appendChild(editSection);

    const warningsSection = document.createElement('div');
    warningsSection.className = 'road-debugger-section';
    const warningsTitle = document.createElement('div');
    warningsTitle.className = 'road-debugger-section-title';
    warningsTitle.textContent = 'Warnings';
    warningsSection.appendChild(warningsTitle);

    const warningsToolbar = document.createElement('div');
    warningsToolbar.className = 'road-debugger-warnings-toolbar';
    warningsSection.appendChild(warningsToolbar);

    const warningsSeverity = document.createElement('div');
    warningsSeverity.className = 'road-debugger-warnings-severity';
    warningsToolbar.appendChild(warningsSeverity);

    const warningsFilter = {
        info: true,
        warning: true,
        error: true
    };

    const filterInfoBtn = makeButton('Info');
    filterInfoBtn.classList.add('road-debugger-warnings-filter');
    filterInfoBtn.title = 'Toggle informational issues.';
    warningsSeverity.appendChild(filterInfoBtn);

    const filterWarningBtn = makeButton('Warn');
    filterWarningBtn.classList.add('road-debugger-warnings-filter');
    filterWarningBtn.title = 'Toggle warning issues.';
    warningsSeverity.appendChild(filterWarningBtn);

    const filterErrorBtn = makeButton('Error');
    filterErrorBtn.classList.add('road-debugger-warnings-filter');
    filterErrorBtn.title = 'Toggle error issues.';
    warningsSeverity.appendChild(filterErrorBtn);

    const selectionOnlyRow = makeToggleRow('Selection only');
    selectionOnlyRow.row.classList.add('road-debugger-warnings-selection');
    selectionOnlyRow.row.title = 'Show only issues that reference the current selection.';
    warningsToolbar.appendChild(selectionOnlyRow.row);

    const warningsList = document.createElement('div');
    warningsList.className = 'road-debugger-warnings-list';
    warningsSection.appendChild(warningsList);
    left.appendChild(warningsSection);

    const roadsSection = document.createElement('div');
    roadsSection.className = 'road-debugger-section';
    const roadsTitle = document.createElement('div');
    roadsTitle.className = 'road-debugger-section-title';
    roadsTitle.textContent = 'Roads';
    roadsSection.appendChild(roadsTitle);
    const roadsList = document.createElement('div');
    roadsList.className = 'road-debugger-roads-list';
    roadsSection.appendChild(roadsList);
    left.appendChild(roadsSection);

    const junctionsSection = document.createElement('div');
    junctionsSection.className = 'road-debugger-section';
    const junctionsTitle = document.createElement('div');
    junctionsTitle.className = 'road-debugger-section-title';
    junctionsTitle.textContent = 'Junctions';
    junctionsSection.appendChild(junctionsTitle);

    const junctionsList = document.createElement('div');
    junctionsList.className = 'road-debugger-junctions-list';
    junctionsSection.appendChild(junctionsList);

    left.appendChild(junctionsSection);

    const pointSection = document.createElement('div');
    pointSection.className = 'road-debugger-section';
    pointSection.style.display = 'none';
    const pointTitle = document.createElement('div');
    pointTitle.className = 'road-debugger-section-title';
    pointTitle.textContent = 'Point';
    pointSection.appendChild(pointTitle);

    const tangentRow = document.createElement('div');
    tangentRow.className = 'road-debugger-tangent';
    tangentRow.title = 'Tangent factor (future): intended to scale Turn-Angle-To-Tangent radius/curvature behavior.';
    const tangentLabel = document.createElement('div');
    tangentLabel.className = 'road-debugger-tangent-label';
    tangentLabel.textContent = 'tangentFactor';
    const tangentInputs = document.createElement('div');
    tangentInputs.className = 'road-debugger-tangent-inputs';
    const tangentRange = document.createElement('input');
    tangentRange.type = 'range';
    tangentRange.min = '0';
    tangentRange.max = '5';
    tangentRange.step = '0.05';
    tangentRange.className = 'road-debugger-tangent-range';
    const tangentNumber = document.createElement('input');
    tangentNumber.type = 'number';
    tangentNumber.min = '0';
    tangentNumber.max = '5';
    tangentNumber.step = '0.05';
    tangentNumber.className = 'road-debugger-tangent-number';
    tangentInputs.appendChild(tangentRange);
    tangentInputs.appendChild(tangentNumber);
    tangentRow.appendChild(tangentLabel);
    tangentRow.appendChild(tangentInputs);
    pointSection.appendChild(tangentRow);

    const controlsHint = document.createElement('div');
    controlsHint.className = 'road-debugger-hint';
    controlsHint.textContent = 'Click: select / add points · Drag: pan / move points · Junctions: drag box selects candidates (Shift adds) · Wheel/A/Z: zoom · Shift: axis lock · Alt: snap off · Esc: exit';
    left.appendChild(controlsHint);

    const selectionRect = document.createElement('div');
    selectionRect.className = 'road-debugger-selection-rect';
    selectionRect.style.display = 'none';
    root.appendChild(selectionRect);

    const pickDebugOverlay = document.createElement('div');
    pickDebugOverlay.className = 'road-debugger-pick-debug';
    pickDebugOverlay.style.display = 'none';
    pickDebugOverlay.textContent = '';
    root.appendChild(pickDebugOverlay);

    const detailPanel = document.createElement('div');
    detailPanel.className = 'road-debugger-panel road-debugger-detail-panel';

    const detailHeader = document.createElement('div');
    detailHeader.className = 'road-debugger-detail-header';
    const detailTitle = document.createElement('div');
    detailTitle.className = 'road-debugger-detail-title';
    detailTitle.textContent = 'Detail';
    detailHeader.appendChild(detailTitle);
    detailPanel.appendChild(detailHeader);

    const detailBody = document.createElement('div');
    detailBody.className = 'road-debugger-detail-body';
    detailBody.textContent = '—';
    detailPanel.appendChild(detailBody);

    const bottom = document.createElement('div');
    bottom.className = 'road-debugger-panel road-debugger-editor';

    const popupTabs = document.createElement('div');
    popupTabs.className = 'road-debugger-editor-tabs';
    const popupTabEdit = makeButton('Edit');
    popupTabEdit.classList.add('road-debugger-editor-tab');
    popupTabEdit.title = 'Edit the current selection.';
    const popupTabRoads = makeButton('Roads');
    popupTabRoads.classList.add('road-debugger-editor-tab');
    popupTabRoads.title = 'Road drafting workflow.';
    const popupTabJunctions = makeButton('Junctions');
    popupTabJunctions.classList.add('road-debugger-editor-tab');
    popupTabJunctions.title = 'Junction creation workflow.';
    popupTabs.appendChild(popupTabEdit);
    popupTabs.appendChild(popupTabRoads);
    popupTabs.appendChild(popupTabJunctions);
    bottom.appendChild(popupTabs);

    const popupTitle = document.createElement('div');
    popupTitle.className = 'road-debugger-editor-title';
    popupTitle.textContent = 'Edit';
    bottom.appendChild(popupTitle);

    const popupBody = document.createElement('div');
    popupBody.className = 'road-debugger-editor-body';
    const popupContent = document.createElement('div');
    popupContent.className = 'road-debugger-editor-content';
    popupBody.appendChild(popupContent);
    popupBody.appendChild(pointSection);
    bottom.appendChild(popupBody);

    const popupCandidates = document.createElement('div');
    popupCandidates.className = 'road-debugger-editor-candidates';
    popupCandidates.style.display = 'none';
    bottom.appendChild(popupCandidates);

    const actions = document.createElement('div');
    actions.className = 'road-debugger-editor-actions';
    const newRoad = makeButton('New Road');
    newRoad.title = 'Start drafting a new road (click tiles to add points).';
    const done = makeButton('Done');
    done.title = 'Finish the current draft.';
    const cancel = makeButton('Cancel');
    cancel.title = 'Cancel the current draft.';
    actions.appendChild(newRoad);
    actions.appendChild(cancel);
    actions.appendChild(done);
    bottom.appendChild(actions);

    const infoPanel = document.createElement('div');
    infoPanel.className = 'road-debugger-panel road-debugger-info-panel';

    const infoHeader = document.createElement('div');
    infoHeader.className = 'road-debugger-info-header';

    const infoTitle = document.createElement('div');
    infoTitle.className = 'road-debugger-info-title';
    infoTitle.textContent = 'Info';
    infoHeader.appendChild(infoTitle);
    infoPanel.appendChild(infoHeader);

    const infoBody = document.createElement('div');
    infoBody.className = 'road-debugger-info-body';
    infoBody.textContent = '—';
    infoPanel.appendChild(infoBody);

    const orbitPanel = document.createElement('div');
    orbitPanel.className = 'road-debugger-panel road-debugger-orbit-panel';

    const orbitHeader = document.createElement('div');
    orbitHeader.className = 'road-debugger-orbit-header';

    const orbitTitle = document.createElement('div');
    orbitTitle.className = 'road-debugger-orbit-title';
    orbitTitle.textContent = 'Orbit';
    orbitHeader.appendChild(orbitTitle);

    const orbitReset = makeButton('Reset');
    orbitReset.classList.add('road-debugger-orbit-reset');
    orbitReset.title = 'Reset orbit yaw/pitch to the default top-down orientation.';
    orbitHeader.appendChild(orbitReset);

    orbitPanel.appendChild(orbitHeader);

    const orbitSurface = document.createElement('div');
    orbitSurface.className = 'road-debugger-orbit-surface';
    orbitSurface.title = 'Drag to orbit the camera around the current focus point.';
    orbitPanel.appendChild(orbitSurface);

    const bottomRight = document.createElement('div');
    bottomRight.className = 'road-debugger-bottom-right';
    bottomRight.appendChild(orbitPanel);
    bottomRight.appendChild(infoPanel);

    root.appendChild(left);
    root.appendChild(bottom);
    root.appendChild(detailPanel);
    root.appendChild(bottomRight);

    const schemaModal = document.createElement('div');
    schemaModal.className = 'road-debugger-schema-modal';
    schemaModal.style.display = 'none';
    const schemaPanel = document.createElement('div');
    schemaPanel.className = 'road-debugger-panel road-debugger-schema-panel';
    const schemaTitle = document.createElement('div');
    schemaTitle.className = 'road-debugger-schema-title';
    schemaTitle.textContent = 'Schema JSON';
    const schemaMsg = document.createElement('div');
    schemaMsg.className = 'road-debugger-schema-msg';
    const schemaTextarea = document.createElement('textarea');
    schemaTextarea.className = 'road-debugger-schema-textarea';
    schemaTextarea.spellcheck = false;
    schemaTextarea.wrap = 'off';
    const schemaActions = document.createElement('div');
    schemaActions.className = 'road-debugger-schema-actions';
    const schemaClose = makeButton('Close');
    const schemaApply = makeButton('Apply');
    schemaActions.appendChild(schemaClose);
    schemaActions.appendChild(schemaApply);
    schemaPanel.appendChild(schemaTitle);
    schemaPanel.appendChild(schemaMsg);
    schemaPanel.appendChild(schemaTextarea);
    schemaPanel.appendChild(schemaActions);
    schemaModal.appendChild(schemaPanel);
    root.appendChild(schemaModal);

    const exitModal = document.createElement('div');
    exitModal.className = 'road-debugger-exit-modal';
    exitModal.style.display = 'none';

    const exitPanel = document.createElement('div');
    exitPanel.className = 'road-debugger-panel road-debugger-exit-panel';
    const exitTitle = document.createElement('div');
    exitTitle.className = 'road-debugger-exit-title';
    exitTitle.textContent = 'Exit';
    const exitBody = document.createElement('div');
    exitBody.className = 'road-debugger-exit-body';
    exitBody.textContent = 'Do you want to exit?';
    const exitActions = document.createElement('div');
    exitActions.className = 'road-debugger-exit-actions';
    const exitCancel = makeButton('Cancel');
    const exitConfirm = makeButton('Exit');
    exitActions.appendChild(exitCancel);
    exitActions.appendChild(exitConfirm);
    exitPanel.appendChild(exitTitle);
    exitPanel.appendChild(exitBody);
    exitPanel.appendChild(exitActions);
    exitModal.appendChild(exitPanel);
    root.appendChild(exitModal);

    const helpModal = document.createElement('div');
    helpModal.className = 'road-debugger-help-modal';
    helpModal.style.display = 'none';

    const helpPanel = document.createElement('div');
    helpPanel.className = 'road-debugger-panel road-debugger-help-panel';

    const helpTitle = document.createElement('div');
    helpTitle.className = 'road-debugger-help-title';
    helpTitle.textContent = 'Road Debugger Help';

    const helpClose = makeButton('Close');
    helpClose.classList.add('road-debugger-help-close');

    const helpHeader = document.createElement('div');
    helpHeader.className = 'road-debugger-help-header';
    helpHeader.appendChild(helpTitle);
    helpHeader.appendChild(helpClose);

    const helpBody = document.createElement('div');
    helpBody.className = 'road-debugger-help-body';

    const addHelpSection = (titleText, lines) => {
        const sec = document.createElement('div');
        sec.className = 'road-debugger-help-section';
        const h = document.createElement('div');
        h.className = 'road-debugger-help-section-title';
        h.textContent = titleText;
        sec.appendChild(h);
        const text = document.createElement('div');
        text.className = 'road-debugger-help-text';
        text.textContent = Array.isArray(lines) ? lines.join('\n') : String(lines ?? '');
        sec.appendChild(text);
        helpBody.appendChild(sec);
    };

    addHelpSection('Lane model', [
        'Each road has lanesF and lanesB (forward/back) relative to the segment direction (A → B).',
        'Set lanesB to 0 to author one-way roads (forward-only).',
        'Right-hand driving: forward lanes are offset to the right side of the divider centerline, backward lanes to the left.',
        'The divider centerline is the road reference line; lane offsets are multiples of laneWidth.'
    ]);

    addHelpSection('Width derivation', [
        'Asphalt half-widths are derived from lane counts:',
        '- Right side: lanesF × laneWidth + 10% margin.',
        '- Left side: lanesB × laneWidth + 10% margin.',
        'This makes asphalt slightly wider than the lanes for visual/physics clearance.'
    ]);

    addHelpSection('Direction centerlines', [
        'If lanesF > 0, a forward direction centerline is rendered inside the forward lanes.',
        'If lanesB > 0, a backward direction centerline is rendered inside the backward lanes.',
        'These are separate from the divider centerline and help debug lane orientation.'
    ]);

    addHelpSection('Tangent factor', [
        'Each point stores tangentFactor (0..5).',
        'It is intended to scale future turn / smoothing behavior (e.g., TAT radius).',
        'Changing it does not currently alter trimming; it is stored so later pipeline steps can use it.'
    ]);

    addHelpSection('Snapping and axis-lock', [
        'Snap places/moves points on a tile/10 grid (tileSize / 10).',
        'Hold Alt while dragging to temporarily disable snap.',
        'Hold Shift to lock movement to X or Z (axis-lock).'
    ]);

    addHelpSection('Crossing threshold (near overlap)', [
        'Trimming detects overlaps between oriented asphalt strips (OBB rectangles).',
        'A threshold expands strips so "near overlaps" count as crossings.',
        'Default threshold is 0.1 × laneWidth.'
    ]);

    addHelpSection('AABB vs OBB', [
        'AABB (axis-aligned bounding box) is used as a fast broad-phase reject test.',
        'OBB (oriented bounding box) matches the road direction and is tested in narrow-phase.'
    ]);

    addHelpSection('SAT for OBB overlap', [
        'SAT (Separating Axis Theorem) tests whether two convex polygons overlap.',
        'If any axis separates the projected intervals, the polygons do not overlap.',
        'For rectangles, the axes come from each rectangle’s edge normals.'
    ]);

    addHelpSection('Overlap polygons (convex clipping)', [
        'When strips overlap, the overlap polygon is computed by convex clipping.',
        'The pipeline uses Sutherland–Hodgman clipping to intersect two convex polygons.'
    ]);

    addHelpSection('Removed intervals and splitting', [
        'Each overlap polygon is projected onto each segment axis to get [t0,t1] on [0..1].',
        'A symmetric trim interval is built around an anchor tCross.',
        'All removed intervals are unioned per segment; the complement produces kept pieces.',
        'Kept pieces shorter than the snap step (tileSize/10) are dropped (tracked for debugging).',
        'If no kept piece is shorter than snap step, dropped count stays 0 and the Dropped pieces toggle shows nothing.'
    ]);

    addHelpSection('Pipeline debug toggles', [
        'Raw segments: pre-trim asphalt OBB.',
        'Strips: expanded strips used for near-overlap.',
        'Overlaps: clipped overlap polygons.',
        'Intervals: removed [t0,t1] along the centerline.',
        'Removed pieces: visualize the removed intervals as asphalt polygons (cut-out pieces).',
        'Kept/Dropped pieces: post-split results (dropped are not asphalt).',
        'Highlight: show AABB/OBB + selected piece outline.'
    ]);

    addHelpSection('Junctions and junction creation', [
        'A junction represents one physical intersection/corner region (one node), not multiple pairwise junctions.',
        'Its asphalt is rendered as one merged surface patch that fills the gap where incoming road pieces stop.',
        'An approach is a road piece endpoint that participates in the junction (connected road piece).',
        'Movements (connector edges) are topology/turn options between approaches; they do not create separate asphalt patches.',
        'Same-road movements can be merged into the parent road to treat them as road continuity (use Undo to revert).',
        'Use the Junctions tab in the bottom workflow panel: New junction → select endpoints/corners (drag a red rectangle to multi-select) → Done to create.',
        'Esc clears the selection; Cancel exits junction creation mode.',
        'Use Hide/Show on a junction row to toggle its asphalt surface; use Delete/Suppress to remove it.'
    ]);

    helpPanel.appendChild(helpHeader);
    helpPanel.appendChild(helpBody);
    helpModal.appendChild(helpPanel);
    root.appendChild(helpModal);
    document.body.appendChild(root);

    let popupMode = 'edit';
    let pendingRoadLanesF = 1;
    let pendingRoadLanesB = 1;

    const setVizMode = (nextMode) => {
        const next = nextMode === 'junctions'
            ? 'junctions'
            : nextMode === 'segments'
                ? 'segments'
                : nextMode === 'grid'
                    ? 'grid'
                    : 'roads';
        if (next === vizMode) return;
        vizMode = next;
        sync();
    };

    const onVizTabRoads = (e) => {
        e.preventDefault?.();
        setVizMode('roads');
    };
    const onVizTabJunctions = (e) => {
        e.preventDefault?.();
        setVizMode('junctions');
    };
    const onVizTabSegments = (e) => {
        e.preventDefault?.();
        setVizMode('segments');
    };
    const onVizTabGrid = (e) => {
        e.preventDefault?.();
        setVizMode('grid');
    };

    const finalizePopupMode = (mode) => {
        if (mode === 'roads') {
            const draft = view.getDraftRoad?.() ?? view._draft ?? null;
            if (!draft) return;
            view.finishRoadDraft();
            const stillDraft = view.getDraftRoad?.() ?? view._draft ?? null;
            if (stillDraft) view.cancelRoadDraft();
            return;
        }

        if (mode === 'junctions') {
            const enabled = view.getJunctionToolEnabled?.() ?? view._junctionToolEnabled === true;
            if (!enabled) return;
            view.createJunctionFromToolSelection?.();
            view.setJunctionToolEnabled?.(false);
        }
    };

    const setPopupMode = (nextMode) => {
        const next = nextMode === 'roads'
            ? 'roads'
            : nextMode === 'junctions'
                ? 'junctions'
                : 'edit';
        if (next === popupMode) return;
        finalizePopupMode(popupMode);
        popupMode = next;
        sync();
    };

    const onGridChange = () => view.setGridEnabled(gridRow.input.checked);
    const onAsphaltChange = () => view.setRenderOptions({ asphalt: asphaltRow.input.checked });
    const onMarkingsChange = () => view.setRenderOptions({ markings: markingsRow.input.checked });
    const onArrowTangentChange = () => view.setArrowTangentDebugEnabled?.(arrowTangentRow.input.checked);
    const onDividerChange = () => view.setRenderOptions({ centerline: dividerRow.input.checked });
    const onDirCenterChange = () => view.setRenderOptions({ directionCenterlines: dirCenterRow.input.checked });
    const onEdgesChange = () => view.setRenderOptions({ edges: edgesRow.input.checked });
    const onPointsChange = () => view.setRenderOptions({ points: pointsRow.input.checked });
    const onSnapChange = () => view.setSnapEnabled(snapRow.input.checked);
    const onTrimThresholdRangeChange = (e) => {
        e.stopPropagation();
        const next = clamp(trimThresholdRange.value, 0, 5);
        trimThresholdRange.value = String(next);
        trimThresholdNumber.value = String(next);
        view.setTrimThresholdFactor?.(next);
    };
    const onTrimThresholdNumberChange = (e) => {
        e.stopPropagation();
        const next = clamp(trimThresholdNumber.value, 0, 5);
        trimThresholdRange.value = String(next);
        trimThresholdNumber.value = String(next);
        view.setTrimThresholdFactor?.(next);
    };
    const onTrimRawChange = () => view.setTrimDebugOptions?.({ rawSegments: trimRawRow.input.checked });
    const onTrimStripsChange = () => view.setTrimDebugOptions?.({ strips: trimStripsRow.input.checked });
    const onTrimOverlapsChange = () => view.setTrimDebugOptions?.({ overlaps: trimOverlapsRow.input.checked });
    const onTrimIntervalsChange = () => view.setTrimDebugOptions?.({ intervals: trimIntervalsRow.input.checked });
    const onTrimRemovedChange = () => view.setTrimDebugOptions?.({ removedPieces: trimRemovedRow.input.checked });
    const onTrimKeptChange = () => view.setTrimDebugOptions?.({ keptPieces: trimKeptRow.input.checked });
    const onTrimDroppedChange = () => view.setTrimDebugOptions?.({ droppedPieces: trimDroppedRow.input.checked });
    const onTrimHighlightChange = () => view.setTrimDebugOptions?.({ highlight: trimHighlightRow.input.checked });
    const onJunctionEnabledChange = () => view.setJunctionEnabled?.(junctionEnabledRow.input.checked);
    const onJunctionEndpointsChange = () => view.setJunctionDebugOptions?.({ endpoints: junctionEndpointsRow.input.checked });
    const onJunctionBoundaryChange = () => view.setJunctionDebugOptions?.({ boundary: junctionBoundaryRow.input.checked });
    const onJunctionConnectorsChange = () => view.setJunctionDebugOptions?.({ connectors: junctionConnectorsRow.input.checked });
    const onJunctionEdgeOrderChange = () => view.setJunctionDebugOptions?.({ edgeOrder: junctionEdgeOrderRow.input.checked });
    const onPopupTabEdit = (e) => {
        e.preventDefault?.();
        setPopupMode('edit');
    };
    const onPopupTabRoads = (e) => {
        e.preventDefault?.();
        setPopupMode('roads');
    };
    const onPopupTabJunctions = (e) => {
        e.preventDefault?.();
        setPopupMode('junctions');
    };
    const onUndo = (e) => {
        e.preventDefault();
        view.undo?.();
    };
    const onRedo = (e) => {
        e.preventDefault();
        view.redo?.();
    };
    const onNewRoad = (e) => {
        e.preventDefault();
        if (popupMode === 'roads') view.startRoadDraft?.({ lanesF: pendingRoadLanesF, lanesB: pendingRoadLanesB });
        else if (popupMode === 'junctions') view.setJunctionToolEnabled?.(true);
    };
    const onDone = (e) => {
        e.preventDefault();
        if (popupMode === 'roads') view.finishRoadDraft();
        else if (popupMode === 'junctions') {
            const ok = view.createJunctionFromToolSelection?.() ?? false;
            if (ok) view.setJunctionToolEnabled?.(false);
        }
    };
    const onCancel = (e) => {
        e.preventDefault();
        if (popupMode === 'roads') view.cancelRoadDraft();
        else if (popupMode === 'junctions') view.setJunctionToolEnabled?.(false);
    };
    const onRoadsLeave = () => view.clearHover();
    const onJunctionsLeave = () => view.clearHover();

    let schemaMode = null;

    const helpPadding = 12;
    const helpGap = 12;
    const layoutHelp = () => {
        const vw = Number(window?.innerWidth) || 0;
        const vh = Number(window?.innerHeight) || 0;
        const leftRect = left?.getBoundingClientRect?.() ?? null;
        const popupRect = bottom?.getBoundingClientRect?.() ?? null;
        const bottomRightRect = bottomRight?.getBoundingClientRect?.() ?? null;

        let leftInset = Number(leftRect?.right) + helpGap;
        if (!Number.isFinite(leftInset)) leftInset = helpPadding;

        const rightInset = helpPadding;
        const minWidth = 320;
        if (vw - rightInset - leftInset < minWidth) leftInset = helpPadding;

        let bottomInset = helpPadding;
        const bottomCandidates = [];
        if (popupRect && Number.isFinite(Number(popupRect.top))) bottomCandidates.push((vh - Number(popupRect.top)) + helpGap);
        if (bottomRightRect && Number.isFinite(Number(bottomRightRect.top))) bottomCandidates.push((vh - Number(bottomRightRect.top)) + helpGap);
        if (bottomCandidates.length) bottomInset = Math.max(helpPadding, ...bottomCandidates);
        const minHeight = 220;
        const maxInset = Math.max(helpPadding, vh - helpPadding - minHeight);
        bottomInset = Math.max(helpPadding, Math.min(bottomInset, maxInset));

        helpModal.style.left = `${Math.round(leftInset)}px`;
        helpModal.style.top = `${helpPadding}px`;
        helpModal.style.right = `${rightInset}px`;
        helpModal.style.bottom = `${Math.round(bottomInset)}px`;
    };

    const isHelpOpen = () => helpModal.style.display !== 'none';

    const openHelp = () => {
        layoutHelp();
        helpModal.style.display = '';
    };
    const closeHelp = () => {
        helpModal.style.display = 'none';
    };

    const closeSchemaModal = () => {
        schemaMode = null;
        schemaMsg.textContent = '';
        schemaModal.style.display = 'none';
        schemaTextarea.value = '';
        schemaTextarea.readOnly = false;
        schemaApply.style.display = '';
    };

    const isExitConfirmOpen = () => exitModal.style.display !== 'none';

    const openExitConfirm = () => {
        exitModal.style.display = '';
    };

    const closeExitConfirm = () => {
        exitModal.style.display = 'none';
    };

    const openSchemaModal = (mode) => {
        schemaMode = mode;
        schemaMsg.textContent = '';
        schemaModal.style.display = '';
        if (mode === 'export') {
            schemaTextarea.readOnly = true;
            schemaTextarea.value = view.exportSchema?.({ pretty: true, includeDraft: true }) ?? '';
            schemaApply.style.display = 'none';
        } else {
            schemaTextarea.readOnly = false;
            schemaTextarea.value = '';
            schemaTextarea.placeholder = '{ "roads": [...] }';
            schemaApply.style.display = '';
        }
        schemaTextarea.focus();
        schemaTextarea.select();
    };

    const onExport = (e) => {
        e.preventDefault();
        openSchemaModal('export');
    };
    const onImport = (e) => {
        e.preventDefault();
        openSchemaModal('import');
    };
    const onSchemaClose = (e) => {
        e.preventDefault();
        closeSchemaModal();
    };
    const onSchemaApply = (e) => {
        e.preventDefault();
        if (schemaMode !== 'import') return;
        const ok = view.importSchema?.(schemaTextarea.value) ?? false;
        if (!ok) {
            schemaMsg.textContent = 'Invalid schema JSON.';
            return;
        }
        closeSchemaModal();
    };

    const onExitCancel = (e) => {
        e.preventDefault?.();
        closeExitConfirm();
    };

    const onExitConfirm = (e) => {
        e.preventDefault?.();
        closeExitConfirm();
        view.confirmExit?.();
    };

    const onHelp = (e) => {
        e.preventDefault();
        if (isHelpOpen()) closeHelp();
        else openHelp();
    };
    const onHelpClose = (e) => {
        e.preventDefault();
        closeHelp();
    };

    const onResize = () => {
        if (isHelpOpen()) layoutHelp();
    };
    window.addEventListener('resize', onResize);

    gridRow.input.addEventListener('change', onGridChange);
    asphaltRow.input.addEventListener('change', onAsphaltChange);
    markingsRow.input.addEventListener('change', onMarkingsChange);
    arrowTangentRow.input.addEventListener('change', onArrowTangentChange);
    dividerRow.input.addEventListener('change', onDividerChange);
    dirCenterRow.input.addEventListener('change', onDirCenterChange);
    edgesRow.input.addEventListener('change', onEdgesChange);
    pointsRow.input.addEventListener('change', onPointsChange);
    snapRow.input.addEventListener('change', onSnapChange);
    trimThresholdRange.addEventListener('input', onTrimThresholdRangeChange);
    trimThresholdNumber.addEventListener('change', onTrimThresholdNumberChange);
    trimRawRow.input.addEventListener('change', onTrimRawChange);
    trimStripsRow.input.addEventListener('change', onTrimStripsChange);
    trimOverlapsRow.input.addEventListener('change', onTrimOverlapsChange);
    trimIntervalsRow.input.addEventListener('change', onTrimIntervalsChange);
    trimRemovedRow.input.addEventListener('change', onTrimRemovedChange);
    trimKeptRow.input.addEventListener('change', onTrimKeptChange);
    trimDroppedRow.input.addEventListener('change', onTrimDroppedChange);
    trimHighlightRow.input.addEventListener('change', onTrimHighlightChange);
    junctionEnabledRow.input.addEventListener('change', onJunctionEnabledChange);
    junctionEndpointsRow.input.addEventListener('change', onJunctionEndpointsChange);
    junctionBoundaryRow.input.addEventListener('change', onJunctionBoundaryChange);
    junctionConnectorsRow.input.addEventListener('change', onJunctionConnectorsChange);
    junctionEdgeOrderRow.input.addEventListener('change', onJunctionEdgeOrderChange);
    vizTabRoads.addEventListener('click', onVizTabRoads);
    vizTabJunctions.addEventListener('click', onVizTabJunctions);
    vizTabSegments.addEventListener('click', onVizTabSegments);
    vizTabGrid.addEventListener('click', onVizTabGrid);
    helpBtn.addEventListener('click', onHelp);
    helpClose.addEventListener('click', onHelpClose);
    undoBtn.addEventListener('click', onUndo);
    redoBtn.addEventListener('click', onRedo);
    exportBtn.addEventListener('click', onExport);
    importBtn.addEventListener('click', onImport);
    popupTabEdit.addEventListener('click', onPopupTabEdit);
    popupTabRoads.addEventListener('click', onPopupTabRoads);
    popupTabJunctions.addEventListener('click', onPopupTabJunctions);
    newRoad.addEventListener('click', onNewRoad);
    done.addEventListener('click', onDone);
    cancel.addEventListener('click', onCancel);
    roadsList.addEventListener('mouseleave', onRoadsLeave);
    junctionsList.addEventListener('mouseleave', onJunctionsLeave);
    schemaClose.addEventListener('click', onSchemaClose);
    schemaApply.addEventListener('click', onSchemaApply);
    schemaModal.addEventListener('click', (e) => {
        if (e.target === schemaModal) closeSchemaModal();
    });
    exitCancel.addEventListener('click', onExitCancel);
    exitConfirm.addEventListener('click', onExitConfirm);
    exitModal.addEventListener('click', (e) => {
        if (e.target === exitModal) closeExitConfirm();
    });

    let orbitDrag = null;
    const onOrbitPointerDown = (e) => {
        e.preventDefault?.();
        e.stopPropagation?.();
        const rect = orbitSurface.getBoundingClientRect?.() ?? { width: 120, height: 120 };
        const yaw = view.getCameraOrbit?.().yaw ?? view._orbitYaw ?? 0;
        const pitch = view.getCameraOrbit?.().pitch ?? view._orbitPitch ?? 0;
        orbitDrag = {
            pointerId: Number.isFinite(e.pointerId) ? e.pointerId : null,
            startX: e.clientX ?? 0,
            startY: e.clientY ?? 0,
            startYaw: Number(yaw) || 0,
            startPitch: Number(pitch) || 0,
            size: Math.max(60, Number(rect.width) || 120)
        };
        orbitSurface.classList.add('is-dragging');
        if (orbitDrag.pointerId !== null) {
            try {
                orbitSurface.setPointerCapture(orbitDrag.pointerId);
            } catch (err) {}
        }
    };

    const onOrbitPointerMove = (e) => {
        if (!orbitDrag) return;
        e.preventDefault?.();
        e.stopPropagation?.();
        const dx = (e.clientX ?? 0) - orbitDrag.startX;
        const dy = (e.clientY ?? 0) - orbitDrag.startY;
        const scale = orbitDrag.size || 120;
        const yaw = orbitDrag.startYaw + dx * ((Math.PI * 2) / scale);
        const pitch = orbitDrag.startPitch + dy * ((Math.PI * 0.5) / scale);
        view.setCameraOrbit?.({ yaw, pitch });
    };

    const onOrbitPointerUp = (e) => {
        if (!orbitDrag) return;
        e.preventDefault?.();
        e.stopPropagation?.();
        const pid = orbitDrag.pointerId;
        orbitDrag = null;
        orbitSurface.classList.remove('is-dragging');
        if (pid !== null) {
            try {
                orbitSurface.releasePointerCapture(pid);
            } catch (err) {}
        }
    };

    const onOrbitReset = (e) => {
        e.preventDefault?.();
        view.resetCameraOrbit?.();
    };

    orbitSurface.addEventListener('pointerdown', onOrbitPointerDown);
    orbitSurface.addEventListener('pointermove', onOrbitPointerMove);
    orbitSurface.addEventListener('pointerup', onOrbitPointerUp);
    orbitSurface.addEventListener('pointercancel', onOrbitPointerUp);
    orbitReset.addEventListener('click', onOrbitReset);

    const buildRoadRow = ({ road, isDraft }) => {
        const row = document.createElement('div');
        row.className = 'road-debugger-road-row road-debugger-road-row-single';
        row.dataset.roadId = road.id;
        if (isDraft) row.classList.add('is-draft');
        const isVisible = road?.visible !== false;
        row.classList.toggle('is-hidden', !isVisible);

        const main = document.createElement('div');
        main.className = 'road-debugger-road-main';

        const label = document.createElement('div');
        label.className = 'road-debugger-road-label';
        label.textContent = isDraft ? `${road.name} (draft)` : road.name;
        main.appendChild(label);

        const meta = document.createElement('div');
        meta.className = 'road-debugger-road-meta';
        meta.textContent = road.id;
        main.appendChild(meta);

        row.appendChild(main);

        const sel = view._selection ?? {};
        const hover = view._hover ?? {};
        const isSelected = !!sel.type && sel.roadId === road.id;
        const isHovered = hover.roadId === road.id && !hover.segmentId && !hover.pointId;
        row.classList.toggle('is-selected', !!isSelected);
        row.classList.toggle('is-hovered', !!isHovered);

        row.addEventListener('mouseenter', () => view.setHoverRoad(road.id));
        row.addEventListener('mouseleave', () => {
            const h = view._hover ?? {};
            if (h.roadId === road.id && !h.segmentId && !h.pointId && !h.junctionId) view.clearHover();
        });
        row.addEventListener('click', () => {
            setPopupMode('edit');
            view.selectRoad(road.id);
        });
        return row;
    };

    const buildSegmentRow = ({ seg }) => {
        const row = document.createElement('div');
        row.className = 'road-debugger-seg-row';
        row.dataset.segmentId = seg.id;
        row.dataset.roadId = seg.roadId;

        const label = document.createElement('div');
        label.className = 'road-debugger-seg-label';
        label.textContent = `#${fmtInt(seg.index)} · ${fmt(seg.length, 1)}m`;
        row.appendChild(label);

        const meta = document.createElement('div');
        meta.className = 'road-debugger-seg-meta';
        meta.textContent = seg.id;
        row.appendChild(meta);

        const isSelected = (view._selection?.type === 'segment' || view._selection?.type === 'piece') && view._selection?.segmentId === seg.id;
        const isHovered = view._hover?.segmentId === seg.id;
        row.classList.toggle('is-selected', !!isSelected);
        row.classList.toggle('is-hovered', !!isHovered);

        row.addEventListener('mouseenter', () => view.setHoverSegment(seg.id));
        row.addEventListener('mouseleave', () => {
            if (view._hover?.segmentId === seg.id) view.clearHover();
        });
        row.addEventListener('click', () => {
            setPopupMode('edit');
            view.selectSegment(seg.id);
        });
        return row;
    };

    const buildPointRow = ({ roadId, pt, index }) => {
        const row = document.createElement('div');
        row.className = 'road-debugger-point-row';
        row.dataset.roadId = roadId;
        row.dataset.pointId = pt.id;

        const label = document.createElement('div');
        label.className = 'road-debugger-point-label';
        label.textContent = `pt #${fmtInt(index)} · ${pt.id}`;
        row.appendChild(label);

        const meta = document.createElement('div');
        meta.className = 'road-debugger-point-meta';
        meta.textContent = `tile ${fmtInt(pt.tileX)}, ${fmtInt(pt.tileY)} · uv ${fmt(pt.offsetU, 3)}, ${fmt(pt.offsetV, 3)}`;
        row.appendChild(meta);

        const isSelected = view._selection?.type === 'point' && view._selection?.roadId === roadId && view._selection?.pointId === pt.id;
        const isHovered = view._hover?.roadId === roadId && view._hover?.pointId === pt.id;
        row.classList.toggle('is-selected', !!isSelected);
        row.classList.toggle('is-hovered', !!isHovered);

        row.addEventListener('mouseenter', () => view.setHoverPoint?.(roadId, pt.id));
        row.addEventListener('mouseleave', () => {
            if (view._hover?.roadId === roadId && view._hover?.pointId === pt.id) view.clearHover();
        });
        row.addEventListener('click', () => {
            setPopupMode('edit');
            view.selectPoint?.(roadId, pt.id);
        });
        return row;
    };

    const buildJunctionRow = ({ junction }) => {
        const row = document.createElement('div');
        row.className = 'road-debugger-road-row road-debugger-junction-row road-debugger-road-row-single';
        row.dataset.junctionId = junction.id;

        const main = document.createElement('div');
        main.className = 'road-debugger-road-main';

        const label = document.createElement('div');
        label.className = 'road-debugger-road-label';
        const ends = junction?.endpoints?.length ?? 0;
        const conns = junction?.connectors?.length ?? 0;
        const source = junction?.source ?? 'auto';
        label.textContent = `Junction · ${source} · ${fmtInt(ends)} approaches · ${fmtInt(conns)} movements`;
        main.appendChild(label);

        const meta = document.createElement('div');
        meta.className = 'road-debugger-road-meta';
        meta.textContent = junction.id;
        main.appendChild(meta);

        row.appendChild(main);

        const sel = view._selection ?? {};
        const hover = view._hover ?? {};
        const isSelected = sel?.type === 'junction' && sel?.junctionId === junction.id;
        const isHovered = hover?.junctionId === junction.id && !hover?.connectorId && !hover?.approachId;
        row.classList.toggle('is-selected', !!isSelected);
        row.classList.toggle('is-hovered', !!isHovered);
        row.classList.toggle('is-hidden', junction?.asphaltVisible === false);

        row.addEventListener('mouseenter', () => view.setHoverJunction?.(junction.id));
        row.addEventListener('mouseleave', () => {
            const h = view._hover ?? {};
            if (h.junctionId === junction.id && !h.connectorId && !h.approachId) view.clearHover();
        });
        row.addEventListener('click', () => {
            setPopupMode('edit');
            view.selectJunction?.(junction.id);
        });
        return row;
    };

    const buildJunctionSubheadRow = ({ text, title = '' }) => {
        const row = document.createElement('div');
        row.className = 'road-debugger-junction-subhead';
        row.textContent = text;
        if (title) row.title = title;
        return row;
    };

    const buildJunctionEndpointRow = ({ endpoint, junctionId }) => {
        const row = document.createElement('div');
        row.className = 'road-debugger-junction-endpoint-row';
        row.dataset.junctionId = junctionId;
        row.dataset.endpointId = endpoint?.id ?? '';

        const label = document.createElement('div');
        label.className = 'road-debugger-junction-endpoint-label';
        label.textContent = `Approach · ${endpoint?.roadId ?? '--'} · ${endpoint?.end ?? '--'} · seg ${endpoint?.segmentId ?? '--'} · piece ${endpoint?.pieceId ?? '--'}`;
        row.appendChild(label);

        const meta = document.createElement('div');
        meta.className = 'road-debugger-junction-endpoint-meta';
        meta.textContent = endpoint?.id ?? '--';
        row.appendChild(meta);

        const isSelected = view._selection?.type === 'approach' && view._selection?.junctionId === junctionId && view._selection?.approachId === endpoint?.id;
        const isHovered = view._hover?.junctionId === junctionId && view._hover?.approachId === endpoint?.id;
        row.classList.toggle('is-selected', !!isSelected);
        row.classList.toggle('is-hovered', !!isHovered);

        row.title = 'Approach: a road piece endpoint participating in this junction.';
        row.addEventListener('mouseenter', () => view.setHoverApproach?.(junctionId, endpoint?.id));
        row.addEventListener('mouseleave', () => {
            if (view._hover?.junctionId === junctionId && view._hover?.approachId === endpoint?.id) view.clearHover();
        });
        row.addEventListener('click', () => {
            setPopupMode('edit');
            view.selectApproach?.(junctionId, endpoint?.id);
        });

        return row;
    };

    const buildConnectorRow = ({ connector, junctionId, junction = null }) => {
        const resolvedJunctionId = junction?.id ?? junctionId ?? null;
        const endpointById = new Map((junction?.endpoints ?? []).map((e) => [e?.id, e]));
        const aEp = endpointById.get(connector?.aEndpointId) ?? null;
        const bEp = endpointById.get(connector?.bEndpointId) ?? null;

        const aRoad = aEp?.roadId ?? connector?.aRoadId ?? '--';
        const bRoad = bEp?.roadId ?? connector?.bRoadId ?? '--';
        const aEnd = aEp?.end ?? '--';
        const bEnd = bEp?.end ?? '--';
        const dist = Number(connector?.distance) || 0;

        const symbol = connector?.allowAToB && connector?.allowBToA
            ? '↔'
            : connector?.allowAToB
                ? '→'
                : connector?.allowBToA
                    ? '←'
                    : '×';

        const row = document.createElement('div');
        row.className = 'road-debugger-connector-row';
        row.dataset.connectorId = connector.id;
        if (resolvedJunctionId) row.dataset.junctionId = resolvedJunctionId;

        const label = document.createElement('div');
        label.className = 'road-debugger-connector-label';
        if (connector?.sameRoad) {
            const roadId = aRoad !== '--' ? aRoad : bRoad;
            label.textContent = `${connector?.mergedIntoRoad ? 'Continuity (merged)' : 'Continuity'} · ${roadId} · ${aEnd} ${symbol} ${bEnd} · ${fmt(dist, 1)}m`;
            row.title = 'Continuity: same-road movement between two approaches. Merge into road to treat it as road continuity.';
        } else {
            label.textContent = `Movement · ${aRoad} ${aEnd} ${symbol} ${bRoad} ${bEnd} · ${fmt(dist, 1)}m`;
            row.title = 'Movement: a connector edge between two approaches (topology/turn option). It does not create separate asphalt.';
        }
        row.appendChild(label);

        const right = document.createElement('div');
        right.className = 'road-debugger-connector-right';

        const meta = document.createElement('div');
        meta.className = 'road-debugger-connector-meta';
        meta.textContent = connector.id;
        right.appendChild(meta);

        if (connector?.sameRoad) {
            const merge = document.createElement('button');
            merge.type = 'button';
            merge.className = 'road-debugger-connector-merge';
            const merged = connector?.mergedIntoRoad;
            merge.textContent = merged ? 'Merged' : 'Merge into road';
            merge.disabled = !!merged;
            merge.title = merged
                ? 'This same-road movement is treated as road continuity (hidden from movements). Asphalt is unchanged.'
                : 'Treat this same-road movement as road continuity (removes it from the movements list). Asphalt is unchanged.';
            merge.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                view.mergeConnectorIntoRoad?.(connector.id);
            });
            right.appendChild(merge);
        }

        row.appendChild(right);

        const isSelected = view._selection?.type === 'connector' && view._selection?.connectorId === connector.id;
        const isHovered = view._hover?.connectorId === connector.id;
        row.classList.toggle('is-selected', !!isSelected);
        row.classList.toggle('is-hovered', !!isHovered);
        row.classList.toggle('is-merged', !!connector?.mergedIntoRoad);

        row.addEventListener('mouseenter', () => view.setHoverConnector?.(connector.id));
        row.addEventListener('mouseleave', () => {
            if (view._hover?.connectorId === connector.id) view.clearHover();
        });
        row.addEventListener('click', () => {
            setPopupMode('edit');
            view.selectConnector?.(connector.id);
        });
        return row;
    };

    let roadsListKey = null;

    const sync = () => {
        vizTabRoads.classList.toggle('is-active', vizMode === 'roads');
        vizTabJunctions.classList.toggle('is-active', vizMode === 'junctions');
        vizTabSegments.classList.toggle('is-active', vizMode === 'segments');
        vizTabGrid.classList.toggle('is-active', vizMode === 'grid');
        roadsPanel.classList.toggle('is-active', vizMode === 'roads');
        junctionsVizPanel.classList.toggle('is-active', vizMode === 'junctions');
        segmentsPanel.classList.toggle('is-active', vizMode === 'segments');
        gridPanel.classList.toggle('is-active', vizMode === 'grid');

        gridRow.input.checked = view._gridEnabled !== false;
        asphaltRow.input.checked = view._renderOptions?.asphalt !== false;
        markingsRow.input.checked = view._renderOptions?.markings === true;
        arrowTangentRow.input.checked = view.getArrowTangentDebugEnabled?.() ?? view._arrowTangentDebugEnabled === true;
        dividerRow.input.checked = view._renderOptions?.centerline !== false;
        dirCenterRow.input.checked = view._renderOptions?.directionCenterlines !== false;
        edgesRow.input.checked = view._renderOptions?.edges !== false;
        pointsRow.input.checked = view._renderOptions?.points !== false;
        snapRow.input.checked = view.getSnapEnabled?.() ?? view._snapEnabled !== false;
        const pickDebugEnabled = pickDebugRow.input.checked;
        if (view._picking) view._picking.debugEnabled = pickDebugEnabled;
        pickDebugOverlay.style.display = pickDebugEnabled ? '' : 'none';
        if (pickDebugEnabled) {
            const pick = view._picking?.getDebugPick?.() ?? null;
            const label = view._picking?.formatPick?.(pick) ?? 'background';
            pickDebugOverlay.textContent = `pick: ${label}`;
        }
        undoBtn.disabled = !(view.canUndo?.() ?? false);
        redoBtn.disabled = !(view.canRedo?.() ?? false);

        const trimFactor = clamp(view.getTrimThresholdFactor?.() ?? view._trimThresholdFactor ?? 0.1, 0, 5);
        trimThresholdRange.value = String(trimFactor);
        trimThresholdNumber.value = String(trimFactor);

        const trimDebug = view.getTrimDebugOptions?.() ?? view._trimDebug ?? {};
        trimRawRow.input.checked = !!trimDebug.rawSegments;
        trimStripsRow.input.checked = !!trimDebug.strips;
        trimOverlapsRow.input.checked = !!trimDebug.overlaps;
        trimIntervalsRow.input.checked = !!trimDebug.intervals;
        trimRemovedRow.input.checked = !!trimDebug.removedPieces;
        trimKeptRow.input.checked = !!trimDebug.keptPieces;
        trimDroppedRow.input.checked = !!trimDebug.droppedPieces;
        trimHighlightRow.input.checked = !!trimDebug.highlight;

        const junctionsVisible = view.getJunctionEnabled?.() ?? view._junctionEnabled !== false;
        junctionEnabledRow.input.checked = junctionsVisible;
        const junctionDebug = view.getJunctionDebugOptions?.() ?? view._junctionDebug ?? {};
        junctionEndpointsRow.input.checked = !!junctionDebug.endpoints;
        junctionBoundaryRow.input.checked = !!junctionDebug.boundary;
        junctionConnectorsRow.input.checked = !!junctionDebug.connectors;
        junctionEdgeOrderRow.input.checked = !!junctionDebug.edgeOrder;
        junctionEndpointsRow.input.disabled = !junctionsVisible;
        junctionBoundaryRow.input.disabled = !junctionsVisible;
        junctionConnectorsRow.input.disabled = !junctionsVisible;
        junctionEdgeOrderRow.input.disabled = !junctionsVisible;

        const junctionToolEnabled = view.getJunctionToolEnabled?.() ?? view._junctionToolEnabled === true;
        const selectedCandidates = view.getJunctionToolSelection?.() ?? Array.from(view._junctionToolSelectedCandidateIds ?? []).sort();
        const selectedCount = selectedCandidates.length;
        const singleIsCorner = selectedCount === 1 && String(selectedCandidates[0] ?? '').startsWith('corner_');

        const info = outputInfo(view);
        infoTitle.textContent = info.title;
        infoBody.textContent = info.text;

        const derived = view.getDerived?.() ?? view._derived ?? null;

        detailBody.textContent = '';
        const appendDetail = (el) => detailBody.appendChild(el);
        const buildDetailSummary = (lines) => {
            const row = document.createElement('div');
            row.className = 'road-debugger-detail-summary';
            row.textContent = Array.isArray(lines) ? lines.join('\n') : String(lines ?? '');
            return row;
        };
        const buildDetailSubhead = (text) => {
            const row = document.createElement('div');
            row.className = 'road-debugger-detail-subhead';
            row.textContent = text;
            return row;
        };

        const selectedIssueId = view.getSelectedIssueId?.() ?? view._selectedIssueId ?? null;
        const selectedIssue = selectedIssueId ? (view.getIssueById?.(selectedIssueId) ?? null) : null;
        if (selectedIssue) {
            const severity = String(selectedIssue.severity ?? 'info');
            appendDetail(buildDetailSubhead('Issue'));
            appendDetail(buildDetailSummary([
                `id: ${selectedIssue.issueId}`,
                `severity: ${severity}`,
                `label: ${selectedIssue.label ?? '--'}`
            ]));
            if (selectedIssue.details) {
                appendDetail(buildDetailSummary(String(selectedIssue.details)));
            }
            const fixes = Array.isArray(selectedIssue.fixes) ? selectedIssue.fixes : [];
            if (fixes.length) {
                const actions = document.createElement('div');
                actions.className = 'road-debugger-detail-actions';
                for (const fix of fixes) {
                    if (!fix?.fixId) continue;
                    const btn = makeButton(fix?.label ?? fix.fixId);
                    btn.classList.add('road-debugger-detail-fix-btn');
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        view.applyIssueFix?.(selectedIssue.issueId, fix.fixId);
                    });
                    actions.appendChild(btn);
                }
                appendDetail(actions);
            }
        }

        const selDetail = view._selection ?? {};
        if (!selDetail?.type) {
            appendDetail(buildDetailSummary('No selection.'));
        } else if (selDetail.type === 'junction' || selDetail.type === 'connector' || selDetail.type === 'approach') {
            const junctionId = selDetail.junctionId ?? null;
            const junction = derived?.junctions?.find?.((j) => j?.id === junctionId) ?? null;
            if (!junction) {
                appendDetail(buildDetailSummary('Junction not found.'));
            } else {
                const ends = junction?.endpoints?.length ?? 0;
                const conns = junction?.connectors?.length ?? 0;
                appendDetail(buildDetailSummary([
                    `Junction: ${junction.id}`,
                    `source: ${junction?.source ?? 'auto'}`,
                    `approaches: ${fmtInt(ends)}`,
                    `movements: ${fmtInt(conns)}`
                ]));

                const endpoints = junction?.endpoints ?? [];
                if (endpoints.length) appendDetail(buildDetailSubhead(`Approaches (${fmtInt(endpoints.length)})`));
                for (const endpoint of endpoints) {
                    if (!endpoint?.id) continue;
                    appendDetail(buildJunctionEndpointRow({ endpoint, junctionId: junction.id }));
                }

                const connectors = junction?.connectors ?? [];
                const active = connectors.filter((c) => c?.id && !c?.mergedIntoRoad);
                const merged = connectors.filter((c) => c?.id && !!c?.mergedIntoRoad);
                if (active.length) appendDetail(buildDetailSubhead(`Movements (${fmtInt(active.length)})`));
                for (const conn of active) appendDetail(buildConnectorRow({ connector: conn, junction }));
                if (merged.length) appendDetail(buildDetailSubhead(`Merged into road (${fmtInt(merged.length)})`));
                for (const conn of merged) appendDetail(buildConnectorRow({ connector: conn, junction }));
            }
        } else {
            const roadId = selDetail.roadId ?? null;
            const road = derived?.roads?.find?.((r) => r?.id === roadId) ?? null;
            const segs = derived?.segments?.filter?.((s) => s?.roadId === roadId) ?? [];
            if (!road) {
                appendDetail(buildDetailSummary('Road not found.'));
            } else {
                appendDetail(buildDetailSummary([
                    `Road: ${road.name}`,
                    `id: ${road.id}`,
                    `lanesF/B: ${fmtInt(road.lanesF)} / ${fmtInt(road.lanesB)}`,
                    `points: ${fmtInt(road?.points?.length ?? 0)}`,
                    `segments: ${fmtInt(segs.length)}`
                ]));

                const points = road?.points ?? [];
                if (points.length) appendDetail(buildDetailSubhead(`Points (${fmtInt(points.length)})`));
                for (let i = 0; i < points.length; i++) {
                    const pt = points[i];
                    if (!pt?.id) continue;
                    appendDetail(buildPointRow({ roadId: road.id, pt, index: i }));
                }

                if (segs.length) appendDetail(buildDetailSubhead(`Segments (${fmtInt(segs.length)})`));
                for (const seg of segs) appendDetail(buildSegmentRow({ seg }));
            }
        }

        const setRowLabel = (row, text) => {
            const span = row?.querySelector?.('.road-debugger-label') ?? null;
            if (span && span.textContent !== text) span.textContent = text;
        };
        const segsForCounts = Array.isArray(derived?.segments) ? derived.segments : [];
        const trimCounts = segsForCounts.reduce(
            (acc, seg) => {
                acc.intervals += seg?.trimRemoved?.length ?? 0;
                acc.removedPieces += seg?.trimRemoved?.length ?? 0;
                acc.kept += seg?.keptPieces?.length ?? 0;
                acc.dropped += seg?.droppedPieces?.length ?? 0;
                return acc;
            },
            { intervals: 0, removedPieces: 0, kept: 0, dropped: 0 }
        );
        const overlapCount = derived?.trim?.overlaps?.length ?? 0;
        setRowLabel(trimOverlapsRow.row, `Overlaps (${fmtInt(overlapCount)})`);
        setRowLabel(trimIntervalsRow.row, `Intervals (${fmtInt(trimCounts.intervals)})`);
        setRowLabel(trimRemovedRow.row, `Removed pieces (${fmtInt(trimCounts.removedPieces)})`);
        setRowLabel(trimKeptRow.row, `Kept pieces (${fmtInt(trimCounts.kept)})`);
        setRowLabel(trimDroppedRow.row, `Dropped pieces (${fmtInt(trimCounts.dropped)})`);
        const sel = view._selection ?? {};
        const selRoad = sel?.roadId ? (derived?.roads?.find?.((r) => r?.id === sel.roadId) ?? null) : null;
        const selPoint = sel?.type === 'point' ? (selRoad?.points?.find?.((p) => p?.id === sel.pointId) ?? null) : null;
        const showPointEditor = popupMode === 'edit' && !!selPoint;
        pointSection.style.display = showPointEditor ? '' : 'none';
        if (showPointEditor) {
            const factor = Number.isFinite(selPoint.tangentFactor) ? selPoint.tangentFactor : 1;
            tangentRange.value = String(factor);
            tangentNumber.value = String(factor);
        }

        filterInfoBtn.classList.toggle('is-active', warningsFilter.info);
        filterWarningBtn.classList.toggle('is-active', warningsFilter.warning);
        filterErrorBtn.classList.toggle('is-active', warningsFilter.error);

        const selectionOnly = selectionOnlyRow.input.checked;
        const matchesSelection = (issue, sel) => {
            if (!selectionOnly) return true;
            const refs = issue?.refs ?? null;
            const selObj = sel ?? {};
            if (!selObj?.type) return false;
            if (selObj.type === 'road') {
                const ids = Array.isArray(refs?.roadIds) ? refs.roadIds : [];
                return !!selObj.roadId && ids.includes(selObj.roadId);
            }
            if (selObj.type === 'segment' || selObj.type === 'piece') {
                const ids = Array.isArray(refs?.segmentIds) ? refs.segmentIds : [];
                return !!selObj.segmentId && ids.includes(selObj.segmentId);
            }
            if (selObj.type === 'point') {
                const ids = Array.isArray(refs?.pointIds) ? refs.pointIds : [];
                return !!selObj.pointId && ids.includes(selObj.pointId);
            }
            if (selObj.type === 'junction' || selObj.type === 'approach') {
                const ids = Array.isArray(refs?.junctionIds) ? refs.junctionIds : [];
                return !!selObj.junctionId && ids.includes(selObj.junctionId);
            }
            if (selObj.type === 'connector') {
                const ids = Array.isArray(refs?.connectorIds) ? refs.connectorIds : [];
                return !!selObj.connectorId && ids.includes(selObj.connectorId);
            }
            return false;
        };

        const issues = view.getIssues?.() ?? view._issues ?? [];
        const issueSelId = view.getSelectedIssueId?.() ?? view._selectedIssueId ?? null;
        const issueHoverId = view.getHoverIssueId?.() ?? view._hoverIssueId ?? null;
        const filteredIssues = issues
            .filter((issue) => {
                const severity = String(issue?.severity ?? 'info');
                if (severity === 'info' && !warningsFilter.info) return false;
                if (severity === 'warning' && !warningsFilter.warning) return false;
                if (severity === 'error' && !warningsFilter.error) return false;
                return matchesSelection(issue, view._selection);
            })
            .slice()
            .sort((a, b) => {
                const order = { error: 0, warning: 1, info: 2 };
                const ao = order[String(a?.severity ?? 'info')] ?? 99;
                const bo = order[String(b?.severity ?? 'info')] ?? 99;
                if (ao !== bo) return ao - bo;
                const aid = String(a?.issueId ?? '');
                const bid = String(b?.issueId ?? '');
                if (aid < bid) return -1;
                if (aid > bid) return 1;
                return 0;
            });

        warningsTitle.textContent = `Warnings (${fmtInt(issues.length)})`;
        warningsList.textContent = '';
        if (!filteredIssues.length) {
            const empty = document.createElement('div');
            empty.className = 'road-debugger-placeholder';
            empty.textContent = issues.length ? 'No matching issues.' : 'No issues.';
            warningsList.appendChild(empty);
        } else {
            for (const issue of filteredIssues) {
                if (!issue?.issueId) continue;
                const row = document.createElement('div');
                row.className = 'road-debugger-issue-row';
                row.dataset.issueId = issue.issueId;
                const severity = String(issue.severity ?? 'info');
                row.classList.add(`is-${severity}`);
                row.classList.toggle('is-selected', issue.issueId === issueSelId);
                row.classList.toggle('is-hovered', issue.issueId === issueHoverId);

                const main = document.createElement('div');
                main.className = 'road-debugger-issue-main';
                const badge = document.createElement('div');
                badge.className = 'road-debugger-issue-badge';
                badge.textContent = severity === 'error' ? 'E' : (severity === 'warning' ? 'W' : 'I');
                main.appendChild(badge);
                const label = document.createElement('div');
                label.className = 'road-debugger-issue-label';
                label.textContent = issue.label ?? issue.issueId;
                main.appendChild(label);
                row.appendChild(main);

                const meta = document.createElement('div');
                meta.className = 'road-debugger-issue-meta';
                meta.textContent = issue.issueId;
                row.appendChild(meta);

                row.addEventListener('mouseenter', () => view.setHoverIssue?.(issue.issueId));
                row.addEventListener('mouseleave', () => {
                    if ((view.getHoverIssueId?.() ?? view._hoverIssueId) === issue.issueId) view.clearHoverIssue?.();
                });
                row.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    view.selectIssue?.(issue.issueId);
                });

                warningsList.appendChild(row);
            }
        }

        const draft = view.getDraftRoad?.() ?? view._draft ?? null;
        const roads = view.getRoads?.() ?? view._roads ?? [];
        const all = draft ? [draft, ...roads] : roads;

        const nextKeyParts = [];
        for (const road of all) {
            if (!road?.id) continue;
            const isDraft = draft?.id === road.id;
            const visible = road.visible !== false;
            const name = String(road.name ?? '');
            nextKeyParts.push(`${road.id}:${isDraft ? 1 : 0}:${visible ? 1 : 0}:${name}`);
        }
        const nextRoadsListKey = nextKeyParts.join('||');

        const rebuildRoadList = nextRoadsListKey !== roadsListKey;
        if (rebuildRoadList) {
            roadsList.textContent = '';

            if (!all.length) {
                const empty = document.createElement('div');
                empty.className = 'road-debugger-placeholder';
                empty.textContent = 'No roads yet.';
                roadsList.appendChild(empty);
            }

            for (const road of all) {
                if (!road?.id) continue;
                const isDraft = draft?.id === road.id;
                roadsList.appendChild(buildRoadRow({ road, isDraft }));
            }

            roadsListKey = nextRoadsListKey;
        } else {
            const sel = view._selection ?? {};
            const hover = view._hover ?? {};
            for (const row of roadsList.querySelectorAll('.road-debugger-road-row[data-road-id]')) {
                const roadId = row?.dataset?.roadId ?? null;
                if (!roadId) continue;
                const selected = !!sel.type && sel.roadId === roadId;
                const hovered = hover.roadId === roadId && !hover.segmentId && !hover.pointId;
                row.classList.toggle('is-selected', !!selected);
                row.classList.toggle('is-hovered', !!hovered);
            }
        }

        junctionsList.textContent = '';
        const junctions = derived?.junctions ?? [];
        if (!junctions.length) {
            const empty = document.createElement('div');
            empty.className = 'road-debugger-placeholder';
            empty.textContent = 'No junctions.';
            junctionsList.appendChild(empty);
        } else {
            const list = junctions.slice().sort((a, b) => {
                const aa = String(a?.id ?? '');
                const bb = String(b?.id ?? '');
                if (aa < bb) return -1;
                if (aa > bb) return 1;
                return 0;
            });
            for (const junction of list) {
                if (!junction?.id) continue;
                junctionsList.appendChild(buildJunctionRow({ junction }));
            }
        }

        const draftActive = !!draft;
        const pts = draft?.points?.length ?? 0;
        popupTabEdit.classList.toggle('is-active', popupMode === 'edit');
        popupTabRoads.classList.toggle('is-active', popupMode === 'roads');
        popupTabJunctions.classList.toggle('is-active', popupMode === 'junctions');

        popupContent.textContent = '';
        popupCandidates.style.display = 'none';
        popupCandidates.textContent = '';

        newRoad.style.display = 'none';
        cancel.style.display = 'none';
        done.style.display = 'none';

        const addEditorText = (text) => {
            const div = document.createElement('div');
            div.className = 'road-debugger-editor-text';
            div.textContent = String(text ?? '');
            popupContent.appendChild(div);
        };

        const addEditorField = ({ labelText, inputEl }) => {
            const row = document.createElement('label');
            row.className = 'road-debugger-editor-field';
            const label = document.createElement('span');
            label.className = 'road-debugger-editor-field-label';
            label.textContent = labelText;
            row.appendChild(label);
            row.appendChild(inputEl);
            popupContent.appendChild(row);
        };

        const addEditorButtonRow = (buttons) => {
            const row = document.createElement('div');
            row.className = 'road-debugger-editor-button-row';
            for (const btn of buttons) row.appendChild(btn);
            popupContent.appendChild(row);
        };

        if (popupMode === 'edit') {
            popupTitle.textContent = 'Edit';
            const sel = view._selection ?? {};
            if (!sel?.type) {
                addEditorText('Select an entity from the lists, the detail tree, or the map.');
            } else if (sel.type === 'road') {
                const schemaDraft = view.getDraftRoad?.() ?? view._draft ?? null;
                const schemaRoads = view.getRoads?.() ?? view._roads ?? [];
                const schema = (schemaDraft?.id === sel.roadId ? schemaDraft : schemaRoads.find((r) => r?.id === sel.roadId)) ?? null;
                addEditorText(schema ? `${schema.name} · ${schema.id}` : `Road · ${sel.roadId ?? '--'}`);

                const lanesF = document.createElement('input');
                lanesF.type = 'number';
                lanesF.min = '1';
                lanesF.max = '5';
                lanesF.step = '1';
                lanesF.className = 'road-debugger-editor-number';
                lanesF.value = String(clampInt(schema?.lanesF ?? 1, 1, 5));
                lanesF.addEventListener('change', (e) => {
                    e.stopPropagation();
                    const next = clampInt(lanesF.value, 1, 5);
                    lanesF.value = String(next);
                    view.setRoadLaneConfig?.(sel.roadId, { lanesF: next });
                });
                addEditorField({ labelText: 'lanesF', inputEl: lanesF });

                const lanesB = document.createElement('input');
                lanesB.type = 'number';
                lanesB.min = '0';
                lanesB.max = '5';
                lanesB.step = '1';
                lanesB.className = 'road-debugger-editor-number';
                lanesB.value = String(clampInt(schema?.lanesB ?? 1, 0, 5));
                lanesB.addEventListener('change', (e) => {
                    e.stopPropagation();
                    const next = clampInt(lanesB.value, 0, 5);
                    lanesB.value = String(next);
                    view.setRoadLaneConfig?.(sel.roadId, { lanesB: next });
                });
                addEditorField({ labelText: 'lanesB', inputEl: lanesB });

                const visible = document.createElement('input');
                visible.type = 'checkbox';
                visible.className = 'road-debugger-editor-checkbox';
                visible.checked = schema?.visible !== false;
                visible.addEventListener('change', (e) => {
                    e.stopPropagation();
                    view.setRoadVisibility?.(sel.roadId, visible.checked);
                });
                addEditorField({ labelText: 'visible', inputEl: visible });

                const del = makeButton('Delete road');
                del.classList.add('is-danger');
                del.addEventListener('click', (e) => {
                    e.preventDefault();
                    view.deleteRoad?.(sel.roadId);
                });
                addEditorButtonRow([del]);
            } else if (sel.type === 'point') {
                addEditorText(`Point · ${sel.pointId ?? '--'}`);
                if (pointSection.parentElement !== popupBody) popupBody.appendChild(pointSection);
            } else if (sel.type === 'junction' || sel.type === 'approach' || sel.type === 'connector') {
                const junctionId = sel.junctionId ?? null;
                const junction = derived?.junctions?.find?.((j) => j?.id === junctionId) ?? null;
                addEditorText(junction ? `Junction · ${junction.id}` : `Junction · ${junctionId ?? '--'}`);

                const toggle = makeButton((junction?.asphaltVisible ?? true) ? 'Hide asphalt' : 'Show asphalt');
                toggle.addEventListener('click', (e) => {
                    e.preventDefault();
                    view.toggleJunctionAsphaltVisibility?.(junctionId);
                });

                const del = makeButton(junction?.source === 'manual' ? 'Delete junction' : 'Suppress junction');
                del.classList.add('is-danger');
                del.addEventListener('click', (e) => {
                    e.preventDefault();
                    view.deleteJunction?.(junctionId);
                });

                addEditorButtonRow([toggle, del]);

                if (sel.type === 'connector' && sel.connectorId) {
                    const connector = derived?.junctions
                        ?.flatMap?.((j) => j?.connectors ?? [])
                        ?.find?.((c) => c?.id === sel.connectorId) ?? null;
                    const merge = makeButton('Merge into road');
                    merge.disabled = !(connector?.sameRoad) || !!connector?.mergedIntoRoad;
                    merge.addEventListener('click', (e) => {
                        e.preventDefault();
                        view.mergeConnectorIntoRoad?.(sel.connectorId);
                    });
                    addEditorButtonRow([merge]);
                }
            } else if (sel.type === 'segment' || sel.type === 'piece') {
                addEditorText(`${sel.type === 'piece' ? 'Piece' : 'Segment'} · ${sel.segmentId ?? '--'}`);
            } else {
                addEditorText(`${sel.type} selected.`);
            }
        } else if (popupMode === 'roads') {
            popupTitle.textContent = 'Roads';
            const lanesFValue = clampInt(draft?.lanesF ?? pendingRoadLanesF, 1, 5);
            const lanesBValue = clampInt(draft?.lanesB ?? pendingRoadLanesB, 0, 5);

            const lanesGroup = document.createElement('div');
            lanesGroup.className = 'road-debugger-lanes-group';

            const buildLaneStepper = ({ capText, value, min, max, onSet, title = '' }) => {
                const row = document.createElement('div');
                row.className = 'road-debugger-lane-stepper';
                if (title) row.title = title;

                const cap = document.createElement('div');
                cap.className = 'road-debugger-lane-stepper-cap';
                cap.textContent = capText;
                row.appendChild(cap);

                const dec = document.createElement('button');
                dec.type = 'button';
                dec.className = 'road-debugger-lane-stepper-btn';
                dec.textContent = '−';
                dec.disabled = value <= min;
                dec.addEventListener('click', (e) => {
                    e.preventDefault();
                    onSet(Math.max(min, value - 1));
                });
                row.appendChild(dec);

                const val = document.createElement('div');
                val.className = 'road-debugger-lane-stepper-value';
                val.textContent = String(value);
                row.appendChild(val);

                const inc = document.createElement('button');
                inc.type = 'button';
                inc.className = 'road-debugger-lane-stepper-btn';
                inc.textContent = '+';
                inc.disabled = value >= max;
                inc.addEventListener('click', (e) => {
                    e.preventDefault();
                    onSet(Math.min(max, value + 1));
                });
                row.appendChild(inc);

                return row;
            };

            const setLanesF = (next) => {
                const value = clampInt(next, 1, 5);
                pendingRoadLanesF = value;
                if (draftActive && draft?.id) view.setRoadLaneConfig?.(draft.id, { lanesF: value });
                else sync();
            };

            const setLanesB = (next) => {
                const value = clampInt(next, 0, 5);
                pendingRoadLanesB = value;
                if (draftActive && draft?.id) view.setRoadLaneConfig?.(draft.id, { lanesB: value });
                else sync();
            };

            lanesGroup.appendChild(buildLaneStepper({
                capText: 'F',
                value: lanesFValue,
                min: 1,
                max: 5,
                onSet: setLanesF,
                title: 'Forward lanes (relative to A → B direction). Forward lanes are on the right side of the divider centerline.'
            }));
            lanesGroup.appendChild(buildLaneStepper({
                capText: 'B',
                value: lanesBValue,
                min: 0,
                max: 5,
                onSet: setLanesB,
                title: 'Backward lanes (relative to A → B direction). Backward lanes are on the left side of the divider centerline. Set to 0 for one-way roads.'
            }));
            popupContent.appendChild(lanesGroup);

            addEditorText(draftActive
                ? `Drafting ${draft.name} · ${pts} point${pts === 1 ? '' : 's'} · click tiles to add points.`
                : 'Click New Road, then click tiles to place points.');

            newRoad.textContent = 'New Road';
            newRoad.title = 'Start drafting a new road (click tiles to add points).';
            cancel.title = 'Cancel the current draft road.';
            done.title = 'Finish the current draft road (requires at least 2 points).';

            if (draftActive) {
                cancel.style.display = '';
                done.style.display = '';
                cancel.disabled = false;
                done.disabled = pts < 2;
            } else {
                newRoad.style.display = '';
                newRoad.disabled = false;
            }
        } else {
            popupTitle.textContent = 'Junctions';
            addEditorText(junctionToolEnabled
                ? `Selecting junction points · ${fmtInt(selectedCount)} selected · drag a rectangle to multi-select · click to toggle · Done to create.`
                : 'Click New Junction, then click endpoints/corners (or drag a rectangle) to select points.');

            newRoad.textContent = 'New Junction';
            newRoad.title = 'Start selecting junction points (endpoints + corners).';
            done.title = 'Create a junction from the current selection.';
            cancel.title = 'Cancel junction creation.';

            if (junctionToolEnabled) {
                cancel.style.display = '';
                done.style.display = '';
                cancel.disabled = false;
                done.disabled = (!(selectedCount >= 2) && !singleIsCorner);

                popupCandidates.style.display = '';
                if (!selectedCandidates.length) {
                    const empty = document.createElement('div');
                    empty.className = 'road-debugger-placeholder';
                    empty.textContent = 'No selected candidates yet.';
                    popupCandidates.appendChild(empty);
                } else {
                    const derivedCandidates = derived?.junctionCandidates ?? null;
                    const endpoints = derivedCandidates?.endpoints ?? [];
                    const corners = derivedCandidates?.corners ?? [];
                    const endpointById = new Map(endpoints.map((c) => [c?.id, c]));
                    const cornerById = new Map(corners.map((c) => [c?.id, c]));
                    for (const id of selectedCandidates) {
                        const row = document.createElement('div');
                        row.className = 'road-debugger-candidate-row';
                        row.dataset.candidateId = id;
                        row.classList.toggle('is-hovered', view._junctionToolHoverCandidateId === id);

                        const isCorner = String(id).startsWith('corner_');
                        const cand = (isCorner ? cornerById.get(id) : endpointById.get(id)) ?? null;

                        const label = document.createElement('div');
                        label.className = 'road-debugger-candidate-label';
                        label.textContent = isCorner
                            ? `${id} · ${fmt((cand?.angleRad ?? 0) * 57.2958, 1)}°`
                            : `${id} · ${cand?.roadId ?? '--'} · ${cand?.end ?? '--'}`;
                        row.appendChild(label);

                        row.addEventListener('mouseenter', () => view.setJunctionToolHoverCandidate?.(id));
                        row.addEventListener('mouseleave', () => view.clearJunctionToolHoverCandidate?.(id));
                        row.addEventListener('click', (e) => {
                            e.preventDefault?.();
                            e.stopPropagation?.();
                            view.toggleJunctionToolCandidate?.(id);
                        });

                        popupCandidates.appendChild(row);
                    }
                }
            } else {
                newRoad.style.display = '';
                newRoad.disabled = false;
            }
        }

        if (isHelpOpen()) layoutHelp();
    };

    const setSelectedTangentFactor = (value) => {
        const derived = view.getDerived?.() ?? view._derived ?? null;
        const sel = view._selection ?? {};
        if (sel?.type !== 'point') return;
        const road = derived?.roads?.find?.((r) => r?.id === sel.roadId) ?? null;
        const pt = road?.points?.find?.((p) => p?.id === sel.pointId) ?? null;
        if (!pt) return;
        const next = Number(value);
        const safe = Number.isFinite(next) ? next : 1;
        tangentRange.value = String(safe);
        tangentNumber.value = String(safe);
        view.setPointTangentFactor?.(sel.roadId, sel.pointId, safe);
    };

    const onTangentRangeChange = (e) => {
        e.stopPropagation();
        setSelectedTangentFactor(tangentRange.value);
    };
    const onTangentNumberChange = (e) => {
        e.stopPropagation();
        setSelectedTangentFactor(tangentNumber.value);
    };

    tangentRange.addEventListener('change', onTangentRangeChange);
    tangentNumber.addEventListener('change', onTangentNumberChange);

    filterInfoBtn.addEventListener('click', (e) => {
        e.preventDefault();
        warningsFilter.info = !warningsFilter.info;
        sync();
    });
    filterWarningBtn.addEventListener('click', (e) => {
        e.preventDefault();
        warningsFilter.warning = !warningsFilter.warning;
        sync();
    });
    filterErrorBtn.addEventListener('click', (e) => {
        e.preventDefault();
        warningsFilter.error = !warningsFilter.error;
        sync();
    });
    selectionOnlyRow.input.addEventListener('change', () => sync());
    pickDebugRow.input.addEventListener('change', () => sync());

    sync();

    view.ui = {
        root,
        left,
        bottom,
        helpBtn,
        helpModal,
        helpClose,
        exitModal,
        exitCancel,
        exitConfirm,
        openExitConfirm,
        closeExitConfirm,
        isExitConfirmOpen,
        selectionRect,
        setSelectionRect: ({ x0, y0, x1, y1 }) => {
            const left = Math.min(Number(x0) || 0, Number(x1) || 0);
            const top = Math.min(Number(y0) || 0, Number(y1) || 0);
            const w = Math.abs((Number(x1) || 0) - (Number(x0) || 0));
            const h = Math.abs((Number(y1) || 0) - (Number(y0) || 0));
            selectionRect.style.display = '';
            selectionRect.style.left = `${Math.round(left)}px`;
            selectionRect.style.top = `${Math.round(top)}px`;
            selectionRect.style.width = `${Math.round(w)}px`;
            selectionRect.style.height = `${Math.round(h)}px`;
        },
        hideSelectionRect: () => {
            selectionRect.style.display = 'none';
        },
        gridToggle: gridRow.input,
        asphaltToggle: asphaltRow.input,
        markingsToggle: markingsRow.input,
        arrowTangentToggle: arrowTangentRow.input,
        dividerToggle: dividerRow.input,
        dirCenterToggle: dirCenterRow.input,
        edgesToggle: edgesRow.input,
        pointsToggle: pointsRow.input,
        snapToggle: snapRow.input,
        pickDebugToggle: pickDebugRow.input,
        pickDebugOverlay,
        trimThresholdRange,
        trimThresholdNumber,
        trimRawToggle: trimRawRow.input,
        trimStripsToggle: trimStripsRow.input,
        trimOverlapsToggle: trimOverlapsRow.input,
        trimIntervalsToggle: trimIntervalsRow.input,
        trimRemovedToggle: trimRemovedRow.input,
        trimKeptToggle: trimKeptRow.input,
        trimDroppedToggle: trimDroppedRow.input,
        trimHighlightToggle: trimHighlightRow.input,
        junctionEnabledToggle: junctionEnabledRow.input,
        junctionEndpointsToggle: junctionEndpointsRow.input,
        junctionBoundaryToggle: junctionBoundaryRow.input,
        junctionConnectorsToggle: junctionConnectorsRow.input,
        junctionEdgeOrderToggle: junctionEdgeOrderRow.input,
        vizTabRoads,
        vizTabJunctions,
        vizTabSegments,
        vizTabGrid,
        detailPanel,
        detailBody,
        popupTabEdit,
        popupTabRoads,
        popupTabJunctions,
        popupTitle,
        popupBody,
        popupContent,
        popupCandidates,
        warningsList,
        warningsSelectionOnly: selectionOnlyRow.input,
        warningsFilterInfoBtn: filterInfoBtn,
        warningsFilterWarningBtn: filterWarningBtn,
        warningsFilterErrorBtn: filterErrorBtn,
        roadsList,
        junctionsList,
        orbitPanel,
        orbitSurface,
        orbitReset,
        _onOrbitPointerDown: onOrbitPointerDown,
        _onOrbitPointerMove: onOrbitPointerMove,
        _onOrbitPointerUp: onOrbitPointerUp,
        _onOrbitReset: onOrbitReset,
        infoPanel,
        infoTitle,
        infoBody,
        pointSection,
        tangentRow,
        tangentRange,
        tangentNumber,
        sync,
        _onGridChange: onGridChange,
        _onAsphaltChange: onAsphaltChange,
        _onMarkingsChange: onMarkingsChange,
        _onArrowTangentChange: onArrowTangentChange,
        _onDividerChange: onDividerChange,
        _onDirCenterChange: onDirCenterChange,
        _onEdgesChange: onEdgesChange,
        _onPointsChange: onPointsChange,
        _onSnapChange: onSnapChange,
        _onTrimThresholdRangeChange: onTrimThresholdRangeChange,
        _onTrimThresholdNumberChange: onTrimThresholdNumberChange,
        _onTrimRawChange: onTrimRawChange,
        _onTrimStripsChange: onTrimStripsChange,
        _onTrimOverlapsChange: onTrimOverlapsChange,
        _onTrimIntervalsChange: onTrimIntervalsChange,
        _onTrimRemovedChange: onTrimRemovedChange,
        _onTrimKeptChange: onTrimKeptChange,
        _onTrimDroppedChange: onTrimDroppedChange,
        _onTrimHighlightChange: onTrimHighlightChange,
        _onJunctionEnabledChange: onJunctionEnabledChange,
        _onJunctionEndpointsChange: onJunctionEndpointsChange,
        _onJunctionBoundaryChange: onJunctionBoundaryChange,
        _onJunctionConnectorsChange: onJunctionConnectorsChange,
        _onJunctionEdgeOrderChange: onJunctionEdgeOrderChange,
        _onVizTabRoads: onVizTabRoads,
        _onVizTabJunctions: onVizTabJunctions,
        _onVizTabSegments: onVizTabSegments,
        _onVizTabGrid: onVizTabGrid,
        _onPopupTabEdit: onPopupTabEdit,
        _onPopupTabRoads: onPopupTabRoads,
        _onPopupTabJunctions: onPopupTabJunctions,
        _onHelp: onHelp,
        _onHelpClose: onHelpClose,
        _onResize: onResize,
        _onUndo: onUndo,
        _onRedo: onRedo,
        _onExport: onExport,
        _onImport: onImport,
        _onNewRoad: onNewRoad,
        _onDone: onDone,
        _onCancel: onCancel,
        _onRoadsLeave: onRoadsLeave,
        _onJunctionsLeave: onJunctionsLeave,
        _onTangentRangeChange: onTangentRangeChange,
        _onTangentNumberChange: onTangentNumberChange,
        _onSchemaClose: onSchemaClose,
        _onSchemaApply: onSchemaApply,
        _onExitCancel: onExitCancel,
        _onExitConfirm: onExitConfirm,
        _closeSchemaModal: closeSchemaModal,
        schemaModal,
        schemaClose,
        schemaApply,
        schemaTextarea
    };
}

export function destroyUI(view) {
    const ui = view.ui ?? null;
    if (!ui) return;

    window.removeEventListener('resize', ui._onResize);
    ui.orbitSurface?.removeEventListener?.('pointerdown', ui._onOrbitPointerDown);
    ui.orbitSurface?.removeEventListener?.('pointermove', ui._onOrbitPointerMove);
    ui.orbitSurface?.removeEventListener?.('pointerup', ui._onOrbitPointerUp);
    ui.orbitSurface?.removeEventListener?.('pointercancel', ui._onOrbitPointerUp);
    ui.orbitReset?.removeEventListener?.('click', ui._onOrbitReset);
    ui.helpBtn?.removeEventListener?.('click', ui._onHelp);
    ui.helpClose?.removeEventListener?.('click', ui._onHelpClose);
    ui.gridToggle?.removeEventListener?.('change', ui._onGridChange);
    ui.asphaltToggle?.removeEventListener?.('change', ui._onAsphaltChange);
    ui.markingsToggle?.removeEventListener?.('change', ui._onMarkingsChange);
    ui.arrowTangentToggle?.removeEventListener?.('change', ui._onArrowTangentChange);
    ui.dividerToggle?.removeEventListener?.('change', ui._onDividerChange);
    ui.dirCenterToggle?.removeEventListener?.('change', ui._onDirCenterChange);
    ui.edgesToggle?.removeEventListener?.('change', ui._onEdgesChange);
    ui.pointsToggle?.removeEventListener?.('change', ui._onPointsChange);
    ui.snapToggle?.removeEventListener?.('change', ui._onSnapChange);
    ui.trimThresholdRange?.removeEventListener?.('input', ui._onTrimThresholdRangeChange);
    ui.trimThresholdNumber?.removeEventListener?.('change', ui._onTrimThresholdNumberChange);
    ui.trimRawToggle?.removeEventListener?.('change', ui._onTrimRawChange);
    ui.trimStripsToggle?.removeEventListener?.('change', ui._onTrimStripsChange);
    ui.trimOverlapsToggle?.removeEventListener?.('change', ui._onTrimOverlapsChange);
    ui.trimIntervalsToggle?.removeEventListener?.('change', ui._onTrimIntervalsChange);
    ui.trimRemovedToggle?.removeEventListener?.('change', ui._onTrimRemovedChange);
    ui.trimKeptToggle?.removeEventListener?.('change', ui._onTrimKeptChange);
    ui.trimDroppedToggle?.removeEventListener?.('change', ui._onTrimDroppedChange);
    ui.trimHighlightToggle?.removeEventListener?.('change', ui._onTrimHighlightChange);
    ui.junctionEnabledToggle?.removeEventListener?.('change', ui._onJunctionEnabledChange);
    ui.junctionEndpointsToggle?.removeEventListener?.('change', ui._onJunctionEndpointsChange);
    ui.junctionBoundaryToggle?.removeEventListener?.('change', ui._onJunctionBoundaryChange);
    ui.junctionConnectorsToggle?.removeEventListener?.('change', ui._onJunctionConnectorsChange);
    ui.junctionEdgeOrderToggle?.removeEventListener?.('change', ui._onJunctionEdgeOrderChange);
    ui.vizTabRoads?.removeEventListener?.('click', ui._onVizTabRoads);
    ui.vizTabJunctions?.removeEventListener?.('click', ui._onVizTabJunctions);
    ui.vizTabSegments?.removeEventListener?.('click', ui._onVizTabSegments);
    ui.vizTabGrid?.removeEventListener?.('click', ui._onVizTabGrid);
    ui.popupTabRoads?.removeEventListener?.('click', ui._onPopupTabRoads);
    ui.popupTabJunctions?.removeEventListener?.('click', ui._onPopupTabJunctions);
    ui.roadsList?.removeEventListener?.('mouseleave', ui._onRoadsLeave);
    ui.junctionsList?.removeEventListener?.('mouseleave', ui._onJunctionsLeave);
    ui.tangentRange?.removeEventListener?.('change', ui._onTangentRangeChange);
    ui.tangentNumber?.removeEventListener?.('change', ui._onTangentNumberChange);
    ui.schemaClose?.removeEventListener?.('click', ui._onSchemaClose);
    ui.schemaApply?.removeEventListener?.('click', ui._onSchemaApply);
    ui.exitCancel?.removeEventListener?.('click', ui._onExitCancel);
    ui.exitConfirm?.removeEventListener?.('click', ui._onExitConfirm);
    ui.schemaModal?.remove?.();
    if (ui.root?.isConnected) ui.root.remove();
    view.ui = null;
}
