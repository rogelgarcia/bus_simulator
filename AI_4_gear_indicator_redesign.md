# AI Request 4: Gear Indicator Redesign

## Objective
Move the gear indicator inside the gauge block (speed/rpm ranges). Remove the "Gear" label - just show the number bigger.

## Changes Needed
1. Move the gear indicator inside the `gauge-row` container (currently it's outside below it)
2. Remove the "Gear" text label
3. Make the gear number significantly larger and more prominent
4. Position it visually integrated with the speed and RPM gauges

## Response Requirements
**IMPORTANT**: Provide the response as FULL MODIFIED FILES, not snippets or diffs. Include complete file content for any files that need changes.

---

## Attached Files - Complete Source Code from graphics/gui folder

### graphics/gui/GameHUD.js
```javascript
// graphics/gui/GameHUD.js

import { injectHudStyles } from "./HUDStyles.js";
import { RampedControl } from "../../src/input/RampedControl.js";
import { SteeringWheelWidget } from "./widgets/SteeringWheelWidget.js";
import { PedalWidget } from "./widgets/PedalWidget.js";
import { GaugeWidget } from "./widgets/GaugeWidget.js";
import { DemoDrivetrainSim } from "../../src/physics/systems/DemoDrivetrainSim.js";

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
```

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
```

### graphics/gui/GameHUD.js
```
// graphics/gui/GameHUD.js

import { injectHudStyles } from "./HUDStyles.js";
import { RampedControl } from "../../src/input/RampedControl.js";
import { SteeringWheelWidget } from "./widgets/SteeringWheelWidget.js";
import { PedalWidget } from "./widgets/PedalWidget.js";
import { GaugeWidget } from "./widgets/GaugeWidget.js";
import { DemoDrivetrainSim } from "../../src/physics/systems/DemoDrivetrainSim.js";

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
```

### graphics/gui/HUDStyles.js
```
// graphics/gui/HUDStyles.js

export function injectHudStyles() {
    // Avoid double-inject
    const existing = document.getElementById("hud-styles");
    if (existing) return () => {};

    const style = document.createElement("style");
    style.id = "hud-styles";
    style.textContent = `
:root{
  --hud-bg: rgba(8, 12, 18, 0.55);
  --hud-border: rgba(255,255,255,0.14);
  --hud-text: rgba(255,255,255,0.92);
  --hud-muted: rgba(255,255,255,0.72);
  --hud-accent: rgba(255, 204, 0, 0.95);
  --hud-danger: rgba(255, 90, 90, 0.92);
}

#hud-game {
  position: fixed;
  inset: 0;
  z-index: 4;
  pointer-events: none;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  color: var(--hud-text);
}

#hud-game.hidden { display: none !important; }

.hud-cluster {
  position: fixed;
  display: flex;
  gap: 12px;
  padding: 12px;
}

.hud-panel {
  background: var(--hud-bg);
  border: 1px solid var(--hud-border);
  border-radius: 16px;
  box-shadow: 0 18px 60px rgba(0,0,0,0.45);
  backdrop-filter: blur(10px);
}

.hud-cluster.bottom-left { left: 18px; bottom: 18px; }
.hud-cluster.bottom-right { right: 18px; bottom: 18px; }
.hud-cluster.top-right { right: 18px; top: 18px; }

.hud-title {
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--hud-muted);
  margin-bottom: 8px;
}

/* ===== Steering wheel ===== */
.wheel-widget {
  width: 178px;
  height: 178px;
  padding: 12px;
}

.wheel-wrap {
  width: 154px;
  height: 154px;
  position: relative;
  border-radius: 50%;
}

.wheel-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.22);
  box-shadow:
    inset 0 0 0 6px rgba(0,0,0,0.18),
    0 10px 30px rgba(0,0,0,0.28);
}

.wheel-center {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(255,255,255,0.70);
  transform: translate(-50%, -50%);
  box-shadow: 0 0 10px rgba(255,255,255,0.22);
}

.wheel-ball {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--hud-accent);
  transform: translate(-50%, -50%);
  box-shadow: 0 0 14px rgba(255,204,0,0.35);
}

.wheel-readout {
  position: absolute;
  left: 50%;
  bottom: 10px;
  transform: translateX(-50%);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--hud-muted);
  white-space: nowrap;
}

/* Simple “gap” hint to suggest 270° travel (bottom gap) */
.wheel-gap {
  position: absolute;
  left: 50%;
  bottom: -2px;
  width: 54px;
  height: 22px;
  transform: translateX(-50%);
  background: rgba(8, 12, 18, 0.95);
  border-radius: 999px 999px 0 0;
  border-top: 1px solid rgba(255,255,255,0.10);
}

/* ===== Pedals ===== */
.pedal-widget {
  width: 158px;
  height: 178px;
  padding: 12px;
  display: flex;
  flex-direction: column;
}

.pedal-row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}

.pedal {
  width: 66px;
}

.pedal-label {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--hud-muted);
  margin: 0 0 8px;
  text-align: center;
}

.pedal-track {
  position: relative;
  height: 118px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(255,255,255,0.06);
  overflow: hidden;
  box-shadow: inset 0 0 0 2px rgba(0,0,0,0.12);
}

.pedal-fill {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 0%;
  border-radius: 12px;
  transform: translateZ(0);
}

.pedal-fill.throttle { background: linear-gradient(180deg, rgba(255,204,0,0.95), rgba(255,184,0,0.85)); }
.pedal-fill.brake { background: linear-gradient(180deg, rgba(255,90,90,0.92), rgba(255,60,60,0.82)); }

.pedal-value {
  margin-top: 8px;
  font-size: 11px;
  color: rgba(255,255,255,0.86);
  text-align: center;
}

/* ===== Gauges ===== */
.gauge-widget {
  width: 320px;
  padding: 12px;
}

.gauge-row {
  display: flex;
  gap: 12px;
}

.gauge {
  width: 146px;
}

.gauge-face {
  width: 146px;
  height: 146px;
  position: relative;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.22);
  background:
    radial-gradient(circle at 50% 50%, rgba(255,255,255,0.07) 0%, rgba(0,0,0,0.00) 58%),
    linear-gradient(180deg, rgba(255,255,255,0.03), rgba(0,0,0,0.0));
  box-shadow:
    inset 0 0 0 6px rgba(0,0,0,0.16),
    0 14px 40px rgba(0,0,0,0.30);
}

.gauge-needle {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 2px;
  height: 56px;
  transform-origin: 50% 100%;
  transform: translate(-50%, -100%) rotate(0deg);
  background: var(--hud-accent);
  border-radius: 2px;
  box-shadow: 0 0 12px rgba(255,204,0,0.22);
}

.gauge-center {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background: rgba(255,255,255,0.72);
}

.gauge-caption {
  margin-top: 10px;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.gauge-label {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--hud-muted);
}

.gauge-value {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: rgba(255,255,255,0.92);
}

.hud-keys {
  margin-top: 10px;
  font-size: 11px;
  color: rgba(255,255,255,0.70);
  letter-spacing: 0.02em;
}

/* ===== Gear indicator ===== */
.gear-strip {
  margin-top: 10px;
  display: flex;
  justify-content: flex-end;
}

.gear-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(0,0,0,0.18);
}

.gear-label {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--hud-muted);
}

.gear-value {
  font-size: 18px;
  font-weight: 900;
  letter-spacing: 0.06em;
  color: rgba(255,255,255,0.92);
  min-width: 20px;
  text-align: center;
}
`;
    document.head.appendChild(style);
    return () => style.remove();
}
```

### graphics/gui/index.js
```
// graphics/gui/index.js

export { GameHUD } from "./GameHUD.js";
```

### graphics/gui/styles.css
```
/* graphics/gui/styles.css */

html, body {
    height: 100%;
    margin: 0;
    overflow: hidden;
    background: #0b0f14;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
}

/* Canvas always full screen (3D scenes) */
#game-canvas {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    z-index: 1;
}

