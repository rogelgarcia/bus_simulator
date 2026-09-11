// Finish asynchronous game-view preparation before reading native shadow resources.
export async function renderProductionPreparedFrame(engine) {
    const deadline = performance.now() + 120000;
    for (;;) {
        engine.renderFrame();
        const view = engine.getBakedLightingDebugInfo().view;
        if (view.error) throw new Error(view.error);
        if (view.ready) return;
        if (performance.now() > deadline) throw new Error('Native shadow view preparation timed out');
        await new Promise(requestAnimationFrame);
    }
}
