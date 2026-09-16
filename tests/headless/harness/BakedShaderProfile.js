// Opt-in diagnostic instrumentation; never enabled in startup benchmark runs.
export function profileBakedShaders(renderer) {
    const gl = renderer.getContext(), shaders = new Map(), programs = new Map(), restores = [];
    const start = performance.now(), compiles = [];
    const record = program => {
        if (!programs.has(program)) programs.set(program, { id: programs.size, shaders: [], apis: {}, visits: 0 });
        return programs.get(program);
    };
    const wrap = (owner, name, invoke) => {
        const original = owner[name];
        owner[name] = function(...args) { return invoke(original, args); };
        restores.push(() => { owner[name] = original; });
    };
    wrap(gl, 'shaderSource', (original, args) => { shaders.set(args[0], args[1]); return original.apply(gl, args); });
    wrap(gl, 'attachShader', (original, args) => { record(args[0]).shaders.push(args[1]); return original.apply(gl, args); });
    for (const name of ['linkProgram', 'getProgramParameter', 'getProgramInfoLog', 'getActiveUniform', 'getUniformLocation', 'getActiveAttrib', 'getAttribLocation', 'useProgram']) {
        wrap(gl, name, (original, args) => {
            const before = performance.now(), value = original.apply(gl, args), elapsed = performance.now() - before;
            const p = record(args[0]);
            const api = p.apis[name] ??= { calls: 0, ms: 0, maxMs: 0 };
            api.calls++; api.ms += elapsed; api.maxMs = Math.max(api.maxMs, elapsed);
            if (name === 'linkProgram') p.linkTimeMs = performance.now() - start;
            if (name === 'getProgramParameter' && args[1] === 0x91B1 && value && p.readyTimeMs === undefined) p.readyTimeMs = performance.now() - start;
            if (name === 'useProgram' && p.firstUseMs === undefined) p.firstUseMs = performance.now() - start;
            return value;
        });
    }
    wrap(renderer, 'compile', (original, args) => {
        const before = performance.now();
        const materials = original.apply(renderer, args), elapsed = performance.now() - before, ids = new Set();
        for (const material of materials) {
            const program = renderer.properties.get(material).currentProgram, p = record(program.program);
            p.name = material.name; p.type = material.type; p.visits++; p.key = program.cacheKey; ids.add(p.id);
        }
        // Whole-scene compile time cannot be attributed to each material; keep
        // one call record so totals remain additive even with shared programs.
        compiles.push({ timeMs: before - start, elapsedMs: elapsed, materialCount: materials.size, programs: [...ids] });
        return materials;
    });
    return { finish() {
        for (const restore of restores) restore();
        return { compiles, programs: [...programs.values()].map(p => ({ ...p, shaders: p.shaders.map(s => shaders.get(s) ?? 'existing-before-profile') })) };
    } };
}
