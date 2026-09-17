// Diagnostic-only CPU scopes. Nested phase times overlap and must not be added.
export function profileBakedCpuPhases(engine) {
    const restores = [], frames = [];
    let phases = {};
    const scope = (owner, key, label) => {
        const original = owner[key];
        owner[key] = function(...args) {
            const start = performance.now();
            try { return original.apply(this, args); }
            finally {
                const row = phases[label] ??= { calls: 0, ms: 0 };
                row.calls++; row.ms += performance.now() - start;
            }
        };
        restores.push(() => { owner[key] = original; });
    };
    scope(engine._stateMachine, 'update', 'stateUpdate');
    scope(engine._bakedLighting, 'prepareFrame', 'bakedPrepare');
    scope(engine._bakedLighting, 'frameBegin', 'bakedBegin');
    scope(engine, '_prepareDynamicAo', 'dynamicAo');
    scope(engine, '_renderAoFrame', 'renderAoFrame');
    scope(engine.renderer, 'render', 'rendererRender');
    const remove = engine.addFrameListener(frame => {
        frames.push({ frame: frame.frameIndex, cpuMs: frame.cpuMs, phases });
        phases = {};
    });
    return { finish() {
        remove();
        for (const restore of restores.reverse()) restore();
        return { frames, accounting: 'Nested CPU scopes overlap; rendererRender includes all render calls, not GPU execution time.' };
    } };
}
