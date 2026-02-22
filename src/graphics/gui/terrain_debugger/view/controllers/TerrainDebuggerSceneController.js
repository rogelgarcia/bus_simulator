// src/graphics/gui/terrain_debugger/view/controllers/TerrainDebuggerSceneController.js
// Scene and lifecycle orchestration adapter for TerrainDebuggerView.
// @ts-check

function assertView(view) {
    if (!view || typeof view !== 'object') {
        throw new Error('[TerrainDebuggerSceneController] Missing TerrainDebuggerView instance');
    }
    return view;
}

export class TerrainDebuggerSceneController {
    constructor({ view, disposerRegistry = null } = {}) {
        this._view = assertView(view);
        this._disposerRegistry = disposerRegistry;
    }

    setDisposerRegistry(disposerRegistry) {
        this._disposerRegistry = disposerRegistry ?? null;
    }

    registerDomListeners() {
        const view = this._view;
        const disposer = this._disposerRegistry;
        if (!disposer) return;

        if (view.canvas) {
            disposer.addEventListener(view.canvas, 'contextmenu', view._onContextMenu, { passive: false, capture: true });
            disposer.addEventListener(view.canvas, 'pointermove', view._onPointerMove, { passive: true, capture: true });
            disposer.addEventListener(view.canvas, 'pointerleave', view._onPointerLeave, { passive: true, capture: true });
        }
        disposer.addEventListener(window, 'resize', view._onResize, { passive: true });
        disposer.addEventListener(window, 'keydown', view._onKeyDown, { passive: false });
        disposer.addEventListener(window, 'keyup', view._onKeyUp, { passive: false });
    }

    buildScene() {
        this._view._buildScene();
    }

    resizeViewport() {
        this._view._resize();
    }

    ensureGrassEngine(GrassEngineCtor) {
        const view = this._view;
        if (view._grassEngine || !view.scene || !view._terrain || !view._terrainGrid) return;
        const Ctor = typeof GrassEngineCtor === 'function' ? GrassEngineCtor : null;
        if (!Ctor) throw new Error('[TerrainDebuggerSceneController] Missing GrassEngine constructor');
        view._grassEngine = new Ctor({
            scene: view.scene,
            terrainMesh: view._terrain,
            terrainGrid: view._terrainGrid,
            getExclusionRects: () => view._getGrassExclusionRects()
        });
    }

    disposeDomAndLifecycleResources() {
        const disposer = this._disposerRegistry;
        if (!disposer) return;
        const errors = disposer.disposeAll();
        for (const issue of errors) {
            console.warn('[TerrainDebugger] Disposer cleanup failed', issue);
        }
    }
}
