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

    const highlight = sel?.type
        ? { source: 'Selected', type: sel.type, roadId: sel.roadId ?? null, segmentId: sel.segmentId ?? null, pointId: sel.pointId ?? null, pieceId: sel.pieceId ?? null }
        : hover?.segmentId
            ? { source: 'Hovered', type: 'segment', roadId: hover.roadId ?? null, segmentId: hover.segmentId ?? null, pointId: null, pieceId: null }
            : hover?.roadId
                ? { source: 'Hovered', type: 'road', roadId: hover.roadId ?? null, segmentId: null, pointId: null, pieceId: null }
                : null;

    if (!highlight) return { title: 'Info', text: '—' };

    if (highlight.type === 'road') {
        const road = derived?.roads?.find?.((r) => r?.id === highlight.roadId) ?? null;
        if (!road) return { title: `${highlight.source}: Road`, text: `Road: ${highlight.roadId ?? '--'}` };
        const lanesF = Number(road.lanesF) || 0;
        const lanesB = Number(road.lanesB) || 0;
        const wR = lanesF * laneWidth + margin;
        const wL = lanesB * laneWidth + margin;
        const total = wL + wR;
        const segCount = derived?.segments?.filter?.((s) => s?.roadId === road.id)?.length ?? 0;
        const ptCount = road?.points?.length ?? 0;
        const schemaRoad = schemaRoadById(road.id);
        const visible = schemaRoad?.visible !== false;
        return {
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
        };
    }

    if (highlight.type === 'segment') {
        const seg = derived?.segments?.find?.((s) => s?.id === highlight.segmentId) ?? null;
        if (!seg) return { title: `${highlight.source}: Segment`, text: `Segment: ${highlight.segmentId ?? '--'}` };
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

        return { title: `${highlight.source}: Segment`, text: lines.join('\n') };
    }

    if (highlight.type === 'piece') {
        const seg = derived?.segments?.find?.((s) => s?.id === highlight.segmentId) ?? null;
        if (!seg) return { title: `${highlight.source}: Piece`, text: `Piece: ${highlight.pieceId ?? '--'}` };
        const piece = seg.keptPieces?.find?.((p) => p?.id === highlight.pieceId) ?? null;
        if (!piece) return { title: `${highlight.source}: Piece`, text: `Piece: ${highlight.pieceId ?? '--'}` };
        return {
            title: `${highlight.source}: Piece`,
            text: [
                `id: ${piece.id}`,
                `segment: ${seg.id}`,
                `road: ${seg.roadId}`,
                `t: ${fmt(piece.t0, 3)} → ${fmt(piece.t1, 3)}`,
                `length: ${fmt(piece.length, 2)}`
            ].join('\n')
        };
    }

    if (highlight.type === 'point') {
        const road = derived?.roads?.find?.((r) => r?.id === highlight.roadId) ?? null;
        const pt = road?.points?.find?.((p) => p?.id === highlight.pointId) ?? null;
        if (!pt) return { title: `${highlight.source}: Point`, text: `Point: ${highlight.pointId ?? '--'}` };
        const w = pt?.world ?? null;
        return {
            title: `${highlight.source}: Point`,
            text: [
                `id: ${pt.id}`,
                `road: ${road?.id ?? highlight.roadId ?? '--'}`,
                `tile: ${fmtInt(pt.tileX)}, ${fmtInt(pt.tileY)}`,
                `offset: ${fmt(pt.offsetX, 2)}, ${fmt(pt.offsetY, 2)}`,
                `world: ${fmt(w?.x, 2)}, ${fmt(w?.z, 2)}`,
                `tangentFactor: ${fmt(pt.tangentFactor, 2)}`
            ].join('\n')
        };
    }

    return { title: `${highlight.source}`, text: '—' };
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
    pointsRow.row.title = 'Show authored control points and markers for debugging.';
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
    const trimKeptRow = makeToggleRow('Kept pieces');
    trimKeptRow.row.title = 'Visualize kept pieces after trimming/splitting.';
    trimToggles.appendChild(trimKeptRow.row);
    const trimDroppedRow = makeToggleRow('Dropped pieces');
    trimDroppedRow.row.title = 'Visualize dropped tiny pieces (kept pieces shorter than snap step tileSize/10). Many crossings produce none.';
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
    controlsHint.textContent = 'Click: select / add points · Drag: pan / move points · Wheel/A/Z: zoom · Shift: axis lock · Alt: snap off · Esc: exit';
    left.appendChild(controlsHint);

    const bottom = document.createElement('div');
    bottom.className = 'road-debugger-popup';

    const popupTitle = document.createElement('div');
    popupTitle.className = 'road-debugger-popup-title';
    popupTitle.textContent = 'Road creation';
    bottom.appendChild(popupTitle);

    const popupBody = document.createElement('div');
    popupBody.className = 'road-debugger-popup-body';
    bottom.appendChild(popupBody);

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
        'Kept/Dropped pieces: post-split results (dropped are not asphalt).',
        'Highlight: show AABB/OBB + selected piece outline.'
    ]);

    helpPanel.appendChild(helpHeader);
    helpPanel.appendChild(helpBody);
    helpModal.appendChild(helpPanel);
    root.appendChild(helpModal);
    document.body.appendChild(root);

    const expandedRoads = new Set();

    const onGridChange = () => view.setGridEnabled(gridRow.input.checked);
    const onAsphaltChange = () => view.setRenderOptions({ asphalt: asphaltRow.input.checked });
    const onMarkingsChange = () => view.setRenderOptions({ markings: markingsRow.input.checked });
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
    const onTrimKeptChange = () => view.setTrimDebugOptions?.({ keptPieces: trimKeptRow.input.checked });
    const onTrimDroppedChange = () => view.setTrimDebugOptions?.({ droppedPieces: trimDroppedRow.input.checked });
    const onTrimHighlightChange = () => view.setTrimDebugOptions?.({ highlight: trimHighlightRow.input.checked });
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
        view.startRoadDraft();
    };
    const onDone = (e) => {
        e.preventDefault();
        view.finishRoadDraft();
    };
    const onCancel = (e) => {
        e.preventDefault();
        view.cancelRoadDraft();
    };
    const onRoadsLeave = () => view.clearHover();

    let schemaMode = null;

    const helpPadding = 12;
    const helpGap = 12;
    const layoutHelp = () => {
        const vw = Number(window?.innerWidth) || 0;
        const vh = Number(window?.innerHeight) || 0;
        const leftRect = left?.getBoundingClientRect?.() ?? null;
        const popupRect = bottom?.getBoundingClientRect?.() ?? null;

        let leftInset = Number(leftRect?.right) + helpGap;
        if (!Number.isFinite(leftInset)) leftInset = helpPadding;

        const rightInset = helpPadding;
        const minWidth = 320;
        if (vw - rightInset - leftInset < minWidth) leftInset = helpPadding;

        let bottomInset = helpPadding;
        if (popupRect && Number.isFinite(Number(popupRect.top))) {
            bottomInset = Math.max(helpPadding, (vh - Number(popupRect.top)) + helpGap);
        }

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
    trimKeptRow.input.addEventListener('change', onTrimKeptChange);
    trimDroppedRow.input.addEventListener('change', onTrimDroppedChange);
    trimHighlightRow.input.addEventListener('change', onTrimHighlightChange);
    helpBtn.addEventListener('click', onHelp);
    helpClose.addEventListener('click', onHelpClose);
    undoBtn.addEventListener('click', onUndo);
    redoBtn.addEventListener('click', onRedo);
    exportBtn.addEventListener('click', onExport);
    importBtn.addEventListener('click', onImport);
    newRoad.addEventListener('click', onNewRoad);
    done.addEventListener('click', onDone);
    cancel.addEventListener('click', onCancel);
    roadsList.addEventListener('mouseleave', onRoadsLeave);
    schemaClose.addEventListener('click', onSchemaClose);
    schemaApply.addEventListener('click', onSchemaApply);
    schemaModal.addEventListener('click', (e) => {
        if (e.target === schemaModal) closeSchemaModal();
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
            input.min = '1';
            input.max = '5';
            input.step = '1';
            input.className = 'road-debugger-lane-input';
            input.value = String(clampInt(value, 1, 5));
            input.title = key === 'F'
                ? 'Forward lane count (relative to A → B direction). Forward lanes are on the right side of the divider centerline.'
                : 'Backward lane count (relative to A → B direction). Backward lanes are on the left side of the divider centerline.';
            input.addEventListener('click', (e) => e.stopPropagation());
            input.addEventListener('change', (e) => {
                e.stopPropagation();
                const next = clampInt(input.value, 1, 5);
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
            if (view._hover?.roadId === road.id && !view._hover?.segmentId) view.clearHover();
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

    const sync = () => {
        gridRow.input.checked = view._gridEnabled !== false;
        asphaltRow.input.checked = view._renderOptions?.asphalt !== false;
        markingsRow.input.checked = view._renderOptions?.markings === true;
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
        trimKeptRow.input.checked = !!trimDebug.keptPieces;
        trimDroppedRow.input.checked = !!trimDebug.droppedPieces;
        trimHighlightRow.input.checked = !!trimDebug.highlight;

        const info = highlightInfo(view);
        infoTitle.textContent = info.title;
        infoBody.textContent = info.text;

        const derived = view.getDerived?.() ?? view._derived ?? null;
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
        if ((view._selection?.type === 'segment' || view._selection?.type === 'piece') && view._selection?.roadId) expandedRoads.add(view._selection.roadId);

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
                const segs = derived?.segments?.filter?.((s) => s?.roadId === road.id) ?? [];
                for (const seg of segs) roadsList.appendChild(buildSegmentRow({ seg }));
            }
        }

        const draftActive = !!draft;
        const pts = draft?.points?.length ?? 0;
        popupBody.textContent = draftActive
            ? `Drafting ${draft.name} · ${pts} point${pts === 1 ? '' : 's'} · click tiles to add points.`
            : 'Start a new road, then click tiles to place points.';

        newRoad.disabled = draftActive;
        done.disabled = !draftActive || pts < 2;
        cancel.disabled = !draftActive;

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
        gridToggle: gridRow.input,
        asphaltToggle: asphaltRow.input,
        markingsToggle: markingsRow.input,
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
        trimKeptToggle: trimKeptRow.input,
        trimDroppedToggle: trimDroppedRow.input,
        trimHighlightToggle: trimHighlightRow.input,
        roadsList,
        expandedRoads,
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
        _onTrimKeptChange: onTrimKeptChange,
        _onTrimDroppedChange: onTrimDroppedChange,
        _onTrimHighlightChange: onTrimHighlightChange,
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
        _onTangentRangeChange: onTangentRangeChange,
        _onTangentNumberChange: onTangentNumberChange,
        _onSchemaClose: onSchemaClose,
        _onSchemaApply: onSchemaApply,
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
    ui.trimKeptToggle?.removeEventListener?.('change', ui._onTrimKeptChange);
    ui.trimDroppedToggle?.removeEventListener?.('change', ui._onTrimDroppedChange);
    ui.trimHighlightToggle?.removeEventListener?.('change', ui._onTrimHighlightChange);
    ui.roadsList?.removeEventListener?.('mouseleave', ui._onRoadsLeave);
    ui.tangentRange?.removeEventListener?.('change', ui._onTangentRangeChange);
    ui.tangentNumber?.removeEventListener?.('change', ui._onTangentNumberChange);
    ui.schemaClose?.removeEventListener?.('click', ui._onSchemaClose);
    ui.schemaApply?.removeEventListener?.('click', ui._onSchemaApply);
    ui.schemaModal?.remove?.();
    if (ui.root?.isConnected) ui.root.remove();
    view.ui = null;
}
