// src/graphics/gui/mesh_fabrication/MeshFabricationView.js
// Mesh fabrication workspace view: UI shell, multi-camera viewport presets, and camera interactions.
import * as THREE from 'three';
import { createMaterialSymbolIcon, setIconOnlyButtonLabel } from '../shared/materialSymbols.js';
import {
    LIVE_MESH_POLL_INTERVAL_MS,
    buildObjTextFromLiveMesh,
    buildThreeGroupFromLiveMesh,
    parseLiveMeshDocument,
    resolveLiveMeshEndpoint,
    resolveLiveMeshStaticFileUrl
} from './liveMeshHandoff.js';
import {
    MESH_AI_INTERACTION_VERSION,
    MESH_AI_OPERATION_SCOPE_V1,
    MESH_AI_QUALITY_CONSTRAINTS_V1,
    MESH_AI_WORKFLOW_VERSION,
    buildAiWorkflowDocument,
    buildPreviewEvaluation,
    canAcceptPreview,
    createInstructionBatch,
    summarizeCommandWindow,
    summarizeOperationWindow
} from './meshAiWorkflow.js';

const PRESET_TOP_HEIGHT = 0.62;
const LIVE_MESH_UPDATE_PULSE_MS = 5000;
const AI_OUTPUT_RECENT_OP_LIMIT = 6;
const AI_SCOPE_LABEL = 'V1 active: transform/material/boolean. Hooks: creation, extrusion/bevel, topology-cut, UV.';
const AXIS_GIZMO_MAIN_SIZE = 126;
const AXIS_GIZMO_AUX_SIZE = 94;
const AXIS_GIZMO_MARGIN = 10;
const TOPOLOGY_HOVER_ORANGE = 0xff9a2f;

const VIEW_LAYOUT_PRESETS = Object.freeze([
    Object.freeze({
        id: 'layout_1',
        label: 'Single 3D',
        iconTop: '3D',
        bottom: Object.freeze([])
    }),
    Object.freeze({
        id: 'layout_2',
        label: '3D + Left/Front/Right',
        iconTop: '3D',
        bottom: Object.freeze(['left', 'front', 'right'])
    }),
    Object.freeze({
        id: 'layout_3',
        label: '3D + Right/Back/Left',
        iconTop: '3D',
        bottom: Object.freeze(['right', 'back', 'left'])
    }),
    Object.freeze({
        id: 'layout_4',
        label: '3D + Top/Bottom',
        iconTop: '3D',
        bottom: Object.freeze(['top', 'bottom'])
    }),
    Object.freeze({
        id: 'layout_5',
        label: '3D + Left/Right',
        iconTop: '3D',
        bottom: Object.freeze(['left', 'right'])
    })
]);

const ORTHO_VIEW_LABEL = Object.freeze({
    left: 'Left',
    right: 'Right',
    front: 'Front',
    back: 'Back',
    top: 'Top',
    bottom: 'Bottom'
});

const DISPLAY_MODE_OPTIONS = Object.freeze([
    Object.freeze({
        id: 'shaded',
        label: 'Shaded',
        icon: 'deployed_code'
    }),
    Object.freeze({
        id: 'shaded_wireframe',
        label: 'Shaded + Wireframe',
        icon: 'polyline'
    }),
    Object.freeze({
        id: 'wireframe',
        label: 'Wireframe',
        icon: 'grid_on'
    }),
    Object.freeze({
        id: 'shaded_vertices',
        label: 'Shaded + Vertices',
        icon: 'scatter_plot'
    }),
    Object.freeze({
        id: 'shaded_wireframe_vertices',
        label: 'Shaded + Wireframe + Vertices',
        icon: 'polyline'
    }),
    Object.freeze({
        id: 'vertices',
        label: 'Vertices',
        icon: 'radio_button_unchecked'
    })
]);

const VIEWPORT_BG_HEX = Object.freeze({
    perspective: 0x28303a,
    left: 0x2e3532,
    front: 0x30342b,
    right: 0x2b3436,
    back: 0x332f2b,
    top: 0x2d2f38,
    bottom: 0x332c35
});

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function getPresetById(presetId) {
    const id = typeof presetId === 'string' ? presetId : '';
    return VIEW_LAYOUT_PRESETS.find((preset) => preset.id === id) ?? VIEW_LAYOUT_PRESETS[0];
}

function createLayoutIcon(topLabel, bottomLabels) {
    const icon = document.createElement('span');
    icon.className = 'mesh-fab-layout-icon';
    const hasBottom = Array.isArray(bottomLabels) && bottomLabels.length > 0;

    if (!hasBottom) {
        icon.classList.add('is-single');
        const cell = document.createElement('span');
        cell.className = 'mesh-fab-layout-cell mesh-fab-layout-cell-single';
        cell.textContent = topLabel;
        icon.appendChild(cell);
        return icon;
    }

    const top = document.createElement('span');
    top.className = 'mesh-fab-layout-row mesh-fab-layout-row-top';
    const topCell = document.createElement('span');
    topCell.className = 'mesh-fab-layout-cell';
    topCell.textContent = topLabel;
    top.appendChild(topCell);
    icon.appendChild(top);

    const bottom = document.createElement('span');
    bottom.className = 'mesh-fab-layout-row mesh-fab-layout-row-bottom';
    for (const label of bottomLabels) {
        const cell = document.createElement('span');
        cell.className = 'mesh-fab-layout-cell';
        cell.textContent = label;
        bottom.appendChild(cell);
    }
    icon.appendChild(bottom);

    return icon;
}

function describeLayoutPreset(preset) {
    if (!preset || !Array.isArray(preset.bottom)) return 'Main view: 3D';
    if (!preset.bottom.length) return 'Main view: 3D only';
    const bottom = preset.bottom
        .map((id) => ORTHO_VIEW_LABEL[id] ?? id)
        .join(' / ');
    return `Main: 3D, Bottom: ${bottom}`;
}

function getDisplayModeOptionById(modeId) {
    const id = typeof modeId === 'string' ? modeId : '';
    return DISPLAY_MODE_OPTIONS.find((option) => option.id === id) ?? DISPLAY_MODE_OPTIONS[0];
}

function normalizePointerButton(button) {
    const value = Number(button);
    if (!Number.isFinite(value)) return -1;
    return value | 0;
}

function makeReadoutRow(labelText) {
    const row = document.createElement('div');
    row.className = 'mesh-fab-readout-row';

    const label = document.createElement('span');
    label.className = 'mesh-fab-readout-label';
    label.textContent = labelText;

    const value = document.createElement('span');
    value.className = 'mesh-fab-readout-value';
    value.textContent = '-';

    row.appendChild(label);
    row.appendChild(value);
    return { row, value };
}

function formatTimeLabel(epochMs) {
    if (!Number.isFinite(epochMs) || epochMs <= 0) return '-';
    try {
        return new Date(epochMs).toLocaleTimeString();
    } catch {
        return '-';
    }
}

function sanitizeFileToken(value, fallback = 'mesh') {
    const raw = String(value ?? '').trim();
    if (!raw) return fallback;
    const normalized = raw.replace(/[^a-zA-Z0-9._-]+/g, '_');
    return normalized.length ? normalized : fallback;
}

function formatAiSummaryLine(summary) {
    if (!summary) return 'Ops: -';
    return `Ops: ${summary.total} total, ${summary.applied} applied, ${summary.rejected} rejected, ${summary.needsClarification} clarification, ${summary.error} error`;
}

function formatAiScopeSummary(scopeSummary) {
    if (!scopeSummary) return 'Scope: -';
    return `Scope window: ${scopeSummary.total} commands (${scopeSummary.active} active, ${scopeSummary.hook} hook, ${scopeSummary.clarification} clarification, ${scopeSummary.unsupported} unsupported)`;
}

function getRecentOperationLines(operationLog) {
    const operations = Array.isArray(operationLog?.operations) ? operationLog.operations : [];
    const recent = operations.slice(Math.max(0, operations.length - AI_OUTPUT_RECENT_OP_LIMIT));
    return recent.map((op) => {
        const id = String(op?.operationId ?? '-');
        const status = String(op?.status ?? 'unknown');
        const type = String(op?.command?.type ?? 'unknown');
        const msg = String(op?.message ?? '').trim();
        return msg ? `${id} ${status} ${type}: ${msg}` : `${id} ${status} ${type}`;
    });
}

function cloneJsonValue(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

function formatVector3Label(value) {
    const x = Number(value?.x);
    const y = Number(value?.y);
    const z = Number(value?.z);
    const formatAxis = (num) => (Number.isFinite(num) ? num.toFixed(3) : '0.000');
    return `${formatAxis(x)}, ${formatAxis(y)}, ${formatAxis(z)}`;
}

function createPivotCheckerTexture() {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const cell = 32;
    for (let y = 0; y < canvas.height; y += cell) {
        for (let x = 0; x < canvas.width; x += cell) {
            const checker = (((x / cell) | 0) + ((y / cell) | 0)) % 2 === 0;
            ctx.fillStyle = checker ? '#eceff3' : '#3d434f';
            ctx.fillRect(x, y, cell, cell);
        }
    }

    // Slight spherical cue so the marker reads as a ball.
    const shade = ctx.createRadialGradient(84, 76, 12, 128, 128, 118);
    shade.addColorStop(0, 'rgba(255,255,255,0.34)');
    shade.addColorStop(0.62, 'rgba(255,255,255,0.02)');
    shade.addColorStop(1, 'rgba(0,0,0,0.26)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
}

function createAxisLabelSprite(text, colorHex, offset) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '900 78px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(6, 10, 16, 0.85)';
    ctx.strokeText(text, canvas.width * 0.5, canvas.height * 0.54);
    ctx.fillStyle = colorHex;
    ctx.fillText(text, canvas.width * 0.5, canvas.height * 0.54);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.38, 0.38, 0.38);
    sprite.position.copy(offset);
    sprite.renderOrder = 12;

    return { sprite, material, texture };
}

export class MeshFabricationView {
    constructor(engine) {
        this.engine = engine;
        this.scene = engine.scene;
        this.camera = engine.camera;
        this.canvas = engine.canvas;

        this.onExit = null;

        this._root = null;
        this._mainPane = null;
        this._viewportShell = null;
        this._viewportStage = null;
        this._viewportOverlay = null;
        this._contextMenuRoot = null;
        this._contextMenuCopyButton = null;
        this._contextMenuCopyCanonicalButton = null;
        this._contextMenuOpen = false;
        this._contextMenuPath = '';
        this._contextMenuCanonicalPath = '';
        this._rightPane = null;

        this._canvasHomeParent = null;
        this._canvasHomeNextSibling = null;

        this._layoutPresetId = VIEW_LAYOUT_PRESETS[0].id;
        this._displayMode = 'shaded';
        this._userMode = 'orbit';
        this._hoverTileId = '';

        this._auxZoom = 0.6;
        this._orthoBaseSpan = 16;
        this._orthoDistance = 18;
        this._orthoCameras = new Map();
        this._modelSize = new THREE.Vector3(4, 4, 4);
        this._modelCenter = new THREE.Vector3(0, 0, 0);

        this._orbitTarget = new THREE.Vector3(0, 0, 0);
        this._orbitYaw = 0.9;
        this._orbitPitch = 0.55;
        this._orbitRadius = 16;
        this._autoOrbitEnabled = false;
        this._autoOrbitSpeedRadPerSec = 0.36;
        this._autoOrbitReturnState = null;
        this._drag = null;
        this._pivotPosition = new THREE.Vector3(0, 0, 0);
        this._pivotOverlay = null;
        this._pivotOverlayTexture = null;
        this._clearColorScratch = new THREE.Color();
        this._tmpSize2 = new THREE.Vector2();
        this._raycaster = new THREE.Raycaster();
        this._rayNdc = new THREE.Vector2();
        this._lastDevicePixelRatio = (typeof window !== 'undefined' ? Number(window.devicePixelRatio) : 1) || 1;

        this._tiles = [];
        this._tileFrameById = new Map();
        this._tileStatusById = new Map();
        this._tileStatusElementById = new Map();
        this._tileHoverHitById = new Map();
        this._topologyCanonicalById = new Map();
        this._topologyAuthoredById = new Map();
        this._topologyWorldVertexById = new Map();
        this._topologyEdgeVertexIdsById = new Map();
        this._topologyFaceVertexIdsById = new Map();
        this._hoverFaceVertexCapacity = 3;
        this._hoverVertexHighlight = null;
        this._hoverEdgeHighlight = null;
        this._hoverFaceFillHighlight = null;
        this._hoverFaceOutlineHighlight = null;

        this._buttonByPresetId = new Map();
        this._buttonByDisplayMode = new Map();
        this._buttonByUserMode = new Map();
        this._autoOrbitButton = null;
        this._displayModeComboRoot = null;
        this._displayModeComboButton = null;
        this._displayModeComboPopup = null;
        this._displayModeComboPreviewHost = null;
        this._displayModeComboOpen = false;
        this._layoutComboRoot = null;
        this._layoutComboButton = null;
        this._layoutComboPopup = null;
        this._layoutComboPreviewHost = null;
        this._layoutComboOpen = false;
        this._overlayOptionsRoot = null;
        this._overlayOptionsButton = null;
        this._overlayOptionsPopup = null;
        this._overlayOptionsAxisRow = null;
        this._overlayOptionsPivotRow = null;
        this._overlayOptionsHoverHighlightRow = null;
        this._overlayOptionsFaceCentersRow = null;
        this._overlayOptionsOccludedFaceCentersRow = null;
        this._overlayOptionsOccludedWiresRow = null;
        this._overlayOptionsOpen = false;
        this._axisArrowsEnabled = true;
        this._pivotOverlayEnabled = false;
        this._topologyHoverHighlightEnabled = true;
        this._wireFaceCentersEnabled = true;
        this._hideOccludedFaceCentersEnabled = true;
        this._hideOccludedWiresEnabled = false;
        this._axisGizmoScene = null;
        this._axisGizmoCamera = null;
        this._axisGizmoRoot = null;
        this._axisGizmoMaterials = [];
        this._axisGizmoGeometries = [];
        this._axisGizmoTextures = [];
        this._axisLabelSprites = {
            x: null,
            y: null,
            z: null
        };

        this._readouts = {
            layout: null,
            activeView: null,
            displayMode: null,
            userMode: null,
            meshSource: null,
            meshSync: null,
            meshLiveButton: null,
            meshLiveMode: null,
            meshLiveDot: null,
            meshRevision: null,
            meshLastCheck: null,
            aiWorkflow: null,
            aiScope: null,
            aiOutput: null
        };

        this._aiUi = {
            input: null,
            previewButton: null,
            acceptButton: null,
            rejectButton: null,
            undoButton: null,
            redoButton: null
        };

        this._liveMeshHostGroup = null;
        this._liveMeshGroup = null;
        this._liveMeshSourceDocument = null;
        this._liveMeshRevision = '-';
        this._liveMeshSyncLabel = 'Idle';
        this._liveMeshLastCheckMs = 0;
        this._liveMeshUpdatePulseUntilMs = 0;
        this._liveMeshHasError = false;
        this._liveMeshEnabled = true;
        this._liveMeshEtag = '';
        this._liveMeshLastModified = '';
        this._meshEndpoint = resolveLiveMeshEndpoint();
        this._meshStaticFileUrl = resolveLiveMeshStaticFileUrl();
        this._meshSyncIntervalId = null;
        this._meshSyncInFlight = false;
        this._meshSyncAbortController = null;
        this._meshStaticBootstrapTried = false;
        this._liveMeshParsedDocument = null;

        this._aiBatchSerial = 0;
        this._aiAcceptedBatches = [];
        this._aiRedoBatches = [];
        this._aiPreviewBatch = null;
        this._aiPreviewWindow = null;
        this._aiDraftText = '';
        this._aiPreviewAcceptable = false;
        this._aiWorkflowStatus = 'Idle';
        this._aiOutputText = [
            `Workflow ${MESH_AI_WORKFLOW_VERSION}`,
            `Interaction ${MESH_AI_INTERACTION_VERSION}`,
            `Scope ${MESH_AI_OPERATION_SCOPE_V1.version}`,
            `Safety ${MESH_AI_QUALITY_CONSTRAINTS_V1.version}`
        ].join('\n');

        this._surfaceMeshes = [];
        this._polygonWireOverlay = null;
        this._vertexOverlay = null;
        this._faceCenterOverlay = null;
        this._ownedGeometries = [];
        this._ownedMaterials = [];
        this._ownedObjects = [];
        this._surfaceMaterialDefaults = new WeakMap();

        this._frameListenerDisposer = null;
        this._resizeObserver = null;

        this._onFrame = (frame) => {
            this._updateAutoOrbit(frame?.dt ?? 0);
            this._renderMultiView();
        };
        this._onWindowResize = () => this._applyViewportSize();
        this._onPointerDown = (e) => this._handlePointerDown(e);
        this._onPointerMove = (e) => this._handlePointerMove(e);
        this._onPointerUp = (e) => this._handlePointerUp(e);
        this._onPointerCancel = (e) => this._handlePointerUp(e);
        this._onPointerLeave = () => this._handlePointerLeave();
        this._onWheel = (e) => this._handleWheel(e);
        this._onContextMenu = (e) => this._handleContextMenu(e);
        this._onContextMenuCopyPath = () => {
            void this._handleContextMenuCopyPath();
        };
        this._onContextMenuCopyCanonicalPath = () => {
            void this._handleContextMenuCopyCanonicalPath();
        };
        this._onDownloadObjClick = () => this._downloadCurrentMeshObj();
        this._onLiveStatusToggle = () => this._toggleLiveMeshSync();
        this._onAutoOrbitToggle = () => this._toggleAutoOrbitCamera();
        this._onOverlayOptionsToggle = () => this._setOverlayOptionsOpen(!this._overlayOptionsOpen);
        this._onAxisArrowsToggle = () => this._toggleAxisArrows();
        this._onPivotOverlayToggle = () => this._togglePivotOverlay();
        this._onHoverHighlightToggle = () => this._toggleHoverHighlight();
        this._onWireFaceCentersToggle = () => this._toggleWireFaceCenters();
        this._onOccludedFaceCentersToggle = () => this._toggleOccludedFaceCenters();
        this._onOccludedWiresToggle = () => this._toggleOccludedWires();
        this._onAiDraftInput = (e) => this._handleAiDraftInput(e);
        this._onAiPreviewClick = () => this._handleAiPreview();
        this._onAiAcceptClick = () => this._handleAiAccept();
        this._onAiRejectClick = () => this._handleAiReject();
        this._onAiUndoClick = () => this._handleAiUndo();
        this._onAiRedoClick = () => this._handleAiRedo();
        this._onDocumentPointerDown = (e) => this._handleDocumentPointerDown(e);
        this._onDocumentKeyDown = (e) => this._handleDocumentKeyDown(e);
    }

