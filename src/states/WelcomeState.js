// src/states/WelcomeState.js
import { getSceneShortcutByKey } from './SceneShortcutRegistry.js';

function isEditableTarget(target) {
    const el = target && typeof target === 'object' ? target : null;
    if (!el) return false;
    const tag = String(el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    return !!el.isContentEditable;
}

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

    _goScene(sceneId) {
        const id = typeof sceneId === 'string' ? sceneId : '';
        if (!id) return;
        this.sm.go(id);
    }

    _setup() {
        this.sm.go('setup');
    }

    _setupDebugs() {
        this.sm.go('setup', { initialMenu: 'debugs' });
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
        if (isEditableTarget(e.target)) return;
        const code = e.code;
        const key = e.key;

        const isEnter = code === 'Enter' || key === 'Enter';
        const isSpace = code === 'Space' || key === ' ' || key === 'Spacebar';
        const isG = code === 'KeyG' || key === 'g' || key === 'G';
        const isQ = code === 'KeyQ' || key === 'q' || key === 'Q';
        const is8 = code === 'Digit8' || code === 'Numpad8' || key === '8';

        const typed = typeof key === 'string' ? key.toUpperCase() : '';
        const scene = getSceneShortcutByKey(typed);

        if (isEnter || isSpace || scene || isG || isQ || is8) e.preventDefault();

        if (scene) return this._goScene(scene.id);
        if (isG) return this._garage();
        if (isQ) return this._setup();
        if (is8) return this._setupDebugs();
        if (isEnter || isSpace) return this._start();
    }
}
