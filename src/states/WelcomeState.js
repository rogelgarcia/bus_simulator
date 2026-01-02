// src/states/WelcomeState.js
export class WelcomeState {
    constructor(engine, sm) {
        this.engine = engine;
        this.sm = sm;

        this.canvas = engine.canvas;

        this.uiWelcome = document.getElementById('ui-welcome');
        this.uiSelect = document.getElementById('ui-select');
        this.uiSetup = document.getElementById('ui-setup');

        this._onKeyDown = (e) => this._handleKeyDown(e);
        this._onPointerDown = () => this._start(); // optional click-to-start
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
    }

    exit() {
        window.removeEventListener('keydown', this._onKeyDown);
        this.canvas?.removeEventListener?.('pointerdown', this._onPointerDown);
    }

    _start() {
        this.sm.go('bus_select');
    }

    _garage() {
        this.sm.go('bus_select');
    }

    _city() {
        this.sm.go('city');
    }

    _test() {
        this.sm.go('test_mode');
    }

    _connectorDebugger() {
        this.sm.go('connector_debugger');
    }

    _setup() {
        this.sm.go('setup');
    }

    _handleKeyDown(e) {
        const code = e.code;
        const key = e.key;

        const isEnter = code === 'Enter' || key === 'Enter';
        const isSpace = code === 'Space' || key === ' ' || key === 'Spacebar';
        const is1 = code === 'Digit1' || code === 'Numpad1' || key === '1';
        const is2 = code === 'Digit2' || code === 'Numpad2' || key === '2';
        const is3 = code === 'Digit3' || code === 'Numpad3' || key === '3';
        const isG = code === 'KeyG' || key === 'g' || key === 'G';
        const isQ = code === 'KeyQ' || key === 'q' || key === 'Q';

        if (isEnter || isSpace || is1 || is2 || is3 || isG || isQ) e.preventDefault();

        if (is1) return this._city();
        if (is2) return this._test();
        if (is3) return this._connectorDebugger();
        if (isG) return this._garage();
        if (isQ) return this._setup();
        if (isEnter || isSpace) return this._start();
    }
}
