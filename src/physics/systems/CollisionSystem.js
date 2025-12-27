// src/physics/systems/CollisionSystem.js

import { CurbCollisionDetector, SURFACE } from '../CurbCollisionDetector.js';

/**
 * Surface type constants (re-exported for convenience).
 */
export { SURFACE };

/**
 * Surface name lookup.
 */
const SURFACE_NAMES = {
    [SURFACE.UNKNOWN]: 'unknown',
    [SURFACE.ASPHALT]: 'asphalt',
    [SURFACE.CURB]: 'curb',
    [SURFACE.GRASS]: 'grass'
};

/**
 * Default collision configuration.
 */
const DEFAULT_CONFIG = {
    // Default surface heights (meters)
    roadY: 0.02,
    groundY: 0.08,

    // Curb impact parameters
    curbImpactVelocity: 0.15,  // m/s impulse on curb hit
    curbDamping: 0.7           // Damping factor for curb impacts
};

/**
 * CollisionSystem handles ground/curb collision detection and response.
 *
 * Responsibilities:
 * - Detect wheel surface types (asphalt, curb, grass)
 * - Track surface transitions
 * - Provide wheel height offsets for suspension
 * - Detect curb impacts for suspension response
 */
export class CollisionSystem {
    constructor(config = {}) {
        /** @type {Map<string, object>} */
        this.vehicles = new Map();

        /** @type {object} */
        this.config = { ...DEFAULT_CONFIG, ...config };

        /** @type {object|null} */
        this.environment = null;

        /** @type {CurbCollisionDetector|null} */
        this._detector = null;
    }

    /**
     * Set the environment (city with map and config) for collision detection.
     * @param {object} env - City object with { map, config/genConfig }
     */
    setEnvironment(env) {
        this.environment = env ?? null;

        // Create detector if we have a valid environment
        if (this.environment?.map) {
            this._detector = new CurbCollisionDetector(this.environment);
        } else {
            this._detector = null;
        }
    }

    /**
     * Register a vehicle with this system.
     * @param {object} vehicle - Vehicle instance with { id, api, anchor }
     */
    addVehicle(vehicle) {
        if (!vehicle?.id) return;

        this.vehicles.set(vehicle.id, {
            vehicle,
            api: vehicle.api ?? null,
            anchor: vehicle.anchor ?? null,

            // Surface state per wheel
            wheelSurfaces: {
                fl: SURFACE.UNKNOWN,
                fr: SURFACE.UNKNOWN,
                rl: SURFACE.UNKNOWN,
                rr: SURFACE.UNKNOWN
            },

            // Height offset per wheel (for suspension)
            wheelHeights: {
                fl: this.config.roadY,
                fr: this.config.roadY,
                rl: this.config.roadY,
                rr: this.config.roadY
            },

            // Previous frame surfaces (for transition detection)
            prevSurfaces: {
                fl: SURFACE.UNKNOWN,
                fr: SURFACE.UNKNOWN,
                rl: SURFACE.UNKNOWN,
                rr: SURFACE.UNKNOWN
            },

            // Transitions this frame
            transitions: [],

            // Aggregate state
            onCurb: false,
            onGrass: false,
            allOnAsphalt: true
        });
    }

    /**
     * Unregister a vehicle from this system.
     * @param {string} vehicleId
     */
    removeVehicle(vehicleId) {
        this.vehicles.delete(vehicleId);
    }

    /**
     * Fixed timestep update.
     * @param {number} dt - Delta time in seconds
     */
    fixedUpdate(dt) {
        if (dt <= 0) return;

        for (const state of this.vehicles.values()) {
            this._updateCollisions(state);
        }
    }