/* UI layers sit on top */
.ui-layer {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    z-index: 2;
}

.hidden { display: none !important; }

/* ===== Splash background ===== */
body.splash-bg {
    background: #0b0f14 url('../../assets/main.png') center/cover no-repeat fixed;
}

/* Darken + add readability overlay on top of the background image */
body.splash-bg::before {
    content: "";
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;

    /* very light overlay (almost transparent) */
    background:
            radial-gradient(ellipse at 50% 35%,
            rgba(0,0,0,0.00) 0%,
            rgba(0,0,0,0.06) 65%,
            rgba(0,0,0,0.10) 100%),
            linear-gradient(180deg,
            rgba(0,0,0,0.03) 0%,
            rgba(0,0,0,0.08) 100%);
}


/* Hide the 3D canvas visually during splash so the background image is clean */
body.splash-bg #game-canvas {
    opacity: 0;
    transition: opacity 200ms ease;
}

/* ===== Splash content ===== */
.splash-wrap {
    pointer-events: auto;
    text-align: center;
    padding: 44px 28px 34px;
    border-radius: 22px;
    border: 1px solid rgba(255,255,255,0.12);
    background: rgba(8, 12, 18, 0.35);
    backdrop-filter: blur(10px);
    box-shadow: 0 20px 80px rgba(0,0,0,0.45);
    max-width: 820px;
    width: min(820px, calc(100vw - 36px));
}

