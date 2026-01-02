// src/app/input/InputManager.js
import { RampedControl } from './RampedControl.js';

/**
 * Default input configuration.
 */
const DEFAULT_CONFIG = {
    // Steering ramp
    steerRampTime: 0.55,
    steerMinRate: 0.7,
    steerMaxRate: 3.8,
    steerReturnRampTime: 0.55,
    steerMinReturnRate: 0.6,
    steerMaxReturnRate: 4.8,

    // Throttle ramp
    throttleRampTime: 0.55,
    throttleMinRate: 0.55,
    throttleMaxRate: 2.8,
    throttleReturnRampTime: 0.55,
    throttleMinReturnRate: 0.55,
    throttleMaxReturnRate: 3.0,

    // Brake ramp
    brakeRampTime: 0.55,
    brakeMinRate: 0.55,
    brakeMaxRate: 3.2,
    brakeReturnRampTime: 0.55,
    brakeMinReturnRate: 0.55,
    brakeMaxReturnRate: 3.4
};

/**
 * InputManager handles keyboard/touch input and provides smoothed control values.
 * 
 * Responsibilities:
 * - Listen to keyboard events
 * - Apply ramped smoothing to inputs
 * - Emit input events via EventBus
 * - Provide current input state
 * 
 * Usage:
 *   const input = new InputManager(eventBus);
 *   input.attach();
 *   // In update loop:
 *   input.update(dt);
 *   const controls = input.getControls();
 */
export class InputManager {
    /**
     * @param {import('../../core/EventBus.js').EventBus} eventBus
     * @param {object} [config]
     */
    constructor(eventBus, config = {}) {
        /** @type {import('../../core/EventBus.js').EventBus} */
        this.eventBus = eventBus;

        /** @type {object} */
        this.config = { ...DEFAULT_CONFIG, ...config };

        // Raw key states
        this.keys = {
            left: false,
            right: false,
            up: false,
            down: false,
            space: false,  // Handbrake
            h: false       // Headlights toggle
        };

        // Ramped controls
        const c = this.config;

        this.steer = new RampedControl({
            value: 0,
            min: -1,
            max: 1,
            rampTime: c.steerRampTime,
            minRate: c.steerMinRate,
            maxRate: c.steerMaxRate,
            returnRampTime: c.steerReturnRampTime,
            minReturnRate: c.steerMinReturnRate,
            maxReturnRate: c.steerMaxReturnRate
        });

        this.throttle = new RampedControl({
            value: 0,
            min: 0,
            max: 1,
            rampTime: c.throttleRampTime,
            minRate: c.throttleMinRate,
            maxRate: c.throttleMaxRate,
            returnRampTime: c.throttleReturnRampTime,
            minReturnRate: c.throttleMinReturnRate,
            maxReturnRate: c.throttleMaxReturnRate
        });

        this.brake = new RampedControl({
            value: 0,
            min: 0,
            max: 1,
            rampTime: c.brakeRampTime,
            minRate: c.brakeMinRate,
            maxRate: c.brakeMaxRate,
            returnRampTime: c.brakeReturnRampTime,
            minReturnRate: c.brakeMinReturnRate,
            maxReturnRate: c.brakeMaxReturnRate
        });

        // Headlight toggle state
        this._headlightsOn = false;
        this._headlightToggleCooldown = 0;

        // Bound event handlers
        this._onKeyDown = (e) => this._handleKey(e, true);
        this._onKeyUp = (e) => this._handleKey(e, false);

        /** @type {boolean} */
        this._attached = false;
    }

    /**
     * Attach keyboard listeners.
     */
    attach() {
        if (this._attached) return;
        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);
        this._attached = true;
    }

    /**
     * Detach keyboard listeners.
     */
    detach() {
        if (!this._attached) return;
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
        this._attached = false;
    }

    /**
     * Handle keyboard events.
     * @param {KeyboardEvent} e
     * @param {boolean} isDown
     */
    _handleKey(e, isDown) {
        const tag = e.target?.tagName?.toLowerCase() ?? '';
        if (tag === 'input' || tag === 'textarea' || e.isComposing) return;

        const code = e.code;
        let handled = false;

        // Steering
        if (code === 'ArrowLeft' || code === 'KeyA') {
            this.keys.left = isDown;
            handled = true;
        }
        if (code === 'ArrowRight' || code === 'KeyD') {
            this.keys.right = isDown;
            handled = true;
        }

        // Throttle/Brake
        if (code === 'ArrowUp' || code === 'KeyW') {
            this.keys.up = isDown;
            handled = true;
        }
        if (code === 'ArrowDown' || code === 'KeyS') {
            this.keys.down = isDown;
            handled = true;
        }

        // Handbrake
        if (code === 'Space') {
            this.keys.space = isDown;
            handled = true;
        }

        // Headlights toggle (on key down only)
        if (code === 'KeyH' && isDown && !this.keys.h) {
            this.keys.h = true;
            if (this._headlightToggleCooldown <= 0) {
                this._headlightsOn = !this._headlightsOn;
                this._headlightToggleCooldown = 0.3;
                this.eventBus.emit('input:headlights', { on: this._headlightsOn });
            }
            handled = true;
        }
        if (code === 'KeyH' && !isDown) {
            this.keys.h = false;
        }

        if (handled) {
            e.preventDefault();
        }
    }

    /**
     * Update ramped controls and emit input events.
     * @param {number} dt - Delta time in seconds
     */
    update(dt) {
        // Clamp dt
        if (dt > 1.0) dt *= 0.001; // Handle ms
        dt = Math.min(Math.max(dt, 0), 0.05);

        // Calculate raw inputs
        const steerInput = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
        const throttleInput = this.keys.up ? 1 : 0;
        const brakeInput = this.keys.down ? 1 : 0;

        // Update ramped controls
        const steerVal = this.steer.update(dt, steerInput);
        const throttleVal = this.throttle.update(dt, throttleInput);
        const brakeVal = this.brake.update(dt, brakeInput);

        // Update headlight cooldown
        if (this._headlightToggleCooldown > 0) {
            this._headlightToggleCooldown -= dt;
        }

        // Emit input event
        this.eventBus.emit('input:controls', {
            steering: steerVal,
            throttle: throttleVal,
            brake: brakeVal,
            handbrake: this.keys.space ? 1 : 0,
            headlights: this._headlightsOn
        });
    }

    /**
     * Get current control values.
     * @returns {object} { steering, throttle, brake, handbrake, headlights }
     */
    getControls() {
        return {
            steering: this.steer.value,
            throttle: this.throttle.value,
            brake: this.brake.value,
            handbrake: this.keys.space ? 1 : 0,
            headlights: this._headlightsOn
        };
    }

    /**
     * Get raw key states.
     * @returns {object}
     */
    getKeys() {
        return { ...this.keys };
    }

    /**
     * Set headlights state directly.
     * @param {boolean} on
     */
    setHeadlights(on) {
        this._headlightsOn = !!on;
    }

    /**
     * Reset all inputs to neutral.
     */
    reset() {
        this.keys = {
            left: false,
            right: false,
            up: false,
            down: false,
            space: false,
            h: false
        };
        this.steer.value = 0;
        this.throttle.value = 0;
        this.brake.value = 0;
    }

    /**
     * Dispose and clean up.
     */
    dispose() {
        this.detach();
        this.reset();
    }
}

