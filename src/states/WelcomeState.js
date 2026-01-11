// src/states/WelcomeState.js
export class WelcomeState {
    constructor(engine, sm) {
        this.engine = engine;
        this.sm = sm;

        this.canvas = engine.canvas;

        this.uiWelcome = document.getElementById('ui-welcome');
        this.uiSelect = document.getElementById('ui-select');
        this.uiSetup = document.getElementById('ui-setup');
        this.testErrorWidget = document.getElementById('ui-test-errors');

        this._onKeyDown = (e) => this._handleKeyDown(e);
        this._onPointerDown = () => this._start(); // optional click-to-start
        this._testErrorInterval = null;
    }

    enter() {
        document.body.classList.remove('setup-bg');
        document.body.classList.add('splash-bg');

        if (this.uiSelect) this.uiSelect.classList.add('hidden');
        if (this.uiSetup) this.uiSetup.classList.add('hidden');
        if (this.uiWelcome) this.uiWelcome.classList.remove('hidden');

        // keep scene clean behind splash
        this.engine.clearScene();

        window.addEventListener('keydown', this._onKeyDown, { passive: false });
        this.canvas?.addEventListener?.('pointerdown', this._onPointerDown);
        this._startTestErrorWidget();
    }

    exit() {
        window.removeEventListener('keydown', this._onKeyDown);
        this.canvas?.removeEventListener?.('pointerdown', this._onPointerDown);
        this._stopTestErrorWidget();
    }

    _start() {
        this.sm.go('bus_select');
    }

    _garage() {
        this.sm.go('bus_select');
    }

    _mapDebugger() {
        this.sm.go('map_debugger');
    }

    _test() {
        this.sm.go('test_mode');
    }

    _connectorDebugger() {
        this.sm.go('connector_debugger');
    }

    _rapierDebugger() {
        this.sm.go('rapier_debugger');
    }

    _buildingFabrication() {
        this.sm.go('building_fabrication');
    }

    _meshInspector() {
        this.sm.go('mesh_inspector');
    }

    _textureInspector() {
        this.sm.go('texture_inspector');
    }

    _setup() {
        this.sm.go('setup');
    }

    _startTestErrorWidget() {
        if (!this.testErrorWidget) return;
        this._refreshTestErrorWidget();
        if (this._testErrorInterval) return;
        this._testErrorInterval = window.setInterval(() => this._refreshTestErrorWidget(), 250);
    }

    _stopTestErrorWidget() {
        if (!this._testErrorInterval) return;
        window.clearInterval(this._testErrorInterval);
        this._testErrorInterval = null;
    }

    _refreshTestErrorWidget() {
        if (!this.testErrorWidget || typeof window === 'undefined') return;
        const errors = Array.isArray(window.__testErrors) ? window.__testErrors : [];
        const fatals = Array.isArray(window.__testFatals) ? window.__testFatals : [];
        const errorCount = errors.length;
        const fatalCount = fatals.length;
        if (errorCount === 0 && fatalCount === 0) {
            this.testErrorWidget.textContent = 'All tests passed';
            this.testErrorWidget.classList.add('hidden');
            return;
        }
        this.testErrorWidget.textContent = `${errorCount} errors, ${fatalCount} fatals found`;
        this.testErrorWidget.classList.remove('hidden');
    }

    _handleKeyDown(e) {
        const code = e.code;
        const key = e.key;

        const isEnter = code === 'Enter' || key === 'Enter';
        const isSpace = code === 'Space' || key === ' ' || key === 'Spacebar';
        const is1 = code === 'Digit1' || code === 'Numpad1' || key === '1';
        const is2 = code === 'Digit2' || code === 'Numpad2' || key === '2';
        const is3 = code === 'Digit3' || code === 'Numpad3' || key === '3';
        const is4 = code === 'Digit4' || code === 'Numpad4' || key === '4';
        const is5 = code === 'Digit5' || code === 'Numpad5' || key === '5';
        const is6 = code === 'Digit6' || code === 'Numpad6' || key === '6';
        const is7 = code === 'Digit7' || code === 'Numpad7' || key === '7';
        const isG = code === 'KeyG' || key === 'g' || key === 'G';
        const isQ = code === 'KeyQ' || key === 'q' || key === 'Q';

        if (isEnter || isSpace || is1 || is2 || is3 || is4 || is5 || is6 || is7 || isG || isQ) e.preventDefault();

        if (is1) return this._mapDebugger();
        if (is2) return this._test();
        if (is3) return this._connectorDebugger();
        if (is4) return this._rapierDebugger();
        if (is5) return this._buildingFabrication();
        if (is6) return this._meshInspector();
        if (is7) return this._textureInspector();
        if (isG) return this._garage();
        if (isQ) return this._setup();
        if (isEnter || isSpace) return this._start();
    }
}
