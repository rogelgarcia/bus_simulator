// src/app/core/VehicleManager.js
/**
 * VehicleManager is the central registry for all vehicles in the simulation.
 * 
 * Responsibilities:
 * - Register/unregister vehicles
 * - Generate unique vehicle IDs
 * - Emit events when vehicles are added/removed
 * - Provide lookup by ID
 * 
 * Events emitted (via EventBus):
 * - 'vehicle:added'   { id, vehicle, anchor, api }
 * - 'vehicle:removed' { id }
 * 
 * Usage:
 *   const manager = new VehicleManager(eventBus);
 *   const id = manager.addVehicle(busModel, busAnchor, busApi);
 *   manager.removeVehicle(id);
 */
export class VehicleManager {
    /**
     * @param {import('./EventBus.js').EventBus} eventBus
     */
    constructor(eventBus) {
        /** @type {import('./EventBus.js').EventBus} */
        this.eventBus = eventBus;

        /** @type {Map<string, { vehicle: object, anchor: object, api: object }>} */
        this._vehicles = new Map();

        /** @type {number} */
        this._nextId = 1;
    }

    /**
     * Generate a unique vehicle ID.
     * @returns {string}
     */
    _generateId() {
        return `vehicle_${this._nextId++}`;
    }

    /**
     * Register a vehicle with the manager.
     * @param {object} vehicle - The bus model (THREE.Object3D)
     * @param {object} anchor - The floor anchor group
     * @param {object} api - The BusSkeleton API
     * @param {string} [id] - Optional custom ID (auto-generated if not provided)
     * @returns {string} The vehicle ID
     */
    addVehicle(vehicle, anchor, api, id) {
        const vehicleId = id ?? this._generateId();

        if (this._vehicles.has(vehicleId)) {
            console.warn(`VehicleManager: Vehicle with id "${vehicleId}" already exists. Overwriting.`);
        }

        const entry = {
            id: vehicleId,
            vehicle,
            anchor,
            api
        };

        this._vehicles.set(vehicleId, entry);

        // Attach ID to vehicle userData for reverse lookup
        if (vehicle?.userData) {
            vehicle.userData.vehicleId = vehicleId;
        }
        if (anchor?.userData) {
            anchor.userData.vehicleId = vehicleId;
        }

        this.eventBus.emit('vehicle:added', entry);

        return vehicleId;
    }

    /**
     * Unregister a vehicle from the manager.
     * @param {string} vehicleId
     * @returns {boolean} True if vehicle was found and removed
     */
    removeVehicle(vehicleId) {
        const entry = this._vehicles.get(vehicleId);
        if (!entry) {
            return false;
        }

        this._vehicles.delete(vehicleId);

        this.eventBus.emit('vehicle:removed', { id: vehicleId });

        return true;
    }

    /**
     * Get a vehicle entry by ID.
     * @param {string} vehicleId
     * @returns {{ id: string, vehicle: object, anchor: object, api: object } | null}
     */
    getVehicle(vehicleId) {
        return this._vehicles.get(vehicleId) ?? null;
    }

    /**
     * Get all registered vehicles.
     * @returns {Array<{ id: string, vehicle: object, anchor: object, api: object }>}
     */
    getAllVehicles() {
        return [...this._vehicles.values()];
    }

    /**
     * Get the number of registered vehicles.
     * @returns {number}
     */
    get count() {
        return this._vehicles.size;
    }

    /**
     * Check if a vehicle is registered.
     * @param {string} vehicleId
     * @returns {boolean}
     */
    hasVehicle(vehicleId) {
        return this._vehicles.has(vehicleId);
    }

    /**
     * Clear all vehicles (does not emit individual remove events).
     */
    clear() {
        const ids = [...this._vehicles.keys()];
        this._vehicles.clear();

        // Emit a bulk clear event
        this.eventBus.emit('vehicle:cleared', { ids });
    }

    /**
     * Iterate over all vehicles.
     * @param {function} callback - (entry) => void
     */
    forEach(callback) {
        for (const entry of this._vehicles.values()) {
            callback(entry);
        }
    }
}

