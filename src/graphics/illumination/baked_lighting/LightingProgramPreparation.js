// Compiles supplied object variants cooperatively without drawing or uploading scene resources.
// @ts-check
import * as THREE from 'three';

/** @param {any} renderer @param {{object:any,material:any}[]} objects
 * @param {any} camera @param {any} lighting @param {any} target
 * @param {AbortSignal} signal @param {(value:any)=>void} [progress] */
export async function prepareLightingPrograms(renderer, objects, camera, lighting, target, signal, progress = () => {}) {
    signal.throwIfAborted();
    const deadline = performance.now() + 90000;
    const check = () => {
        signal.throwIfAborted();
        if (renderer.getContext().isContextLost()) throw new Error('lighting_view_context_lost');
        if (performance.now() > deadline) throw new Error('lighting_view_preparation_timeout');
    };
    const yieldFrame = async () => { await new Promise(resolve => requestAnimationFrame(resolve)); check(); };
    const candidate = new THREE.Group(); let current;
    candidate.traverse = visitor => visitor(current);
    const programs = new Set();
    let batch = performance.now(), maximumSubmitMs = 0;
    progress({ phase: 'submitting_programs', objects: objects.length });
    for (const { object, material } of objects) {
        check(); current = object;
        const previous = renderer.getRenderTarget(), liveMaterial = object.material;
        try {
            // Dynamic AO restores its borrowed materials when submission first
            // yields. Preserve the exact requested variant for later batches.
            object.material = material;
            renderer.setRenderTarget(target);
            const materials = renderer.compile(candidate, camera, lighting);
            for (const material of materials) programs.add(renderer.properties.get(material).currentProgram);
        } finally { object.material = liveMaterial; renderer.setRenderTarget(previous); }
        const elapsed = performance.now() - batch;
        if (elapsed >= 4) { maximumSubmitMs = Math.max(maximumSubmitMs, elapsed); await yieldFrame(); batch = performance.now(); }
    }
    maximumSubmitMs = Math.max(maximumSubmitMs, performance.now() - batch);
    progress({ phase: 'waiting_for_programs', programs: programs.size, maximumSubmitMs });
    const pending = new Set(programs);
    while (pending.size) {
        check();
        for (const program of pending) if (program.isReady()) pending.delete(program);
        if (pending.size) await yieldFrame();
    }
    // Readiness does not populate Three's uniform/attribute reflection. Doing it
    // for every completed variant here prevents a first-draw reflection burst.
    progress({ phase: 'preparing_bindings' }); batch = performance.now();
    for (const program of programs) {
        check(); program.getUniforms(); program.getAttributes();
        if (program.diagnostics?.runnable === false) throw new Error('lighting_view_shader_link_failed');
        if (performance.now() - batch >= 4) { await yieldFrame(); batch = performance.now(); }
    }
    return programs;
}