.splash-title {
    margin: 0;
    font-weight: 900;
    letter-spacing: 0.10em;
    text-transform: uppercase;
    font-size: clamp(44px, 6vw, 92px);
    line-height: 1.0;
    color: #ffffff;
    text-shadow:
            0 2px 0 rgba(0,0,0,0.35),
            0 0 22px rgba(255, 204, 0, 0.22),
            0 0 42px rgba(126, 203, 255, 0.14);
}

.splash-subtitle {
    margin: 14px 0 26px;
    font-size: clamp(14px, 1.6vw, 18px);
    opacity: 0.85;
    color: rgba(255,255,255,0.92);
}

.start-btn {
    cursor: pointer;
    border: 1px solid rgba(255, 204, 0, 0.75);
    border-radius: 999px;
    padding: 14px 28px;
    font-size: 16px;
    font-weight: 900;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #0b0f14;
    background: linear-gradient(180deg, #ffdd33 0%, #ffb800 100%);
    position: relative;
    outline: none;
    transform: translateY(0);
    box-shadow:
            0 10px 30px rgba(0,0,0,0.35),
            0 0 18px rgba(255,204,0,0.28),
            0 0 44px rgba(255,204,0,0.18);
    animation: pulseGlow 1.6s ease-in-out infinite;
}

.start-btn::after {
    content: "";
    position: absolute;
    inset: -10px;
    border-radius: 999px;
    border: 1px solid rgba(255, 204, 0, 0.38);
    opacity: 0.65;
    filter: blur(0.3px);
}

.start-btn:hover {
    filter: brightness(1.05);
}

.start-btn:active {
    transform: translateY(1px);
}

@keyframes pulseGlow {
    0%, 100% {
        box-shadow:
                0 10px 30px rgba(0,0,0,0.35),
                0 0 18px rgba(255,204,0,0.28),
                0 0 44px rgba(255,204,0,0.18);
    }
    50% {
        box-shadow:
                0 14px 40px rgba(0,0,0,0.42),
                0 0 26px rgba(255,204,0,0.55),
                0 0 78px rgba(255,204,0,0.28);
    }
}

.hint {
    margin-top: 14px;
    font-size: 12px;
    color: rgba(255,255,255,0.72);
}

/* ===== Bus selection HUD ===== */
.topbar {
    position: fixed;
    left: 0;
    right: 0;
    top: 0;
    padding: 12px 14px;
    display: flex;
    justify-content: center;
    pointer-events: none;
    z-index: 2;
}
.topbar .chip {
    pointer-events: none;
    padding: 8px 12px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.12);
    background: rgba(10,14,20,0.6);
    color: #fff;
    font-size: 13px;
    opacity: 0.92;
}

/* Blink effect */
#blink {
    position: fixed;
    inset: 0;
    background: #fff;
    opacity: 0;
    pointer-events: none;
    z-index: 5;
}
#blink.blink { animation: blink 0.45s linear 1; }
@keyframes blink {
    0% { opacity: 0; }
    12% { opacity: 1; }
    24% { opacity: 0; }
    36% { opacity: 1; }
    48% { opacity: 0; }
    100% { opacity: 0; }
}
```

### graphics/gui/utils/screenFade.js
```
// graphics/gui/utils/screenFade.js
import { tween } from '../../../src/utils/animate.js';

