// src/states/WelcomeState.js
export class WelcomeState {
    constructor(engine, sm) {
        this.engine = engine;
        this.sm = sm;

        this.canvas = engine.canvas;

        this.uiWelcome = document.getElementById('ui-welcome');
        this.uiSelect = document.getElementById('ui-select');

        this._onKeyDown = (e) => this._handleKeyDown(e);
        this._onPointerDown = () => this._start(); // optional click-to-start
    }

    enter() {
        document.body.classList.add('splash-bg');

        if (this.uiSelect) this.uiSelect.classList.add('hidden');
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

    _test() {
        this.sm.go('test_mode');
    }

    _city() {
        this.sm.go('city');
    }

    _gameplay() {
        // Go directly to new GameplayState (for testing new architecture)
        this.sm.go('gameplay');
    }

    _handleKeyDown(e) {
        const code = e.code;
        const key = e.key;

        const isEnter = code === 'Enter' || key === 'Enter';
        const isSpace = code === 'Space' || key === ' ' || key === 'Spacebar';
        const isT = code === 'KeyT' || key === 't' || key === 'T';
        const isC = code === 'KeyC' || key === 'c' || key === 'C';
        const isG = code === 'KeyG' || key === 'g' || key === 'G';

        if (isEnter || isSpace || isT || isC || isG) e.preventDefault();

        if (isG) return this._gameplay();
        if (isC) return this._city();
        if (isT) return this._test();
        if (isEnter || isSpace) return this._start();
    }
}
