// Diagnostic-only pass timing and actual GL work; excluded from ordinary benchmarks.
export function profileBakedPasses(engine) {
    const renderer = engine.renderer, gl = renderer.getContext();
    const extension = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const originalTimer = engine._gpuFrameTimer;
    // TIME_ELAPSED queries cannot nest inside the normal whole-frame query.
    engine._gpuFrameTimer = { ...originalTimer, wholeFrameSuppressed: true, beginFrame() {}, endFrame() {} };
    const restores = [], pending = [], passes = [], cpu = {}, programs = new Set();
    let active = null, disjoints = 0, skippedQueries = 0;
    const wrap = (owner, key, invoke) => {
        const original = owner[key];
        if (typeof original !== 'function') return;
        owner[key] = function(...args) { return invoke(original, this, args); };
        restores.push(() => { owner[key] = original; });
    };
    const drain = () => {
        const disjoint = extension && gl.getParameter(extension.GPU_DISJOINT_EXT);
        if (disjoint) disjoints++;
        for (let i = pending.length - 1; i >= 0; i--) {
            const { query, row } = pending[i];
            if (!disjoint && !gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) continue;
            row.gpuMs = disjoint ? null : gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
            gl.deleteQuery(query); pending.splice(i, 1);
        }
    };
    const scope = (owner, key, label = key) => wrap(owner, key, (fn, self, args) => {
        const start = performance.now();
        try { return fn.apply(self, args); }
        finally {
            const row = cpu[label] ??= { calls: 0, ms: 0, maxMs: 0 };
            const ms = performance.now() - start;
            row.calls++; row.ms += ms; row.maxMs = Math.max(row.maxMs, ms);
        }
    });
    for (const key of ['prepareFrame', 'frameBegin']) scope(engine._bakedLighting, key, 'baked.' + key);
    for (const key of ['_prepareDynamicAo', '_syncAoScope', '_updateStaticAo', '_updateBusContactShadow']) scope(engine, key);
    for (const key of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'useProgram',
        'bindTexture', 'texImage2D', 'texImage3D', 'texSubImage2D', 'texSubImage3D', 'bufferData', 'bufferSubData',
        'uniform1f', 'uniform1i', 'uniform1fv', 'uniform1iv', 'uniform2f', 'uniform2fv', 'uniform2iv',
        'uniform3f', 'uniform3fv', 'uniform3iv', 'uniform4f', 'uniform4fv', 'uniform4iv',
        'uniformMatrix2fv', 'uniformMatrix3fv', 'uniformMatrix4fv']) {
        wrap(gl, key, (fn, self, args) => {
            if (active) {
                active.calls[key] = (active.calls[key] ?? 0) + 1;
                if (key === 'useProgram' && args[0]) programs.add(args[0]);
                const arrayIndex = key.startsWith('uniformMatrix') ? 2 : 1;
                if (key.startsWith('uniform') && ArrayBuffer.isView(args[arrayIndex])) {
                    active.uniformElements += args[arrayIndex + 2] || args[arrayIndex].length - (args[arrayIndex + 1] || 0);
                }
                if (key === 'bufferData' || key === 'bufferSubData') {
                    const data = args[key === 'bufferData' ? 1 : 2];
                    active.bufferUploadBytes += typeof data === 'number' ? data : data?.byteLength ?? 0;
                }
                if (key.startsWith('tex')) {
                    active.textureUploadBytes += args.reduce((sum, value) => sum + (ArrayBuffer.isView(value) ? value.byteLength : 0), 0);
                }
            }
            return fn.apply(self, args);
        });
    }
    wrap(renderer, 'render', (fn, self, args) => {
        if (active) return fn.apply(self, args);
        drain();
        const target = renderer.getRenderTarget();
        const row = { frame: engine.frameIndex, name: args[0] === engine.scene ? 'city' : args[0].name || args[0].type,
            target: target ? `${target.width}x${target.height}` : 'screen', calls: {}, uniformElements: 0,
            bufferUploadBytes: 0, textureUploadBytes: 0, cpuMs: 0, gpuMs: null };
        const query = extension && !gl.getQuery(extension.TIME_ELAPSED_EXT, gl.CURRENT_QUERY) ? gl.createQuery() : null;
        if (query) gl.beginQuery(extension.TIME_ELAPSED_EXT, query); else skippedQueries++;
        active = row; const start = performance.now();
        try { return fn.apply(self, args); }
        finally {
            row.cpuMs = performance.now() - start; active = null; passes.push(row);
            if (query) { gl.endQuery(extension.TIME_ELAPSED_EXT); pending.push({ query, row }); }
        }
    });
    return { finish() {
        drain();
        for (const { query } of pending) gl.deleteQuery(query);
        for (const restore of restores.reverse()) restore();
        engine._gpuFrameTimer = originalTimer;
        return { passes, cpu, disjoints, skippedQueries, pendingQueries: pending.length,
            programs: [...programs].map(program => gl.getAttachedShaders(program).map(shader => gl.getShaderSource(shader))) };
    } };
}
