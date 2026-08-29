// Resolves compact static-visibility masks for gameplay camera poses.
// @ts-check

import { STATIC_VISIBILITY_PROFILE } from './StaticVisibilityProfile.js';
import { sanitizeStaticVisibilitySettings } from './StaticVisibilitySettings.js';

function normalizeAngle(angle) {
    const turn = Math.PI * 2;
    return ((angle % turn) + turn) % turn;
}

export class StaticVisibilityRuntime {
    constructor({ map, units, onVisibilityChange, settings = null, graceMs = STATIC_VISIBILITY_PROFILE.temporalGraceMs } = {}) {
        if (!map || !Number.isInteger(map.width) || !Number.isInteger(map.height) || !(map.tileSize > 0)) {
            throw new Error('Static visibility runtime requires valid map metadata');
        }
        if (!Array.isArray(units)) throw new Error('Static visibility runtime requires units');
        if (typeof onVisibilityChange !== 'function') throw new Error('Static visibility runtime requires onVisibilityChange');

        this.map = Object.freeze({
            width: map.width,
            height: map.height,
            tileSize: map.tileSize,
            originX: map.originX,
            originZ: map.originZ
        });
        this.units = Object.freeze(units.map((unit) => Object.freeze({ id: unit.id, category: unit.category })));
        this._onVisibilityChange = onVisibilityChange;
        this._settings = sanitizeStaticVisibilitySettings(settings);
        this._graceMs = Math.max(0, Number(graceMs) || 0);
        this._decoded = null;
        this._currentMask = new Uint32Array(Math.ceil(units.length / 32));
        this._outputMask = new Uint32Array(this._currentMask.length);
        this._previousMask = new Uint32Array(this._currentMask.length);
        this._visible = new Uint8Array(units.length);
        this._visible.fill(1);
        this._lastKey = null;
        this._graceUntilMs = 0;
        this._status = 'loading';
        this._fallbackReason = 'loading';
        this._diagnostics = this._createDiagnostics();
    }

    _createDiagnostics() {
        return {
            state: this._status,
            fallbackReason: this._fallbackReason,
            cell: null,
            yawBins: null,
            pitchCoverage: [STATIC_VISIBILITY_PROFILE.camera.minPitchDeg, STATIC_VISIBILITY_PROFILE.camera.maxPitchDeg],
            changedBits: 0,
            visibleRoots: this.units.length,
            culledRoots: 0,
            updateMs: 0,
            categories: {}
        };
    }

    setPayload(decoded) {
        if (!decoded?.ok || !(decoded.table instanceof Uint32Array)) {
            this.setFallback(decoded?.reason ?? 'payload_invalid');
            return false;
        }
        this._decoded = decoded;
        this._status = this._settings.enabled ? 'active' : 'disabled';
        this._fallbackReason = this._settings.enabled ? null : 'disabled';
        this._lastKey = null;
        this._graceUntilMs = 0;
        if (!this._settings.enabled) this._applyAllVisible();
        this._syncDiagnostics(0, null, null);
        return true;
    }

    setSettings(settings) {
        this._settings = sanitizeStaticVisibilitySettings(settings);
        this._lastKey = null;
        this._graceUntilMs = 0;
        if (!this._settings.enabled) {
            this._status = 'disabled';
            this._fallbackReason = 'disabled';
            this._applyAllVisible();
        } else if (this._decoded) {
            this._status = 'active';
            this._fallbackReason = null;
        } else {
            this._status = 'loading';
            this._fallbackReason = 'loading';
            this._applyAllVisible();
        }
        this._syncDiagnostics(0, null, null);
    }

    setFallback(reason) {
        this._status = this._settings.enabled ? 'fallback' : 'disabled';
        this._fallbackReason = this._settings.enabled ? String(reason || 'unknown') : 'disabled';
        this._lastKey = null;
        this._graceUntilMs = 0;
        this._applyAllVisible();
        this._syncDiagnostics(0, null, null);
    }

    _applyAllVisible() {
        let changed = 0;
        for (let index = 0; index < this._visible.length; index += 1) {
            if (this._visible[index] === 1) continue;
            this._visible[index] = 1;
            this._onVisibilityChange(index, true);
            changed += 1;
        }
        return changed;
    }

