// src/gui/widgets/PedalWidget.js

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
