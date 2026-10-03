// Computes camera-relative free-flight steps without depending on the renderer or DOM.
// @ts-check
export const LANDSCAPE_NAVIGATION = Object.freeze({ fov: 55, heightMeters: 4.5, lookDistanceMeters: 12, targetHeightMeters: 1.6, speed: 36, fastSpeed: 84, dragThreshold: 5 });

const movementCodes = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'PageUp', 'PageDown', 'ShiftLeft', 'ShiftRight']);

export class LandscapeNavigationState {
    #keys = new Set();

    /** @param {string} code @param {boolean} down @returns {boolean} */
    setKey(code, down) {
        if (!movementCodes.has(code)) return false;
        if (down) this.#keys.add(code); else this.#keys.delete(code);
        return true;
    }

    clear() { this.#keys.clear(); }

    /** @param {number} dt Seconds. @param {number} yaw Radians around world Y. */
    step(dt, yaw) {
        if (!Number.isFinite(dt) || dt < 0 || !Number.isFinite(yaw)) throw new Error('Navigation requires finite nonnegative seconds and finite yaw');
        const held = code => this.#keys.has(code);
        const right = Number(held('ArrowRight') || held('KeyD')) - Number(held('ArrowLeft') || held('KeyA'));
        const forward = Number(held('ArrowUp') || held('KeyW')) - Number(held('ArrowDown') || held('KeyS'));
        const up = Number(held('PageUp')) - Number(held('PageDown'));
        const length = Math.hypot(right, forward, up);
        const scale = length ? Math.min(dt, .1) * (held('ShiftLeft') || held('ShiftRight') ? LANDSCAPE_NAVIGATION.fastSpeed : LANDSCAPE_NAVIGATION.speed) / length : 0;
        return { x: (Math.cos(yaw) * right - Math.sin(yaw) * forward) * scale, y: up * scale, z: (-Math.sin(yaw) * right - Math.cos(yaw) * forward) * scale };
    }
}
