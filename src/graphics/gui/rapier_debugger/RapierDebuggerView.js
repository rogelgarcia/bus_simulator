// src/graphics/gui/rapier_debugger/RapierDebuggerView.js
import { RapierDebuggerSim } from '../../../app/physics/rapier_debugger/RapierDebuggerSim.js';
import { RapierDebuggerScene } from './RapierDebuggerScene.js';
import { RapierDebuggerUI } from './RapierDebuggerUI.js';

export class RapierDebuggerView {
    constructor(engine) {
        this.engine = engine;

        this.sim = new RapierDebuggerSim();
        this.scene = new RapierDebuggerScene(engine);
        this.ui = new RapierDebuggerUI({ vehicleConfig: this.sim.vehicleConfig, tuning: this.sim.tuning });

        this._initStarted = false;
        this._uiEnabled = false;
    }

    enter() {
        this.scene.enter();
        this.ui.mount();
        this.ui.onReset = () => this.sim.resetPose();
        this.ui.onWheelHover = (idx) => this.scene.setHighlightedWheel(idx);
        this._ensureInit();
    }

    exit() {
        this.ui.onReset = null;
        this.ui.onWheelHover = null;
        this.ui.unmount();
        this.scene.dispose();
        this.sim.dispose();
        this._initStarted = false;
        this._uiEnabled = false;
    }

    update(dt) {
        this._ensureInit();

        this.ui.update(dt, null);

        if (this.sim.ready) {
            this.sim.setVehicleConfig(this.ui.getVehicleConfig());
            this.sim.setTuning(this.ui.getTuning());
            this.sim.setInputs(this.ui.getInputs());
        }

        const snapshot = this.sim.step(dt);
        const debugRender = this.sim.getDebugRenderBuffers();

        this.scene.sync(snapshot, debugRender);
        this.scene.update(dt);
        this.ui.setOutputs(snapshot);
        this.ui.update(0, snapshot);

        const shouldEnable = this.sim.ready;
        if (shouldEnable !== this._uiEnabled) {
            this._uiEnabled = shouldEnable;
            this.ui.setEnabled(shouldEnable);
        }
    }

    _ensureInit() {
        if (this._initStarted) return;
        this._initStarted = true;
        this.ui.setEnabled(false);
        this.sim.init().then(() => {
            this._uiEnabled = this.sim.ready;
            this.ui.setEnabled(this._uiEnabled);
        });
    }
}
