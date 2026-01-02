// src/app/physics/PhysicsController.js
import { PhysicsLoop } from './PhysicsLoop.js';
import { LocomotionSystem } from './systems/LocomotionSystem.js';
import { SuspensionSystem } from './systems/SuspensionSystem.js';
import { DrivetrainSystem } from './systems/DrivetrainSystem.js';
import { CollisionSystem } from './systems/CollisionSystem.js';
import { BrakeSystem } from './systems/BrakeSystem.js';

/**
 * PhysicsController coordinates all physics systems.
 *
 * Responsibilities:
 * - Owns the PhysicsLoop (fixed timestep)
 * - Owns all physics systems (locomotion, suspension, drivetrain, collision, brake)
 * - Registers/unregisters vehicles with all systems
 * - Wires inter-system communication (data flow between systems)
 * - Provides unified update() entry point
 * - Listens to EventBus for vehicle:added/removed events
 *
 * System Update Order:
 * 1. Collision - detect surfaces, wheel heights
 * 2. Drivetrain - engine RPM, gear selection
 * 3. Brake - brake force calculation
 * 4. Locomotion - movement, steering, position integration
 * 5. Suspension - spring-damper physics, body pose
 * 6. Sync - wire data between systems
 *
 * Usage:
 *   const controller = new PhysicsController(eventBus);
 *   controller.addVehicle(id, vehicle, anchor, api);
 *   controller.update(dt); // call each frame
 */
export class PhysicsController {
    /**
     * @param {import('../core/EventBus.js').EventBus} eventBus
     * @param {object} [config]
     * @param {number} [config.fixedDt=1/60]
     * @param {number} [config.maxSubSteps=10]
     */
    constructor(eventBus, config = {}) {
        /** @type {import('../core/EventBus.js').EventBus} */
        this.eventBus = eventBus;

        const fixedDt = config.fixedDt ?? 1 / 60;
        const maxSubSteps = config.maxSubSteps ?? 10;

        /** @type {PhysicsLoop} */
        this.loop = new PhysicsLoop({ fixedDt, maxSubSteps });

        /** @type {object} */
        this.systems = {
            locomotion: new LocomotionSystem(),
            suspension: new SuspensionSystem(),
            drivetrain: new DrivetrainSystem(),
            collision: new CollisionSystem(),
            brake: new BrakeSystem()
        };

        // Create sync system for inter-system communication
        this._syncSystem = this._createSyncSystem();

        // Register systems with loop (order matters!)
        // 1. Collision first (detect surfaces)
        // 2. Drivetrain (engine/transmission)
        // 3. Brake (braking forces)
        // 4. Locomotion (movement)
        // 5. Suspension (reacts to movement)
        // 6. Sync last (wire data between systems for next frame)
        this.loop.add(this.systems.collision);
        this.loop.add(this.systems.drivetrain);
        this.loop.add(this.systems.brake);
        this.loop.add(this.systems.locomotion);
        this.loop.add(this.systems.suspension);
        this.loop.add(this._syncSystem);

        /** @type {Set<string>} */
        this._vehicleIds = new Set();

        /** @type {object|null} */
        this._environment = null;

        // Subscribe to vehicle events
        this._unsubAdded = this.eventBus.on('vehicle:added', (e) => {
            this.addVehicle(e.id, e.vehicle, e.anchor, e.api);
        });

        this._unsubRemoved = this.eventBus.on('vehicle:removed', (e) => {
            this.removeVehicle(e.id);
        });
    }

    /**
     * Create a sync system that wires data between physics systems.
     * This runs after all other systems to prepare data for the next frame.
     * @returns {object} Sync system with fixedUpdate method
     */
    _createSyncSystem() {
        const controller = this;

        return {
            fixedUpdate(dt) {
                for (const vehicleId of controller._vehicleIds) {
                    controller._syncVehicleSystems(vehicleId);
                }
            }
        };
    }

    /**
     * Sync data between systems for a single vehicle.
     * @param {string} vehicleId
     */
    _syncVehicleSystems(vehicleId) {
        const { locomotion, suspension, drivetrain, brake, collision } = this.systems;

        // Get states from each system
        const locoState = locomotion.getState(vehicleId);
        const brakeState = brake.getState(vehicleId);
        const collisionState = collision.getState(vehicleId);

        // 1. Brake → Locomotion: Apply brake force
        if (brakeState) {
            const brakeForce = brakeState.brakeForce ?? 0;
            if (typeof locomotion.setExternalBrakeForce === 'function') {
                locomotion.setExternalBrakeForce(vehicleId, brakeForce);
            }
        }

        // 2. Locomotion → Suspension: Apply chassis acceleration for load transfer
        if (locoState) {
            const aLong = locoState.longAccel ?? 0;
            const aLat = locomotion.getLateralAccel?.(vehicleId) ?? 0;
            suspension.setChassisAcceleration(vehicleId, aLat, aLong);
        }

        // 3. Locomotion → Drivetrain: Sync speed for RPM calculation
        if (locoState && typeof drivetrain.setExternalSpeed === 'function') {
            drivetrain.setExternalSpeed(vehicleId, locoState.speedKph ?? 0);
        }

        // 4. Collision → Suspension: Apply wheel compressions from surface heights
        if (collisionState && collisionState.wheelHeights) {
            const heights = collisionState.wheelHeights;
            for (const wheel of ['fl', 'fr', 'rl', 'rr']) {
                if (heights[wheel] !== undefined) {
                    // Convert height delta to compression
                    // Positive height = wheel pushed up = compression
                    suspension.setWheelCompression(vehicleId, wheel, heights[wheel]);
                }
            }
        }

        // 5. Collision → Suspension: Apply curb impact velocity for bounce effect
        if (collisionState && collisionState.transitions?.length > 0) {
            for (const t of collisionState.transitions) {
                if (t.wheel && t.height !== undefined) {
                    suspension.applyCurbImpact(vehicleId, t.wheel, t.height, {
                        impactKick: 10.0,
                        maxVelocity: 3.0
                    });
                }
            }
        }
    }

