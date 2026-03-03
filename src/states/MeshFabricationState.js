// src/states/MeshFabricationState.js
// Wires the mesh fabrication view into the state machine.
import { MeshFabricationView } from '../graphics/gui/mesh_fabrication/MeshFabricationView.js';

export class MeshFabricationState {
    constructor(engine, sm) {
        this.engine = engine;
        this.sm = sm;

        this.uiWelcome = document.getElementById('ui-welcome');
        this.uiSelect = document.getElementById('ui-select');
        this.uiSetup = document.getElementById('ui-setup');
        this.uiHudTest = document.getElementById('ui-test');

        this.view = null;
        this._prevLightingSettings = null;
        this._onKeyDown = (e) => this._handleKeyDown(e);
    }

    enter() {
        const lighting = this.engine?.lightingSettings ?? null;
        this._prevLightingSettings = lighting && typeof lighting === 'object'
            ? JSON.parse(JSON.stringify(lighting))
            : null;
        this.engine?.setLightingSettings?.({
            ...(this._prevLightingSettings ?? {}),
            ibl: {
                ...((this._prevLightingSettings?.ibl && typeof this._prevLightingSettings.ibl === 'object')
                    ? this._prevLightingSettings.ibl
                    : {}),
                setBackground: false
            }
        });

        document.body.classList.remove('splash-bg');
        document.body.classList.remove('setup-bg');

        if (this.uiSelect) this.uiSelect.classList.add('hidden');
        if (this.uiWelcome) this.uiWelcome.classList.add('hidden');
        if (this.uiSetup) this.uiSetup.classList.add('hidden');
        if (this.uiHudTest) this.uiHudTest.classList.add('hidden');

        this.engine.clearScene();

        this.view = new MeshFabricationView(this.engine);
        this.view.enter();

        window.addEventListener('keydown', this._onKeyDown, { passive: false });
    }

    exit() {
        window.removeEventListener('keydown', this._onKeyDown);

        this.view?.exit();
        this.view = null;

        if (this._prevLightingSettings && this.engine?.setLightingSettings) {
            this.engine.setLightingSettings(this._prevLightingSettings);
        } else {
            this.engine?.reloadLightingSettings?.();
        }
        this._prevLightingSettings = null;

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
