// src/states/RoadDebuggerState.js
// Wires the road debugger view into the state machine.
import { RoadDebuggerView } from '../graphics/gui/road_debugger/RoadDebuggerView.js';

export class RoadDebuggerState {
    constructor(engine, sm) {
        this.engine = engine;
        this.sm = sm;

        this.uiWelcome = document.getElementById('ui-welcome');
        this.uiSelect = document.getElementById('ui-select');
        this.uiSetup = document.getElementById('ui-setup');
        this.uiHudTest = document.getElementById('ui-test');

        this.view = null;
        this._uiBound = false;
    }

    enter() {
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

        this.view = new RoadDebuggerView(this.engine);
        this.view.onExit = () => this.sm.go('welcome');
        this.view.enter();
    }

    exit() {
        this.view?.exit();
        this.view = null;

        this.engine.clearScene();
        this._uiBound = false;
    }

    update(dt) {
        this.view?.update(dt);
    }
}
