// src/app/physics/systems/CollisionSystem.js
import { CurbCollisionDetector, SURFACE } from '../CurbCollisionDetector.js';
import { ROAD_DEFAULTS, GROUND_DEFAULTS } from '../../../graphics/assets3d/generators/GeneratorParams.js';

export { SURFACE };

const SURFACE_NAMES = {
    [SURFACE.UNKNOWN]: 'unknown',
    [SURFACE.ASPHALT]: 'asphalt',
    [SURFACE.CURB]: 'curb',
    [SURFACE.GRASS]: 'grass'
};

const DEFAULT_CONFIG = {
    roadY: ROAD_DEFAULTS.surfaceY ?? 0.02,
    groundY: GROUND_DEFAULTS.surfaceY ?? 0.08,
    curbImpactVelocity: 0.15,
    curbDamping: 0.7
};

export class CollisionSystem {
    constructor(config = {}) {
        this.vehicles = new Map();
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.environment = null;
        this._detector = null;
    }

    setEnvironment(env) {
        this.environment = env ?? null;

        if (this.environment?.map) {
            this._detector = new CurbCollisionDetector(this.environment);
        } else {
            this._detector = null;
        }
    }

    addVehicle(vehicle) {
        if (!vehicle?.id) return;

        this.vehicles.set(vehicle.id, {
            vehicle,
            api: vehicle.api ?? null,
            anchor: vehicle.anchor ?? null,

            wheelSurfaces: {
                fl: SURFACE.UNKNOWN,
                fr: SURFACE.UNKNOWN,
                rl: SURFACE.UNKNOWN,
                rr: SURFACE.UNKNOWN
            },

            wheelHeights: {
                fl: this.config.roadY,
                fr: this.config.roadY,
                rl: this.config.roadY,
                rr: this.config.roadY
            },

            prevSurfaces: {
                fl: SURFACE.UNKNOWN,
                fr: SURFACE.UNKNOWN,
                rl: SURFACE.UNKNOWN,
                rr: SURFACE.UNKNOWN
            },

            transitions: [],

            onCurb: false,
            onGrass: false,
            allOnAsphalt: true
        });
    }

    removeVehicle(vehicleId) {
        this.vehicles.delete(vehicleId);
    }

    fixedUpdate(dt) {
        if (dt <= 0) return;

        for (const state of this.vehicles.values()) {
            this._updateCollisions(state);
        }
    }

    _updateCollisions(s) {
        s.transitions.length = 0;

        s.prevSurfaces.fl = s.wheelSurfaces.fl;
        s.prevSurfaces.fr = s.wheelSurfaces.fr;
        s.prevSurfaces.rl = s.wheelSurfaces.rl;
        s.prevSurfaces.rr = s.wheelSurfaces.rr;

        if (this._detector && s.api && s.anchor) {
            this._detector.update(s.api, s.anchor);

            const surfaces = this._detector.getWheelSurfaces();
            const heights = this._detector.getWheelHeights();
            const transitions = this._detector.getTransitions();

            s.wheelSurfaces.fl = surfaces.fl;
            s.wheelSurfaces.fr = surfaces.fr;
            s.wheelSurfaces.rl = surfaces.rl;
            s.wheelSurfaces.rr = surfaces.rr;

            s.wheelHeights.fl = heights.fl;
            s.wheelHeights.fr = heights.fr;
            s.wheelHeights.rl = heights.rl;
            s.wheelHeights.rr = heights.rr;

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

        const wheels = ['fl', 'fr', 'rl', 'rr'];
        s.onCurb = wheels.some(w => s.wheelSurfaces[w] === SURFACE.CURB);
        s.onGrass = wheels.some(w => s.wheelSurfaces[w] === SURFACE.GRASS);
        s.allOnAsphalt = wheels.every(w =>
            s.wheelSurfaces[w] === SURFACE.ASPHALT ||
            s.wheelSurfaces[w] === SURFACE.UNKNOWN
        );
    }

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

    getTransitions(vehicleId) {
        const state = this.vehicles.get(vehicleId);
        return state?.transitions ?? [];
    }

    isOnSurface(vehicleId, surfaceType) {
        const state = this.vehicles.get(vehicleId);
        if (!state) return false;

        return Object.values(state.wheelSurfaces).some(s => s === surfaceType);
    }

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
