// src/graphics/gui/connector_debugger/ConnectorDebuggerUI.js
// Manages panels and payload formatting for connector debugger UI.
import { ConnectorDebugPanel } from './ConnectorDebugPanel.js';
import { ConnectorShortcutsPanel } from './ConnectorShortcutsPanel.js';
import { hideDebugLines, setCurbAutoCreate } from './ConnectorDebuggerScene.js';

export function setupPanel(view) {
    view.panel = new ConnectorDebugPanel({
        radius: view._radius,
        holdRotate: view._rotationModeHold,
        lineVisibility: { ...view._lineVisibility },
        displayEnabled: view._displayDebug,
        autoSelect: view._autoSelectLine,
        pathTypes: view._candidateTypes.slice(),
        onHoldRotateChange: (holdRotate) => {
            view._rotationModeHold = !!holdRotate;
            view._markInteraction();
        },
        onLineVisibilityChange: (visibility) => {
            if (view._autoSelectLine) return;
            view._lineVisibility = { ...view._lineVisibility, ...visibility };
            view._manualLineVisibility = { ...view._lineVisibility };
        },
        onAutoSelectChange: (autoSelect) => {
            setAutoSelectLine(view, autoSelect);
        },
        onDisplayChange: (enabled) => {
            view._displayDebug = !!enabled;
            if (!view._displayDebug) hideDebugLines(view);
        },
        onRadiusChange: (radius) => {
            if (!Number.isFinite(radius)) return;
            view._radius = Math.max(0.1, radius);
            view._markInteraction();
            view._requestHardReset();
        },
        onCopy: () => copyPayload(view),
        curbsEnabled: view._curbAutoCreate,
        onCurbsToggleChange: (enabled) => setCurbAutoCreate(view, enabled)
    });
    view.panel.show();
}

export function setupShortcutsPanel(view) {
    view.shortcutsPanel = new ConnectorShortcutsPanel();
    view.shortcutsPanel.show();
}

export function setAutoSelectLine(view, autoSelect) {
    view._autoSelectLine = !!autoSelect;
    if (view._autoSelectLine) {
        view._manualLineVisibility = { ...view._lineVisibility };
        applyAutoSelectLine(view, view._connector?.type ?? null);
        return;
    }
    if (view._manualLineVisibility) {
        view._lineVisibility = { ...view._manualLineVisibility };
        view.panel?.setLineVisibility(view._lineVisibility);
    }
}

export function applyAutoSelectLine(view, selectedType) {
    if (!view._autoSelectLine) return;
    const visibility = {};
    for (const type of view._candidateTypes) {
        visibility[type] = type === selectedType;
    }
    if (!lineVisibilityEquals(view, visibility)) {
        view._lineVisibility = visibility;
        view.panel?.setLineVisibility(view._lineVisibility);
    }
}

export function lineVisibilityEquals(view, next) {
    for (const type of view._candidateTypes) {
        if (!!next[type] !== !!view._lineVisibility[type]) return false;
    }
    return true;
}

export function buildDebugData(view, inputs, connector, error) {
    const p0 = inputs?.p0 ? { x: inputs.p0.x, z: inputs.p0.y } : null;
    const p1 = inputs?.p1 ? { x: inputs.p1.x, z: inputs.p1.y } : null;
    const dir0 = inputs?.dir0 ? { x: inputs.dir0.x, z: inputs.dir0.y } : null;
    const dir1 = inputs?.dir1 ? { x: inputs.dir1.x, z: inputs.dir1.y } : null;

    const segments = (connector?.segments ?? []).map((segment) => {
        if (segment.type === 'ARC') {
            return {
                type: 'ARC',
                center: { x: segment.center.x, z: segment.center.y },
                startAngle: segment.startAngle,
                deltaAngle: segment.deltaAngle,
                turnDir: segment.turnDir,
                length: segment.length
            };
        }
        if (segment.type === 'STRAIGHT') {
            return {
                type: 'STRAIGHT',
                start: segment.startPoint ? { x: segment.startPoint.x, z: segment.startPoint.y } : null,
                end: segment.endPoint ? { x: segment.endPoint.x, z: segment.endPoint.y } : null,
                length: segment.length
            };
        }
        return null;
    }).filter(Boolean);

    const metrics = connector?.metrics ?? {};

    return {
        p0,
        dir0,
        p1,
        dir1,
        type: connector?.type ?? 'none',
        radius: connector?.radius ?? view._radius,
        segments,
        totalLength: connector?.totalLength ?? 0,
        metrics,
        feasible: !!connector?.ok,
        error: error ?? connector?.failure?.code ?? null
    };
}

