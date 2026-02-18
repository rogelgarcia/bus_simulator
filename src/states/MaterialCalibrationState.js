// src/states/MaterialCalibrationState.js
// Wires the Material Calibration tool into the state machine.
import { MaterialCalibrationView } from '../graphics/gui/material_calibration/MaterialCalibrationView.js';

export class MaterialCalibrationState {
    constructor(engine, sm) {
        this.engine = engine;
        this.sm = sm;

        this.uiWelcome = document.getElementById('ui-welcome');
        this.uiSelect = document.getElementById('ui-select');
        this.uiSetup = document.getElementById('ui-setup');
        this.uiHudTest = document.getElementById('ui-test');

        this.view = null;
        this._uiBound = false;
        this._prevSunBloomSettings = null;
        this._prevColorGradingSettings = null;
    }

    enter() {
        // Material calibration expects neutral presentation; temporarily disable sun bloom.
        // Must not persist: restore previous settings on exit.
        const sunBloom = this.engine?.sunBloomSettings ?? null;
        this._prevSunBloomSettings = sunBloom && typeof sunBloom === 'object'
            ? JSON.parse(JSON.stringify(sunBloom))
            : null;
        this.engine?.setSunBloomSettings?.({ ...(this._prevSunBloomSettings ?? {}), enabled: false });

        // Disable LUT color grading for calibration (must not persist).
        const grading = this.engine?.colorGradingSettings ?? null;
        this._prevColorGradingSettings = grading && typeof grading === 'object'
            ? JSON.parse(JSON.stringify(grading))
            : null;
        this.engine?.setColorGradingSettings?.({ ...(this._prevColorGradingSettings ?? {}), intensity: 0 });

        const appCanvas = document.getElementById('game-canvas');
        this._uiBound = !!(appCanvas && this.engine?.canvas === appCanvas);

        if (this._uiBound) {
            document.body.classList.remove('splash-bg');
            document.body.classList.remove('setup-bg');

            if (this.uiSelect) this.uiSelect.classList.add('hidden');
            if (this.uiWelcome) this.uiWelcome.classList.add('hidden');
            if (this.uiSetup) this.uiSetup.classList.add('hidden');
            if (this.uiHudTest) this.uiHudTest.classList.add('hidden');
        }

        this.engine.clearScene();

        this.view = new MaterialCalibrationView(this.engine);
        this.view.onExit = () => this.sm.go('welcome');
        this.view.enter();
    }

    exit() {
        this.view?.exit();
        this.view = null;

        this.engine?.reloadLightingSettings?.();

        if (this._prevSunBloomSettings && this.engine?.setSunBloomSettings) {
            this.engine.setSunBloomSettings(this._prevSunBloomSettings);
        } else {
            this.engine?.reloadSunBloomSettings?.();
        }
        this._prevSunBloomSettings = null;

        if (this._prevColorGradingSettings && this.engine?.setColorGradingSettings) {
            this.engine.setColorGradingSettings(this._prevColorGradingSettings);
        } else {
            this.engine?.reloadColorGradingSettings?.();
        }
        this._prevColorGradingSettings = null;

        this.engine.clearScene();
        this._uiBound = false;
    }

    update(dt) {
        this.view?.update(dt);
    }
}
