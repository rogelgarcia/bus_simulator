// Polls submitted city shaders without forcing their first draw to block the main thread.
// @ts-check

/** @param {any} renderer @param {any} scene @param {any} camera
 * @param {any} target @param {AbortSignal} signal */
export async function prepareLightingView(renderer, scene, camera, target, signal) {
    signal.throwIfAborted();
    const previous = renderer.getRenderTarget();
    let materials;
    try {
        renderer.setRenderTarget(target);
        materials = renderer.compile(scene, camera);
    } finally { renderer.setRenderTarget(previous); }
    const programs = new Set([...materials].map(material => renderer.properties.get(material).currentProgram));
    const deadline = performance.now() + 90000;
    while ([...programs].some(program => !program.isReady())) {
        signal.throwIfAborted();
        if (renderer.getContext().isContextLost()) throw new Error('lighting_view_context_lost');
        if (performance.now() > deadline) throw new Error('lighting_view_preparation_timeout');
        await new Promise(resolve => setTimeout(resolve, 16));
    }
    signal.throwIfAborted();
}
