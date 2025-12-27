// src/hud/widgets/GaugeWidget.js

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
