// src/graphics/gui/rapier_debugger/RapierDebuggerView.js
import { RapierDebuggerSim } from '../../../app/physics/rapier_debugger/RapierDebuggerSim.js';
import { RapierDebuggerScene } from './RapierDebuggerScene.js';
import { RapierDebuggerUI } from './RapierDebuggerUI.js';

export class RapierDebuggerView {
    constructor(engine) {
        this.engine = engine;

        this.sim = new RapierDebuggerSim();
        this.scene = new RapierDebuggerScene(engine);
        this.ui = new RapierDebuggerUI({
            vehicleConfig: this.sim.vehicleConfig,
            tuning: this.sim.tuning,
            worldConfig: this.sim.worldConfig
        });

        this._initStarted = false;
        this._uiEnabled = false;
    }

    enter() {
        this.scene.enter();
        this.ui.mount();
        this.ui.onReset = () => this.sim.resetPose();
        this.ui.onResetCamera = () => this.scene.resetCamera();
        this.ui.onWheelHover = (idx) => this.scene.setHighlightedWheel(idx);
        this.ui.onAddForce = (force) => this.sim.addForce(force);
        this.ui.onAddForceAtPoint = (force, point) => this.sim.addForceAtPoint(force, point);
        this.ui.onAddTorque = (torque) => this.sim.addTorque(torque);
        this.ui.onResetForces = () => this.sim.resetForces();
        this.ui.onResetTorques = () => this.sim.resetTorques();
        this.ui.onResetVelocities = () => this.sim.resetVelocities();
        this.ui.onApplyImpulse = (impulse) => this.sim.applyImpulse(impulse);
        this.ui.onApplyImpulseAtPoint = (impulse, point) => this.sim.applyImpulseAtPoint(impulse, point);
        this.ui.onApplyTorqueImpulse = (torque) => this.sim.applyTorqueImpulse(torque);
        this.ui.onWakeUp = () => this.sim.wakeUp();
        this.ui.onSleep = () => this.sim.sleep();
        this.ui.onComPreview = (visible, com) => this.scene.setComPreview(visible, com);
        this._ensureInit();
    }

    exit() {
        this.ui.onReset = null;
        this.ui.onResetCamera = null;
        this.ui.onWheelHover = null;
        this.ui.onAddForce = null;
        this.ui.onAddForceAtPoint = null;
        this.ui.onAddTorque = null;
        this.ui.onResetForces = null;
        this.ui.onResetTorques = null;
        this.ui.onResetVelocities = null;
        this.ui.onApplyImpulse = null;
        this.ui.onApplyImpulseAtPoint = null;
        this.ui.onApplyTorqueImpulse = null;
        this.ui.onWakeUp = null;
        this.ui.onSleep = null;
        this.ui.onComPreview = null;
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
            this.sim.setWorldConfig(this.ui.getWorldConfig());
            this.sim.setInputs(this.ui.getInputs());
        }

        const snapshot = this.sim.step(dt);
        const debugRender = this.sim.getDebugRenderBuffers();

        this.scene.sync(snapshot, debugRender);
        this.scene.update(dt);
        this.ui.setOutputs(snapshot);
        this.ui.update(0, snapshot);
        this.ui.setCameraCoords(this.scene.getCameraPosition());

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
