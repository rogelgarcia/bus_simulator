// Finishes driver-side pipelines and texture residency offscreen before presentation.
// @ts-check
import * as THREE from 'three';

export async function prepareLightingViewRaster(renderer, scene, camera, sourceTarget, objects, signal) {
    signal.throwIfAborted();
    const gl = renderer.getContext(), started = performance.now();
    // The post pipeline's scene target is already private: writing it does not
    // present a frame. Reuse it to avoid another full-resolution allocation.
    const size = sourceTarget ? null : renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = sourceTarget ?? new THREE.WebGLRenderTarget(size.x,size.y);
    const previous = renderer.getRenderTarget(), bindings = objects.map(({object}) => object.material);
    let fence;
    try {
        // Uniform reflection and buffer/texture uploads have already been
        // prepared in batches. A real draw also initializes driver pipelines,
        // which KHR_parallel_shader_compile's readiness query does not cover.
        // Use the actual view size: a tiny draw does not touch the texture pages
        // needed by the first full-resolution frame.
        try {
            for (const {object,material} of objects) object.material = material;
            renderer.setRenderTarget(target); renderer.render(scene,camera);
        } finally {
            objects.forEach(({object},i) => { object.material = bindings[i]; });
            renderer.setRenderTarget(previous);
        }
        const cpuMs = performance.now() - started;
        fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
        if (!fence) throw new Error('lighting_view_fence_unavailable');
        gl.flush();
        const deadline = performance.now()+90000;
        while (true) {
            signal.throwIfAborted();
            if (gl.isContextLost()) throw new Error('lighting_view_context_lost');
            const status = gl.clientWaitSync(fence,0,0);
            if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) break;
            if (status === gl.WAIT_FAILED || performance.now()>deadline) throw new Error('lighting_view_fence_failed');
            await new Promise(resolve => requestAnimationFrame(resolve));
        }
        return {cpuMs,elapsedMs:performance.now()-started};
    } finally { if(fence)gl.deleteSync(fence);if(!sourceTarget)target.dispose(); }
}