    update({ x, z, yaw, nowMs = 0 } = {}) {
        const started = typeof performance !== 'undefined' ? performance.now() : 0;
        if (!this._settings.enabled || this._status !== 'active' || !this._decoded) {
            this._syncDiagnostics(0, null, null, started);
            return false;
        }
        if (![x, z, yaw].every(Number.isFinite)) {
            this.setFallback('camera_pose_invalid');
            return false;
        }

        const cellX = Math.round((x - this.map.originX) / this.map.tileSize);
        const cellY = Math.round((z - this.map.originZ) / this.map.tileSize);
        if (cellX < 0 || cellY < 0 || cellX >= this.map.width || cellY >= this.map.height) {
            this.setFallback('camera_outside_map');
            return false;
        }

        const directionCount = STATIC_VISIBILITY_PROFILE.directionCount;
        const step = Math.PI * 2 / directionCount;
        const normalizedYaw = normalizeAngle(yaw);
        const lower = Math.floor(normalizedYaw / step) % directionCount;
        const upper = (lower + 1) % directionCount;
        const cellIndex = cellX + cellY * this.map.width;
        const words = this._decoded.wordsPerMask;
        const table = this._decoded.table;
        const lowerOffset = (cellIndex * directionCount + lower) * words;
        const upperOffset = (cellIndex * directionCount + upper) * words;
        for (let word = 0; word < words; word += 1) {
            this._currentMask[word] = table[lowerOffset + word] | table[upperOffset + word];
        }

        const key = `${cellIndex}:${lower}:${upper}`;
        if (this._lastKey !== key) {
            this._previousMask.set(this._outputMask);
            this._graceUntilMs = nowMs + this._graceMs;
            this._lastKey = key;
        }
        const keepPrevious = nowMs < this._graceUntilMs;
        for (let word = 0; word < words; word += 1) {
            this._outputMask[word] = this._currentMask[word] | (keepPrevious ? this._previousMask[word] : 0);
        }

        let changed = 0;
        for (let index = 0; index < this.units.length; index += 1) {
            const unit = this.units[index];
            const categoryEnabled = this._settings.categories[unit.category] !== false;
            const maskVisible = (this._outputMask[index >>> 5] & ((1 << (index & 31)) >>> 0)) !== 0;
            const visible = !categoryEnabled || maskVisible;
            const next = visible ? 1 : 0;
            if (this._visible[index] === next) continue;
            this._visible[index] = next;
            this._onVisibilityChange(index, visible);
            changed += 1;
        }
        this._syncDiagnostics(changed, { x: cellX, y: cellY, index: cellIndex }, [lower, upper], started);
        return true;
    }

    _syncDiagnostics(changed, cell, yawBins, started = 0) {
        if (!this._settings.diagnostics) {
            this._diagnostics = { state: this._status, fallbackReason: this._fallbackReason };
            return;
        }
        let visibleRoots = 0;
        const categories = {};
        for (let index = 0; index < this.units.length; index += 1) {
            const category = this.units[index].category;
            const row = categories[category] ?? (categories[category] = { visible: 0, culled: 0 });
            if (this._visible[index]) {
                visibleRoots += 1;
                row.visible += 1;
            } else {
                row.culled += 1;
            }
        }
        const ended = typeof performance !== 'undefined' ? performance.now() : started;
        this._diagnostics = {
            state: this._status,
            fallbackReason: this._fallbackReason,
            cell,
            yawBins,
            pitchCoverage: [STATIC_VISIBILITY_PROFILE.camera.minPitchDeg, STATIC_VISIBILITY_PROFILE.camera.maxPitchDeg],
            changedBits: changed,
            visibleRoots,
            culledRoots: this.units.length - visibleRoots,
            updateMs: started > 0 ? Math.max(0, ended - started) : 0,
            categories
        };
    }

    getDiagnostics() {
        return JSON.parse(JSON.stringify(this._diagnostics));
    }

    getStatus() {
        return Object.freeze({ state: this._status, reason: this._fallbackReason });
    }

    getVisibleFlags() {
        return new Uint8Array(this._visible);
    }
}
