// src/core/SimulationContext.js

import { EventBus } from './EventBus.js';
import { VehicleManager } from './VehicleManager.js';
import { PhysicsController } from '../physics/PhysicsController.js';

/**
 * SimulationContext is the central game context that owns all core systems.
 * 
 * Responsibilities:
 * - Owns EventBus (pub/sub messaging)
 * - Owns VehicleManager (vehicle registry)
 * - Owns PhysicsController (physics systems)
 * - Provides unified access point for states
 * - Manages environment reference
 * 
 * Usage:
 *   const ctx = new SimulationContext();
 *   ctx.vehicles.addVehicle(vehicle, anchor, api);
 *   ctx.physics.update(dt);
 *   ctx.events.emit('custom:event', data);
 * 
 * States access via:
 *   this.engine.simulation.vehicles
 *   this.engine.simulation.physics
 *   this.engine.simulation.events
 */
export class SimulationContext {
    /**
     * @param {object} [config]
     * @param {number} [config.physicsFixedDt=1/60]
     * @param {number} [config.physicsMaxSubSteps=10]
     */
    constructor(config = {}) {
        /** @type {EventBus} */
        this.events = new EventBus();

        /** @type {VehicleManager} */
        this.vehicles = new VehicleManager(this.events);

        /** @type {PhysicsController} */
        this.physics = new PhysicsController(this.events, {
            fixedDt: config.physicsFixedDt ?? 1 / 60,
            maxSubSteps: config.physicsMaxSubSteps ?? 10
        });

        /** @type {object|null} */
        this._environment = null;

        // Legacy context fields (for backward compatibility with existing states)
        /** @type {string|null} */
        this.selectedBusId = null;

        /** @type {object|null} */
        this.selectedBus = null;
    }

    /**
     * Set the environment (map, config) for collision detection.
     * @param {object} env - { map, config }
     */
    setEnvironment(env) {
        this._environment = env ?? null;
        this.physics.setEnvironment(env);
    }

    /**
     * Get the current environment.
     * @returns {object|null}
     */
    getEnvironment() {
        return this._environment;
    }

    /**
     * Update physics (call each frame).
     * @param {number} dt - Delta time in seconds
     */
    update(dt) {
        this.physics.update(dt);
    }

    /**
     * Register a vehicle with both VehicleManager and PhysicsController.
     * This is a convenience method that handles the full registration flow.
     * 
     * @param {object} vehicle - The bus model (THREE.Object3D)
     * @param {object} anchor - The floor anchor group
     * @param {object} api - The BusSkeleton API
     * @param {string} [id] - Optional custom ID
     * @returns {string} The vehicle ID
     */
    addVehicle(vehicle, anchor, api, id) {
        // VehicleManager.addVehicle emits 'vehicle:added'
        // PhysicsController listens and auto-registers
        return this.vehicles.addVehicle(vehicle, anchor, api, id);
    }

    /**
     * Unregister a vehicle from both VehicleManager and PhysicsController.
     * 
     * @param {string} vehicleId
     * @returns {boolean}
     */
    removeVehicle(vehicleId) {
        // VehicleManager.removeVehicle emits 'vehicle:removed'
        // PhysicsController listens and auto-unregisters
        return this.vehicles.removeVehicle(vehicleId);
    }

    /**
     * Set input for a vehicle (routes to PhysicsController).
     * 
     * @param {string} vehicleId
     * @param {object} input - { throttle, brake, steering, handbrake }
     */
    setVehicleInput(vehicleId, input) {
        this.physics.setInput(vehicleId, input);
    }

    /**
     * Get combined state for a vehicle.
     * 
     * @param {string} vehicleId
     * @returns {object|null}
     */
    getVehicleState(vehicleId) {
        return this.physics.getVehicleState(vehicleId);
    }

    /**
     * Dispose and clean up all systems.
     */
    dispose() {
        this.physics.dispose();
        this.vehicles.clear();
        this.events.clear();
        this._environment = null;
        this.selectedBusId = null;
        this.selectedBus = null;
    }
}

