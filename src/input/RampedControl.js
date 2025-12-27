// src/input/RampedControl.js
function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
}

function moveToward(current, target, maxDelta) {
    const delta = target - current;
    if (Math.abs(delta) <= maxDelta) return target;
    return current + Math.sign(delta) * maxDelta;
}

function easeIn(t) {
    // Slow start -> fast end
    return t * t;
}

/**
 * A simple “press/release acceleration” control:
 * - While input is held, it ramps from minRate -> maxRate
 * - When released, it ramps from minReturnRate -> maxReturnRate
 */
export class RampedControl {
    constructor({
                    value = 0,
                    min = -1,
                    max = 1,

                    rampTime = 0.55,
                    minRate = 0.8,
                    maxRate = 4.2,

                    returnRampTime = 0.55,
                    minReturnRate = 0.6,
                    maxReturnRate = 5.0,
                } = {}) {
        this.value = value;
        this.min = min;
        this.max = max;

        this.rampTime = Math.max(0.001, rampTime);
        this.minRate = minRate;
        this.maxRate = maxRate;

        this.returnRampTime = Math.max(0.001, returnRampTime);
        this.minReturnRate = minReturnRate;
        this.maxReturnRate = maxReturnRate;

        this._holdT = 0;
        this._releaseT = 0;
        this._lastInput = 0;
    }

    update(dt, input) {
        const hasInput = Math.abs(input) > 0.0001;

        // Reset ramp when direction changes (for steering)
        if (hasInput && Math.sign(input) !== Math.sign(this._lastInput)) {
            this._holdT = 0;
        }

        if (hasInput) {
            this._holdT = Math.min(this._holdT + dt, this.rampTime);
            this._releaseT = 0;

            const t = easeIn(this._holdT / this.rampTime);
            const rate = this.minRate + (this.maxRate - this.minRate) * t;

            this.value = clamp(this.value + input * rate * dt, this.min, this.max);
        } else {
            this._releaseT = Math.min(this._releaseT + dt, this.returnRampTime);
            this._holdT = 0;

            const t = easeIn(this._releaseT / this.returnRampTime);
            const rate = this.minReturnRate + (this.maxReturnRate - this.minReturnRate) * t;

            this.value = moveToward(this.value, 0, rate * dt);
        }

        this._lastInput = input;
        return this.value;
    }
}
