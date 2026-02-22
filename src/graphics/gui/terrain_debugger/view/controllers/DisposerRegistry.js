// src/graphics/gui/terrain_debugger/view/controllers/DisposerRegistry.js
// Deterministic disposer registry for listeners, timers, and arbitrary cleanup callbacks.
// @ts-check

function toCallable(value) {
    return typeof value === 'function' ? value : null;
}

function normalizeError(error, tag, source) {
    return {
        tag: String(tag || ''),
        source: String(source || ''),
        error
    };
}

export class DisposerRegistry {
    constructor({ label = 'DisposerRegistry' } = {}) {
        this._label = String(label || 'DisposerRegistry');
        this._entries = [];
        this._disposed = false;
    }

    /**
     * Clears tracked entries so the registry can be reused.
     */
    reset() {
        this._entries.length = 0;
        this._disposed = false;
    }

    /**
     * @param {Function} fn
     * @param {{ tag?: string, source?: string }} [meta]
     */
    add(fn, { tag = '', source = '' } = {}) {
        const disposer = toCallable(fn);
        if (!disposer) throw new Error(`[${this._label}] add() requires a function disposer`);

        const entry = {
            dispose: disposer,
            tag: String(tag || ''),
            source: String(source || '')
        };
        this._entries.push(entry);
        return disposer;
    }

    /**
     * @param {EventTarget} target
     * @param {string} eventName
     * @param {EventListenerOrEventListenerObject} listener
     * @param {AddEventListenerOptions | boolean} [options]
     */
    addEventListener(target, eventName, listener, options = false) {
        const add = toCallable(target?.addEventListener?.bind?.(target));
        const remove = toCallable(target?.removeEventListener?.bind?.(target));
        if (!add || !remove) throw new Error(`[${this._label}] addEventListener() requires EventTarget with add/removeEventListener`);

        add(eventName, listener, options);
        this.add(
            () => {
                remove(eventName, listener, options);
            },
            {
                tag: `event:${String(eventName || '')}`,
                source: target?.constructor?.name ?? 'EventTarget'
            }
        );
    }

    /**
     * @param {number} timeoutId
     * @param {{ tag?: string }} [meta]
     */
    addTimeout(timeoutId, { tag = '' } = {}) {
        const id = Number(timeoutId);
        if (!Number.isFinite(id) || id < 0) return;
        this.add(() => clearTimeout(id), { tag: tag || `timeout:${id}`, source: 'setTimeout' });
    }

    /**
     * @param {number} intervalId
     * @param {{ tag?: string }} [meta]
     */
    addInterval(intervalId, { tag = '' } = {}) {
        const id = Number(intervalId);
        if (!Number.isFinite(id) || id < 0) return;
        this.add(() => clearInterval(id), { tag: tag || `interval:${id}`, source: 'setInterval' });
    }

    /**
     * @param {number} rafId
     * @param {{ tag?: string }} [meta]
     */
    addAnimationFrame(rafId, { tag = '' } = {}) {
        const id = Number(rafId);
        if (!Number.isFinite(id) || id < 0) return;
        this.add(() => cancelAnimationFrame(id), { tag: tag || `raf:${id}`, source: 'requestAnimationFrame' });
    }

    get size() {
        return this._entries.length;
    }

    get isDisposed() {
        return this._disposed;
    }

    /**
     * @returns {Array<{tag: string, source: string, error: unknown}>}
     */
    disposeAll() {
        if (this._disposed) return [];
        this._disposed = true;

        const errors = [];
        for (let i = this._entries.length - 1; i >= 0; i--) {
            const entry = this._entries[i];
            try {
                entry.dispose();
            } catch (error) {
                errors.push(normalizeError(error, entry.tag, entry.source));
            }
        }
        this._entries.length = 0;
        return errors;
    }
}
