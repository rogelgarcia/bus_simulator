// src/graphics/gui/mesh_fabrication/file_loader/meshPollScheduler.js

export function createMeshPollScheduler({
    intervalMs,
    onTick,
    timerApi = null
}) {
    const tick = typeof onTick === 'function' ? onTick : () => {};
    const timers = timerApi ?? globalThis;
    if (typeof timers?.setInterval !== 'function' || typeof timers?.clearInterval !== 'function') {
        throw new Error('[MeshPollScheduler] timerApi requires setInterval/clearInterval.');
    }

    let timerId = null;

    return Object.freeze({
        start() {
            if (timerId !== null) return;
            timerId = timers.setInterval(() => {
                void tick();
            }, Math.max(1, Number(intervalMs) || 1000));
        },
        stop() {
            if (timerId === null) return;
            timers.clearInterval(timerId);
            timerId = null;
        },
        isRunning() {
            return timerId !== null;
        }
    });
}
