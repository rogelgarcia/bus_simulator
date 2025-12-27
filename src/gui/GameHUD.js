// src/gui/GameHUD.js

import { injectHudStyles } from "./HUDStyles.js";
import { RampedControl } from "../input/RampedControl.js";
import { SteeringWheelWidget } from "./widgets/SteeringWheelWidget.js";
import { PedalWidget } from "./widgets/PedalWidget.js";
import { GaugeWidget } from "./widgets/GaugeWidget.js";
import { DemoDrivetrainSim } from "../physics/systems/DemoDrivetrainSim.js";

function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
}

export class GameHUD {
    constructor({ mode = "demo" } = {}) {
        this.mode = mode;

        this._removeStyles = injectHudStyles();

        this.root = document.createElement("div");
        this.root.id = "hud-game";
        this.root.className = "hidden";

        // Telemetry -> bottom-left
        this.clusterTelemetry = document.createElement("div");
        this.clusterTelemetry.className = "hud-cluster bottom-left hud-panel gauge-widget";

        // Controls -> bottom-right (wheel LEFT of pedals)
        this.clusterControls = document.createElement("div");
        this.clusterControls.className = "hud-cluster bottom-right";

        // Widgets
        this.wheelWidget = new SteeringWheelWidget({ title: "Wheel (270°)" });

        this.pedalsWidget = new PedalWidget({ title: "Controls", leftLabel: "Accel", rightLabel: "Brake" });
        this.pedalsWidget.keysHint.textContent = "Keys: ←/→ steer, ↑ throttle, ↓ brake";

        this.speedGauge = new GaugeWidget({ label: "Speed", min: 0, max: 140, units: "km/h", angleRangeDeg: 240 });
        this.rpmGauge = new GaugeWidget({ label: "RPM", min: 0, max: 8000, units: "rpm", angleRangeDeg: 240 });

        const gaugeRow = document.createElement("div");
        gaugeRow.className = "gauge-row";
        gaugeRow.appendChild(this.speedGauge.getElement());
        gaugeRow.appendChild(this.rpmGauge.getElement());
        this.clusterTelemetry.appendChild(gaugeRow);

        // Gear chip
        this.gearStrip = document.createElement("div");
        this.gearStrip.className = "gear-strip";

        this.gearChip = document.createElement("div");
        this.gearChip.className = "gear-chip";

        this.gearLabelEl = document.createElement("div");
        this.gearLabelEl.className = "gear-label";
        this.gearLabelEl.textContent = "Gear";

        this.gearValueEl = document.createElement("div");
        this.gearValueEl.className = "gear-value";
        this.gearValueEl.textContent = "1";

        this.gearChip.appendChild(this.gearLabelEl);
        this.gearChip.appendChild(this.gearValueEl);
        this.gearStrip.appendChild(this.gearChip);
        this.clusterTelemetry.appendChild(this.gearStrip);

        this.clusterControls.appendChild(this.wheelWidget.getElement());
        this.clusterControls.appendChild(this.pedalsWidget.getElement());

        this.root.appendChild(this.clusterTelemetry);
        this.root.appendChild(this.clusterControls);

        // Input state
        this.keys = { left: false, right: false, up: false, down: false };

        // Ramped controls
        this.steer = new RampedControl({
            value: 0,
            min: -1,
            max: 1,
            rampTime: 0.55,
            minRate: 0.7,
            maxRate: 3.8,
            returnRampTime: 0.55,
            minReturnRate: 0.6,
            maxReturnRate: 4.8,
        });

        this.throttle = new RampedControl({
            value: 0,
            min: 0,
            max: 1,
            rampTime: 0.55,
            minRate: 0.55,
            maxRate: 2.8,
            returnRampTime: 0.55,
            minReturnRate: 0.55,
            maxReturnRate: 3.0,
        });

        this.brake = new RampedControl({
            value: 0,
            min: 0,
            max: 1,
            rampTime: 0.55,
            minRate: 0.55,
            maxRate: 3.2,
            returnRampTime: 0.55,
            minReturnRate: 0.55,
            maxReturnRate: 3.4,
        });

        // Demo drivetrain (physics-ish)
        this.driveSim = new DemoDrivetrainSim();

        // RPM display inertia:
        // actualRpm = physics value, displayRpm = what we show on the gauge needle.
        this.actualRpm = 0;
        this.displayRpm = 0;
        this._displayRpmInitialized = false;

        // Tune inertia (bigger = less inertia / more responsive)
        this._rpmDisplayRiseRate = 6.0;  // slower rise
        this._rpmDisplayFallRate = 10.0; // faster fall

        // Telemetry (later)
        this._telemetry = { speedKph: null, rpm: null, gear: null };
        this._telemetryDirty = false;

        this._onKeyDown = (e) => this._handleKey(e, true);
        this._onKeyUp = (e) => this._handleKey(e, false);
    }

