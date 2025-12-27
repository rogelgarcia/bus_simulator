// src/hud/widgets/SteeringWheelWidget.js

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
