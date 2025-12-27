// src/core/StateMachine.js
export class StateMachine {
    constructor() {
        this.states = new Map();
        this.current = null;
    }

    register(name, state) {
        this.states.set(name, state);
    }

    go(name, params = {}) {
        const next = this.states.get(name);
        if (!next) throw new Error(`Unknown state: ${name}`);

        this.current?.exit?.();
        this.current = next;
        this.current?.enter?.(params);
    }

    update(dt) {
        this.current?.update?.(dt);
    }
}