    /**
     * Update collision state for a single vehicle.
     * @param {object} s - Vehicle state
     */
    _updateCollisions(s) {
        // Clear transitions from previous frame
        s.transitions.length = 0;

        // Store previous surfaces
        s.prevSurfaces.fl = s.wheelSurfaces.fl;
        s.prevSurfaces.fr = s.wheelSurfaces.fr;
        s.prevSurfaces.rl = s.wheelSurfaces.rl;
        s.prevSurfaces.rr = s.wheelSurfaces.rr;

        // Use detector if available
        if (this._detector && s.api && s.anchor) {
            this._detector.update(s.api, s.anchor);

            const surfaces = this._detector.getWheelSurfaces();
            const heights = this._detector.getWheelHeights();
            const transitions = this._detector.getTransitions();

            // Copy surfaces and heights
            s.wheelSurfaces.fl = surfaces.fl;
            s.wheelSurfaces.fr = surfaces.fr;
            s.wheelSurfaces.rl = surfaces.rl;
            s.wheelSurfaces.rr = surfaces.rr;

            s.wheelHeights.fl = heights.fl;
            s.wheelHeights.fr = heights.fr;
            s.wheelHeights.rl = heights.rl;
            s.wheelHeights.rr = heights.rr;

            // Copy transitions
            for (const t of transitions) {
                s.transitions.push({
                    wheel: t.wheel,
                    from: t.from,
                    to: t.to,
                    fromName: SURFACE_NAMES[t.from] ?? 'unknown',
                    toName: SURFACE_NAMES[t.to] ?? 'unknown',
                    height: t.height,
                    impactVelocity: this.config.curbImpactVelocity
                });
            }
        }

        // Update aggregate state
        const wheels = ['fl', 'fr', 'rl', 'rr'];
        s.onCurb = wheels.some(w => s.wheelSurfaces[w] === SURFACE.CURB);
        s.onGrass = wheels.some(w => s.wheelSurfaces[w] === SURFACE.GRASS);
        s.allOnAsphalt = wheels.every(w =>
            s.wheelSurfaces[w] === SURFACE.ASPHALT ||
            s.wheelSurfaces[w] === SURFACE.UNKNOWN
        );
    }

    /**
     * Get the current state for a vehicle.
     * @param {string} vehicleId
     * @returns {object|null}
     */
    getState(vehicleId) {
        const state = this.vehicles.get(vehicleId);
        if (!state) return null;

        return {
            wheelSurfaces: { ...state.wheelSurfaces },
            wheelSurfaceNames: {
                fl: SURFACE_NAMES[state.wheelSurfaces.fl] ?? 'unknown',
                fr: SURFACE_NAMES[state.wheelSurfaces.fr] ?? 'unknown',
                rl: SURFACE_NAMES[state.wheelSurfaces.rl] ?? 'unknown',
                rr: SURFACE_NAMES[state.wheelSurfaces.rr] ?? 'unknown'
            },
            wheelHeights: { ...state.wheelHeights },
            transitions: [...state.transitions],
            onCurb: state.onCurb,
            onGrass: state.onGrass,
            allOnAsphalt: state.allOnAsphalt
        };
    }

    /**
     * Get transitions that occurred this frame.
     * @param {string} vehicleId
     * @returns {Array}
     */
    getTransitions(vehicleId) {
        const state = this.vehicles.get(vehicleId);
        return state?.transitions ?? [];
    }

    /**
     * Check if any wheel is on a specific surface.
     * @param {string} vehicleId
     * @param {number} surfaceType - SURFACE constant
     * @returns {boolean}
     */
    isOnSurface(vehicleId, surfaceType) {
        const state = this.vehicles.get(vehicleId);
        if (!state) return false;

        return Object.values(state.wheelSurfaces).some(s => s === surfaceType);
    }

    /**
     * Get the dominant surface (most wheels on).
     * @param {string} vehicleId
     * @returns {number} SURFACE constant
     */
    getDominantSurface(vehicleId) {
        const state = this.vehicles.get(vehicleId);
        if (!state) return SURFACE.UNKNOWN;

        const counts = { [SURFACE.ASPHALT]: 0, [SURFACE.CURB]: 0, [SURFACE.GRASS]: 0 };

        for (const s of Object.values(state.wheelSurfaces)) {
            if (s in counts) counts[s]++;
        }

        let max = 0;
        let dominant = SURFACE.ASPHALT;
        for (const [surface, count] of Object.entries(counts)) {
            if (count > max) {
                max = count;
                dominant = parseInt(surface);
            }
        }

        return dominant;
    }
}

