// Opt-in GL upload diagnostics; inactive during normal startup benchmarks.
export function profileBakedUniforms(renderer) {
    const gl = renderer.getContext(), locations = new WeakMap(), rows = new Map();
    const get = gl.getUniformLocation, upload = gl.uniform4fv;
    let active = false;
    gl.getUniformLocation = function(program, name) {
        const location = get.call(this, program, name);
        if (location) locations.set(location, name);
        return location;
    };
    gl.uniform4fv = function(...args) {
        if (!active) return upload.apply(this, args);
        const name = locations.get(args[0]) ?? 'existing-before-capture';
        const length = args[3] || args[1].length - (args[2] || 0), key = `${name}:${length}`;
        let row = rows.get(key);
        if (!row) { row = { name, length, calls: 0, floats: 0, ms: 0, maxMs: 0 }; rows.set(key, row); }
        const start = performance.now(), result = upload.apply(this, args), ms = performance.now() - start;
        row.calls++; row.floats += length; row.ms += ms; row.maxMs = Math.max(row.maxMs, ms);
        return result;
    };
    return { start() { active = true; }, finish() {
        active = false; gl.getUniformLocation = get; gl.uniform4fv = upload;
        return [...rows.values()];
    } };
}
