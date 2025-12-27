// src/vehicle/VehicleController.js

/**
 * VehicleController provides high-level control for a single vehicle.
 * 
 * Responsibilities:
 * - Bridge between InputManager and PhysicsController
 * - Apply input to physics systems
 * - Apply physics state to visual representation (3D model)
 * - Manage vehicle-specific settings (headlights, etc.)
 * 
 * Usage:
 *   const controller = new VehicleController(vehicleId, physics, eventBus);
 *   controller.setInput({ throttle: 0.5, steering: 0.2 });
 *   controller.update(dt);
 */
export class VehicleController {
    /**
     * @param {string} vehicleId - The vehicle ID in VehicleManager
     * @param {import('../physics/PhysicsController.js').PhysicsController} physics
     * @param {import('../core/EventBus.js').EventBus} eventBus
     * @param {object} [options]
     */
    constructor(vehicleId, physics, eventBus, options = {}) {
        /** @type {string} */
        this.vehicleId = vehicleId;

        /** @type {import('../physics/PhysicsController.js').PhysicsController} */
        this.physics = physics;

        /** @type {import('../core/EventBus.js').EventBus} */
        this.eventBus = eventBus;

        /** @type {object} */
        this.options = options;

        // Current input state
        this.input = {
            throttle: 0,
            brake: 0,
            steering: 0,
            handbrake: 0
        };

        // Vehicle settings
        this.settings = {
            headlightsOn: false,
            brakeLightsOn: false,
            leftTurnSignal: false,
            rightTurnSignal: false
        };

        // Reference to vehicle API (set via setVehicleApi)
        this._api = options.api ?? null;
        this._anchor = options.anchor ?? null;

        // Subscribe to input events
        this._unsubInput = this.eventBus.on('input:controls', (e) => {
            this.setInput(e);
        });

        this._unsubHeadlights = this.eventBus.on('input:headlights', (e) => {
            this.setHeadlights(e.on);
        });
    }

    /**
     * Set the vehicle API for visual updates.
     * @param {object} api - BusSkeleton API
     * @param {object} anchor - Floor anchor group
     */
    setVehicleApi(api, anchor) {
        this._api = api;
        this._anchor = anchor;
    }

    /**
     * Set input values.
     * @param {object} input - { throttle, brake, steering, handbrake }
     */
    setInput(input) {
        if (typeof input.throttle === 'number') {
            this.input.throttle = Math.max(0, Math.min(1, input.throttle));
        }
        if (typeof input.brake === 'number') {
            this.input.brake = Math.max(0, Math.min(1, input.brake));
        }
        if (typeof input.steering === 'number') {
            this.input.steering = Math.max(-1, Math.min(1, input.steering));
        }
        if (typeof input.handbrake === 'number') {
            this.input.handbrake = Math.max(0, Math.min(1, input.handbrake));
        }

        // Forward to physics
        this.physics.setInput(this.vehicleId, this.input);
    }

    /**
     * Set throttle value.
     * @param {number} value - 0 to 1
     */
    setThrottle(value) {
        this.setInput({ throttle: value });
    }

    /**
     * Set brake value.
     * @param {number} value - 0 to 1
     */
    setBrake(value) {
        this.setInput({ brake: value });
    }

    /**
     * Set steering value.
     * @param {number} value - -1 (left) to 1 (right)
     */
    setSteering(value) {
        this.setInput({ steering: value });
    }

    /**
     * Set handbrake value.
     * @param {number} value - 0 to 1
     */
    setHandbrake(value) {
        this.setInput({ handbrake: value });
    }

    /**
     * Set headlights on/off.
     * @param {boolean} on
     */
    setHeadlights(on) {
        this.settings.headlightsOn = !!on;
        this._api?.setHeadlights?.(this.settings.headlightsOn);
    }

    /**
     * Set left turn signal.
     * @param {boolean} on
     */
    setLeftTurnSignal(on) {
        this.settings.leftTurnSignal = !!on;
        this._api?.setTurnSignal?.('left', this.settings.leftTurnSignal);
    }

    /**
     * Set right turn signal.
     * @param {boolean} on
     */
    setRightTurnSignal(on) {
        this.settings.rightTurnSignal = !!on;
        this._api?.setTurnSignal?.('right', this.settings.rightTurnSignal);
    }

    /**
     * Update the controller (apply physics state to visuals).
     * @param {number} dt - Delta time in seconds
     */
    update(dt) {
        const state = this.physics.getVehicleState(this.vehicleId);
        if (!state) return;

        // Apply locomotion state (position, yaw, steering, wheel spin)
        if (state.locomotion) {
            const loco = state.locomotion;

            // Move anchor position
            if (this._anchor && loco.position) {
                this._anchor.position.x = loco.position.x;
                this._anchor.position.z = loco.position.z;
                // Y is controlled by road height, not locomotion
            }

            // Rotate anchor yaw
            if (this._anchor && typeof loco.yaw === 'number') {
                this._anchor.rotation.y = loco.yaw;
            }

            // Steering angle (visual wheel turn)
            if (this._api && typeof this._api.setSteerAngle === 'function') {
                this._api.setSteerAngle(loco.steerAngle ?? 0);
            }

            // Wheel spin
            if (this._api && typeof this._api.setSpinAngle === 'function' && loco.wheelSpinAccum !== undefined) {
                this._api.setSpinAngle(loco.wheelSpinAccum);
            }
        }

        // Apply suspension state
        if (state.suspension && this._api) {
            const susp = state.suspension;

            // Body tilt (pitch and roll)
            if (typeof this._api.setBodyTilt === 'function') {
                this._api.setBodyTilt(susp.bodyPitch ?? 0, susp.bodyRoll ?? 0);
            }

            // Body heave
            if (typeof this._api.setBodyHeave === 'function') {
                this._api.setBodyHeave(susp.bodyHeave ?? 0);
            }
        }

        // Apply brake lights based on brake input
        const braking = this.input.brake > 0.1 || this.input.handbrake > 0.5;
        if (braking !== this.settings.brakeLightsOn) {
            this.settings.brakeLightsOn = braking;
            this._api?.setBrake?.(braking ? 1 : 0);
        }
    }

    /**
     * Get the current physics state for this vehicle.
     * @returns {object|null}
     */
    getState() {
        return this.physics.getVehicleState(this.vehicleId);
    }

    /**
     * Get the current input state.
     * @returns {object}
     */
    getInput() {
        return { ...this.input };
    }

    /**
     * Get the current settings.
     * @returns {object}
     */
    getSettings() {
        return { ...this.settings };
    }

    /**
     * Check if this controller is for a specific vehicle.
     * @param {string} vehicleId
     * @returns {boolean}
     */
    isVehicle(vehicleId) {
        return this.vehicleId === vehicleId;
    }

    /**
     * Dispose and clean up.
     */
    dispose() {
        this._unsubInput();
        this._unsubHeadlights();
        this._api = null;
        this._anchor = null;
    }
}