    enter() {
        this._mountUi();
        this._attachCanvasToViewport();
        this._setupScene();
        this._setLayoutPreset(this._layoutPresetId);
        this._setDisplayMode(this._displayMode);
        this._setUserMode(this._userMode);
        this._attachEvents();
        this._applyViewportSize();
        this._startMeshSync();
        this._frameListenerDisposer = this.engine.addFrameListener(this._onFrame);
    }

    exit() {
        if (this._frameListenerDisposer) {
            this._frameListenerDisposer();
            this._frameListenerDisposer = null;
        }
        this._stopMeshSync();
        this._detachEvents();
        this._disposeSceneAssets();
        this._detachCanvasFromViewport();
        this._unmountUi();
        this._orthoCameras.clear();
        this.engine.resize();
    }

    update(dt) {
        void dt;
    }

    _mountUi() {
        document.body.classList.add('mesh-fab-active');

        const root = document.createElement('div');
        root.className = 'mesh-fab-root';

        const main = document.createElement('div');
        main.className = 'mesh-fab-main';

        const topBar = document.createElement('div');
        topBar.className = 'mesh-fab-topbar';

        const userGroup = this._createToolbarGroup('User');
        const orbitBtn = this._createIconButton({
            label: 'Orbit camera mode',
            icon: '3d_rotation',
            caption: 'Orbit',
            onClick: () => this._setUserMode('orbit')
        });
        const selectBtn = this._createIconButton({
            label: 'Select mode',
            icon: 'ads_click',
            caption: 'Select',
            onClick: () => this._setUserMode('select')
        });
        const autoOrbitBtn = this._createIconButton({
            label: 'Toggle orbit camera',
            icon: 'autorenew',
            caption: 'OrbitCam',
            onClick: this._onAutoOrbitToggle
        });
        this._buttonByUserMode.set('orbit', orbitBtn);
        this._buttonByUserMode.set('select', selectBtn);
        userGroup.buttons.appendChild(orbitBtn);
        userGroup.buttons.appendChild(selectBtn);
        userGroup.buttons.appendChild(autoOrbitBtn);
        this._autoOrbitButton = autoOrbitBtn;
        this._refreshAutoOrbitButtonState();
        topBar.appendChild(userGroup.root);

        const displayGroup = this._createToolbarGroup('Display');
        displayGroup.buttons.appendChild(this._createDisplayModeCombo());
        topBar.appendChild(displayGroup.root);

        const layoutGroup = this._createToolbarGroup('Views');
        layoutGroup.buttons.appendChild(this._createLayoutCombo());
        topBar.appendChild(layoutGroup.root);

        const overlayGroup = this._createToolbarGroup('Overlay');
        overlayGroup.buttons.appendChild(this._createOverlayOptionsMenu());
        topBar.appendChild(overlayGroup.root);

        const liveGroup = this._createToolbarGroup('Live');
        const liveStatusWrap = document.createElement('div');
        liveStatusWrap.className = 'mesh-fab-live-status-wrap';
        const liveStatusBtn = document.createElement('button');
        liveStatusBtn.type = 'button';
        liveStatusBtn.className = 'mesh-fab-live-status-btn';
        liveStatusBtn.setAttribute('aria-label', 'Live mesh sync');
        liveStatusBtn.setAttribute('aria-pressed', 'true');
        liveStatusBtn.addEventListener('click', this._onLiveStatusToggle);
        const liveStatusIcon = createMaterialSymbolIcon('sync', { size: 'sm' });
        liveStatusIcon.classList.add('mesh-fab-live-status-icon');
        const liveStatusMode = document.createElement('span');
        liveStatusMode.className = 'mesh-fab-live-status-mode';
        liveStatusMode.textContent = 'OFF';
        const liveStatusDot = document.createElement('span');
        liveStatusDot.className = 'mesh-fab-live-status-dot is-idle';
        liveStatusDot.setAttribute('aria-hidden', 'true');
        liveStatusBtn.appendChild(liveStatusIcon);
        liveStatusBtn.appendChild(liveStatusMode);
        liveStatusBtn.appendChild(liveStatusDot);
        const liveStatusOutput = document.createElement('div');
        liveStatusOutput.className = 'mesh-fab-live-status-output';
        liveStatusOutput.textContent = 'Status: Idle';
        liveStatusWrap.appendChild(liveStatusBtn);
        liveStatusWrap.appendChild(liveStatusOutput);
        liveGroup.buttons.appendChild(liveStatusWrap);
        topBar.appendChild(liveGroup.root);

        const viewportShell = document.createElement('div');
        viewportShell.className = 'mesh-fab-viewport-shell';

        const viewportStage = document.createElement('div');
        viewportStage.className = 'mesh-fab-viewport-stage';

        const viewportOverlay = document.createElement('div');
        viewportOverlay.className = 'mesh-fab-viewport-overlay';

        const contextMenu = document.createElement('div');
        contextMenu.className = 'mesh-fab-context-menu';
        contextMenu.setAttribute('role', 'menu');
        contextMenu.setAttribute('aria-label', 'Topology context menu');
        contextMenu.addEventListener('contextmenu', (event) => event.preventDefault());
        const copyPathButton = document.createElement('button');
        copyPathButton.type = 'button';
        copyPathButton.className = 'mesh-fab-context-menu-item';
        copyPathButton.textContent = 'Copy Path';
        copyPathButton.addEventListener('click', this._onContextMenuCopyPath);
        const copyCanonicalButton = document.createElement('button');
        copyCanonicalButton.type = 'button';
        copyCanonicalButton.className = 'mesh-fab-context-menu-item';
        copyCanonicalButton.textContent = 'Copy Canonical';
        copyCanonicalButton.addEventListener('click', this._onContextMenuCopyCanonicalPath);
        contextMenu.appendChild(copyPathButton);
        contextMenu.appendChild(copyCanonicalButton);

        viewportShell.appendChild(viewportStage);
        viewportShell.appendChild(viewportOverlay);
        viewportShell.appendChild(contextMenu);

        main.appendChild(topBar);
        main.appendChild(viewportShell);

        const right = document.createElement('aside');
        right.className = 'mesh-fab-right';
        const rightTitle = document.createElement('h2');
        rightTitle.className = 'mesh-fab-right-title';
        rightTitle.textContent = 'Mesh Fabrication';
        right.appendChild(rightTitle);

        root.appendChild(main);
        root.appendChild(right);
        document.body.appendChild(root);

        this._root = root;
        this._mainPane = main;
        this._viewportShell = viewportShell;
        this._viewportStage = viewportStage;
        this._viewportOverlay = viewportOverlay;
        this._contextMenuRoot = contextMenu;
        this._contextMenuCopyButton = copyPathButton;
        this._contextMenuCopyCanonicalButton = copyCanonicalButton;
        this._contextMenuOpen = false;
        this._contextMenuPath = '';
        this._contextMenuCanonicalPath = '';
        this._rightPane = right;
        this._readouts.layout = null;
        this._readouts.activeView = null;
        this._readouts.displayMode = null;
        this._readouts.userMode = null;
        this._readouts.meshSource = null;
        this._readouts.meshSync = liveStatusOutput;
        this._readouts.meshLiveButton = liveStatusBtn;
        this._readouts.meshLiveMode = liveStatusMode;
        this._readouts.meshLiveDot = liveStatusDot;
        this._readouts.meshRevision = null;
        this._readouts.meshLastCheck = null;
        this._readouts.aiWorkflow = null;
        this._readouts.aiScope = null;
        this._readouts.aiOutput = null;
        this._aiUi.input = null;
        this._aiUi.previewButton = null;
        this._aiUi.acceptButton = null;
        this._aiUi.rejectButton = null;
        this._aiUi.undoButton = null;
        this._aiUi.redoButton = null;
        this._refreshAiUiState();
    }

    _unmountUi() {
        if (this._root?.parentNode) this._root.parentNode.removeChild(this._root);
        this._root = null;
        this._mainPane = null;
        this._viewportShell = null;
        this._viewportStage = null;
        this._viewportOverlay = null;
        this._contextMenuRoot = null;
        this._contextMenuCopyButton = null;
        this._contextMenuCopyCanonicalButton = null;
        this._contextMenuOpen = false;
        this._contextMenuPath = '';
        this._contextMenuCanonicalPath = '';
        this._rightPane = null;
        this._readouts.layout = null;
        this._readouts.activeView = null;
        this._readouts.displayMode = null;
        this._readouts.userMode = null;
        this._readouts.meshSource = null;
        this._readouts.meshSync = null;
        this._readouts.meshLiveButton = null;
        this._readouts.meshLiveMode = null;
        this._readouts.meshLiveDot = null;
        this._readouts.meshRevision = null;
        this._readouts.meshLastCheck = null;
        this._readouts.aiWorkflow = null;
        this._readouts.aiScope = null;
        this._readouts.aiOutput = null;
        this._aiUi.input = null;
        this._aiUi.previewButton = null;
        this._aiUi.acceptButton = null;
        this._aiUi.rejectButton = null;
        this._aiUi.undoButton = null;
        this._aiUi.redoButton = null;
        this._buttonByPresetId.clear();
        this._buttonByDisplayMode.clear();
        this._buttonByUserMode.clear();
        this._autoOrbitButton = null;
        this._autoOrbitEnabled = false;
        this._autoOrbitReturnState = null;
        this._displayModeComboRoot = null;
        this._displayModeComboButton = null;
        this._displayModeComboPopup = null;
        this._displayModeComboPreviewHost = null;
        this._displayModeComboOpen = false;
        this._layoutComboRoot = null;
        this._layoutComboButton = null;
        this._layoutComboPopup = null;
        this._layoutComboPreviewHost = null;
        this._layoutComboOpen = false;
        this._overlayOptionsRoot = null;
        this._overlayOptionsButton = null;
        this._overlayOptionsPopup = null;
        this._overlayOptionsAxisRow = null;
        this._overlayOptionsPivotRow = null;
        this._overlayOptionsHoverHighlightRow = null;
        this._overlayOptionsFaceCentersRow = null;
        this._overlayOptionsOccludedFaceCentersRow = null;
        this._overlayOptionsOccludedWiresRow = null;
        this._overlayOptionsOpen = false;
        this._tileFrameById.clear();
        this._tileStatusById.clear();
        this._tileStatusElementById.clear();
        this._tileHoverHitById.clear();
        this._topologyCanonicalById.clear();
        this._topologyAuthoredById.clear();
        this._topologyWorldVertexById.clear();
        this._topologyEdgeVertexIdsById.clear();
        this._topologyFaceVertexIdsById.clear();
        this._hoverVertexHighlight = null;
        this._hoverEdgeHighlight = null;
        this._hoverFaceFillHighlight = null;
        this._hoverFaceOutlineHighlight = null;
        this._pivotOverlay = null;
        this._pivotOverlayTexture = null;
        this._tiles = [];
        this._hoverTileId = '';
        document.body.classList.remove('mesh-fab-active');
    }

    _createToolbarGroup(titleText) {
        const root = document.createElement('section');
        root.className = 'mesh-fab-topbar-group';
        const title = document.createElement('h3');
        title.className = 'mesh-fab-topbar-title';
        title.textContent = titleText;
        const buttons = document.createElement('div');
        buttons.className = 'mesh-fab-topbar-buttons';
        root.appendChild(title);
        root.appendChild(buttons);
        return { root, buttons };
    }

