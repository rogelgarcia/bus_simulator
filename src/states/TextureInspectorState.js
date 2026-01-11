// src/states/TextureInspectorState.js
// Wires the texture inspector view into the state machine.
import { TextureInspectorView } from '../graphics/gui/texture_inspector/TextureInspectorView.js';

export class TextureInspectorState {
    constructor(engine, sm) {
        this.engine = engine;
        this.sm = sm;

        this.uiWelcome = document.getElementById('ui-welcome');
        this.uiSelect = document.getElementById('ui-select');
        this.uiSetup = document.getElementById('ui-setup');
        this.uiHudTest = document.getElementById('ui-test');

        this.view = null;

        this._onKeyDown = (e) => this._handleKeyDown(e);
    }

    enter() {
        document.body.classList.remove('splash-bg');
        document.body.classList.remove('setup-bg');

        if (this.uiSelect) this.uiSelect.classList.add('hidden');
        if (this.uiWelcome) this.uiWelcome.classList.add('hidden');
        if (this.uiSetup) this.uiSetup.classList.add('hidden');
        if (this.uiHudTest) this.uiHudTest.classList.add('hidden');

        this.engine.clearScene();

        this.view = new TextureInspectorView(this.engine);
        this.view.enter();

        window.addEventListener('keydown', this._onKeyDown, { passive: false });
    }

    exit() {
        window.removeEventListener('keydown', this._onKeyDown);

        this.view?.exit();
        this.view = null;

        this.engine.clearScene();
    }

    update(dt) {
        this.view?.update(dt);
    }

    _handleKeyDown(e) {
        const code = e.code;
        const key = e.key;
        if (code === 'Escape' || key === 'Escape') {
            e.preventDefault();
            this.sm.go('welcome');
        }
    }
}

