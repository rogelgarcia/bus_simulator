// src/app/core/StateMachine.js
export class StateMachine {
    constructor() {
        this.states = new Map();
        this.current = null;
        this.currentName = null;
        this._overlayStack = [];
        this._basePausedForOverlay = false;
    }

    register(name, state) {
        this.states.set(name, state);
    }

    go(name, params = {}) {
        const next = this.states.get(name);
        if (!next) throw new Error(`Unknown state: ${name}`);

        this._clearOverlays({ nextName: name, nextParams: params, resumeBase: false });
        this.current?.exit?.({ nextName: name, nextParams: params });
        this.current = next;
        this.currentName = name;
        this.current?.enter?.(params);
    }

    pushOverlay(name, params = {}) {
        const next = this.states.get(name);
        if (!next) throw new Error(`Unknown state: ${name}`);

        const base = this.current;
        const baseName = this.currentName;
        if (!base) {
            this.go(name, params);
            return;
        }

        if (!this._basePausedForOverlay && typeof base.pause === 'function' && typeof base.resume === 'function') {
            this._basePausedForOverlay = true;
            base.pause({ nextName: name, nextParams: params });
        }

        this._overlayStack.push({ state: next, name });
        next.enter?.({
            ...params,
            overlay: true,
            returnTo: params?.returnTo ?? baseName ?? 'welcome'
        });
    }

    popOverlay(params = {}) {
        const entry = this._overlayStack.pop() ?? null;
        if (!entry?.state || !entry?.name) return false;

        entry.state?.exit?.({ nextName: this.currentName, nextParams: params });

        if (!this._overlayStack.length && this._basePausedForOverlay) {
            this._basePausedForOverlay = false;
            const base = this.current;
            if (base && typeof base.resume === 'function') {
                base.resume({ fromName: entry.name, fromParams: params });
            }
        }
        return true;
    }

    isOverlayOpen(name = null) {
        if (!this._overlayStack.length) return false;
        if (typeof name !== 'string' || !name) return true;
        return this._overlayStack.some((e) => e?.name === name);
    }

    update(dt) {
        this.current?.update?.(dt);
        for (const entry of this._overlayStack) entry?.state?.update?.(dt);
    }

    _clearOverlays({ nextName = null, nextParams = {}, resumeBase = true } = {}) {
        while (this._overlayStack.length) {
            const entry = this._overlayStack.pop();
            entry?.state?.exit?.({ nextName, nextParams });
        }

        if (this._basePausedForOverlay) {
            this._basePausedForOverlay = false;
            if (resumeBase && this.current && typeof this.current.resume === 'function') {
                this.current.resume({ fromName: nextName, fromParams: nextParams });
            }
        }
    }
}