    _createIconButton({ label, icon, caption, onClick }) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mesh-fab-toolbar-btn';
        button.appendChild(createMaterialSymbolIcon(icon, { size: 'lg' }));
        const cap = document.createElement('span');
        cap.className = 'mesh-fab-btn-caption';
        cap.textContent = caption;
        button.appendChild(cap);
        setIconOnlyButtonLabel(button, label);
        button.addEventListener('click', onClick);
        return button;
    }

    _createDisplayModeCombo() {
        const wrap = document.createElement('div');
        wrap.className = 'mesh-fab-display-combo-wrap';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mesh-fab-toolbar-btn mesh-fab-layout-combo-btn mesh-fab-display-combo-btn';
        button.setAttribute('aria-haspopup', 'listbox');
        button.setAttribute('aria-expanded', 'false');
        setIconOnlyButtonLabel(button, 'Select display mode');
        button.addEventListener('click', () => {
            this._setLayoutPopupOpen(false);
            this._setOverlayOptionsOpen(false);
            this._setDisplayModePopupOpen(!this._displayModeComboOpen);
        });

        const main = document.createElement('span');
        main.className = 'mesh-fab-layout-combo-main mesh-fab-display-combo-main';
        const previewHost = document.createElement('span');
        previewHost.className = 'mesh-fab-layout-combo-preview mesh-fab-display-combo-preview';
        main.appendChild(previewHost);

        const separator = document.createElement('span');
        separator.className = 'mesh-fab-layout-combo-separator mesh-fab-display-combo-separator';
        separator.setAttribute('aria-hidden', 'true');

        const arrow = createMaterialSymbolIcon('expand_more', { size: 'sm' });
        arrow.classList.add('mesh-fab-layout-combo-arrow');
        arrow.classList.add('mesh-fab-display-combo-arrow');
        arrow.setAttribute('aria-hidden', 'true');

        button.appendChild(main);
        button.appendChild(separator);
        button.appendChild(arrow);

        const popup = document.createElement('div');
        popup.className = 'mesh-fab-display-popup';
        popup.setAttribute('role', 'listbox');

        this._buttonByDisplayMode.clear();
        for (const option of DISPLAY_MODE_OPTIONS) {
            const optButton = document.createElement('button');
            optButton.type = 'button';
            optButton.className = 'mesh-fab-display-popup-option';
            optButton.setAttribute('role', 'option');
            optButton.setAttribute('aria-selected', 'false');
            setIconOnlyButtonLabel(optButton, `Set display mode: ${option.label}`);
            optButton.addEventListener('click', () => {
                this._setDisplayMode(option.id);
                this._setDisplayModePopupOpen(false);
            });

            const icon = createMaterialSymbolIcon(option.icon, { size: 'sm' });
            icon.classList.add('mesh-fab-display-popup-icon');
            const text = document.createElement('span');
            text.className = 'mesh-fab-display-popup-label';
            text.textContent = option.label;
            optButton.appendChild(icon);
            optButton.appendChild(text);

            popup.appendChild(optButton);
            this._buttonByDisplayMode.set(option.id, optButton);
        }

        wrap.appendChild(button);
        wrap.appendChild(popup);

        this._displayModeComboRoot = wrap;
        this._displayModeComboButton = button;
        this._displayModeComboPopup = popup;
        this._displayModeComboPreviewHost = previewHost;
        this._setDisplayModePopupOpen(false);
        this._refreshDisplayModeComboSummary();

        return wrap;
    }

    _refreshDisplayModeComboSummary() {
        const mode = getDisplayModeOptionById(this._displayMode);
        if (this._displayModeComboPreviewHost) {
            this._displayModeComboPreviewHost.textContent = '';
            const icon = createMaterialSymbolIcon(mode.icon, { size: 'sm' });
            icon.classList.add('mesh-fab-display-combo-preview-icon');
            this._displayModeComboPreviewHost.appendChild(icon);
        }
        if (this._displayModeComboButton) {
            setIconOnlyButtonLabel(this._displayModeComboButton, `Display mode: ${mode.label}`);
        }
    }

    _setDisplayModePopupOpen(open) {
        const next = !!open;
        if (next === this._displayModeComboOpen) return;
        this._displayModeComboOpen = next;
        if (this._displayModeComboButton) {
            this._displayModeComboButton.setAttribute('aria-expanded', next ? 'true' : 'false');
        }
        this._displayModeComboPopup?.classList.toggle('is-open', next);
    }

    _createLayoutCombo() {
        const wrap = document.createElement('div');
        wrap.className = 'mesh-fab-layout-combo-wrap';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mesh-fab-toolbar-btn mesh-fab-layout-combo-btn';
        button.setAttribute('aria-haspopup', 'listbox');
        button.setAttribute('aria-expanded', 'false');
        setIconOnlyButtonLabel(button, 'Select viewport layout');
        button.addEventListener('click', () => {
            this._setDisplayModePopupOpen(false);
            this._setOverlayOptionsOpen(false);
            this._setLayoutPopupOpen(!this._layoutComboOpen);
        });

        const main = document.createElement('span');
        main.className = 'mesh-fab-layout-combo-main';
        const previewHost = document.createElement('span');
        previewHost.className = 'mesh-fab-layout-combo-preview';
        main.appendChild(previewHost);

        const separator = document.createElement('span');
        separator.className = 'mesh-fab-layout-combo-separator';
        separator.setAttribute('aria-hidden', 'true');

        const arrow = createMaterialSymbolIcon('expand_more', { size: 'sm' });
        arrow.classList.add('mesh-fab-layout-combo-arrow');
        arrow.setAttribute('aria-hidden', 'true');

        button.appendChild(main);
        button.appendChild(separator);
        button.appendChild(arrow);

        const popup = document.createElement('div');
        popup.className = 'mesh-fab-layout-popup';
        popup.setAttribute('role', 'listbox');

        this._buttonByPresetId.clear();
        for (const preset of VIEW_LAYOUT_PRESETS) {
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'mesh-fab-toolbar-btn mesh-fab-layout-popup-option';
            option.setAttribute('role', 'option');
            option.setAttribute('aria-selected', 'false');
            setIconOnlyButtonLabel(option, `Set view layout: ${describeLayoutPreset(preset)}`);
            option.addEventListener('click', () => {
                this._setLayoutPreset(preset.id);
                this._setLayoutPopupOpen(false);
            });

            option.appendChild(createLayoutIcon(
                preset.iconTop,
                preset.bottom.map((viewId) => String(ORTHO_VIEW_LABEL[viewId] ?? viewId).slice(0, 1).toUpperCase())
            ));
            popup.appendChild(option);
            this._buttonByPresetId.set(preset.id, option);
        }

        wrap.appendChild(button);
        wrap.appendChild(popup);

        this._layoutComboRoot = wrap;
        this._layoutComboButton = button;
        this._layoutComboPopup = popup;
        this._layoutComboPreviewHost = previewHost;
        this._setLayoutPopupOpen(false);

        return wrap;
    }

    _refreshLayoutComboSummary() {
        const preset = getPresetById(this._layoutPresetId);

        if (this._layoutComboPreviewHost) {
            this._layoutComboPreviewHost.textContent = '';
            const icon = createLayoutIcon(
                preset.iconTop,
                preset.bottom.map((viewId) => String(ORTHO_VIEW_LABEL[viewId] ?? viewId).slice(0, 1).toUpperCase())
            );
            icon.classList.add('mesh-fab-layout-icon-compact');
            this._layoutComboPreviewHost.appendChild(icon);
        }
        if (this._layoutComboButton) {
            setIconOnlyButtonLabel(this._layoutComboButton, `Select viewport layout. Current: ${describeLayoutPreset(preset)}`);
        }
    }

    _setLayoutPopupOpen(open) {
        const next = !!open;
        if (next === this._layoutComboOpen) return;
        this._layoutComboOpen = next;
        if (this._layoutComboButton) {
            this._layoutComboButton.setAttribute('aria-expanded', next ? 'true' : 'false');
        }
        this._layoutComboPopup?.classList.toggle('is-open', next);
    }

    _createOverlayOptionsMenu() {
        const wrap = document.createElement('div');
        wrap.className = 'mesh-fab-overlay-options-wrap';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mesh-fab-toolbar-btn mesh-fab-layout-combo-btn mesh-fab-overlay-options-btn';
        button.setAttribute('aria-haspopup', 'menu');
        button.setAttribute('aria-expanded', 'false');
        setIconOnlyButtonLabel(button, 'Open viewport overlay options');
        button.addEventListener('click', () => {
            this._setDisplayModePopupOpen(false);
            this._setLayoutPopupOpen(false);
            this._onOverlayOptionsToggle();
        });

        const icon = createMaterialSymbolIcon('bottom_panel_open', { size: 'lg' });
        icon.classList.add('mesh-fab-overlay-options-icon');
        const main = document.createElement('span');
        main.className = 'mesh-fab-layout-combo-main mesh-fab-overlay-options-main';
        main.appendChild(icon);
        const separator = document.createElement('span');
        separator.className = 'mesh-fab-layout-combo-separator mesh-fab-overlay-options-separator';
        separator.setAttribute('aria-hidden', 'true');
        const arrow = createMaterialSymbolIcon('expand_more', { size: 'sm' });
        arrow.classList.add('mesh-fab-layout-combo-arrow');
        arrow.classList.add('mesh-fab-overlay-options-arrow');
        arrow.setAttribute('aria-hidden', 'true');

        button.appendChild(main);
        button.appendChild(separator);
        button.appendChild(arrow);

        const popup = document.createElement('div');
        popup.className = 'mesh-fab-overlay-options-popup';
        popup.setAttribute('role', 'menu');

        const axisRow = document.createElement('button');
        axisRow.type = 'button';
        axisRow.className = 'mesh-fab-overlay-option-row';
        axisRow.setAttribute('role', 'menuitemcheckbox');
        axisRow.addEventListener('click', this._onAxisArrowsToggle);
        const axisLabel = document.createElement('span');
        axisLabel.className = 'mesh-fab-overlay-option-label';
        axisLabel.textContent = 'Axis Arrows';
        const axisSwitch = document.createElement('span');
        axisSwitch.className = 'mesh-fab-overlay-option-switch';
        axisSwitch.setAttribute('aria-hidden', 'true');
        const axisThumb = document.createElement('span');
        axisThumb.className = 'mesh-fab-overlay-option-switch-thumb';
        axisSwitch.appendChild(axisThumb);
        axisRow.appendChild(axisLabel);
        axisRow.appendChild(axisSwitch);
        popup.appendChild(axisRow);

        const hoverHighlightRow = document.createElement('button');
        hoverHighlightRow.type = 'button';
        hoverHighlightRow.className = 'mesh-fab-overlay-option-row';
        hoverHighlightRow.setAttribute('role', 'menuitemcheckbox');
        hoverHighlightRow.addEventListener('click', this._onHoverHighlightToggle);
        const hoverHighlightLabel = document.createElement('span');
        hoverHighlightLabel.className = 'mesh-fab-overlay-option-label';
        hoverHighlightLabel.textContent = 'Hover Highlight';
        const hoverHighlightSwitch = document.createElement('span');
        hoverHighlightSwitch.className = 'mesh-fab-overlay-option-switch';
        hoverHighlightSwitch.setAttribute('aria-hidden', 'true');
        const hoverHighlightThumb = document.createElement('span');
        hoverHighlightThumb.className = 'mesh-fab-overlay-option-switch-thumb';
        hoverHighlightSwitch.appendChild(hoverHighlightThumb);
        hoverHighlightRow.appendChild(hoverHighlightLabel);
        hoverHighlightRow.appendChild(hoverHighlightSwitch);
        popup.appendChild(hoverHighlightRow);

        const faceCentersRow = document.createElement('button');
        faceCentersRow.type = 'button';
        faceCentersRow.className = 'mesh-fab-overlay-option-row';
        faceCentersRow.setAttribute('role', 'menuitemcheckbox');
        faceCentersRow.addEventListener('click', this._onWireFaceCentersToggle);
        const faceCentersLabel = document.createElement('span');
        faceCentersLabel.className = 'mesh-fab-overlay-option-label';
        faceCentersLabel.textContent = 'Wireframe Face Centers';
        const faceCentersSwitch = document.createElement('span');
        faceCentersSwitch.className = 'mesh-fab-overlay-option-switch';
        faceCentersSwitch.setAttribute('aria-hidden', 'true');
        const faceCentersThumb = document.createElement('span');
        faceCentersThumb.className = 'mesh-fab-overlay-option-switch-thumb';
        faceCentersSwitch.appendChild(faceCentersThumb);
        faceCentersRow.appendChild(faceCentersLabel);
        faceCentersRow.appendChild(faceCentersSwitch);
        popup.appendChild(faceCentersRow);

        const occludedFaceCentersRow = document.createElement('button');
        occludedFaceCentersRow.type = 'button';
        occludedFaceCentersRow.className = 'mesh-fab-overlay-option-row';
        occludedFaceCentersRow.setAttribute('role', 'menuitemcheckbox');
        occludedFaceCentersRow.addEventListener('click', this._onOccludedFaceCentersToggle);
        const occludedFaceCentersLabel = document.createElement('span');
        occludedFaceCentersLabel.className = 'mesh-fab-overlay-option-label';
        occludedFaceCentersLabel.textContent = 'Hide Occluded Face Centers';
        const occludedFaceCentersSwitch = document.createElement('span');
        occludedFaceCentersSwitch.className = 'mesh-fab-overlay-option-switch';
        occludedFaceCentersSwitch.setAttribute('aria-hidden', 'true');
        const occludedFaceCentersThumb = document.createElement('span');
        occludedFaceCentersThumb.className = 'mesh-fab-overlay-option-switch-thumb';
        occludedFaceCentersSwitch.appendChild(occludedFaceCentersThumb);
        occludedFaceCentersRow.appendChild(occludedFaceCentersLabel);
        occludedFaceCentersRow.appendChild(occludedFaceCentersSwitch);
        popup.appendChild(occludedFaceCentersRow);

        const occludedWiresRow = document.createElement('button');
        occludedWiresRow.type = 'button';
        occludedWiresRow.className = 'mesh-fab-overlay-option-row';
        occludedWiresRow.setAttribute('role', 'menuitemcheckbox');
        occludedWiresRow.addEventListener('click', this._onOccludedWiresToggle);
        const occludedWiresLabel = document.createElement('span');
        occludedWiresLabel.className = 'mesh-fab-overlay-option-label';
        occludedWiresLabel.textContent = 'Hide Occluded Wires';
        const occludedWiresSwitch = document.createElement('span');
        occludedWiresSwitch.className = 'mesh-fab-overlay-option-switch';
        occludedWiresSwitch.setAttribute('aria-hidden', 'true');
        const occludedWiresThumb = document.createElement('span');
        occludedWiresThumb.className = 'mesh-fab-overlay-option-switch-thumb';
        occludedWiresSwitch.appendChild(occludedWiresThumb);
        occludedWiresRow.appendChild(occludedWiresLabel);
        occludedWiresRow.appendChild(occludedWiresSwitch);
        popup.appendChild(occludedWiresRow);

        const pivotRow = document.createElement('button');
        pivotRow.type = 'button';
        pivotRow.className = 'mesh-fab-overlay-option-row';
        pivotRow.setAttribute('role', 'menuitemcheckbox');
        pivotRow.addEventListener('click', this._onPivotOverlayToggle);
        const pivotLabel = document.createElement('span');
        pivotLabel.className = 'mesh-fab-overlay-option-label';
        pivotLabel.textContent = 'Show pivot';
        const pivotSwitch = document.createElement('span');
        pivotSwitch.className = 'mesh-fab-overlay-option-switch';
        pivotSwitch.setAttribute('aria-hidden', 'true');
        const pivotThumb = document.createElement('span');
        pivotThumb.className = 'mesh-fab-overlay-option-switch-thumb';
        pivotSwitch.appendChild(pivotThumb);
        pivotRow.appendChild(pivotLabel);
        pivotRow.appendChild(pivotSwitch);
        popup.appendChild(pivotRow);

        wrap.appendChild(button);
        wrap.appendChild(popup);

        this._overlayOptionsRoot = wrap;
        this._overlayOptionsButton = button;
        this._overlayOptionsPopup = popup;
        this._overlayOptionsAxisRow = axisRow;
        this._overlayOptionsPivotRow = pivotRow;
        this._overlayOptionsHoverHighlightRow = hoverHighlightRow;
        this._overlayOptionsFaceCentersRow = faceCentersRow;
        this._overlayOptionsOccludedFaceCentersRow = occludedFaceCentersRow;
        this._overlayOptionsOccludedWiresRow = occludedWiresRow;
        this._setOverlayOptionsOpen(false);
        this._refreshOverlayOptionsUi();
        return wrap;
    }

    _setOverlayOptionsOpen(open) {
        const next = !!open;
        if (next === this._overlayOptionsOpen) return;
        this._overlayOptionsOpen = next;
        if (this._overlayOptionsButton) {
            this._overlayOptionsButton.setAttribute('aria-expanded', next ? 'true' : 'false');
        }
        this._overlayOptionsPopup?.classList.toggle('is-open', next);
    }

    _toggleAxisArrows() {
        this._axisArrowsEnabled = !this._axisArrowsEnabled;
        this._refreshOverlayOptionsUi();
    }

    _togglePivotOverlay() {
        this._pivotOverlayEnabled = !this._pivotOverlayEnabled;
        if (this._pivotOverlay) {
            this._pivotOverlay.visible = !!this._pivotOverlayEnabled;
            if (this._pivotOverlayEnabled) {
                this._pivotOverlay.position.copy(this._pivotPosition);
            }
        }
        if (!this._pivotOverlayEnabled) {
            const hoverId = this._hoverTileId;
            const hoverHit = hoverId ? (this._tileHoverHitById.get(hoverId) ?? null) : null;
            const hoveredPivot = hoverHit?.kind === 'pivot';
            if (hoverId && hoverHit?.kind === 'pivot') {
                this._setTileHoverHit(hoverId, null);
                this._setTileStatus(hoverId, '-');
            }
            if (this._contextMenuOpen && hoveredPivot) {
                this._setContextMenuOpen(false);
            }
        }
        this._refreshOverlayOptionsUi();
    }

    _toggleHoverHighlight() {
        this._topologyHoverHighlightEnabled = !this._topologyHoverHighlightEnabled;
        this._refreshOverlayOptionsUi();
        if (!this._topologyHoverHighlightEnabled) {
            this._clearTopologyHoverHighlights();
        }
    }

    _toggleWireFaceCenters() {
        this._wireFaceCentersEnabled = !this._wireFaceCentersEnabled;
        this._refreshOverlayOptionsUi();
        this._applyDisplayModeToScene();
    }

    _toggleOccludedFaceCenters() {
        if (!this._wireFaceCentersEnabled) return;
        this._hideOccludedFaceCentersEnabled = !this._hideOccludedFaceCentersEnabled;
        this._refreshOverlayOptionsUi();
        this._applyDisplayModeToScene();
    }

    _toggleOccludedWires() {
        this._hideOccludedWiresEnabled = !this._hideOccludedWiresEnabled;
        this._refreshOverlayOptionsUi();
        this._applyDisplayModeToScene();
    }

    _setOverlayToggleState(row, enabled) {
        const target = row && typeof row === 'object' ? row : null;
        if (!target) return;
        target.setAttribute('aria-checked', enabled ? 'true' : 'false');
        target.classList.toggle('is-enabled', enabled);
    }

    _setOverlayToggleInteractivity(row, interactive) {
        const target = row && typeof row === 'object' ? row : null;
        if (!target) return;
        const isInteractive = !!interactive;
        target.disabled = !isInteractive;
        target.setAttribute('aria-disabled', isInteractive ? 'false' : 'true');
        target.classList.toggle('is-disabled', !isInteractive);
    }

    _refreshOverlayOptionsUi() {
        this._setOverlayToggleState(this._overlayOptionsAxisRow, !!this._axisArrowsEnabled);
        this._setOverlayToggleState(this._overlayOptionsPivotRow, !!this._pivotOverlayEnabled);
        this._setOverlayToggleState(this._overlayOptionsHoverHighlightRow, !!this._topologyHoverHighlightEnabled);
        this._setOverlayToggleState(this._overlayOptionsFaceCentersRow, !!this._wireFaceCentersEnabled);
        this._setOverlayToggleState(this._overlayOptionsOccludedFaceCentersRow, !!this._hideOccludedFaceCentersEnabled);
        this._setOverlayToggleState(this._overlayOptionsOccludedWiresRow, !!this._hideOccludedWiresEnabled);
        this._setOverlayToggleInteractivity(this._overlayOptionsOccludedFaceCentersRow, !!this._wireFaceCentersEnabled);
    }

    _setContextMenuOpen(open, { x = 0, y = 0, path = '', canonicalPath = '' } = {}) {
        const menu = this._contextMenuRoot;
        if (!menu) return;
        const shouldOpen = !!open;
        this._contextMenuOpen = shouldOpen;
        if (!shouldOpen) {
            menu.classList.remove('is-open');
            this._contextMenuPath = '';
            this._contextMenuCanonicalPath = '';
            return;
        }

        this._contextMenuPath = String(path ?? '').trim();
        this._contextMenuCanonicalPath = String(canonicalPath ?? '').trim();
        const hasPath = this._contextMenuPath.length > 0;
        const hasCanonicalPath = this._contextMenuCanonicalPath.length > 0;
        if (this._contextMenuCopyButton) {
            this._contextMenuCopyButton.disabled = !hasPath;
            this._contextMenuCopyButton.setAttribute('aria-disabled', hasPath ? 'false' : 'true');
        }
        if (this._contextMenuCopyCanonicalButton) {
            this._contextMenuCopyCanonicalButton.disabled = !hasCanonicalPath;
            this._contextMenuCopyCanonicalButton.setAttribute('aria-disabled', hasCanonicalPath ? 'false' : 'true');
        }

        menu.classList.add('is-open');
        const shell = this._viewportShell;
        const shellW = Math.max(1, Number(shell?.clientWidth) || 1);
        const shellH = Math.max(1, Number(shell?.clientHeight) || 1);
        const menuW = Math.max(1, Number(menu.offsetWidth) || 1);
        const menuH = Math.max(1, Number(menu.offsetHeight) || 1);
        const pad = 6;
        const left = clamp(Math.round(x), pad, Math.max(pad, shellW - menuW - pad));
        const top = clamp(Math.round(y), pad, Math.max(pad, shellH - menuH - pad));
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
    }

    async _writeClipboardText(text) {
        const content = String(text ?? '');
        if (!content) return false;
        try {
            const nav = globalThis?.navigator;
            if (nav?.clipboard?.writeText) {
                await nav.clipboard.writeText(content);
                return true;
            }
        } catch {}

        try {
            const area = document.createElement('textarea');
            area.value = content;
            area.setAttribute('readonly', 'true');
            area.style.position = 'fixed';
            area.style.left = '-9999px';
            area.style.top = '0';
            document.body.appendChild(area);
            area.select();
            area.setSelectionRange(0, area.value.length);
            const copied = document.execCommand('copy');
            area.remove();
            return !!copied;
        } catch {
            return false;
        }
    }

    async _handleContextMenuCopyPath() {
        const path = String(this._contextMenuPath ?? '').trim();
        if (!path) return;
        await this._writeClipboardText(path);
        this._setContextMenuOpen(false);
    }

    async _handleContextMenuCopyCanonicalPath() {
        const canonicalPath = String(this._contextMenuCanonicalPath ?? '').trim();
        if (!canonicalPath) return;
        await this._writeClipboardText(canonicalPath);
        this._setContextMenuOpen(false);
    }

    _handleContextMenu(event) {
        event.preventDefault();
        event.stopPropagation();

        const tile = this._pickTile(event.clientX, event.clientY);
        this._setHoveredTile(tile?.id ?? '');
        if (!tile) {
            this._setContextMenuOpen(false);
            return;
        }

        this._updateHoverTopologyStatus(event.clientX, event.clientY, tile);
        const hoveredHit = this._tileHoverHitById.get(tile.id) ?? null;
        const path = String(hoveredHit?.id ?? '').trim();
        const canonicalPath = String(hoveredHit?.canonicalId ?? '').trim();
        const shellRect = this._viewportShell?.getBoundingClientRect?.();
        const localX = shellRect ? event.clientX - shellRect.left : 0;
        const localY = shellRect ? event.clientY - shellRect.top : 0;
        this._setContextMenuOpen(true, {
            x: localX,
            y: localY,
            path,
            canonicalPath
        });
    }

    _handleDocumentPointerDown(event) {
        const target = event?.target ?? null;
        if (!target) return;
        if (this._displayModeComboOpen && !this._displayModeComboRoot?.contains(target)) {
            this._setDisplayModePopupOpen(false);
        }
        if (this._layoutComboOpen && !this._layoutComboRoot?.contains(target)) {
            this._setLayoutPopupOpen(false);
        }
        if (this._overlayOptionsOpen && !this._overlayOptionsRoot?.contains(target)) {
            this._setOverlayOptionsOpen(false);
        }
        if (this._contextMenuOpen && !this._contextMenuRoot?.contains(target)) {
            this._setContextMenuOpen(false);
        }
    }

    _handleDocumentKeyDown(event) {
        if (!this._displayModeComboOpen && !this._layoutComboOpen && !this._overlayOptionsOpen && !this._contextMenuOpen) return;
        const code = event?.code;
        const key = event?.key;
        if (code !== 'Escape' && key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        this._setDisplayModePopupOpen(false);
        this._setLayoutPopupOpen(false);
        this._setOverlayOptionsOpen(false);
        this._setContextMenuOpen(false);
    }

    _attachCanvasToViewport() {
        if (!this.canvas || !this._viewportStage) return;
        this._canvasHomeParent = this.canvas.parentNode ?? null;
        this._canvasHomeNextSibling = this.canvas.nextSibling ?? null;
        this._viewportStage.appendChild(this.canvas);
    }

    _detachCanvasFromViewport() {
        if (!this.canvas) return;
        const home = this._canvasHomeParent;
        if (home) {
            if (this._canvasHomeNextSibling && this._canvasHomeNextSibling.parentNode === home) {
                home.insertBefore(this.canvas, this._canvasHomeNextSibling);
            } else {
                home.appendChild(this.canvas);
            }
        }
        this._canvasHomeParent = null;
        this._canvasHomeNextSibling = null;
    }

    _setupScene() {
        const hemi = new THREE.HemisphereLight(0xb7bec8, 0x2f343d, 1.2);
        const sun = new THREE.DirectionalLight(0xffffff, 1.25);
        sun.position.set(9, 14, 6);
        sun.target.position.set(0, 0.6, 0);
        const grid = new THREE.GridHelper(80, 24, 0x6e7480, 0x4d525c);
        const pivotGeometry = new THREE.SphereGeometry(0.18, 18, 14);
        const pivotTexture = createPivotCheckerTexture();
        const pivotMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            map: pivotTexture,
            transparent: true,
            opacity: 0.98,
            depthTest: false,
            depthWrite: false
        });
        const pivot = new THREE.Mesh(pivotGeometry, pivotMaterial);
        pivot.name = 'mesh-fab-pivot-overlay';
        pivot.renderOrder = 98;
        pivot.visible = !!this._pivotOverlayEnabled;
        pivot.position.copy(this._pivotPosition);
        pivot.frustumCulled = false;
        const liveHost = new THREE.Group();
        liveHost.name = 'mesh-fab-live-host';

        this.scene.add(hemi);
        this.scene.add(sun);
        this.scene.add(sun.target);
        this.scene.add(grid);
        this.scene.add(pivot);
        this.scene.add(liveHost);

        this._pivotOverlay = pivot;
        this._pivotOverlayTexture = pivotTexture;
        this._liveMeshHostGroup = liveHost;
        this._ownedObjects.push(hemi, sun, sun.target, grid, pivot, liveHost);

        this.camera.near = 0.1;
        this.camera.far = 600;
        this._fitCamerasToMeshBounds(new THREE.Box3(
            new THREE.Vector3(-2, 0, -2),
            new THREE.Vector3(2, 3, 2)
        ), new THREE.Vector3(0, 0, 0));
        this._setupAxisGizmo();
    }

    _setupAxisGizmo() {
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 10);
        camera.position.set(0, 0, 4.2);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();

        const root = new THREE.Group();
        root.name = 'mesh-fab-axis-gizmo-root';
        scene.add(root);

        const axisLength = 1.18;
        const headLength = 0.34;
        const headWidth = 0.2;
        const xAxis = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), axisLength, 0xff5a5a, headLength, headWidth);
        const yAxis = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), axisLength, 0x63ff9b, headLength, headWidth);
        const zAxis = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), axisLength, 0x6aa5ff, headLength, headWidth);
        root.add(xAxis, yAxis, zAxis);

        const xLabel = createAxisLabelSprite('X', '#ff8a8a', new THREE.Vector3(axisLength + 0.28, 0, 0));
        const yLabel = createAxisLabelSprite('Y', '#86ffb3', new THREE.Vector3(0, axisLength + 0.28, 0));
        const zLabel = createAxisLabelSprite('Z', '#91bcff', new THREE.Vector3(0, 0, axisLength + 0.28));
        this._axisLabelSprites = {
            x: xLabel?.sprite ?? null,
            y: yLabel?.sprite ?? null,
            z: zLabel?.sprite ?? null
        };
        for (const label of [xLabel, yLabel, zLabel]) {
            if (!label) continue;
            root.add(label.sprite);
            this._axisGizmoMaterials.push(label.material);
            this._axisGizmoTextures.push(label.texture);
        }

        this._axisGizmoScene = scene;
        this._axisGizmoCamera = camera;
        this._axisGizmoRoot = root;
        this._axisGizmoMaterials.push(xAxis.line.material, xAxis.cone.material, yAxis.line.material, yAxis.cone.material, zAxis.line.material, zAxis.cone.material);
        this._axisGizmoGeometries = [xAxis.line.geometry, xAxis.cone.geometry, yAxis.line.geometry, yAxis.cone.geometry, zAxis.line.geometry, zAxis.cone.geometry];
    }

    _disposeSceneAssets() {
        this._clearLiveMeshScene();
        this._pivotOverlay?.geometry?.dispose?.();
        if (Array.isArray(this._pivotOverlay?.material)) {
            for (const mat of this._pivotOverlay.material) mat?.dispose?.();
        } else {
            this._pivotOverlay?.material?.dispose?.();
        }
        this._pivotOverlayTexture?.dispose?.();
        for (const object of this._ownedObjects) object?.removeFromParent?.();
        for (const geo of this._ownedGeometries) geo?.dispose?.();
        for (const mat of this._ownedMaterials) mat?.dispose?.();
        this._ownedObjects.length = 0;
        this._ownedGeometries.length = 0;
        this._ownedMaterials.length = 0;
        this._surfaceMeshes.length = 0;
        this._polygonWireOverlay = null;
        this._vertexOverlay = null;
        this._faceCenterOverlay = null;
        this._liveMeshHostGroup = null;
        this._pivotOverlay = null;
        this._pivotOverlayTexture = null;
        this._liveMeshParsedDocument = null;
        this._liveMeshSourceDocument = null;
        this._aiAcceptedBatches.length = 0;
        this._aiRedoBatches.length = 0;
        this._aiPreviewBatch = null;
        this._aiPreviewWindow = null;
        for (const material of this._axisGizmoMaterials) material?.dispose?.();
        for (const geometry of this._axisGizmoGeometries) geometry?.dispose?.();
        for (const texture of this._axisGizmoTextures) texture?.dispose?.();
        this._axisGizmoMaterials = [];
        this._axisGizmoGeometries = [];
        this._axisGizmoTextures = [];
        this._axisLabelSprites = {
            x: null,
            y: null,
            z: null
        };
        this._axisGizmoRoot = null;
        this._axisGizmoScene = null;
        this._axisGizmoCamera = null;
    }

    _clearLiveMeshScene() {
        if (this._liveMeshGroup?.parent) this._liveMeshGroup.removeFromParent();
        this._liveMeshGroup = null;
        for (const geo of this._ownedGeometries) geo?.dispose?.();
        for (const mat of this._ownedMaterials) mat?.dispose?.();
        this._ownedGeometries.length = 0;
        this._ownedMaterials.length = 0;
        this._surfaceMeshes.length = 0;
        this._polygonWireOverlay = null;
        this._vertexOverlay = null;
        this._faceCenterOverlay = null;
        this._surfaceMaterialDefaults = new WeakMap();
        this._topologyCanonicalById.clear();
        this._topologyAuthoredById.clear();
        this._topologyWorldVertexById.clear();
        this._topologyEdgeVertexIdsById.clear();
        this._topologyFaceVertexIdsById.clear();
        this._hoverFaceVertexCapacity = 3;
        this._hoverVertexHighlight = null;
        this._hoverEdgeHighlight = null;
        this._hoverFaceFillHighlight = null;
        this._hoverFaceOutlineHighlight = null;
    }

    _rebuildTopologyCanonicalIndex(parsedDocument) {
        this._topologyCanonicalById.clear();
        this._topologyAuthoredById.clear();
        const topologyIndex = parsedDocument?.topologyIndex ?? null;
        const register = (map, kind = '') => {
            if (!(map instanceof Map)) return;
            for (const [id, record] of map.entries()) {
                const key = String(id ?? '').trim();
                if (!key) continue;
                const canonicalPath = String(record?.address?.path ?? '').trim();
                if (canonicalPath) {
                    this._topologyCanonicalById.set(key, canonicalPath);
                }
                if (kind === 'face') {
                    const authoredLabel = String(record?.label ?? '').trim();
                    const authoredId = this._buildFaceAuthoredAliasId(key, authoredLabel);
                    if (authoredId) {
                        this._topologyAuthoredById.set(key, authoredId);
                    }
                }
            }
        };
        register(topologyIndex?.vertices, 'vertex');
        register(topologyIndex?.edges, 'edge');
        register(topologyIndex?.faces, 'face');
        register(topologyIndex?.triangles, 'triangle');
    }

    _rebuildTopologyHoverLookup(parsedDocument) {
        this._topologyWorldVertexById.clear();
        this._topologyEdgeVertexIdsById.clear();
        this._topologyFaceVertexIdsById.clear();
        this._hoverFaceVertexCapacity = 3;

        const objects = Array.isArray(parsedDocument?.objects) ? parsedDocument.objects : [];
        if (objects.length < 1) return;

        const euler = new THREE.Euler();
        const quat = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        const position = new THREE.Vector3();
        const matrix = new THREE.Matrix4();
        const point = new THREE.Vector3();

        for (const objectDef of objects) {
            const objectId = String(objectDef?.id ?? '').trim();
            if (!objectId) continue;
            const objectOverride = parsedDocument?.aiObjectOverrides?.get(objectId) ?? null;
            const objectPosition = objectOverride?.position ?? objectDef.position;
            const objectRotation = objectOverride?.rotation ?? objectDef.rotation;
            const objectScale = objectOverride?.scale ?? objectDef.scale;

            euler.set(
                Number(objectRotation?.[0]) || 0,
                Number(objectRotation?.[1]) || 0,
                Number(objectRotation?.[2]) || 0,
                'XYZ'
            );
            quat.setFromEuler(euler);
            scale.set(
                Number(objectScale?.[0]) || 1,
                Number(objectScale?.[1]) || 1,
                Number(objectScale?.[2]) || 1
            );
            position.set(
                Number(objectPosition?.[0]) || 0,
                Number(objectPosition?.[1]) || 0,
                Number(objectPosition?.[2]) || 0
            );
            matrix.compose(position, quat, scale);

            if (Array.isArray(objectDef?.vertices) && Array.isArray(objectDef?.vertexIds)) {
                const count = Math.min(objectDef.vertices.length, objectDef.vertexIds.length);
                for (let i = 0; i < count; i++) {
                    const vertexId = String(objectDef.vertexIds[i] ?? '').trim();
                    const source = objectDef.vertices[i];
                    if (!vertexId || !Array.isArray(source) || source.length < 3) continue;
                    point.set(
                        Number(source[0]) || 0,
                        Number(source[1]) || 0,
                        Number(source[2]) || 0
                    ).applyMatrix4(matrix);
                    this._topologyWorldVertexById.set(vertexId, point.clone());
                }
            }

            const edges = Array.isArray(objectDef?.edges) ? objectDef.edges : [];
            for (const edge of edges) {
                const edgeId = String(edge?.id ?? '').trim();
                const edgeVertexIds = Array.isArray(edge?.vertexIds) ? edge.vertexIds : [];
                if (!edgeId || edgeVertexIds.length < 2) continue;
                const a = String(edgeVertexIds[0] ?? '').trim();
                const b = String(edgeVertexIds[1] ?? '').trim();
                if (!a || !b) continue;
                this._topologyEdgeVertexIdsById.set(edgeId, Object.freeze([a, b]));
            }

            const faces = Array.isArray(objectDef?.faces) ? objectDef.faces : [];
            for (const face of faces) {
                const faceId = String(face?.id ?? '').trim();
                const faceVertexIds = Array.isArray(face?.vertexIds) ? face.vertexIds : [];
                if (!faceId || faceVertexIds.length < 3) continue;
                const ring = faceVertexIds
                    .map((vertexId) => String(vertexId ?? '').trim())
                    .filter(Boolean);
                if (ring.length < 3) continue;
                this._topologyFaceVertexIdsById.set(faceId, Object.freeze(ring));
                if (ring.length > this._hoverFaceVertexCapacity) {
                    this._hoverFaceVertexCapacity = ring.length;
                }
            }
        }
    }

    _setupTopologyHoverHighlights() {
        if (!this._liveMeshGroup) return;

        const vertexGeometry = new THREE.BufferGeometry();
        vertexGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3), 3));
        vertexGeometry.setDrawRange(0, 0);
        const vertexMaterial = new THREE.PointsMaterial({
            color: TOPOLOGY_HOVER_ORANGE,
            size: 9.5,
            sizeAttenuation: false,
            transparent: true,
            opacity: 0.98,
            depthTest: false,
            depthWrite: false
        });
        const vertexHighlight = new THREE.Points(vertexGeometry, vertexMaterial);
        vertexHighlight.name = 'mesh-fab-hover-vertex';
        vertexHighlight.renderOrder = 80;
        vertexHighlight.visible = false;
        vertexHighlight.frustumCulled = false;
        this._liveMeshGroup.add(vertexHighlight);

        const edgeGeometry = new THREE.BufferGeometry();
        edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
        edgeGeometry.setDrawRange(0, 0);
        const edgeMaterial = new THREE.LineBasicMaterial({
            color: TOPOLOGY_HOVER_ORANGE,
            transparent: true,
            opacity: 0.98,
            depthTest: false,
            depthWrite: false
        });
        const edgeHighlight = new THREE.LineSegments(edgeGeometry, edgeMaterial);
        edgeHighlight.name = 'mesh-fab-hover-edge';
        edgeHighlight.renderOrder = 79;
        edgeHighlight.visible = false;
        edgeHighlight.frustumCulled = false;
        this._liveMeshGroup.add(edgeHighlight);

        const capacity = Math.max(3, this._hoverFaceVertexCapacity);
        const faceFillGeometry = new THREE.BufferGeometry();
        faceFillGeometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(new Float32Array(capacity * 3), 3)
        );
        const FaceIndexArray = capacity > 65535 ? Uint32Array : Uint16Array;
        const faceIndex = new FaceIndexArray((capacity - 2) * 3);
        for (let i = 0; i < capacity - 2; i++) {
            const base = i * 3;
            faceIndex[base] = 0;
            faceIndex[base + 1] = i + 1;
            faceIndex[base + 2] = i + 2;
        }
        faceFillGeometry.setIndex(new THREE.BufferAttribute(faceIndex, 1));
        faceFillGeometry.setDrawRange(0, 0);
        const faceFillMaterial = new THREE.MeshBasicMaterial({
            color: TOPOLOGY_HOVER_ORANGE,
            transparent: true,
            opacity: 0.23,
            side: THREE.DoubleSide,
            depthTest: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1
        });
        const faceFillHighlight = new THREE.Mesh(faceFillGeometry, faceFillMaterial);
        faceFillHighlight.name = 'mesh-fab-hover-face-fill';
        faceFillHighlight.renderOrder = 78;
        faceFillHighlight.visible = false;
        faceFillHighlight.frustumCulled = false;
        this._liveMeshGroup.add(faceFillHighlight);

        const faceOutlineGeometry = new THREE.BufferGeometry();
        faceOutlineGeometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(new Float32Array(capacity * 3), 3)
        );
        faceOutlineGeometry.setDrawRange(0, 0);
        const faceOutlineMaterial = new THREE.LineBasicMaterial({
            color: TOPOLOGY_HOVER_ORANGE,
            transparent: true,
            opacity: 0.98,
            depthTest: false,
            depthWrite: false
        });
        const faceOutlineHighlight = new THREE.LineLoop(faceOutlineGeometry, faceOutlineMaterial);
        faceOutlineHighlight.name = 'mesh-fab-hover-face-outline';
        faceOutlineHighlight.renderOrder = 81;
        faceOutlineHighlight.visible = false;
        faceOutlineHighlight.frustumCulled = false;
        this._liveMeshGroup.add(faceOutlineHighlight);

        this._hoverVertexHighlight = vertexHighlight;
        this._hoverEdgeHighlight = edgeHighlight;
        this._hoverFaceFillHighlight = faceFillHighlight;
        this._hoverFaceOutlineHighlight = faceOutlineHighlight;
        this._ownedGeometries.push(vertexGeometry, edgeGeometry, faceFillGeometry, faceOutlineGeometry);
        this._ownedMaterials.push(vertexMaterial, edgeMaterial, faceFillMaterial, faceOutlineMaterial);
    }

    _clearTopologyHoverHighlights() {
        if (this._hoverVertexHighlight) {
            this._hoverVertexHighlight.visible = false;
            this._hoverVertexHighlight.geometry?.setDrawRange?.(0, 0);
        }
        if (this._hoverEdgeHighlight) {
            this._hoverEdgeHighlight.visible = false;
            this._hoverEdgeHighlight.geometry?.setDrawRange?.(0, 0);
        }
        if (this._hoverFaceFillHighlight) {
            this._hoverFaceFillHighlight.visible = false;
            this._hoverFaceFillHighlight.geometry?.setDrawRange?.(0, 0);
        }
        if (this._hoverFaceOutlineHighlight) {
            this._hoverFaceOutlineHighlight.visible = false;
            this._hoverFaceOutlineHighlight.geometry?.setDrawRange?.(0, 0);
        }
    }

    _showTopologyHoverVertex(vertexId) {
        const target = this._hoverVertexHighlight;
        const point = this._topologyWorldVertexById.get(String(vertexId ?? '').trim()) ?? null;
        if (!target || !point) return false;
        this._clearTopologyHoverHighlights();
        const attr = target.geometry?.getAttribute?.('position');
        if (!attr) return false;
        attr.setXYZ(0, point.x, point.y, point.z);
        attr.needsUpdate = true;
        target.geometry.setDrawRange(0, 1);
        target.visible = true;
        return true;
    }

    _showTopologyHoverEdge(edgeId) {
        const target = this._hoverEdgeHighlight;
        const vertexIds = this._topologyEdgeVertexIdsById.get(String(edgeId ?? '').trim()) ?? null;
        if (!target || !Array.isArray(vertexIds) || vertexIds.length < 2) return false;
        const a = this._topologyWorldVertexById.get(vertexIds[0]) ?? null;
        const b = this._topologyWorldVertexById.get(vertexIds[1]) ?? null;
        if (!a || !b) return false;
        this._clearTopologyHoverHighlights();
        const attr = target.geometry?.getAttribute?.('position');
        if (!attr) return false;
        attr.setXYZ(0, a.x, a.y, a.z);
        attr.setXYZ(1, b.x, b.y, b.z);
        attr.needsUpdate = true;
        target.geometry.setDrawRange(0, 2);
        target.visible = true;
        return true;
    }

    _showTopologyHoverFace(faceId) {
        const fill = this._hoverFaceFillHighlight;
        const outline = this._hoverFaceOutlineHighlight;
        const vertexRing = this._topologyFaceVertexIdsById.get(String(faceId ?? '').trim()) ?? null;
        if (!fill || !outline || !Array.isArray(vertexRing) || vertexRing.length < 3) return false;

        const count = Math.min(vertexRing.length, this._hoverFaceVertexCapacity);
        if (count < 3) return false;
        const points = new Array(count);
        for (let i = 0; i < count; i++) {
            const point = this._topologyWorldVertexById.get(vertexRing[i]) ?? null;
            if (!point) return false;
            points[i] = point;
        }

        this._clearTopologyHoverHighlights();
        const fillAttr = fill.geometry?.getAttribute?.('position');
        const outlineAttr = outline.geometry?.getAttribute?.('position');
        if (!fillAttr || !outlineAttr) return false;

        for (let i = 0; i < count; i++) {
            const point = points[i];
            fillAttr.setXYZ(i, point.x, point.y, point.z);
            outlineAttr.setXYZ(i, point.x, point.y, point.z);
        }
        fillAttr.needsUpdate = true;
        outlineAttr.needsUpdate = true;
        fill.geometry.setDrawRange(0, (count - 2) * 3);
        outline.geometry.setDrawRange(0, count);
        fill.visible = true;
        outline.visible = true;
        return true;
    }

    _setTopologyHoverHighlight(hit) {
        if (!this._topologyHoverHighlightEnabled) {
            this._clearTopologyHoverHighlights();
            return;
        }
        if (!hit || typeof hit !== 'object') {
            this._clearTopologyHoverHighlights();
            return;
        }
        const id = String(hit.id ?? '').trim();
        const kind = String(hit.kind ?? '').trim().toLowerCase();
        if (!id || !kind) {
            this._clearTopologyHoverHighlights();
            return;
        }
        let highlighted = false;
        if (kind === 'vertex') {
            highlighted = this._showTopologyHoverVertex(id);
        } else if (kind === 'edge') {
            highlighted = this._showTopologyHoverEdge(id);
        } else if (kind === 'face') {
            highlighted = this._showTopologyHoverFace(id);
        }
        if (!highlighted) {
            this._clearTopologyHoverHighlights();
        }
    }

    _resolveScenePivotPosition(surfaceMeshes) {
        if (Array.isArray(surfaceMeshes) && surfaceMeshes.length > 0) {
            const first = surfaceMeshes[0];
            if (first?.isObject3D) {
                const pivot = first.getWorldPosition(new THREE.Vector3());
                if (Number.isFinite(pivot.x) && Number.isFinite(pivot.y) && Number.isFinite(pivot.z)) {
                    return pivot;
                }
            }
        }
        return new THREE.Vector3(0, 0, 0);
    }

    _updateMeshBoundsState(bounds, pivotPosition = null) {
        const safeBounds = bounds?.isBox3 && !bounds.isEmpty()
            ? bounds
            : new THREE.Box3(
                new THREE.Vector3(-2, 0, -2),
                new THREE.Vector3(2, 3, 2)
            );
        const center = safeBounds.getCenter(new THREE.Vector3());
        const size = safeBounds.getSize(new THREE.Vector3());

        this._modelSize.copy(size);
        this._modelCenter.copy(center);
        const hasPivot = pivotPosition?.isVector3
            && Number.isFinite(pivotPosition.x)
            && Number.isFinite(pivotPosition.y)
            && Number.isFinite(pivotPosition.z);
        this._pivotPosition.copy(hasPivot ? pivotPosition : center);
        if (this._pivotOverlay) this._pivotOverlay.position.copy(this._pivotPosition);
        return { center, size };
    }

    _fitCamerasToMeshBounds(bounds, pivotPosition = null) {
        const { center, size } = this._updateMeshBoundsState(bounds, pivotPosition);
        const maxAxis = Math.max(size.x, size.y, size.z, 1);
        const radius = Math.max(maxAxis * 0.5, 1.25);
        this._orbitTarget.copy(center);
        this._orbitRadius = Math.max(radius * 3.1, 8);
        this._orthoDistance = Math.max(radius * 3.2, 10);
        this._orthoBaseSpan = Math.max(maxAxis * 2.2, 8);
        this._updateMainCameraOrbit();
    }

    _applyLiveMeshDocument(rawDocument) {
        this._liveMeshSourceDocument = cloneJsonValue(rawDocument);
        this._renderEffectiveMeshDocument();
    }

    _buildCurrentAiWorkflowDocument() {
        if (!this._liveMeshSourceDocument) {
            throw new Error('[MeshFabricationView] Live mesh source document is not available.');
        }
        return buildAiWorkflowDocument(this._liveMeshSourceDocument, {
            acceptedBatches: this._aiAcceptedBatches,
            previewBatch: this._aiPreviewBatch
        });
    }

    _renderEffectiveMeshDocument() {
        if (!this._liveMeshSourceDocument) return null;
        const hasPreviousMesh = !!this._liveMeshParsedDocument;
        const workflowDoc = this._buildCurrentAiWorkflowDocument();
        const parsed = parseLiveMeshDocument(workflowDoc.document);
        const built = buildThreeGroupFromLiveMesh(parsed);

        this._clearLiveMeshScene();
        this._rebuildTopologyCanonicalIndex(parsed);
        this._rebuildTopologyHoverLookup(parsed);
        this._liveMeshGroup = built.group;
        this._liveMeshParsedDocument = parsed;
        this._surfaceMeshes.push(...built.surfaceMeshes);
        this._polygonWireOverlay = built.polygonWire ?? null;
        this._vertexOverlay = built.vertexOverlay ?? null;
        this._faceCenterOverlay = built.faceCenterOverlay ?? null;
        this._ownedGeometries.push(...built.geometries);
        this._ownedMaterials.push(...built.materials);
        this._liveMeshHostGroup?.add(this._liveMeshGroup);
        this._setupTopologyHoverHighlights();
        this._clearTopologyHoverHighlights();
        this._applyFaceCenterOcclusionSetting();
        this._applyDisplayModeToScene();

        this._liveMeshRevision = parsed.revision;
        const pivotPosition = this._resolveScenePivotPosition(built.surfaceMeshes);
        if (!hasPreviousMesh) {
            this._fitCamerasToMeshBounds(built.bounds, pivotPosition);
        } else {
            this._updateMeshBoundsState(built.bounds, pivotPosition);
        }
        this._aiPreviewWindow = workflowDoc.window;
        return { parsed, workflowWindow: workflowDoc.window };
    }

    _startMeshSync() {
        this._liveMeshEnabled = true;
        this._stopMeshSync();
        this._liveMeshSyncLabel = 'Connecting';
        this._liveMeshHasError = false;
        this._updateReadouts();

        if (!this._meshStaticBootstrapTried) {
            void this._loadBootstrapMeshFromStaticFile();
        }
        void this._pollLiveMesh({ force: true });
        this._meshSyncIntervalId = window.setInterval(() => {
            void this._pollLiveMesh();
        }, LIVE_MESH_POLL_INTERVAL_MS);
        this._updateReadouts();
    }

    _stopMeshSync() {
        if (this._meshSyncIntervalId !== null) {
            window.clearInterval(this._meshSyncIntervalId);
            this._meshSyncIntervalId = null;
        }
        this._meshSyncAbortController?.abort();
        this._meshSyncAbortController = null;
        this._meshSyncInFlight = false;
        this._updateReadouts();
    }

    _toggleLiveMeshSync() {
        if (this._liveMeshEnabled) {
            this._liveMeshEnabled = false;
            this._stopMeshSync();
            this._liveMeshSyncLabel = 'Polling paused';
            this._liveMeshHasError = false;
            this._updateReadouts();
            return;
        }
        this._startMeshSync();
    }

    async _pollLiveMesh({ force = false } = {}) {
        if (!this._liveMeshEnabled) return;
        if (this._meshSyncInFlight) return;
        this._meshSyncInFlight = true;
        this._liveMeshLastCheckMs = Date.now();

        const controller = new AbortController();
        this._meshSyncAbortController = controller;

        try {
            const headers = new Headers({ Accept: 'application/json' });
            if (!force && this._liveMeshEtag) headers.set('If-None-Match', this._liveMeshEtag);
            if (!force && this._liveMeshLastModified) headers.set('If-Modified-Since', this._liveMeshLastModified);

            const response = await fetch(this._meshEndpoint, {
                method: 'GET',
                cache: 'no-store',
                headers,
                signal: controller.signal
            });

            if (response.status === 304) {
                this._liveMeshSyncLabel = 'Not modified';
                this._liveMeshHasError = false;
                return;
            }
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error(`HTTP 404 (mesh API not routed at ${this._meshEndpoint})`);
                }
                throw new Error(`HTTP ${response.status}`);
            }

            const etag = response.headers.get('ETag');
            const lastModified = response.headers.get('Last-Modified');
            if (etag) this._liveMeshEtag = etag;
            if (lastModified) this._liveMeshLastModified = lastModified;

            const payload = await response.json();
            this._applyLiveMeshDocument(payload);
            this._liveMeshSyncLabel = 'Updated';
            this._liveMeshUpdatePulseUntilMs = Date.now() + LIVE_MESH_UPDATE_PULSE_MS;
            this._liveMeshHasError = false;
        } catch (err) {
            if (controller.signal.aborted) return;
            this._liveMeshSyncLabel = `Error: ${err?.message ?? String(err)}`;
            this._liveMeshHasError = true;
            console.warn('[MeshFabricationView] Live mesh polling failed.', err);
            if (!this._liveMeshParsedDocument) {
                void this._loadBootstrapMeshFromStaticFile();
            }
        } finally {
            this._meshSyncInFlight = false;
            if (this._meshSyncAbortController === controller) {
                this._meshSyncAbortController = null;
            }
            this._liveMeshLastCheckMs = Date.now();
            this._updateReadouts();
        }
    }

    async _loadBootstrapMeshFromStaticFile() {
        if (this._meshStaticBootstrapTried) return;
        this._meshStaticBootstrapTried = true;

        try {
            const response = await fetch(this._meshStaticFileUrl, {
                method: 'GET',
                cache: 'no-store',
                headers: { Accept: 'application/json' }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json();
            this._applyLiveMeshDocument(payload);
            if (this._liveMeshSyncLabel.startsWith('Error') || this._liveMeshSyncLabel === 'Connecting') {
                this._liveMeshSyncLabel = 'Loaded default mesh';
            }
            this._liveMeshUpdatePulseUntilMs = Date.now() + LIVE_MESH_UPDATE_PULSE_MS;
            this._liveMeshHasError = false;
            this._updateReadouts();
        } catch (err) {
            this._liveMeshHasError = true;
            console.warn('[MeshFabricationView] Failed to load bootstrap mesh file.', err);
        }
    }

    _downloadCurrentMeshObj() {
        if (!this._liveMeshParsedDocument) {
            this._liveMeshSyncLabel = 'Error: no mesh loaded';
            this._liveMeshHasError = true;
            this._updateReadouts();
            return;
        }

        const objText = buildObjTextFromLiveMesh(this._liveMeshParsedDocument);
        const meshId = sanitizeFileToken(this._liveMeshParsedDocument.meshId, 'mesh');
        const revision = sanitizeFileToken(this._liveMeshParsedDocument.revision, 'rev');
        const filename = `${meshId}.${revision}.obj`;

        const blob = new Blob([objText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);

        this._liveMeshSyncLabel = `Downloaded ${filename}`;
        this._liveMeshHasError = false;
        this._updateReadouts();
    }

    _refreshAiUiState() {
        const hasSource = !!this._liveMeshSourceDocument;
        const hasDraft = this._aiDraftText.trim().length > 0;
        const hasPreview = !!this._aiPreviewBatch;

        if (this._aiUi.input && this._aiUi.input.value !== this._aiDraftText) {
            this._aiUi.input.value = this._aiDraftText;
        }
        if (this._aiUi.previewButton) {
            this._aiUi.previewButton.disabled = !hasSource || !hasDraft;
        }
        if (this._aiUi.acceptButton) {
            this._aiUi.acceptButton.disabled = !hasPreview || !this._aiPreviewAcceptable;
        }
        if (this._aiUi.rejectButton) {
            this._aiUi.rejectButton.disabled = !hasPreview;
        }
        if (this._aiUi.undoButton) {
            this._aiUi.undoButton.disabled = this._aiAcceptedBatches.length < 1;
        }
        if (this._aiUi.redoButton) {
            this._aiUi.redoButton.disabled = this._aiRedoBatches.length < 1;
        }
    }

    _setAiOutput(lines) {
        this._aiOutputText = Array.isArray(lines) ? lines.filter(Boolean).join('\n') : String(lines ?? '');
    }

    _handleAiDraftInput(event) {
        this._aiDraftText = String(event?.target?.value ?? '');
        if (this._aiPreviewBatch) {
            this._aiPreviewBatch = null;
            this._aiPreviewAcceptable = false;
            try {
                this._renderEffectiveMeshDocument();
            } catch (err) {
                this._liveMeshSyncLabel = `Error: ${err?.message ?? String(err)}`;
                this._liveMeshHasError = true;
            }
            this._aiWorkflowStatus = 'Draft changed';
            this._setAiOutput([
                'Draft changed. Previous preview was cleared.',
                `Accepted batches: ${this._aiAcceptedBatches.length}`,
                `Redo batches: ${this._aiRedoBatches.length}`
            ]);
        }
        this._refreshAiUiState();
        this._updateReadouts();
    }

    _handleAiPreview() {
        if (!this._liveMeshSourceDocument) {
            this._aiWorkflowStatus = 'No source mesh';
            this._setAiOutput(['Preview blocked: no source mesh loaded yet.']);
            this._aiPreviewAcceptable = false;
            this._refreshAiUiState();
            this._updateReadouts();
            return;
        }

        const evaluation = buildPreviewEvaluation({
            draftText: this._aiDraftText,
            acceptedBatches: this._aiAcceptedBatches
        });
        if (evaluation.hasError) {
            this._aiPreviewBatch = null;
            this._aiPreviewAcceptable = false;
            this._aiWorkflowStatus = 'Draft invalid';
            this._setAiOutput([
                'Preview blocked by safety guardrails:',
                ...evaluation.issues.map((issue) => `- ${issue.message}`)
            ]);
            this._refreshAiUiState();
            this._updateReadouts();
            return;
        }

        this._aiBatchSerial += 1;
        this._aiPreviewBatch = createInstructionBatch(evaluation.lines, this._aiBatchSerial);
        this._aiPreviewAcceptable = false;

        try {
            const renderResult = this._renderEffectiveMeshDocument();
            const parsed = renderResult?.parsed ?? null;
            const workflowWindow = renderResult?.workflowWindow ?? null;
            const previewStart = workflowWindow?.previewInstructionStart ?? 0;
            const previewCount = workflowWindow?.previewInstructionCount ?? 0;
            const scopeSummary = summarizeCommandWindow(parsed?.aiCommandPlan, previewStart, previewCount);
            const operationSummary = summarizeOperationWindow(parsed?.aiOperationLog, previewStart, previewCount);
            const acceptable = canAcceptPreview({
                commandScopeSummary: scopeSummary,
                operationSummary,
                constraints: MESH_AI_QUALITY_CONSTRAINTS_V1
            });
            this._aiPreviewAcceptable = acceptable;
            this._aiWorkflowStatus = acceptable ? 'Preview ready' : 'Preview has issues';

            const lines = [
                `Preview batch: ${this._aiPreviewBatch.batchId}`,
                formatAiScopeSummary(scopeSummary),
                formatAiSummaryLine(operationSummary),
                `Accepted batches: ${this._aiAcceptedBatches.length}`
            ];
            if (!acceptable) {
                lines.push('Accept disabled: preview contains hook/unsupported/failed operations.');
            }
            const recentOps = getRecentOperationLines(parsed?.aiOperationLog);
            if (recentOps.length) {
                lines.push('Recent ops:');
                lines.push(...recentOps);
            }
            this._setAiOutput(lines);
        } catch (err) {
            this._aiPreviewBatch = null;
            this._aiPreviewAcceptable = false;
            this._aiWorkflowStatus = 'Preview error';
            this._setAiOutput([`Preview failed: ${err?.message ?? String(err)}`]);
            this._liveMeshSyncLabel = `Error: ${err?.message ?? String(err)}`;
            this._liveMeshHasError = true;
            console.warn('[MeshFabricationView] AI preview failed.', err);
        }

        this._refreshAiUiState();
        this._updateReadouts();
    }

    _handleAiAccept() {
        if (!this._aiPreviewBatch) return;
        if (!this._aiPreviewAcceptable) {
            this._aiWorkflowStatus = 'Accept blocked';
            this._setAiOutput(['Accept blocked: preview must be valid first.']);
            this._refreshAiUiState();
            this._updateReadouts();
            return;
        }

        const acceptedBatch = this._aiPreviewBatch;
        this._aiAcceptedBatches.push(acceptedBatch);
        this._aiPreviewBatch = null;
        this._aiPreviewAcceptable = false;
        this._aiRedoBatches.length = 0;
        this._aiDraftText = '';

        try {
            const renderResult = this._renderEffectiveMeshDocument();
            const parsed = renderResult?.parsed ?? null;
            const workflowWindow = renderResult?.workflowWindow ?? null;
            const acceptedCount = acceptedBatch.instructions.length;
            const acceptedStart = Math.max(
                0,
                (workflowWindow?.acceptedInstructionStart ?? 0)
                + (workflowWindow?.acceptedInstructionCount ?? 0)
                - acceptedCount
            );
            const scopeSummary = summarizeCommandWindow(parsed?.aiCommandPlan, acceptedStart, acceptedCount);
            const operationSummary = summarizeOperationWindow(parsed?.aiOperationLog, acceptedStart, acceptedCount);

            this._aiWorkflowStatus = 'Applied';
            this._setAiOutput([
                `Applied batch: ${acceptedBatch.batchId}`,
                formatAiScopeSummary(scopeSummary),
                formatAiSummaryLine(operationSummary),
                `Accepted batches: ${this._aiAcceptedBatches.length}`,
                `Redo batches: ${this._aiRedoBatches.length}`
            ]);
        } catch (err) {
            this._aiWorkflowStatus = 'Apply error';
            this._setAiOutput([`Apply failed: ${err?.message ?? String(err)}`]);
            this._liveMeshSyncLabel = `Error: ${err?.message ?? String(err)}`;
            this._liveMeshHasError = true;
            console.warn('[MeshFabricationView] AI apply failed.', err);
        }

        this._refreshAiUiState();
        this._updateReadouts();
    }

    _handleAiReject() {
        if (!this._aiPreviewBatch) return;
        this._aiPreviewBatch = null;
        this._aiPreviewAcceptable = false;
        try {
            this._renderEffectiveMeshDocument();
        } catch (err) {
            this._liveMeshSyncLabel = `Error: ${err?.message ?? String(err)}`;
            this._liveMeshHasError = true;
            console.warn('[MeshFabricationView] AI reject rerender failed.', err);
        }

        this._aiWorkflowStatus = 'Preview rejected';
        this._setAiOutput([
            'Preview rejected.',
            `Accepted batches: ${this._aiAcceptedBatches.length}`,
            `Redo batches: ${this._aiRedoBatches.length}`
        ]);
        this._refreshAiUiState();
        this._updateReadouts();
    }

    _handleAiUndo() {
        if (this._aiAcceptedBatches.length < 1) return;
        if (this._aiPreviewBatch) {
            this._aiPreviewBatch = null;
            this._aiPreviewAcceptable = false;
        }

        const batch = this._aiAcceptedBatches.pop();
        this._aiRedoBatches.push(batch);
        try {
            this._renderEffectiveMeshDocument();
        } catch (err) {
            this._liveMeshSyncLabel = `Error: ${err?.message ?? String(err)}`;
            this._liveMeshHasError = true;
            console.warn('[MeshFabricationView] AI undo failed.', err);
        }

        this._aiWorkflowStatus = 'Undo';
        this._setAiOutput([
            `Undo batch: ${batch?.batchId ?? '-'}`,
            `Accepted batches: ${this._aiAcceptedBatches.length}`,
            `Redo batches: ${this._aiRedoBatches.length}`
        ]);
        this._refreshAiUiState();
        this._updateReadouts();
    }

    _handleAiRedo() {
        if (this._aiRedoBatches.length < 1) return;
        if (this._aiPreviewBatch) {
            this._aiPreviewBatch = null;
            this._aiPreviewAcceptable = false;
        }

        const batch = this._aiRedoBatches.pop();
        this._aiAcceptedBatches.push(batch);
        try {
            this._renderEffectiveMeshDocument();
        } catch (err) {
            this._liveMeshSyncLabel = `Error: ${err?.message ?? String(err)}`;
            this._liveMeshHasError = true;
            console.warn('[MeshFabricationView] AI redo failed.', err);
        }

        this._aiWorkflowStatus = 'Redo';
        this._setAiOutput([
            `Redo batch: ${batch?.batchId ?? '-'}`,
            `Accepted batches: ${this._aiAcceptedBatches.length}`,
            `Redo batches: ${this._aiRedoBatches.length}`
        ]);
        this._refreshAiUiState();
        this._updateReadouts();
    }

    _attachEvents() {
        if (!this.canvas) return;

        this.canvas.style.touchAction = 'none';
        window.addEventListener('resize', this._onWindowResize, { passive: true });
        document.addEventListener('pointerdown', this._onDocumentPointerDown, { passive: true });
        window.addEventListener('keydown', this._onDocumentKeyDown, { passive: false });
        this.canvas.addEventListener('pointerdown', this._onPointerDown, { passive: false });
        this.canvas.addEventListener('pointermove', this._onPointerMove, { passive: false });
        this.canvas.addEventListener('pointerup', this._onPointerUp, { passive: false });
        this.canvas.addEventListener('pointercancel', this._onPointerCancel, { passive: false });
        this.canvas.addEventListener('pointerleave', this._onPointerLeave, { passive: true });
        this.canvas.addEventListener('wheel', this._onWheel, { passive: false });
        this.canvas.addEventListener('contextmenu', this._onContextMenu, { passive: false });

        if (typeof ResizeObserver === 'function' && this._viewportStage) {
            this._resizeObserver = new ResizeObserver(() => this._applyViewportSize());
            this._resizeObserver.observe(this._viewportStage);
        }
    }

    _detachEvents() {
        window.removeEventListener('resize', this._onWindowResize);
        document.removeEventListener('pointerdown', this._onDocumentPointerDown);
        window.removeEventListener('keydown', this._onDocumentKeyDown);
        if (this.canvas) {
            this.canvas.style.touchAction = '';
            this.canvas.removeEventListener('pointerdown', this._onPointerDown);
            this.canvas.removeEventListener('pointermove', this._onPointerMove);
            this.canvas.removeEventListener('pointerup', this._onPointerUp);
            this.canvas.removeEventListener('pointercancel', this._onPointerCancel);
            this.canvas.removeEventListener('pointerleave', this._onPointerLeave);
            this.canvas.removeEventListener('wheel', this._onWheel);
            this.canvas.removeEventListener('contextmenu', this._onContextMenu);
        }
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
        this._setDisplayModePopupOpen(false);
        this._setLayoutPopupOpen(false);
        this._setOverlayOptionsOpen(false);
        this._setContextMenuOpen(false);
        this._clearTopologyHoverHighlights();
        this._drag = null;
    }

    _setLayoutPreset(presetId) {
        const preset = getPresetById(presetId);
        this._layoutPresetId = preset.id;

        for (const [id, button] of this._buttonByPresetId.entries()) {
            const selected = id === preset.id;
            button.classList.toggle('is-selected', selected);
            button.setAttribute('aria-selected', selected ? 'true' : 'false');
        }

        this._refreshLayoutComboSummary();
        this._rebuildTiles();
        this._setHoveredTile('');
        this._setContextMenuOpen(false);
        this._clearTopologyHoverHighlights();
        this._updateReadouts();
    }

    _setDisplayMode(mode) {
        const legacyMap = {
            mesh: 'shaded',
            wire: 'shaded_wireframe',
            wire_overlay: 'shaded_wireframe',
            wire_only: 'wireframe'
        };
        const normalized = legacyMap[mode] ?? mode;
        const option = getDisplayModeOptionById(normalized);
        const next = option.id;
        this._displayMode = next;
        this._applyDisplayModeToScene();

        for (const [id, button] of this._buttonByDisplayMode.entries()) {
            const selected = id === next;
            button.classList.toggle('is-selected', selected);
            button.setAttribute('aria-selected', selected ? 'true' : 'false');
        }

        this._refreshDisplayModeComboSummary();
        this._updateReadouts();
    }

    _applyFaceCenterOcclusionSetting() {
        const overlay = this._faceCenterOverlay ?? null;
        const material = overlay?.material ?? null;
        if (!material) return;
        const depthTest = !!this._hideOccludedFaceCentersEnabled;
        const applyMaterialState = (mat) => {
            if (!mat || typeof mat !== 'object') return;
            if (!Object.prototype.hasOwnProperty.call(mat, 'depthTest') && !('depthTest' in mat)) return;
            mat.depthTest = depthTest;
            if (Object.prototype.hasOwnProperty.call(mat, 'depthWrite') || ('depthWrite' in mat)) {
                mat.depthWrite = false;
            }
            if (Object.prototype.hasOwnProperty.call(mat, 'needsUpdate') || ('needsUpdate' in mat)) {
                mat.needsUpdate = true;
            }
        };
        if (Array.isArray(material)) {
            for (const item of material) applyMaterialState(item);
            return;
        }
        applyMaterialState(material);
    }

    _applyWireOcclusionSetting() {
        const overlay = this._polygonWireOverlay ?? null;
        const material = overlay?.material ?? null;
        if (!material) return;
        const depthTest = !!this._hideOccludedWiresEnabled;
        const applyMaterialState = (mat) => {
            if (!mat || typeof mat !== 'object') return;
            if (!Object.prototype.hasOwnProperty.call(mat, 'depthTest') && !('depthTest' in mat)) return;
            mat.depthTest = depthTest;
            if (Object.prototype.hasOwnProperty.call(mat, 'depthWrite') || ('depthWrite' in mat)) {
                mat.depthWrite = false;
            }
            if (Object.prototype.hasOwnProperty.call(mat, 'needsUpdate') || ('needsUpdate' in mat)) {
                mat.needsUpdate = true;
            }
        };
        if (Array.isArray(material)) {
            for (const item of material) applyMaterialState(item);
            return;
        }
        applyMaterialState(material);
    }

    _getSurfaceMaterialDefaults(material) {
        const target = material && typeof material === 'object' ? material : null;
        if (!target) return null;
        const existing = this._surfaceMaterialDefaults.get(target);
        if (existing) return existing;
        const defaults = Object.freeze({
            colorWrite: target.colorWrite !== false,
            depthWrite: target.depthWrite !== false,
            depthTest: target.depthTest !== false
        });
        this._surfaceMaterialDefaults.set(target, defaults);
        return defaults;
    }

    _applySurfaceMeshRenderState(mesh, { showSurface = true, depthOnly = false } = {}) {
        const target = mesh && typeof mesh === 'object' ? mesh : null;
        if (!target) return;

        const shouldDepthOnly = !!depthOnly && !showSurface;
        target.visible = !!showSurface || shouldDepthOnly;
        target.userData = target.userData && typeof target.userData === 'object' ? target.userData : {};
        target.userData.meshFabDepthOnly = shouldDepthOnly;

        const materials = Array.isArray(target.material) ? target.material : [target.material];
        for (const mat of materials) {
            const defaults = this._getSurfaceMaterialDefaults(mat);
            if (!defaults) continue;

            const nextColorWrite = shouldDepthOnly ? false : defaults.colorWrite;
            const nextDepthWrite = shouldDepthOnly ? true : defaults.depthWrite;
            const nextDepthTest = shouldDepthOnly ? true : defaults.depthTest;

            if (mat.colorWrite !== nextColorWrite) mat.colorWrite = nextColorWrite;
            if (mat.depthWrite !== nextDepthWrite) mat.depthWrite = nextDepthWrite;
            if (mat.depthTest !== nextDepthTest) mat.depthTest = nextDepthTest;
        }
    }

    _applyDisplayModeToScene() {
        const showSurface = (
            this._displayMode === 'shaded'
            || this._displayMode === 'shaded_wireframe'
            || this._displayMode === 'shaded_vertices'
            || this._displayMode === 'shaded_wireframe_vertices'
        );
        const showWire = (
            this._displayMode === 'wireframe'
            || this._displayMode === 'shaded_wireframe'
            || this._displayMode === 'shaded_wireframe_vertices'
        );
        const showVertices = (
            this._displayMode === 'vertices'
            || this._displayMode === 'shaded_vertices'
            || this._displayMode === 'shaded_wireframe_vertices'
        );
        const showFaceCenters = showWire && this._wireFaceCentersEnabled;
        const hideOccludedFaceCenters = showFaceCenters && this._hideOccludedFaceCentersEnabled;
        const hideOccludedWires = showWire && this._hideOccludedWiresEnabled;
        const depthOnlyOccluder = !showSurface && (hideOccludedFaceCenters || hideOccludedWires);
        for (const mesh of this._surfaceMeshes) {
            this._applySurfaceMeshRenderState(mesh, {
                showSurface,
                depthOnly: depthOnlyOccluder
            });
        }
        if (this._polygonWireOverlay) {
            this._polygonWireOverlay.visible = showWire;
            this._applyWireOcclusionSetting();
        }
        if (this._vertexOverlay) {
            this._vertexOverlay.visible = showVertices;
        }
        if (this._faceCenterOverlay) {
            this._faceCenterOverlay.visible = showFaceCenters;
        }
        if (showFaceCenters) {
            this._applyFaceCenterOcclusionSetting();
        }
    }

    _setUserMode(mode) {
        const next = mode === 'select' ? 'select' : 'orbit';
        this._userMode = next;
        for (const [id, button] of this._buttonByUserMode.entries()) {
            button.classList.toggle('is-active', id === next);
        }
        this._updateReadouts();
    }

    _refreshAutoOrbitButtonState() {
        const button = this._autoOrbitButton;
        if (!button) return;
        const enabled = !!this._autoOrbitEnabled;
        button.classList.toggle('is-active', enabled);
        button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        setIconOnlyButtonLabel(
            button,
            enabled ? 'Disable orbit camera' : 'Enable orbit camera'
        );
    }

    _toggleAutoOrbitCamera(forceEnabled = null) {
        const next = forceEnabled === null ? !this._autoOrbitEnabled : !!forceEnabled;
        if (next === this._autoOrbitEnabled) return;

        if (next) {
            this._autoOrbitReturnState = {
                orbitYaw: this._orbitYaw,
                orbitPitch: this._orbitPitch,
                orbitRadius: this._orbitRadius,
                orbitTarget: [this._orbitTarget.x, this._orbitTarget.y, this._orbitTarget.z]
            };
            this._autoOrbitEnabled = true;
            this._refreshAutoOrbitButtonState();
            return;
        }

        this._autoOrbitEnabled = false;
        const restore = this._autoOrbitReturnState;
        this._autoOrbitReturnState = null;
        if (restore && Array.isArray(restore.orbitTarget) && restore.orbitTarget.length === 3) {
            this._orbitYaw = Number.isFinite(restore.orbitYaw) ? restore.orbitYaw : this._orbitYaw;
            this._orbitPitch = Number.isFinite(restore.orbitPitch) ? restore.orbitPitch : this._orbitPitch;
            this._orbitRadius = Number.isFinite(restore.orbitRadius) ? restore.orbitRadius : this._orbitRadius;
            this._orbitTarget.set(
                Number(restore.orbitTarget[0]) || 0,
                Number(restore.orbitTarget[1]) || 0,
                Number(restore.orbitTarget[2]) || 0
            );
            this._updateMainCameraOrbit();
        }
        this._refreshAutoOrbitButtonState();
    }

    _updateAutoOrbit(dt) {
        if (!this._autoOrbitEnabled) return;
        const deltaSec = clamp(Number(dt) || 0, 0, 0.25);
        if (deltaSec <= 0) return;
        this._orbitYaw += this._autoOrbitSpeedRadPerSec * deltaSec;
        this._updateMainCameraOrbit();
    }

    _rebuildTiles() {
        const preset = getPresetById(this._layoutPresetId);
        const stageRect = this._viewportStage?.getBoundingClientRect?.() ?? null;
        const stageWidth = Math.max(
            1,
            Math.round(this._viewportStage?.clientWidth || Number(stageRect?.width) || this.canvas?.clientWidth || 1)
        );
        const stageHeight = Math.max(
            1,
            Math.round(this._viewportStage?.clientHeight || Number(stageRect?.height) || this.canvas?.clientHeight || 1)
        );

        const tiles = [];
        const bottom = preset.bottom;
        const topHeightPx = bottom.length > 0
            ? Math.max(1, Math.min(stageHeight - 1, Math.round(stageHeight * PRESET_TOP_HEIGHT)))
            : stageHeight;
        tiles.push({
            id: 'view-main',
            kind: 'perspective',
            label: '3D',
            x: 0,
            y: 0,
            width: stageWidth,
            height: topHeightPx
        });

        if (bottom.length > 0) {
            const y = topHeightPx;
            for (let i = 0; i < bottom.length; i++) {
                const x0 = Math.round((i / bottom.length) * stageWidth);
                const x1 = i === bottom.length - 1
                    ? stageWidth
                    : Math.round(((i + 1) / bottom.length) * stageWidth);
                tiles.push({
                    id: `view-${bottom[i]}-${i}`,
                    kind: 'orthographic',
                    viewType: bottom[i],
                    label: ORTHO_VIEW_LABEL[bottom[i]] ?? bottom[i],
                    x: x0,
                    y,
                    width: Math.max(1, x1 - x0),
                    height: Math.max(1, stageHeight - y)
                });
            }
        }

        this._tiles = tiles;
        this._syncTileFrames();
    }

    _syncTileFrames() {
        const overlay = this._viewportOverlay;
        if (!overlay) return;
        overlay.textContent = '';
        this._tileFrameById.clear();
        this._tileStatusById.clear();
        this._tileStatusElementById.clear();
        this._tileHoverHitById.clear();

        for (const tile of this._tiles) {
            const frame = document.createElement('div');
            frame.className = 'mesh-fab-view-frame';
            frame.style.left = `${tile.x}px`;
            frame.style.top = `${tile.y}px`;
            frame.style.width = `${tile.width}px`;
            frame.style.height = `${tile.height}px`;
            if (tile.id === this._hoverTileId) frame.classList.add('is-hovered');

            const label = document.createElement('span');
            label.className = 'mesh-fab-view-label';
            label.textContent = tile.label;
            frame.appendChild(label);

            const status = document.createElement('span');
            status.className = 'mesh-fab-view-status';
            const statusCanonical = document.createElement('span');
            statusCanonical.className = 'mesh-fab-view-status-canonical';
            statusCanonical.textContent = '-';
            const statusAuthored = document.createElement('span');
            statusAuthored.className = 'mesh-fab-view-status-authored';
            statusAuthored.textContent = '-';
            status.appendChild(statusCanonical);
            status.appendChild(statusAuthored);
            frame.appendChild(status);

            overlay.appendChild(frame);
            this._tileFrameById.set(tile.id, frame);
            this._tileStatusById.set(tile.id, Object.freeze({ canonical: '-', authored: '-' }));
            this._tileStatusElementById.set(tile.id, {
                canonical: statusCanonical,
                authored: statusAuthored
            });
        }
    }

    _setHoveredTile(tileId) {
        const id = typeof tileId === 'string' ? tileId : '';
        if (id === this._hoverTileId) return;
        const prev = this._tileFrameById.get(this._hoverTileId);
        if (prev) prev.classList.remove('is-hovered');
        this._hoverTileId = id;
        const next = this._tileFrameById.get(id);
        if (next) next.classList.add('is-hovered');
        this._updateReadouts();
    }

    _setTileStatus(tileId, value) {
        const id = typeof tileId === 'string' ? tileId : '';
        if (!id) return;
        const normalize = (raw) => {
            if (typeof raw === 'string') {
                const text = raw.trim();
                if (!text || text === '-') return { canonical: '-', authored: '-' };
                return { canonical: '-', authored: text };
            }
            if (!raw || typeof raw !== 'object') {
                return { canonical: '-', authored: '-' };
            }
            const canonical = typeof raw.canonical === 'string' && raw.canonical.trim()
                ? raw.canonical.trim()
                : '-';
            const authored = typeof raw.authored === 'string' && raw.authored.trim()
                ? raw.authored.trim()
                : '-';
            return { canonical, authored };
        };
        const next = normalize(value);
        const current = this._tileStatusById.get(id) ?? { canonical: '-', authored: '-' };
        if (current.canonical === next.canonical && current.authored === next.authored) return;
        this._tileStatusById.set(id, Object.freeze(next));
        const status = this._tileStatusElementById.get(id);
        if (!status || typeof status !== 'object') return;
        if (status.canonical) status.canonical.textContent = next.canonical;
        if (status.authored) status.authored.textContent = next.authored;
    }

    _setTileHoverHit(tileId, hit) {
        const id = typeof tileId === 'string' ? tileId : '';
        if (!id) return;
        if (!hit || typeof hit !== 'object' || typeof hit.id !== 'string' || !hit.id.trim()) {
            this._tileHoverHitById.delete(id);
            return;
        }
        const canonicalId = typeof hit.canonicalId === 'string' && hit.canonicalId.trim()
            ? hit.canonicalId.trim()
            : '';
        let coords = null;
        if (Array.isArray(hit.coords) && hit.coords.length >= 3) {
            const x = Number(hit.coords[0]);
            const y = Number(hit.coords[1]);
            const z = Number(hit.coords[2]);
            if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
                coords = Object.freeze([x, y, z]);
            }
        }
        this._tileHoverHitById.set(id, Object.freeze({
            kind: String(hit.kind ?? ''),
            id: hit.id.trim(),
            canonicalId,
            ...(coords ? { coords } : {})
        }));
    }

    _updateReadouts() {
        const preset = getPresetById(this._layoutPresetId);
        if (this._readouts.layout) this._readouts.layout.textContent = preset.label;
        if (this._readouts.displayMode) {
            this._readouts.displayMode.textContent = getDisplayModeOptionById(this._displayMode).label;
        }
        if (this._readouts.userMode) this._readouts.userMode.textContent = this._userMode === 'select' ? 'Select' : 'Orbit';
        if (this._readouts.meshSource) this._readouts.meshSource.textContent = this._meshEndpoint;
        if (this._readouts.meshSync) {
            const lastCheck = formatTimeLabel(this._liveMeshLastCheckMs);
            this._readouts.meshSync.textContent = [
                `Status: ${this._liveMeshSyncLabel}`,
                `Revision: ${this._liveMeshRevision}`,
                `Last check: ${lastCheck}`
            ].join('\n');
        }
        if (this._readouts.meshLiveButton) {
            this._readouts.meshLiveButton.setAttribute('aria-pressed', this._liveMeshEnabled ? 'true' : 'false');
            this._readouts.meshLiveButton.classList.toggle('is-on', !!this._liveMeshEnabled);
            this._readouts.meshLiveButton.classList.toggle('is-off', !this._liveMeshEnabled);
            setIconOnlyButtonLabel(
                this._readouts.meshLiveButton,
                this._liveMeshEnabled ? 'Disable live mesh polling' : 'Enable live mesh polling'
            );
        }
        if (this._readouts.meshLiveMode) {
            this._readouts.meshLiveMode.textContent = this._liveMeshEnabled ? 'ON' : 'OFF';
        }
        if (this._readouts.meshLiveDot) {
            const dot = this._readouts.meshLiveDot;
            dot.classList.remove('is-idle', 'is-green', 'is-red');
            if (!this._liveMeshEnabled) {
                dot.classList.add('is-idle');
            } else if (this._liveMeshHasError) {
                dot.classList.add('is-red');
            } else if (Date.now() < this._liveMeshUpdatePulseUntilMs) {
                dot.classList.add('is-green');
            } else {
                dot.classList.add('is-idle');
            }
        }
        if (this._readouts.meshRevision) this._readouts.meshRevision.textContent = this._liveMeshRevision;
        if (this._readouts.meshLastCheck) this._readouts.meshLastCheck.textContent = formatTimeLabel(this._liveMeshLastCheckMs);

        if (this._readouts.aiWorkflow) {
            const previewState = this._aiPreviewBatch ? `preview ${this._aiPreviewBatch.batchId}` : 'no preview';
            this._readouts.aiWorkflow.textContent = `${this._aiWorkflowStatus} (${previewState})`;
        }
        if (this._readouts.aiScope) {
            this._readouts.aiScope.textContent = AI_SCOPE_LABEL;
        }
        if (this._readouts.aiOutput) {
            this._readouts.aiOutput.textContent = this._aiOutputText;
        }

        const hovered = this._tiles.find((tile) => tile.id === this._hoverTileId) ?? null;
        if (this._readouts.activeView) this._readouts.activeView.textContent = hovered?.label ?? 'None';
        this._refreshAiUiState();
    }

    _applyViewportSize() {
        const width = Math.max(1, this._viewportStage?.clientWidth || 1);
        const height = Math.max(1, this._viewportStage?.clientHeight || 1);
        this.engine.setViewportSize(width, height);
        this._rebuildTiles();
    }

    _pickTile(clientX, clientY) {
        const rect = this._viewportStage?.getBoundingClientRect?.() ?? this.canvas?.getBoundingClientRect?.();
        if (!rect) return null;
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
        return this._tiles.find((tile) => {
            const x1 = tile.x + tile.width;
            const y1 = tile.y + tile.height;
            return x >= tile.x && x <= x1 && y >= tile.y && y <= y1;
        }) ?? null;
    }

    _pickSelectableInPerspectiveTile(clientX, clientY, tile) {
        if (!tile || tile.kind !== 'perspective') return null;
        const rect = this._viewportStage?.getBoundingClientRect?.() ?? this.canvas?.getBoundingClientRect?.();
        if (!rect) return null;
        if (!Array.isArray(this._surfaceMeshes) || this._surfaceMeshes.length < 1) return null;

        const localX = clientX - rect.left;
        const localY = clientY - rect.top;
        const tx = localX - tile.x;
        const ty = localY - tile.y;
        if (tx < 0 || ty < 0 || tx > tile.width || ty > tile.height) return null;

        const safeW = Math.max(1, Number(tile.width) || 1);
        const safeH = Math.max(1, Number(tile.height) || 1);
        const ndcX = ((tx / safeW) * 2) - 1;
        const ndcY = -((ty / safeH) * 2) + 1;
        this.camera.aspect = safeW / safeH;
        this.camera.updateProjectionMatrix();
        this._rayNdc.set(ndcX, ndcY);
        this._raycaster.setFromCamera(this._rayNdc, this.camera);

        const candidates = this._surfaceMeshes.filter(
            (mesh) => !!mesh && mesh.visible !== false && mesh.userData?.meshFabDepthOnly !== true
        );
        if (candidates.length < 1) return null;
        const hits = this._raycaster.intersectObjects(candidates, false);
        return hits[0] ?? null;
    }

    _splitHierarchySegments(value) {
        return String(value ?? '')
            .split(/[./:>]+/)
            .map((segment) => segment.trim())
            .filter(Boolean);
    }

    _buildFaceAuthoredAliasId(faceId, authoredLabel) {
        const id = String(faceId ?? '').trim();
        const label = String(authoredLabel ?? '').trim();
        if (!id || !label) return '';
        const segments = id.split('.');
        if (!Array.isArray(segments) || segments.length < 1) return '';
        segments[segments.length - 1] = label;
        return segments.join('.');
    }

    _formatHierarchyLabelFromId(value) {
        const id = String(value ?? '').trim();
        if (!id) return '-';
        const meshPrefix = this._splitHierarchySegments(this._liveMeshParsedDocument?.meshId ?? '');
        let segments = this._splitHierarchySegments(id);

        if (meshPrefix.length > 0 && segments.length > meshPrefix.length) {
            let hasCommonPrefix = true;
            for (let i = 0; i < meshPrefix.length; i++) {
                if (segments[i] !== meshPrefix[i]) {
                    hasCommonPrefix = false;
                    break;
                }
            }
            if (hasCommonPrefix) {
                segments = segments.slice(meshPrefix.length);
            }
        }

        const deduped = [];
        for (const segment of segments) {
            if (deduped.length > 0 && deduped[deduped.length - 1] === segment) continue;
            deduped.push(segment);
        }

        if (deduped.length < 1) {
            return id;
        }
        return deduped.join(' > ');
    }

    _formatTopologyHoverLabel(hit) {
        if (!hit || typeof hit !== 'object') return '-';
        const id = String(hit.id ?? '').trim();
        if (!id) return '-';
        if (String(hit.kind ?? '').trim().toLowerCase() === 'face') {
            const authoredAliasId = String(this._topologyAuthoredById.get(id) ?? '').trim();
            if (authoredAliasId) {
                return this._formatHierarchyLabelFromId(authoredAliasId);
            }
        }
        return this._formatHierarchyLabelFromId(id);
    }

    _resolveCanonicalTopologyId(value) {
        const id = String(value ?? '').trim();
        if (!id) return '';
        const mapped = String(this._topologyCanonicalById.get(id) ?? '').trim();
        return mapped || id;
    }

    _createTopologyHit(kind, id) {
        const normalizedId = String(id ?? '').trim();
        if (!normalizedId) return null;
        const canonicalId = this._resolveCanonicalTopologyId(normalizedId);
        return {
            kind: String(kind ?? ''),
            id: normalizedId,
            canonicalId
        };
    }

    _createPivotHit() {
        return {
            kind: 'pivot',
            id: 'scene.pivot',
            canonicalId: 'scene.pivot',
            coords: [this._pivotPosition.x, this._pivotPosition.y, this._pivotPosition.z]
        };
    }

    _formatTopologyHoverStatus(hit) {
        if (!hit || typeof hit !== 'object') {
            return { canonical: '-', authored: '-' };
        }
        if (String(hit.kind ?? '').trim().toLowerCase() === 'pivot') {
            const coords = Array.isArray(hit.coords) && hit.coords.length >= 3
                ? {
                    x: Number(hit.coords[0]) || 0,
                    y: Number(hit.coords[1]) || 0,
                    z: Number(hit.coords[2]) || 0
                }
                : this._pivotPosition;
            return {
                canonical: 'scene.pivot',
                authored: `Pivot @ (${formatVector3Label(coords)})`
            };
        }
        const authored = this._formatTopologyHoverLabel(hit);
        const canonicalRaw = typeof hit.canonicalId === 'string' && hit.canonicalId.trim()
            ? hit.canonicalId.trim()
            : this._resolveCanonicalTopologyId(hit.id);
        return {
            canonical: canonicalRaw || '-',
            authored: authored || '-'
        };
    }

    _resolveRaycastCameraForTile(tile, width, height) {
        const safeW = Math.max(1, Number(width) || 1);
        const safeH = Math.max(1, Number(height) || 1);
        if (tile?.kind === 'orthographic') {
            const ortho = this._getOrthoCamera(tile.viewType);
            this._configureOrthoCamera(ortho, tile.viewType, safeW / safeH);
            return ortho;
        }
        this.camera.aspect = safeW / safeH;
        this.camera.updateProjectionMatrix();
        return this.camera;
    }

    _setRaycasterThresholdForTile(camera, tileHeight) {
        const safeH = Math.max(1, Number(tileHeight) || 1);
        let worldPerPixel = 0.01;
        if (camera?.isOrthographicCamera) {
            worldPerPixel = Math.max(0.0001, Math.abs((camera.top - camera.bottom) / safeH));
        } else {
            const fov = Number(camera?.fov);
            const distance = Math.max(0.001, this.camera.position.distanceTo(this._orbitTarget));
            const fovRad = Number.isFinite(fov) ? THREE.MathUtils.degToRad(fov) : THREE.MathUtils.degToRad(55);
            const viewHeight = 2 * Math.tan(fovRad * 0.5) * distance;
            worldPerPixel = Math.max(0.0001, viewHeight / safeH);
        }
        if (!this._raycaster.params.Line) this._raycaster.params.Line = {};
        if (!this._raycaster.params.Points) this._raycaster.params.Points = {};
        this._raycaster.params.Line.threshold = Math.max(0.0006, worldPerPixel * 4.0);
        this._raycaster.params.Points.threshold = Math.max(0.001, worldPerPixel * 9.0);
    }

    _pickTopologyElementInTile(clientX, clientY, tile) {
        if (!tile) return null;
        const rect = this._viewportStage?.getBoundingClientRect?.() ?? this.canvas?.getBoundingClientRect?.();
        if (!rect) return null;

        const localX = clientX - rect.left;
        const localY = clientY - rect.top;
        const tx = localX - tile.x;
        const ty = localY - tile.y;
        if (tx < 0 || ty < 0 || tx > tile.width || ty > tile.height) return null;

        const safeW = Math.max(1, Number(tile.width) || 1);
        const safeH = Math.max(1, Number(tile.height) || 1);
        const ndcX = ((tx / safeW) * 2) - 1;
        const ndcY = -((ty / safeH) * 2) + 1;
        const activeCamera = this._resolveRaycastCameraForTile(tile, safeW, safeH);
        this._setRaycasterThresholdForTile(activeCamera, safeH);
        this._rayNdc.set(ndcX, ndcY);
        this._raycaster.setFromCamera(this._rayNdc, activeCamera);

        if (this._pivotOverlayEnabled && this._pivotOverlay?.visible) {
            const pivotHit = this._raycaster.intersectObject(this._pivotOverlay, false)[0] ?? null;
            if (pivotHit) {
                return this._createPivotHit();
            }
        }

        const occluderMeshes = this._surfaceMeshes.filter((mesh) => !!mesh && mesh.visible !== false);
        let nearestSurfaceDistance = Number.POSITIVE_INFINITY;
        if (occluderMeshes.length > 0) {
            const nearestSurfaceHit = this._raycaster.intersectObjects(occluderMeshes, false)[0] ?? null;
            if (nearestSurfaceHit && Number.isFinite(Number(nearestSurfaceHit.distance))) {
                nearestSurfaceDistance = Number(nearestSurfaceHit.distance);
            }
        }
        const lineThreshold = Number(this._raycaster.params?.Line?.threshold) || 0;
        const pointThreshold = Number(this._raycaster.params?.Points?.threshold) || 0;
        const occlusionTolerance = Math.max(0.0015, lineThreshold * 0.5, pointThreshold * 0.45);
        const isHitBehindOccluder = (hit) => {
            const hitDistance = Number(hit?.distance);
            if (!Number.isFinite(hitDistance)) return false;
            if (!Number.isFinite(nearestSurfaceDistance)) return false;
            return hitDistance > (nearestSurfaceDistance + occlusionTolerance);
        };

        if (this._vertexOverlay?.visible) {
            const hit = this._raycaster.intersectObject(this._vertexOverlay, false)[0] ?? null;
            const hitIndex = Number(hit?.index);
            const ids = this._vertexOverlay?.userData?.topology?.vertexIds;
            if (Number.isInteger(hitIndex) && Array.isArray(ids) && hitIndex >= 0 && hitIndex < ids.length) {
                return this._createTopologyHit('vertex', ids[hitIndex]);
            }
        }

        if (this._polygonWireOverlay?.visible) {
            const hit = this._raycaster.intersectObject(this._polygonWireOverlay, false)[0] ?? null;
            if (this._hideOccludedWiresEnabled && isHitBehindOccluder(hit)) {
                // Ignore occluded wire hits so hover path follows visible topology only.
            } else {
            const rawIndex = Number(hit?.index);
            const ids = this._polygonWireOverlay?.userData?.topology?.edgeIds;
            if (Array.isArray(ids) && Number.isInteger(rawIndex) && rawIndex >= 0) {
                let edgeIndex = rawIndex;
                const positionCount = Number(
                    this._polygonWireOverlay?.geometry?.getAttribute?.('position')?.count
                ) || 0;
                const nonIndexedPairEncoded = positionCount === (ids.length * 2);
                if (nonIndexedPairEncoded) {
                    // For non-indexed LineSegments, raycast index points to segment vertex slot (0,2,4,...).
                    edgeIndex = Math.floor(edgeIndex * 0.5);
                } else if (edgeIndex >= ids.length) {
                    edgeIndex = Math.floor(edgeIndex * 0.5);
                }
                if (edgeIndex >= 0 && edgeIndex < ids.length) {
                    return this._createTopologyHit('edge', ids[edgeIndex]);
                }
            }
            }
        }

        if (this._faceCenterOverlay?.visible) {
            const hit = this._raycaster.intersectObject(this._faceCenterOverlay, false)[0] ?? null;
            if (this._hideOccludedFaceCentersEnabled && isHitBehindOccluder(hit)) {
                // Ignore occluded face-center hits when occlusion hiding is enabled.
            } else {
            const hitIndex = Number(hit?.index);
            const ids = this._faceCenterOverlay?.userData?.topology?.faceIds;
            if (Number.isInteger(hitIndex) && Array.isArray(ids) && hitIndex >= 0 && hitIndex < ids.length) {
                return this._createTopologyHit('face', ids[hitIndex]);
            }
            }
        }

        const candidates = occluderMeshes;
        if (candidates.length < 1) return null;
        const hit = this._raycaster.intersectObjects(candidates, false)[0] ?? null;
        const faceIndex = Number(hit?.faceIndex);
        const triangleFaceIds = hit?.object?.userData?.topology?.triangleFaceIds;
        if (Number.isInteger(faceIndex) && Array.isArray(triangleFaceIds) && faceIndex >= 0 && faceIndex < triangleFaceIds.length) {
            return this._createTopologyHit('face', triangleFaceIds[faceIndex]);
        }
        return null;
    }

    _updateHoverTopologyStatus(clientX, clientY, tile) {
        if (!tile) return;
        const hit = this._pickTopologyElementInTile(clientX, clientY, tile);
        this._setTileHoverHit(tile.id, hit);
        this._setTileStatus(tile.id, this._formatTopologyHoverStatus(hit));
        this._setTopologyHoverHighlight(hit);
    }

    _handlePointerDown(event) {
        const button = normalizePointerButton(event.button);
        if (button !== 0 && button !== 1) return;

        const tile = this._pickTile(event.clientX, event.clientY);
        this._setHoveredTile(tile?.id ?? '');
        if (!tile) return;
        if (tile.kind !== 'perspective') return;

        if (button === 0 && this._userMode !== 'orbit') {
            if (this._userMode !== 'select') return;
            const selectableHit = this._pickSelectableInPerspectiveTile(event.clientX, event.clientY, tile);
            if (selectableHit) return;
        }

        this._clearTopologyHoverHighlights();
        this._drag = {
            mode: button === 1 ? 'pan' : 'orbit',
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY
        };
        this.canvas?.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    }

    _handlePointerMove(event) {
        const prevHoverTileId = this._hoverTileId;
        const tile = this._pickTile(event.clientX, event.clientY);
        this._setHoveredTile(tile?.id ?? '');
        if (!tile) {
            if (this._contextMenuOpen) return;
            if (prevHoverTileId) {
                this._setTileHoverHit(prevHoverTileId, null);
                this._setTileStatus(prevHoverTileId, '-');
            }
            this._clearTopologyHoverHighlights();
        } else if (!this._drag) {
            this._updateHoverTopologyStatus(event.clientX, event.clientY, tile);
        }

        if (!this._drag || event.pointerId !== this._drag.pointerId) return;

        const dx = event.clientX - this._drag.x;
        const dy = event.clientY - this._drag.y;
        this._drag.x = event.clientX;
        this._drag.y = event.clientY;

        if (this._drag.mode === 'pan') {
            this._panMainCamera(dx, dy);
        } else {
            this._orbitYaw -= dx * 0.008;
            this._orbitPitch = clamp(this._orbitPitch + dy * 0.0075, -1.45, 1.45);
            this._updateMainCameraOrbit();
        }
        event.preventDefault();
    }

    _handlePointerUp(event) {
        if (!this._drag || event.pointerId !== this._drag.pointerId) return;
        this.canvas?.releasePointerCapture?.(event.pointerId);
        this._drag = null;
    }

    _handlePointerLeave() {
        if (!this._drag) {
            if (this._contextMenuOpen) return;
            if (this._hoverTileId) {
                this._setTileHoverHit(this._hoverTileId, null);
                this._setTileStatus(this._hoverTileId, '-');
            }
            this._clearTopologyHoverHighlights();
            this._setHoveredTile('');
        }
    }

    _handleWheel(event) {
        const tile = this._pickTile(event.clientX, event.clientY);
        if (!tile) return;

        if (tile.kind === 'orthographic') {
            this._auxZoom = clamp(this._auxZoom * Math.exp(-event.deltaY * 0.0015), 0.35, 6);
            event.preventDefault();
            return;
        }

        if (tile.kind === 'perspective') {
            this._orbitRadius = clamp(this._orbitRadius * Math.exp(event.deltaY * 0.0012), 3.5, 90);
            this._updateMainCameraOrbit();
            event.preventDefault();
        }
    }

    _updateMainCameraOrbit() {
        const radius = this._orbitRadius;
        const pitchCos = Math.cos(this._orbitPitch);
        const x = this._orbitTarget.x + Math.sin(this._orbitYaw) * pitchCos * radius;
        const y = this._orbitTarget.y + Math.sin(this._orbitPitch) * radius;
        const z = this._orbitTarget.z + Math.cos(this._orbitYaw) * pitchCos * radius;
        this.camera.position.set(x, y, z);
        this.camera.lookAt(this._orbitTarget);
        this.camera.updateProjectionMatrix();
    }

    _panMainCamera(dx, dy) {
        const forward = new THREE.Vector3().subVectors(this._orbitTarget, this.camera.position);
        if (forward.lengthSq() <= 1e-8) return;
        forward.normalize();

        const up = this.camera.up.clone().normalize();
        const right = new THREE.Vector3().crossVectors(forward, up).normalize();
        if (right.lengthSq() <= 1e-8) return;

        const panScale = this._orbitRadius * 0.0022;
        const tx = -dx * panScale;
        const ty = dy * panScale;
        this._orbitTarget.addScaledVector(right, tx);
        this._orbitTarget.addScaledVector(up, ty);
        this._updateMainCameraOrbit();
    }

    _getOrthoCamera(viewType) {
        const key = typeof viewType === 'string' ? viewType : 'front';
        const existing = this._orthoCameras.get(key);
        if (existing) return existing;
        const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
        this._orthoCameras.set(key, cam);
        return cam;
    }

    _configureOrthoCamera(cam, viewType, aspect) {
        const safeAspect = Math.max(0.0001, Number.isFinite(aspect) ? aspect : 1);
        const size = this._modelSize;
        const halfX = Math.max(0.001, size.x * 0.5);
        const halfY = Math.max(0.001, size.y * 0.5);
        const halfZ = Math.max(0.001, size.z * 0.5);
        const padding = 1.6;

        let modelHalfW = halfX;
        let modelHalfH = halfY;
        switch (viewType) {
            case 'left':
            case 'right':
                modelHalfW = halfZ;
                modelHalfH = halfY;
                break;
            case 'top':
            case 'bottom':
                modelHalfW = halfX;
                modelHalfH = halfZ;
                break;
            case 'front':
            case 'back':
            default:
                modelHalfW = halfX;
                modelHalfH = halfY;
                break;
        }

        const fitHalf = Math.max(modelHalfH * padding, (modelHalfW * padding) / safeAspect);
        const zoomHalf = fitHalf / Math.max(0.001, this._auxZoom);
        cam.left = -zoomHalf * safeAspect;
        cam.right = zoomHalf * safeAspect;
        cam.top = zoomHalf;
        cam.bottom = -zoomHalf;

        const target = this._modelCenter;
        const dist = this._orthoDistance;
        const y = target.y;
        cam.up.set(0, 1, 0);

        switch (viewType) {
            case 'left':
                cam.position.set(target.x - dist, y, target.z);
                break;
            case 'right':
                cam.position.set(target.x + dist, y, target.z);
                break;
            case 'front':
                cam.position.set(target.x, y, target.z + dist);
                break;
            case 'back':
                cam.position.set(target.x, y, target.z - dist);
                break;
            case 'top':
                cam.position.set(target.x, target.y + dist, target.z);
                cam.up.set(0, 0, -1);
                break;
            case 'bottom':
                cam.position.set(target.x, target.y - dist, target.z);
                cam.up.set(0, 0, 1);
                break;
            default:
                cam.position.set(target.x, y, target.z + dist);
                break;
        }

        const near = Math.max(0.01, dist - (size.length() + 8));
        const far = dist + size.length() + 30;
        cam.near = near;
        cam.far = far;
        cam.lookAt(target);
        cam.updateProjectionMatrix();
    }

    _renderMultiView() {
        const renderer = this.engine?.renderer ?? null;
        if (!renderer || !this.canvas || !this._tiles.length) return;

        // Keep per-viewport clear colors authoritative for this screen.
        if (this.scene?.background) this.scene.background = null;

        this._syncRendererSizeToViewportStage();

        const stageRect = this._viewportStage?.getBoundingClientRect?.() ?? this.canvas.getBoundingClientRect();
        const stageCssW = Math.max(
            1,
            Math.round(this._viewportStage?.clientWidth || Number(stageRect?.width) || this.canvas.clientWidth || 1)
        );
        const stageCssH = Math.max(
            1,
            Math.round(this._viewportStage?.clientHeight || Number(stageRect?.height) || this.canvas.clientHeight || 1)
        );

        const previousAutoClear = renderer.autoClear;
        const previousClearColor = renderer.getClearColor(this._clearColorScratch);
        const previousClearAlpha = renderer.getClearAlpha();

        renderer.autoClear = false;
        renderer.setScissorTest(true);
        renderer.setViewport(0, 0, stageCssW, stageCssH);
        renderer.setScissor(0, 0, stageCssW, stageCssH);
        renderer.setClearColor(0x000000, 0);
        renderer.clear(true, true, true);

        const resolveTileViewport = (tile) => {
            const leftCss = clamp(Math.round(Number(tile.x) || 0), 0, stageCssW);
            const topCss = clamp(Math.round(Number(tile.y) || 0), 0, stageCssH);
            const rightCss = clamp(Math.round(leftCss + Math.max(1, Number(tile.width) || 1)), 0, stageCssW);
            const bottomCss = clamp(Math.round(topCss + Math.max(1, Number(tile.height) || 1)), 0, stageCssH);

            // Three.js expects CSS pixel viewport/scissor values and applies pixel ratio internally.
            const x = leftCss;
            const y = stageCssH - bottomCss;
            const w = Math.max(1, rightCss - leftCss);
            const h = Math.max(1, bottomCss - topCss);
            return { x, y, w, h };
        };

        const drawTile = (tile) => {
            const vp = resolveTileViewport(tile);
            const x = vp.x;
            const y = vp.y;
            const w = vp.w;
            const h = vp.h;
            const clearHex = tile.kind === 'perspective'
                ? VIEWPORT_BG_HEX.perspective
                : (VIEWPORT_BG_HEX[tile.viewType] ?? 0x2e3338);

            renderer.setViewport(x, y, w, h);
            renderer.setScissor(x, y, w, h);
            renderer.setClearColor(clearHex, 1);
            renderer.clear(true, true, true);

            if (tile.kind === 'perspective') {
                this.camera.aspect = w / h;
                this.camera.updateProjectionMatrix();
                renderer.render(this.scene, this.camera);
                this._renderAxisGizmoInTile(renderer, tile, x, y, w, h, this.camera);
                return;
            }

            const ortho = this._getOrthoCamera(tile.viewType);
            this._configureOrthoCamera(ortho, tile.viewType, w / h);
            renderer.render(this.scene, ortho);
            this._renderAxisGizmoInTile(renderer, tile, x, y, w, h, ortho);
        };

        for (const tile of this._tiles) {
            if (tile.kind === 'perspective') continue;
            drawTile(tile);
        }
        for (const tile of this._tiles) {
            if (tile.kind !== 'perspective') continue;
            drawTile(tile);
        }

        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, stageCssW, stageCssH);
        renderer.autoClear = previousAutoClear;
        renderer.setClearColor(previousClearColor, previousClearAlpha);
    }

    _renderAxisGizmoInTile(renderer, tile, x, y, w, h, sourceCamera) {
        if (!this._axisArrowsEnabled) return;
        if (!renderer || !sourceCamera || !this._axisGizmoScene || !this._axisGizmoCamera || !this._axisGizmoRoot) return;

        const labelX = this._axisLabelSprites?.x ?? null;
        const labelY = this._axisLabelSprites?.y ?? null;
        const labelZ = this._axisLabelSprites?.z ?? null;
        if (labelX && labelY && labelZ) {
            labelX.visible = true;
            labelY.visible = true;
            labelZ.visible = true;
            if (tile.kind !== 'perspective') {
                const viewType = String(tile.viewType ?? '').toLowerCase();
                if (viewType === 'front' || viewType === 'back') {
                    labelZ.visible = false;
                } else if (viewType === 'left' || viewType === 'right') {
                    labelX.visible = false;
                } else if (viewType === 'top' || viewType === 'bottom') {
                    labelY.visible = false;
                }
            }
        }

        const size = tile.kind === 'perspective' ? AXIS_GIZMO_MAIN_SIZE : AXIS_GIZMO_AUX_SIZE;
        const gizmoSize = Math.max(28, Math.min(size, Math.floor(Math.min(w, h) * 0.62)));
        const margin = AXIS_GIZMO_MARGIN;
        const gx = tile.kind === 'perspective'
            ? Math.max(x, x + w - gizmoSize - margin)
            : Math.min(x + margin, x + Math.max(0, w - gizmoSize));
        const gy = tile.kind === 'perspective'
            ? Math.max(y, y + h - gizmoSize - margin)
            : Math.min(y + margin, y + Math.max(0, h - gizmoSize));

        this._axisGizmoRoot.quaternion.copy(sourceCamera.quaternion).invert();

        renderer.setViewport(gx, gy, gizmoSize, gizmoSize);
        renderer.setScissor(gx, gy, gizmoSize, gizmoSize);
        renderer.clearDepth();
        renderer.render(this._axisGizmoScene, this._axisGizmoCamera);
    }

    _syncRendererSizeToViewportStage() {
        const stage = this._viewportStage ?? null;
        if (!stage || !this.engine?.setViewportSize || !this.engine?.renderer?.getSize) return;

        const targetW = Math.max(1, stage.clientWidth || Math.floor(stage.getBoundingClientRect().width));
        const targetH = Math.max(1, stage.clientHeight || Math.floor(stage.getBoundingClientRect().height));
        const dpr = (typeof window !== 'undefined' ? Number(window.devicePixelRatio) : 1) || 1;

        const cssSize = this.engine.renderer.getSize(this._tmpSize2);
        const currentW = Math.max(1, Math.floor(cssSize.x || 1));
        const currentH = Math.max(1, Math.floor(cssSize.y || 1));

        if (currentW === targetW && currentH === targetH && Math.abs(dpr - this._lastDevicePixelRatio) <= 1e-6) return;
        this._lastDevicePixelRatio = dpr;
        this.engine.setViewportSize(targetW, targetH);
        this._rebuildTiles();
    }
}
