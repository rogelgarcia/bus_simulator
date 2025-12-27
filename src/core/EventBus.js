// src/core/EventBus.js

/**
 * Simple pub/sub event bus for loose coupling between systems.
 * 
 * Usage:
 *   const bus = new EventBus();
 *   bus.on('vehicle:added', (vehicle) => console.log('Added:', vehicle));
 *   bus.emit('vehicle:added', myVehicle);
 *   bus.off('vehicle:added', handler);
 */
export class EventBus {
    constructor() {
        /** @type {Map<string, Set<Function>>} */
        this._listeners = new Map();
    }

    /**
     * Subscribe to an event.
     * @param {string} event - Event name
     * @param {Function} handler - Callback function
     * @returns {Function} Unsubscribe function
     */
    on(event, handler) {
        if (typeof handler !== 'function') {
            throw new Error(`EventBus.on: handler must be a function`);
        }

        if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
        }

        this._listeners.get(event).add(handler);

        // Return unsubscribe function for convenience
        return () => this.off(event, handler);
    }

    /**
     * Subscribe to an event, but only fire once.
     * @param {string} event - Event name
     * @param {Function} handler - Callback function
     * @returns {Function} Unsubscribe function
     */
    once(event, handler) {
        if (typeof handler !== 'function') {
            throw new Error(`EventBus.once: handler must be a function`);
        }

        const wrapper = (...args) => {
            this.off(event, wrapper);
            handler(...args);
        };

        return this.on(event, wrapper);
    }

    /**
     * Unsubscribe from an event.
     * @param {string} event - Event name
     * @param {Function} handler - The same handler function passed to on()
     */
    off(event, handler) {
        const handlers = this._listeners.get(event);
        if (handlers) {
            handlers.delete(handler);
            if (handlers.size === 0) {
                this._listeners.delete(event);
            }
        }
    }

    /**
     * Emit an event to all subscribers.
     * @param {string} event - Event name
     * @param {...any} args - Arguments to pass to handlers
     */
    emit(event, ...args) {
        const handlers = this._listeners.get(event);
        if (!handlers) return;

        // Copy to array to avoid issues if handler modifies listeners
        for (const handler of [...handlers]) {
            try {
                handler(...args);
            } catch (err) {
                console.error(`EventBus: Error in handler for "${event}":`, err);
            }
        }
    }

    /**
     * Remove all listeners for an event, or all listeners if no event specified.
     * @param {string} [event] - Optional event name
     */
    clear(event) {
        if (event) {
            this._listeners.delete(event);
        } else {
            this._listeners.clear();
        }
    }

    /**
     * Get the number of listeners for an event.
     * @param {string} event - Event name
     * @returns {number}
     */
    listenerCount(event) {
        return this._listeners.get(event)?.size ?? 0;
    }
}

