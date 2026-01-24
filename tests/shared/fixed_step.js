// Fixed-step simulation runner for deterministic stepping tests.
export function runFixedSteps({
    ticks,
    dt,
    update
}) {
    const tickCount = Math.max(0, Math.floor(Number(ticks) || 0));
    const stepDt = Number(dt);
    if (!Number.isFinite(stepDt) || stepDt <= 0) throw new Error(`Invalid dt: ${dt}`);
    if (typeof update !== 'function') throw new Error('update must be a function');

    let now = 0;
    for (let i = 0; i < tickCount; i++) {
        now += stepDt;
        update(stepDt, { tick: i + 1, now });
    }
    return { ticks: tickCount, dt: stepDt, now };
}