let _el = null;
let _stop = null;

function getEl() {
    if (_el) return _el;

    const el = document.createElement('div');
    el.id = 'ui-fade';
    el.style.position = 'fixed';
    el.style.inset = '0';
    el.style.background = '#000';
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
    el.style.zIndex = '999999';
    el.style.willChange = 'opacity';

    document.body.appendChild(el);
    _el = el;
    return _el;
}

function setOpacity(opacity, { blockInput = true } = {}) {
    const el = getEl();
    const o = Math.max(0, Math.min(1, opacity));
    el.style.opacity = String(o);

    // Optional input block while fading
    el.style.pointerEvents = blockInput && o > 0.001 ? 'auto' : 'none';
}

export function fadeTo({ opacity = 0, duration = 0.6, blockInput = true } = {}) {
    const el = getEl();

    // cancel any in-flight fade
    if (_stop) {
        _stop();
        _stop = null;
    }

    const from = parseFloat(el.style.opacity || '0') || 0;
    const to = Math.max(0, Math.min(1, opacity));

    // ensure it blocks input immediately if requested
    if (blockInput) el.style.pointerEvents = 'auto';

    return new Promise((resolve) => {
        _stop = tween({
            duration,
            onUpdate: (k) => {
                const v = from + (to - from) * k;
                setOpacity(v, { blockInput });
            },
            onComplete: () => {
                _stop = null;
                setOpacity(to, { blockInput });
                resolve();
            }
        });
    });
}

export function fadeOut({ duration = 0.6, blockInput = true } = {}) {
    return fadeTo({ opacity: 1, duration, blockInput });
}

export function fadeIn({ duration = 0.6 } = {}) {
    // Fade in should NOT block input once done
    return fadeTo({ opacity: 0, duration, blockInput: false });
}
```

### graphics/gui/widgets/GaugeWidget.js
```
// graphics/gui/widgets/GaugeWidget.js

function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
}

export class GaugeWidget {
    constructor({
                    label = "Speed",
                    min = 0,
                    max = 140,
                    units = "km/h",
                    angleRangeDeg = 240, // needle sweep
                } = {}) {
        this.min = min;
        this.max = max;
        this.units = units;
        this.angleRangeDeg = angleRangeDeg;

        this.root = document.createElement("div");
        this.root.className = "gauge";

        this.face = document.createElement("div");
        this.face.className = "gauge-face";

        this.needle = document.createElement("div");
        this.needle.className = "gauge-needle";

        this.center = document.createElement("div");
        this.center.className = "gauge-center";

        this.face.appendChild(this.needle);
        this.face.appendChild(this.center);

        this.caption = document.createElement("div");
        this.caption.className = "gauge-caption";

        this.labelEl = document.createElement("div");
        this.labelEl.className = "gauge-label";
        this.labelEl.textContent = label;

        this.valueEl = document.createElement("div");
        this.valueEl.className = "gauge-value";
        this.valueEl.textContent = `0 ${units}`;

        this.caption.appendChild(this.labelEl);
        this.caption.appendChild(this.valueEl);

        this.root.appendChild(this.face);
        this.root.appendChild(this.caption);

        this.setValue(min);
    }

    getElement() {
        return this.root;
    }

    setValue(v) {
        const value = clamp(v, this.min, this.max);
        const t = (value - this.min) / Math.max(0.0001, this.max - this.min);

        const start = -this.angleRangeDeg / 2;
        const angle = start + t * this.angleRangeDeg;

        // Needle anchor: center; we place it with translate(-50%,-100%)
        this.needle.style.transform = `translate(-50%, -100%) rotate(${angle.toFixed(2)}deg)`;

        const shown = Math.round(value);
        this.valueEl.textContent = `${shown} ${this.units}`;
    }
}
```

### graphics/gui/widgets/PedalWidget.js
```
// graphics/gui/widgets/PedalWidget.js