    attach(parent = document.body) {
        if (!this.root.isConnected) parent.appendChild(this.root);
    }

    show() {
        this.attach(document.body);
        this.root.classList.remove("hidden");
        window.addEventListener("keydown", this._onKeyDown, { passive: false });
        window.addEventListener("keyup", this._onKeyUp, { passive: false });
    }

    hide() {
        this.root.classList.add("hidden");
        window.removeEventListener("keydown", this._onKeyDown);
        window.removeEventListener("keyup", this._onKeyUp);
    }

    destroy() {
        this.hide();
        if (this.root.isConnected) this.root.remove();
        // this._removeStyles?.();
    }

    setTelemetry(t = {}) {
        if (typeof t.speedKph === "number") this._telemetry.speedKph = t.speedKph;
        if (typeof t.rpm === "number") this._telemetry.rpm = t.rpm;
        if (typeof t.gear === "number") this._telemetry.gear = t.gear;
        this._telemetryDirty = true;
    }

    getControls() {
        return {
            steer: this.steer.value,
            throttle: this.throttle.value,
            brake: this.brake.value,
        };
    }

    update(dt) {
        // tolerate ms or seconds
        let delta = dt;
        if (delta > 1.0) delta *= 0.001;
        delta = clamp(delta, 0, 0.05);

        // inputs
        const left = this.keys.left ? 1 : 0;
        const right = this.keys.right ? 1 : 0;
        const steerInput = (right - left);

        const up = this.keys.up ? 1 : 0;
        const down = this.keys.down ? 1 : 0;

        const steerVal = this.steer.update(delta, steerInput);
        const throttleVal = this.throttle.update(delta, up ? 1 : 0);
        const brakeVal = this.brake.update(delta, down ? 1 : 0);

        // controls UI
        this.wheelWidget.setSteerNorm(steerVal);
        this.pedalsWidget.setThrottle(throttleVal);
        this.pedalsWidget.setBrake(brakeVal);

        // --- compute telemetry values (demo sim for now) ---
        let speedKph = 0;
        let rpmActual = 0;
        let gear = 0;

        if (this.mode === "demo" && !this._telemetryDirty) {
            const out = this.driveSim.update(delta, throttleVal, brakeVal);
            speedKph = out.speedKph;
            rpmActual = out.rpm;
            gear = this.driveSim.getGear();
        } else {
            speedKph = typeof this._telemetry.speedKph === "number" ? this._telemetry.speedKph : 0;
            rpmActual = typeof this._telemetry.rpm === "number" ? this._telemetry.rpm : 0;
            gear = typeof this._telemetry.gear === "number" ? this._telemetry.gear : 0;
            this._telemetryDirty = false;
        }

        // --- RPM display inertia ---
        this.actualRpm = rpmActual;

        if (!this._displayRpmInitialized) {
            this.displayRpm = rpmActual;
            this._displayRpmInitialized = true;
        } else {
            const rate = rpmActual >= this.displayRpm ? this._rpmDisplayRiseRate : this._rpmDisplayFallRate;
            const a = 1 - Math.exp(-delta * rate);
            this.displayRpm += (rpmActual - this.displayRpm) * a;
        }

        this.displayRpm = clamp(this.displayRpm, 0, 8000);

        // telemetry UI
        this.speedGauge.setValue(speedKph);
        this.rpmGauge.setValue(this.displayRpm); // <-- smooth needle / display RPM
        this.gearValueEl.textContent = gear > 0 ? String(gear) : "-";
    }

    _handleKey(e, isDown) {
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
        if (tag === "input" || tag === "textarea" || e.isComposing) return;

        const code = e.code;

        if (code === "ArrowLeft" || code === "KeyA") {
            this.keys.left = isDown;
            e.preventDefault();
        }
        if (code === "ArrowRight" || code === "KeyD") {
            this.keys.right = isDown;
            e.preventDefault();
        }

        if (code === "ArrowUp" || code === "KeyW") {
            this.keys.up = isDown;
            e.preventDefault();
        }
        if (code === "ArrowDown" || code === "KeyS") {
            this.keys.down = isDown;
            e.preventDefault();
        }
    }
}
