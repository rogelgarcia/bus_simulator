// src/core/GameLoop.js

/**
 * GameLoop is the main coordinator for gameplay.
 * 
 * Responsibilities:
 * - Coordinate input, physics, vehicles, and world updates
 * - Manage vehicle controllers
 * - Provide a clean update sequence
 * - Emit frame events
 * 
 * Update Order:
 * 1. Input update (process keyboard/touch)
 * 2. Controller update (apply input to physics)
 * 3. Physics update (fixed timestep simulation)
 * 4. Vehicle visual update (apply physics to 3D models)
 * 5. World update (city, traffic, etc.)
 * 6. UI update (HUD, gauges)
 * 
 * Usage:
 *   const loop = new GameLoop(simulation);
 *   loop.setInputManager(inputManager);
 *   loop.addVehicleController(controller);
 *   loop.update(dt);
 */
export class GameLoop {
    /**
     * @param {import('./SimulationContext.js').SimulationContext} simulation
     * @param {object} [options]
     * @param {object} [options.engine] - GameEngine reference for world updates
     */
    constructor(simulation, options = {}) {
        /** @type {import('./SimulationContext.js').SimulationContext} */
        this.simulation = simulation;

        /** @type {import('./EventBus.js').EventBus} */
        this.events = simulation.events;

        /** @type {import('../physics/PhysicsController.js').PhysicsController} */
        this.physics = simulation.physics;

        /** @type {object|null} */
        this.engine = options.engine ?? null;

        /** @type {Map<string, import('../vehicle/VehicleController.js').VehicleController>} */
        this.controllers = new Map();

        /** @type {import('../ui/input/InputManager.js').InputManager|null} */
        this.inputManager = null;

        /** @type {object|null} */
        this.world = null;

        /** @type {object|null} */
        this.ui = null;

        /** @type {boolean} */
        this.paused = false;

        /** @type {number} */
        this.timeScale = 1.0;

        /** @type {number} */
        this._frameCount = 0;
    }

    /**
     * Set the input manager.
     * @param {import('../ui/input/InputManager.js').InputManager} inputManager
     */
    setInputManager(inputManager) {
        this.inputManager = inputManager;
    }

    /**
     * Set the world (city) for updates.
     * @param {object} world - City or world object with update() method
     */
    setWorld(world) {
        this.world = world;
        if (world && this.physics) {
            this.physics.setEnvironment(world);
        }
    }

    /**
     * Set the UI for updates.
     * @param {object} ui - UI object with update() method
     */
    setUI(ui) {
        this.ui = ui;
    }

    /**
     * Add a vehicle controller.
     * @param {import('../vehicle/VehicleController.js').VehicleController} controller
     */
    addVehicleController(controller) {
        if (!controller?.vehicleId) return;
        this.controllers.set(controller.vehicleId, controller);
    }

    /**
     * Remove a vehicle controller.
     * @param {string} vehicleId
     */
    removeVehicleController(vehicleId) {
        const controller = this.controllers.get(vehicleId);
        if (controller) {
            controller.dispose?.();
            this.controllers.delete(vehicleId);
        }
    }

    /**
     * Get a vehicle controller by ID.
     * @param {string} vehicleId
     * @returns {import('../vehicle/VehicleController.js').VehicleController|null}
     */
    getController(vehicleId) {
        return this.controllers.get(vehicleId) ?? null;
    }

    /**
     * Pause the game loop.
     */
    pause() {
        this.paused = true;
        this.events.emit('gameloop:paused');
    }

    /**
     * Resume the game loop.
     */
    resume() {
        this.paused = false;
        this.events.emit('gameloop:resumed');
    }

    /**
     * Toggle pause state.
     */
    togglePause() {
        if (this.paused) {
            this.resume();
        } else {
            this.pause();
        }
    }

    /**
     * Set time scale (slow motion / fast forward).
     * @param {number} scale - 1.0 = normal, 0.5 = half speed, 2.0 = double speed
     */
    setTimeScale(scale) {
        this.timeScale = Math.max(0.1, Math.min(10, scale));
    }

    /**
     * Main update method - call each frame.
     * @param {number} dt - Delta time in seconds
     */
    update(dt) {
        if (this.paused) {
            this.events.emit('gameloop:frame', { dt: 0, paused: true });
            return;
        }

        // Apply time scale
        const scaledDt = dt * this.timeScale;

        // 1. Update input (process keyboard/touch)
        this.inputManager?.update(scaledDt);

        // 2. Update physics (fixed timestep simulation)
        this.physics?.update(scaledDt);

        // 3. Update vehicle controllers (apply physics to visuals)
        for (const controller of this.controllers.values()) {
            controller.update(scaledDt);
        }

        // 4. Update world (city, traffic, etc.)
        // Note: City.update expects engine, not dt
        if (this.world?.update) {
            if (this.engine) {
                this.world.update(this.engine);
            } else {
                this.world.update(scaledDt);
            }
        }

        // 5. Update UI (HUD, gauges)
        if (this.ui?.update) {
            this.ui.update(scaledDt);
        }

        // 6. Emit frame event
        this._frameCount++;
        this.events.emit('gameloop:frame', {
            dt: scaledDt,
            frameCount: this._frameCount,
            paused: false
        });
    }

    /**
     * Get the current frame count.
     * @returns {number}
     */
    getFrameCount() {
        return this._frameCount;
    }

    /**
     * Get telemetry data for the primary vehicle.
     * @param {string} vehicleId
     * @returns {object|null}
     */
    getTelemetry(vehicleId) {
        const state = this.physics?.getVehicleState(vehicleId);
        if (!state) return null;

        return {
            speedKph: state.locomotion?.speedKph ?? 0,
            rpm: state.drivetrain?.rpm ?? 0,
            gear: state.drivetrain?.gear ?? 1,
            steerAngle: state.locomotion?.steerAngle ?? 0,
            bodyPitch: state.suspension?.bodyPitch ?? 0,
            bodyRoll: state.suspension?.bodyRoll ?? 0
        };
    }

    /**
     * Dispose and clean up.
     */
    dispose() {
        // Dispose all controllers
        for (const controller of this.controllers.values()) {
            controller.dispose?.();
        }
        this.controllers.clear();

        // Detach input
        this.inputManager?.dispose?.();
        this.inputManager = null;

        // Clear references
        this.world = null;
        this.ui = null;

        this.events.emit('gameloop:disposed');
    }
}