function clamp01(v) {
    return Math.max(0, Math.min(1, v));
}

export class PedalWidget {
    constructor({ title = "Pedals", leftLabel = "Accel", rightLabel = "Brake" } = {}) {
        this.root = document.createElement("div");
        this.root.className = "hud-panel pedal-widget";

        const header = document.createElement("div");
        header.className = "hud-title";
        header.textContent = title;

        const row = document.createElement("div");
        row.className = "pedal-row";

        // Throttle
        this.throttle = this._makePedal(leftLabel, "throttle");
        // Brake
        this.brake = this._makePedal(rightLabel, "brake");

        row.appendChild(this.throttle.wrap);
        row.appendChild(this.brake.wrap);

        this.keysHint = document.createElement("div");
        this.keysHint.className = "hud-keys";
        this.keysHint.textContent = "Keys: ↑ throttle, ↓ brake";

        this.root.appendChild(header);
        this.root.appendChild(row);
        this.root.appendChild(this.keysHint);

        this.setThrottle(0);
        this.setBrake(0);
    }

    _makePedal(label, kind) {
        const wrap = document.createElement("div");
        wrap.className = "pedal";

        const title = document.createElement("div");
        title.className = "pedal-label";
        title.textContent = label;

        const track = document.createElement("div");
        track.className = "pedal-track";

        const fill = document.createElement("div");
        fill.className = `pedal-fill ${kind}`;

        track.appendChild(fill);

        const value = document.createElement("div");
        value.className = "pedal-value";
        value.textContent = "0%";

        wrap.appendChild(title);
        wrap.appendChild(track);
        wrap.appendChild(value);

        return { wrap, fill, value };
    }

    getElement() {
        return this.root;
    }

    setThrottle(v) {
        const t = clamp01(v);
        this.throttle.fill.style.height = `${(t * 100).toFixed(1)}%`;
        this.throttle.value.textContent = `${Math.round(t * 100)}%`;
    }

    setBrake(v) {
        const b = clamp01(v);
        this.brake.fill.style.height = `${(b * 100).toFixed(1)}%`;
        this.brake.value.textContent = `${Math.round(b * 100)}%`;
    }
}
```

### graphics/gui/widgets/SteeringWheelWidget.js
```
// graphics/gui/widgets/SteeringWheelWidget.js

function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
}

export class SteeringWheelWidget {
    constructor({ title = "Steering" } = {}) {
        this.root = document.createElement("div");
        this.root.className = "hud-panel wheel-widget";

        const header = document.createElement("div");
        header.className = "hud-title";
        header.textContent = title;

        this.wrap = document.createElement("div");
        this.wrap.className = "wheel-wrap";

        this.ring = document.createElement("div");
        this.ring.className = "wheel-ring";

        this.gap = document.createElement("div");
        this.gap.className = "wheel-gap";

        this.ball = document.createElement("div");
        this.ball.className = "wheel-ball";

        this.center = document.createElement("div");
        this.center.className = "wheel-center";

        this.readout = document.createElement("div");
        this.readout.className = "wheel-readout";
        this.readout.textContent = "0°";

        this.wrap.appendChild(this.ring);
        this.wrap.appendChild(this.gap);
        this.wrap.appendChild(this.ball);
        this.wrap.appendChild(this.center);
        this.wrap.appendChild(this.readout);

        this.root.appendChild(header);
        this.root.appendChild(this.wrap);

        this._radiusPx = 60; // ball travel radius
        this._maxDeg = 135;  // 270° total range
        this.setSteerNorm(0);
    }

    getElement() {
        return this.root;
    }

    /**
     * @param {number} norm -1..+1
     */
    setSteerNorm(norm) {
        const n = clamp(norm, -1, 1);
        const deg = n * this._maxDeg;

        // Ball position: 0° at top, +/-135° down-left/down-right.
        const rad = (deg * Math.PI) / 180;
        const x = Math.sin(rad) * this._radiusPx;
        const y = -Math.cos(rad) * this._radiusPx;

        this.ball.style.transform = `translate(-50%, -50%) translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
        this.readout.textContent = `${Math.round(deg)}°`;
    }
}
```
