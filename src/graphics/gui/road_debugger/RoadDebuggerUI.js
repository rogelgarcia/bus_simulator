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
        return appendJunctionToolInfo({
            title: `${highlight.source}: Point`,
            text: [
                `id: ${pt.id}`,
                `road: ${road?.id ?? highlight.roadId ?? '--'}`,
                `tile: ${fmtInt(pt.tileX)}, ${fmtInt(pt.tileY)}`,
                `offset: ${fmt(pt.offsetX, 2)}, ${fmt(pt.offsetY, 2)}`,
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

    const options = document.createElement('div');
    options.className = 'road-debugger-section';

    const optionsTitle = document.createElement('div');
    optionsTitle.className = 'road-debugger-section-title';
    optionsTitle.textContent = 'View';
    options.appendChild(optionsTitle);

    const viewToggles = document.createElement('div');
    viewToggles.className = 'road-debugger-toggle-grid';
    options.appendChild(viewToggles);

    const gridRow = makeToggleRow('Grid');
    gridRow.row.title = 'Show the world tile grid (visual reference for snapping and offsets).';
    viewToggles.appendChild(gridRow.row);
    const asphaltRow = makeToggleRow('Asphalt');
    asphaltRow.row.title = 'Render the asphalt surface polygons (uses trimmed kept pieces).';
    viewToggles.appendChild(asphaltRow.row);
    const markingsRow = makeToggleRow('Markings');
    markingsRow.row.title = 'Render lane markings and direction arrows along kept asphalt pieces.';
    viewToggles.appendChild(markingsRow.row);
    const arrowTangentRow = makeToggleRow('Arrow tangents');
    arrowTangentRow.row.title = 'Render short tangent lines at lane arrow centers to validate orientation.';
    viewToggles.appendChild(arrowTangentRow.row);
    const dividerRow = makeToggleRow('Divider centerline');
    dividerRow.row.title = 'Show the middle divider centerline (road reference line).';
    viewToggles.appendChild(dividerRow.row);
    const dirCenterRow = makeToggleRow('Direction centerlines');
    dirCenterRow.row.title = 'Show per-direction centerlines inside lanes (same color for both directions).';
    viewToggles.appendChild(dirCenterRow.row);
    const edgesRow = makeToggleRow('Edges');
    edgesRow.row.title = 'Show lane edges and asphalt edges derived from lane counts + margin.';
    viewToggles.appendChild(edgesRow.row);
    const pointsRow = makeToggleRow('Points');
    pointsRow.row.title = 'Show derived point markers for debugging.';
    viewToggles.appendChild(pointsRow.row);
    const snapRow = makeToggleRow('Snap');
    snapRow.row.title = 'Snap point movement/placement to tile/10 grid. Hold Alt to temporarily disable. Hold Shift to axis-lock.';
    viewToggles.appendChild(snapRow.row);
    left.appendChild(options);

    const trimSection = document.createElement('div');
    trimSection.className = 'road-debugger-section';
    const trimTitle = document.createElement('div');
    trimTitle.className = 'road-debugger-section-title';
    trimTitle.textContent = 'Trim';
    trimSection.appendChild(trimTitle);

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
    trimThresholdRange.max = '0.5';
    trimThresholdRange.step = '0.01';
    trimThresholdRange.className = 'road-debugger-tangent-range';
    const trimThresholdNumber = document.createElement('input');
    trimThresholdNumber.type = 'number';
    trimThresholdNumber.min = '0';
    trimThresholdNumber.max = '0.5';
    trimThresholdNumber.step = '0.01';
    trimThresholdNumber.className = 'road-debugger-tangent-number';
    trimThresholdInputs.appendChild(trimThresholdRange);
    trimThresholdInputs.appendChild(trimThresholdNumber);
    trimThresholdRow.appendChild(trimThresholdLabel);
    trimThresholdRow.appendChild(trimThresholdInputs);
    trimSection.appendChild(trimThresholdRow);

    const trimToggles = document.createElement('div');
    trimToggles.className = 'road-debugger-toggle-grid';
    trimSection.appendChild(trimToggles);

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

    left.appendChild(trimSection);

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

    const junctionToggles = document.createElement('div');
    junctionToggles.className = 'road-debugger-toggle-grid';
    junctionsSection.appendChild(junctionToggles);

    const junctionEnabledRow = makeToggleRow('Junctions');
    junctionEnabledRow.row.title = 'Enable junction detection and junction surface rendering (fills trimmed gaps).';
    junctionToggles.appendChild(junctionEnabledRow.row);

    const junctionEndpointsRow = makeToggleRow('Endpoints');
    junctionEndpointsRow.row.title = 'Show junction endpoint markers (centerline endpoints of kept pieces).';
    junctionToggles.appendChild(junctionEndpointsRow.row);

    const junctionBoundaryRow = makeToggleRow('Boundary');
    junctionBoundaryRow.row.title = 'Show the stitched junction boundary polyline.';
    junctionToggles.appendChild(junctionBoundaryRow.row);

    const junctionConnectorsRow = makeToggleRow('Connectors');
    junctionConnectorsRow.row.title = 'Show connector edge lines for each junction (movement graph preview).';
    junctionToggles.appendChild(junctionConnectorsRow.row);

    const junctionEdgeOrderRow = makeToggleRow('Edge order');
    junctionEdgeOrderRow.row.title = 'Show the endpoint ordering used to stitch the junction boundary.';
    junctionToggles.appendChild(junctionEdgeOrderRow.row);

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

    left.appendChild(pointSection);

    const controlsHint = document.createElement('div');
    controlsHint.className = 'road-debugger-hint';
    controlsHint.textContent = 'Click: select / add points · Drag: pan / move points · Junctions: drag box selects candidates (Shift adds) · Wheel/A/Z: zoom · Shift: axis lock · Alt: snap off · Esc: exit';
    left.appendChild(controlsHint);

    const selectionRect = document.createElement('div');
    selectionRect.className = 'road-debugger-selection-rect';
    selectionRect.style.display = 'none';
    root.appendChild(selectionRect);

    const bottom = document.createElement('div');
    bottom.className = 'road-debugger-popup';

    const popupTabs = document.createElement('div');
    popupTabs.className = 'road-debugger-popup-tabs';
    const popupTabRoads = makeButton('Roads');
    popupTabRoads.classList.add('road-debugger-popup-tab');
    popupTabRoads.title = 'Road drafting workflow.';
    const popupTabJunctions = makeButton('Junctions');
    popupTabJunctions.classList.add('road-debugger-popup-tab');
    popupTabJunctions.title = 'Junction creation workflow.';
    popupTabs.appendChild(popupTabRoads);
    popupTabs.appendChild(popupTabJunctions);
    bottom.appendChild(popupTabs);

    const popupTitle = document.createElement('div');
    popupTitle.className = 'road-debugger-popup-title';
    popupTitle.textContent = 'Roads';
    bottom.appendChild(popupTitle);

    const popupBody = document.createElement('div');
    popupBody.className = 'road-debugger-popup-body';
    bottom.appendChild(popupBody);

    const popupCandidates = document.createElement('div');
    popupCandidates.className = 'road-debugger-popup-candidates';
    popupCandidates.style.display = 'none';
    bottom.appendChild(popupCandidates);

    const actions = document.createElement('div');
    actions.className = 'road-debugger-actions';
    const newRoad = makeButton('New road');
    newRoad.title = 'Start drafting a new road (click tiles to add points).';
    const done = makeButton('Done');
    done.title = 'Finish the current draft road (requires at least 2 points).';
    const cancel = makeButton('Cancel');
    cancel.title = 'Cancel the current draft road.';
    actions.appendChild(newRoad);
    actions.appendChild(done);
    actions.appendChild(cancel);
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

    const expandedRoads = new Set();
    const expandedJunctions = new Set();
    let popupMode = 'roads';

    const finalizePopupMode = () => {
        if (popupMode === 'roads') {
            const draft = view.getDraftRoad?.() ?? view._draft ?? null;
            if (!draft) return;
            view.finishRoadDraft();
            const stillDraft = view.getDraftRoad?.() ?? view._draft ?? null;
            if (stillDraft) view.cancelRoadDraft();
            return;
        }

        const enabled = view.getJunctionToolEnabled?.() ?? view._junctionToolEnabled === true;
        if (!enabled) return;
        view.createJunctionFromToolSelection?.();
        view.setJunctionToolEnabled?.(false);
    };

    const setPopupMode = (nextMode) => {
        const next = nextMode === 'junctions' ? 'junctions' : 'roads';
        if (next === popupMode) return;
        finalizePopupMode();
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
        const next = clamp(trimThresholdRange.value, 0, 0.5);
        trimThresholdRange.value = String(next);
        trimThresholdNumber.value = String(next);
        view.setTrimThresholdFactor?.(next);
    };
    const onTrimThresholdNumberChange = (e) => {
        e.stopPropagation();
        const next = clamp(trimThresholdNumber.value, 0, 0.5);
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
        if (popupMode === 'roads') view.startRoadDraft();
        else view.setJunctionToolEnabled?.(true);
    };
    const onDone = (e) => {
        e.preventDefault();
        if (popupMode === 'roads') view.finishRoadDraft();
        else {
            const ok = view.createJunctionFromToolSelection?.() ?? false;
            if (ok) view.setJunctionToolEnabled?.(false);
        }
    };
    const onCancel = (e) => {
        e.preventDefault();
        if (popupMode === 'roads') view.cancelRoadDraft();
        else view.setJunctionToolEnabled?.(false);
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
    helpBtn.addEventListener('click', onHelp);
    helpClose.addEventListener('click', onHelpClose);
    undoBtn.addEventListener('click', onUndo);
    redoBtn.addEventListener('click', onRedo);
    exportBtn.addEventListener('click', onExport);
    importBtn.addEventListener('click', onImport);
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

    const buildRoadRow = ({ road, isDraft, derived }) => {
        const row = document.createElement('div');
        row.className = 'road-debugger-road-row road-debugger-road-row-single';
        row.dataset.roadId = road.id;
        if (isDraft) row.classList.add('is-draft');
        const isVisible = road?.visible !== false;
        row.classList.toggle('is-hidden', !isVisible);

        const main = document.createElement('div');
        main.className = 'road-debugger-road-main';

        const exp = document.createElement('button');
        exp.type = 'button';
        exp.className = 'road-debugger-expand';
        exp.textContent = expandedRoads.has(road.id) ? '▾' : '▸';
        exp.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (expandedRoads.has(road.id)) expandedRoads.delete(road.id);
            else expandedRoads.add(road.id);
            sync();
        });
        main.appendChild(exp);

        const label = document.createElement('div');
        label.className = 'road-debugger-road-label';
        label.textContent = isDraft ? `${road.name} (draft)` : road.name;
        main.appendChild(label);

        const meta = document.createElement('div');
        meta.className = 'road-debugger-road-meta';
        meta.textContent = road.id;
        main.appendChild(meta);

        row.appendChild(main);

        const right = document.createElement('div');
        right.className = 'road-debugger-road-right';

        const lanes = document.createElement('div');
        lanes.className = 'road-debugger-road-lanes';

	        const makeLane = (capText, key, value) => {
	            const wrap = document.createElement('label');
	            wrap.className = 'road-debugger-lane-wrap';
	            const cap = document.createElement('span');
	            cap.className = 'road-debugger-lane-cap';
	            cap.textContent = capText;
	            const input = document.createElement('input');
	            input.type = 'number';
	            const min = key === 'B' ? 0 : 1;
	            input.min = String(min);
	            input.max = '5';
	            input.step = '1';
	            input.className = 'road-debugger-lane-input';
	            input.value = String(clampInt(value, min, 5));
	            input.title = key === 'F'
	                ? 'Forward lane count (relative to A → B direction). Forward lanes are on the right side of the divider centerline.'
	                : 'Backward lane count (relative to A → B direction). Backward lanes are on the left side of the divider centerline. Set to 0 for one-way roads.';
	            input.addEventListener('click', (e) => e.stopPropagation());
	            input.addEventListener('change', (e) => {
	                e.stopPropagation();
	                const next = clampInt(input.value, min, 5);
	                input.value = String(next);
	                if (key === 'F') view.setRoadLaneConfig(road.id, { lanesF: next });
	                else view.setRoadLaneConfig(road.id, { lanesB: next });
	            });
	            wrap.appendChild(cap);
	            wrap.appendChild(input);
	            return wrap;
	        };

        lanes.appendChild(makeLane('F', 'F', road.lanesF));
        lanes.appendChild(makeLane('B', 'B', road.lanesB));
        right.appendChild(lanes);

        const actions = document.createElement('div');
        actions.className = 'road-debugger-road-actions';

        const vis = document.createElement('input');
        vis.type = 'checkbox';
        vis.className = 'road-debugger-road-visible';
        vis.checked = isVisible;
        vis.title = 'Toggle visibility (hides rendering only; still used for trimming/crossing calculations).';
        vis.addEventListener('click', (e) => e.stopPropagation());
        vis.addEventListener('change', (e) => {
            e.stopPropagation();
            view.setRoadVisibility?.(road.id, vis.checked);
        });
        actions.appendChild(vis);

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'road-debugger-road-delete';
        del.textContent = '✕';
        del.title = isDraft ? 'Cancel draft road.' : 'Delete road.';
        del.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            view.deleteRoad?.(road.id);
        });
        actions.appendChild(del);

        right.appendChild(actions);
        row.appendChild(right);

        const isSelected = view._selection?.roadId === road.id && !!view._selection?.type;
        const isHovered = view._hover?.roadId === road.id;
        row.classList.toggle('is-selected', !!isSelected);
        row.classList.toggle('is-hovered', !!isHovered);

        row.addEventListener('mouseenter', () => view.setHoverRoad(road.id));
        row.addEventListener('mouseleave', () => {
            if (view._hover?.roadId === road.id && !view._hover?.segmentId && !view._hover?.pointId) view.clearHover();
        });
        row.addEventListener('click', () => view.selectRoad(road.id));
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
        row.addEventListener('click', () => view.selectSegment(seg.id));
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
        meta.textContent = `tile ${fmtInt(pt.tileX)}, ${fmtInt(pt.tileY)} · off ${fmt(pt.offsetX, 2)}, ${fmt(pt.offsetY, 2)}`;
        row.appendChild(meta);

        const isSelected = view._selection?.type === 'point' && view._selection?.roadId === roadId && view._selection?.pointId === pt.id;
        const isHovered = view._hover?.roadId === roadId && view._hover?.pointId === pt.id;
        row.classList.toggle('is-selected', !!isSelected);
        row.classList.toggle('is-hovered', !!isHovered);

        row.addEventListener('mouseenter', () => view.setHoverPoint?.(roadId, pt.id));
        row.addEventListener('mouseleave', () => {
            if (view._hover?.roadId === roadId && view._hover?.pointId === pt.id) view.clearHover();
        });
        row.addEventListener('click', () => view.selectPoint?.(roadId, pt.id));
        return row;
    };

    const buildJunctionRow = ({ junction }) => {
        const row = document.createElement('div');
        row.className = 'road-debugger-road-row road-debugger-junction-row road-debugger-road-row-single';
        row.dataset.junctionId = junction.id;

        const main = document.createElement('div');
        main.className = 'road-debugger-road-main';

        const exp = document.createElement('button');
        exp.type = 'button';
        exp.className = 'road-debugger-expand';
        exp.textContent = expandedJunctions.has(junction.id) ? '▾' : '▸';
        exp.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (expandedJunctions.has(junction.id)) expandedJunctions.delete(junction.id);
            else expandedJunctions.add(junction.id);
            sync();
        });
        main.appendChild(exp);

        const label = document.createElement('div');
        label.className = 'road-debugger-road-label';
        const ends = junction?.endpoints?.length ?? 0;
        const connList = junction?.connectors ?? [];
        const conns = connList.length;
        const mergedCount = connList.filter((c) => c?.mergedIntoRoad).length;
        const activeCount = conns - mergedCount;
        const source = junction?.source ?? 'auto';
        label.textContent = `Junction · ${source} · ${fmtInt(ends)} approaches · ${fmtInt(activeCount)} movements${mergedCount ? ` · ${fmtInt(mergedCount)} merged` : ''}`;
        main.appendChild(label);

        const meta = document.createElement('div');
        meta.className = 'road-debugger-road-meta';
        meta.textContent = junction.id;
        main.appendChild(meta);

        row.appendChild(main);

        const right = document.createElement('div');
        right.className = 'road-debugger-road-right';

        const actions = document.createElement('div');
        actions.className = 'road-debugger-junction-actions';

        const asphaltVisible = junction?.asphaltVisible !== false;
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'road-debugger-junction-action';
        toggle.textContent = asphaltVisible ? 'Hide' : 'Show';
        toggle.title = asphaltVisible ? 'Hide this junction asphalt surface.' : 'Show this junction asphalt surface.';
        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            view.toggleJunctionAsphaltVisibility?.(junction.id);
        });
        actions.appendChild(toggle);

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'road-debugger-junction-action is-danger';
        const isManual = source === 'manual';
        del.textContent = isManual ? 'Delete' : 'Suppress';
        del.title = isManual
            ? 'Delete this authored junction.'
            : 'Suppress this auto junction (it will not regenerate).';
        del.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            view.deleteJunction?.(junction.id);
        });
        actions.appendChild(del);

        right.appendChild(actions);
        row.appendChild(right);

        const isSelected = view._selection?.type === 'junction' && view._selection?.junctionId === junction.id;
        const isHovered = view._hover?.junctionId === junction.id && !view._hover?.connectorId && !view._hover?.approachId;
        row.classList.toggle('is-selected', !!isSelected);
        row.classList.toggle('is-hovered', !!isHovered);
        row.classList.toggle('is-hidden', junction?.asphaltVisible === false);

        row.addEventListener('mouseenter', () => view.setHoverJunction?.(junction.id));
        row.addEventListener('mouseleave', () => {
            if (view._hover?.junctionId === junction.id && !view._hover?.connectorId && !view._hover?.approachId) view.clearHover();
        });
        row.addEventListener('click', () => view.selectJunction?.(junction.id));
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
        row.addEventListener('click', () => view.selectApproach?.(junctionId, endpoint?.id));

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
        row.addEventListener('click', () => view.selectConnector?.(connector.id));
        return row;
    };

    let roadsListKey = null;

    const sync = () => {
        gridRow.input.checked = view._gridEnabled !== false;
        asphaltRow.input.checked = view._renderOptions?.asphalt !== false;
        markingsRow.input.checked = view._renderOptions?.markings === true;
        arrowTangentRow.input.checked = view.getArrowTangentDebugEnabled?.() ?? view._arrowTangentDebugEnabled === true;
        dividerRow.input.checked = view._renderOptions?.centerline !== false;
        dirCenterRow.input.checked = view._renderOptions?.directionCenterlines !== false;
        edgesRow.input.checked = view._renderOptions?.edges !== false;
        pointsRow.input.checked = view._renderOptions?.points !== false;
        snapRow.input.checked = view.getSnapEnabled?.() ?? view._snapEnabled !== false;
        undoBtn.disabled = !(view.canUndo?.() ?? false);
        redoBtn.disabled = !(view.canRedo?.() ?? false);

        const trimFactor = clamp(view.getTrimThresholdFactor?.() ?? view._trimThresholdFactor ?? 0.1, 0, 0.5);
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

        junctionEnabledRow.input.checked = view.getJunctionEnabled?.() ?? view._junctionEnabled !== false;
        const junctionDebug = view.getJunctionDebugOptions?.() ?? view._junctionDebug ?? {};
        junctionEndpointsRow.input.checked = !!junctionDebug.endpoints;
        junctionBoundaryRow.input.checked = !!junctionDebug.boundary;
        junctionConnectorsRow.input.checked = !!junctionDebug.connectors;
        junctionEdgeOrderRow.input.checked = !!junctionDebug.edgeOrder;

        const junctionToolEnabled = view.getJunctionToolEnabled?.() ?? view._junctionToolEnabled === true;
        const selectedCandidates = view.getJunctionToolSelection?.() ?? Array.from(view._junctionToolSelectedCandidateIds ?? []).sort();
        const selectedCount = selectedCandidates.length;
        const singleIsCorner = selectedCount === 1 && String(selectedCandidates[0] ?? '').startsWith('corner_');

        const info = highlightInfo(view);
        infoTitle.textContent = info.title;
        infoBody.textContent = info.text;

        const derived = view.getDerived?.() ?? view._derived ?? null;
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
        if (selPoint) {
            pointSection.style.display = '';
            const factor = Number.isFinite(selPoint.tangentFactor) ? selPoint.tangentFactor : 1;
            tangentRange.value = String(factor);
            tangentNumber.value = String(factor);
        } else {
            pointSection.style.display = 'none';
        }

        const draft = view.getDraftRoad?.() ?? view._draft ?? null;
        const roads = view.getRoads?.() ?? view._roads ?? [];
        const all = draft ? [draft, ...roads] : roads;

        if (view._hover?.segmentId && view._hover?.roadId) expandedRoads.add(view._hover.roadId);
        if (view._hover?.pointId && view._hover?.roadId) expandedRoads.add(view._hover.roadId);
        if ((view._selection?.type === 'segment' || view._selection?.type === 'piece') && view._selection?.roadId) expandedRoads.add(view._selection.roadId);
        if (view._selection?.type === 'point' && view._selection?.roadId) expandedRoads.add(view._selection.roadId);

        const nextKeyParts = [];
        for (const road of all) {
            if (!road?.id) continue;
            const expanded = expandedRoads.has(road.id);
            const isDraft = draft?.id === road.id;
            const visible = road.visible !== false;
            const lanesF = fmtInt(road.lanesF);
            const lanesB = fmtInt(road.lanesB);
            let expandedDetails = '';
            if (expanded) {
                const derivedRoad = derived?.roads?.find?.((r) => r?.id === road.id) ?? null;
                const pts = derivedRoad?.points ?? [];
                const ptIds = pts.map((p) => p?.id ?? '').join(',');
                const segIds = (derived?.segments?.filter?.((s) => s?.roadId === road.id) ?? []).map((s) => s?.id ?? '').join(',');
                expandedDetails = `|pts:${ptIds}|segs:${segIds}`;
            }
            nextKeyParts.push(`${road.id}:${isDraft ? 1 : 0}:${expanded ? 1 : 0}:${visible ? 1 : 0}:${lanesF}:${lanesB}${expandedDetails}`);
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
                roadsList.appendChild(buildRoadRow({ road, isDraft, derived }));

                if (expandedRoads.has(road.id)) {
                    const derivedRoad = derived?.roads?.find?.((r) => r?.id === road.id) ?? null;
                    const pts = derivedRoad?.points ?? [];
                    for (let i = 0; i < pts.length; i++) roadsList.appendChild(buildPointRow({ roadId: road.id, pt: pts[i], index: i }));
                    const segs = derived?.segments?.filter?.((s) => s?.roadId === road.id) ?? [];
                    for (const seg of segs) roadsList.appendChild(buildSegmentRow({ seg }));
                }
            }

            roadsListKey = nextRoadsListKey;
        } else {
            const sel = view._selection ?? {};
            const hover = view._hover ?? {};
            for (const row of roadsList.querySelectorAll('.road-debugger-road-row[data-road-id]')) {
                const roadId = row?.dataset?.roadId ?? null;
                if (!roadId) continue;
                row.classList.toggle('is-selected', !!sel.type && sel.roadId === roadId);
                row.classList.toggle('is-hovered', hover.roadId === roadId);
            }
            for (const row of roadsList.querySelectorAll('.road-debugger-seg-row[data-segment-id]')) {
                const segId = row?.dataset?.segmentId ?? null;
                if (!segId) continue;
                const selected = (sel.type === 'segment' || sel.type === 'piece') && sel.segmentId === segId;
                row.classList.toggle('is-selected', !!selected);
                row.classList.toggle('is-hovered', hover.segmentId === segId);
            }
            for (const row of roadsList.querySelectorAll('.road-debugger-point-row[data-point-id]')) {
                const roadId = row?.dataset?.roadId ?? null;
                const pointId = row?.dataset?.pointId ?? null;
                if (!roadId || !pointId) continue;
                const selected = sel.type === 'point' && sel.roadId === roadId && sel.pointId === pointId;
                const hovered = hover.roadId === roadId && hover.pointId === pointId;
                row.classList.toggle('is-selected', !!selected);
                row.classList.toggle('is-hovered', !!hovered);
            }
        }

        junctionsList.textContent = '';
        const junctions = derived?.junctions ?? [];
        const junctionIds = new Set(junctions.map((j) => j?.id).filter(Boolean));
        for (const id of Array.from(expandedJunctions)) {
            if (!junctionIds.has(id)) expandedJunctions.delete(id);
        }
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
                if (expandedJunctions.has(junction.id)) {
                    const endpoints = junction?.endpoints ?? [];
                    if (endpoints.length) {
                        junctionsList.appendChild(buildJunctionSubheadRow({
                            text: `Approaches (${fmtInt(endpoints.length)})`,
                            title: 'Approach: a road piece endpoint participating in this junction.'
                        }));
                    }
                    for (const endpoint of endpoints) {
                        if (!endpoint?.id) continue;
                        junctionsList.appendChild(buildJunctionEndpointRow({ endpoint, junctionId: junction.id }));
                    }
                    const conns = junction?.connectors ?? [];
                    const active = conns.filter((c) => c?.id && !c?.mergedIntoRoad);
                    const merged = conns.filter((c) => c?.id && !!c?.mergedIntoRoad);

                    if (active.length) {
                        junctionsList.appendChild(buildJunctionSubheadRow({
                            text: `Movements (${fmtInt(active.length)})`,
                            title: 'Movement: a connector edge between two approaches (topology/turn option).'
                        }));
                    }
                    for (const conn of active) junctionsList.appendChild(buildConnectorRow({ connector: conn, junction }));

                    if (merged.length) {
                        junctionsList.appendChild(buildJunctionSubheadRow({
                            text: `Merged into road (${fmtInt(merged.length)})`,
                            title: 'Continuity: same-road movements merged into their parent road (hidden from movements).'
                        }));
                        for (const conn of merged) junctionsList.appendChild(buildConnectorRow({ connector: conn, junction }));
                    }
                }
            }
        }

        const draftActive = !!draft;
        const pts = draft?.points?.length ?? 0;
        popupTabRoads.classList.toggle('is-active', popupMode === 'roads');
        popupTabJunctions.classList.toggle('is-active', popupMode === 'junctions');

        if (popupMode === 'roads') {
            popupTitle.textContent = 'Roads';
            popupBody.textContent = draftActive
                ? `Drafting ${draft.name} · ${pts} point${pts === 1 ? '' : 's'} · click tiles to add points.`
                : 'Start a new road, then click tiles to place points.';

            popupCandidates.style.display = 'none';
            popupCandidates.textContent = '';

            newRoad.textContent = 'New road';
            newRoad.title = 'Start drafting a new road (click tiles to add points).';
            done.title = 'Finish the current draft road (requires at least 2 points).';
            cancel.title = 'Cancel the current draft road.';

            newRoad.disabled = draftActive;
            done.disabled = !draftActive || pts < 2;
            cancel.disabled = !draftActive;
        } else {
            popupTitle.textContent = 'Junctions';
            popupBody.textContent = junctionToolEnabled
                ? `Selecting junction points · ${fmtInt(selectedCount)} selected · drag a red rectangle to multi-select · click to toggle · Done to create.`
                : 'Start a new junction, then click endpoints/corners (or drag a red rectangle) to select points.';

            newRoad.textContent = 'New junction';
            newRoad.title = 'Start selecting junction points (endpoints + corners).';
            done.title = 'Create a junction from the current selection.';
            cancel.title = 'Cancel junction creation (exits selection mode).';

            newRoad.disabled = junctionToolEnabled;
            done.disabled = !junctionToolEnabled || (!(selectedCount >= 2) && !singleIsCorner);
            cancel.disabled = !junctionToolEnabled;

            popupCandidates.style.display = junctionToolEnabled ? '' : 'none';
            popupCandidates.textContent = '';
            if (junctionToolEnabled) {
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
        popupTabRoads,
        popupTabJunctions,
        popupTitle,
        popupBody,
        popupCandidates,
        roadsList,
        expandedRoads,
        junctionsList,
        expandedJunctions,
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