    /**
     * Set the environment for collision detection.
     * @param {object} env - { map, config }
     */
    setEnvironment(env) {
        this._environment = env ?? null;
        this.systems.collision.setEnvironment(env);
    }

    /**
     * Register a vehicle with all physics systems.
     * @param {string} vehicleId
     * @param {object} vehicle
     * @param {object} anchor
     * @param {object} api
     */
    addVehicle(vehicleId, vehicle, anchor, api) {
        if (this._vehicleIds.has(vehicleId)) {
            return; // Already registered
        }

        const vehicleData = { id: vehicleId, vehicle, anchor, api };

        this.systems.locomotion.addVehicle(vehicleData);
        this.systems.suspension.addVehicle(vehicleData);
        this.systems.drivetrain.addVehicle(vehicleData);
        this.systems.collision.addVehicle(vehicleData);
        this.systems.brake.addVehicle(vehicleData);

        this._vehicleIds.add(vehicleId);

        // Emit event for other systems
        this.eventBus.emit('physics:vehicleRegistered', { vehicleId });
    }

    /**
     * Unregister a vehicle from all physics systems.
     * @param {string} vehicleId
     */
    removeVehicle(vehicleId) {
        if (!this._vehicleIds.has(vehicleId)) {
            return;
        }

        this.systems.locomotion.removeVehicle(vehicleId);
        this.systems.suspension.removeVehicle(vehicleId);
        this.systems.drivetrain.removeVehicle(vehicleId);
        this.systems.collision.removeVehicle(vehicleId);
        this.systems.brake.removeVehicle(vehicleId);

        this._vehicleIds.delete(vehicleId);

        // Emit event for other systems
        this.eventBus.emit('physics:vehicleUnregistered', { vehicleId });
    }

    /**
     * Set input for a vehicle.
     * @param {string} vehicleId
     * @param {object} input - { throttle, brake, steering, handbrake }
     */
    setInput(vehicleId, input) {
        if (!this._vehicleIds.has(vehicleId)) return;

        if (input.throttle !== undefined || input.steering !== undefined) {
            this.systems.locomotion.setInput(vehicleId, input);
        }
        if (input.throttle !== undefined) {
            this.systems.drivetrain.setInput(vehicleId, { throttle: input.throttle });
        }
        if (input.brake !== undefined || input.handbrake !== undefined) {
            this.systems.brake.setInput(vehicleId, input);
        }
    }

    /**
     * Update physics (call each frame with delta time).
     * @param {number} dt - Delta time in seconds
     */
    update(dt) {
        this.loop.update(dt);
    }

    /**
     * Get combined state for a vehicle from all systems.
     * @param {string} vehicleId
     * @returns {object|null}
     */
    getVehicleState(vehicleId) {
        if (!this._vehicleIds.has(vehicleId)) return null;

        return {
            locomotion: this.systems.locomotion.getState(vehicleId),
            suspension: this.systems.suspension.getState(vehicleId),
            drivetrain: this.systems.drivetrain.getState(vehicleId),
            collision: this.systems.collision.getState(vehicleId),
            brake: this.systems.brake.getState(vehicleId)
        };
    }

    /**
     * Get a specific system by name.
     * @param {string} name - System name (locomotion, suspension, drivetrain, collision, brake)
     * @returns {object|null}
     */
    getSystem(name) {
        return this.systems[name] ?? null;
    }

    /**
     * Get all registered vehicle IDs.
     * @returns {string[]}
     */
    getVehicleIds() {
        return Array.from(this._vehicleIds);
    }

    /**
     * Check if a vehicle is registered.
     * @param {string} vehicleId
     * @returns {boolean}
     */
    hasVehicle(vehicleId) {
        return this._vehicleIds.has(vehicleId);
    }

    /**
     * Dispose and clean up.
     */
    dispose() {
        this._unsubAdded();
        this._unsubRemoved();

        for (const id of this._vehicleIds) {
            this.removeVehicle(id);
        }

        this.loop.clear();
    }
}

