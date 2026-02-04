// src/app/physics/PhysicsLoop.js
export class PhysicsLoop {
    constructor({ fixedDt = 1 / 60, maxSubSteps = 8 } = {}) {
        this.fixedDt = fixedDt;
        this.maxSubSteps = maxSubSteps;
        this.accum = 0;
        this.systems = new Set();
        this.lastSubSteps = 0;
        this.lastDt = 0;
        this.lastAlpha = 0;
    }

    add(system) {
        this.systems.add(system);
        return system;
    }

    remove(system) {
        this.systems.delete(system);
    }

    clear() {
        this.systems.clear();
        this.accum = 0;
    }

    update(dt) {
        // clamp dt to avoid spiral-of-death when tab is backgrounded
        dt = Math.min(Math.max(dt ?? 0, 0), 0.1);
        this.lastDt = dt;

        this.accum += dt;

        let steps = 0;
        while (this.accum >= this.fixedDt && steps < this.maxSubSteps) {
            for (const s of this.systems) {
                if (typeof s.fixedUpdate === 'function') s.fixedUpdate(this.fixedDt);
                else if (typeof s.update === 'function') s.update(this.fixedDt);
            }
            this.accum -= this.fixedDt;
            steps++;
        }
        this.lastSubSteps = steps;

        // optional interpolation hook (not used yet)
        const alpha = this.fixedDt > 0 ? this.accum / this.fixedDt : 0;
        this.lastAlpha = alpha;
        for (const s of this.systems) {
            if (typeof s.interpolate === 'function') s.interpolate(alpha);
        }
    }
}
