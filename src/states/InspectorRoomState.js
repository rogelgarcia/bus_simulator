// src/states/InspectorRoomState.js
// Wires the Inspector Room view into the state machine.
import { InspectorRoomView } from '../graphics/gui/inspector_room/InspectorRoomView.js';

export class InspectorRoomState {
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

        this.view = new InspectorRoomView(this.engine);
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