export function buildPayload(view, inputs, connector) {
    const endSigns = view.curbs.map((curb) => curb.endSign);
    const dirSigns = inputs?.dirSigns ?? view.curbs.map((curb) => curb.dirSign ?? 1);
    const curbTransforms = view.curbs.map((curb, index) => ({
        id: curb.id,
        position: {
            x: curb.mesh.position.x,
            y: curb.mesh.position.y,
            z: curb.mesh.position.z
        },
        rotation: {
            x: curb.mesh.rotation.x,
            y: curb.mesh.rotation.y,
            z: curb.mesh.rotation.z
        },
        length: curb.length,
        endSign: endSigns[index],
        dirSign: dirSigns[index] ?? 1
    }));

    const vec2 = (v) => (v ? { x: v.x, z: v.y } : null);
    const pose = (p) => (p ? { position: vec2(p.position), direction: vec2(p.direction), heading: p.heading } : null);
    const circle = (c) => (c ? { center: vec2(c.center), radius: c.radius } : null);
    const segment = (s) => {
        if (!s) return null;
        if (s.type === 'ARC') {
            return {
                type: 'ARC',
                center: vec2(s.center),
                startPoint: vec2(s.startPoint),
                endPoint: vec2(s.endPoint),
                startAngle: s.startAngle,
                deltaAngle: s.deltaAngle,
                turnDir: s.turnDir,
                length: s.length,
                radius: s.radius
            };
        }
        if (s.type === 'STRAIGHT') {
            return {
                type: 'STRAIGHT',
                startPoint: vec2(s.startPoint),
                endPoint: vec2(s.endPoint),
                direction: vec2(s.direction),
                length: s.length
            };
        }
        return null;
    };
    const segments = (list) => (Array.isArray(list) ? list.map(segment).filter(Boolean) : []);
    const candidate = (cand) => cand ? ({
        type: cand.type,
        radius: cand.radius,
        totalLength: cand.totalLength,
        segments: segments(cand.segments)
    }) : null;

    const solverResult = connector ? {
        ok: connector.ok,
        type: connector.type,
        radius: connector.radius,
        totalLength: connector.totalLength,
        segments: segments(connector.segments),
        startLeftCircle: circle(connector.startLeftCircle),
        startRightCircle: circle(connector.startRightCircle),
        endLeftCircle: circle(connector.endLeftCircle),
        endRightCircle: circle(connector.endRightCircle),
        metrics: connector.metrics ?? null,
        failure: connector.failure ?? null,
        radiusPolicy: connector.radiusPolicy ?? null,
        startPose: pose(connector.startPose),
        endPose: pose(connector.endPose),
        endPoseComputed: pose(connector.endPoseComputed),
        candidateTypes: connector.candidateTypes ?? null,
        candidatesByType: Array.isArray(connector.candidatesByType)
            ? connector.candidatesByType.map(candidate)
            : null
    } : null;

    return {
        solverResult,
        curbs: curbTransforms,
        engineConfig: {
            tileSize: view._tileSize,
            road: view.city?.generatorConfig?.road ?? null,
            ground: view.city?.generatorConfig?.ground ?? null,
            solver: {
                radius: view._radius,
                allowFallback: false,
                preferS: true
            },
            rotationMode: view._rotationModeHold ? 'hold' : 'step'
        }
    };
}

export function copyPayload(view) {
    if (!view._lastPayload) return;
    const text = JSON.stringify(view._lastPayload, null, 2);
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text);
        return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
}
