// Keep an in-flight representation pair fixed until its complementary dissolve completes.
// @ts-check
export function createGrassImpostorTransition() {
    return { current: null, next: undefined, started: 0 };
}

/** @param {{current:string|null,next:string|null|undefined,started:number}} state @param {string|null} desired @param {number} now @param {number} duration */
export function advanceGrassImpostorTransition(state, desired, now, duration) {
    if (state.next !== undefined && now - state.started >= duration) {
        state.current = state.next;
        state.next = undefined;
    }
    if (state.next === undefined && desired !== state.current) {
        state.next = desired;
        state.started = now;
    }
    if (state.next === undefined) return [{ key: state.current, low: 0, high: 1, ownsLeaves: true }];
    const t = Math.max(0, Math.min(1, (now - state.started) / duration));
    return [
        { key: state.current, low: 0, high: 1 - t, ownsLeaves: t < .5 },
        { key: state.next, low: 1 - t, high: 1, ownsLeaves: t >= .5 }
    ];
}
