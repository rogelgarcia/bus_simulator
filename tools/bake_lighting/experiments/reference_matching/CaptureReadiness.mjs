// Waits for the same complete streamed-shadow view before images and timing samples.
export async function waitForShadowTiles(page) {
    await page.waitForFunction(() => {
        const detail = window.__busSim.engine._bakedLighting.shadows.getDiagnostics().pipeline.streamedShadows;
        return detail.state === 'off' || (detail.state === 'ready' && detail.pending === 0
            && detail.queued === 0 && detail.selectionFallbacks === 0);
    }, null, {timeout:60000});
}
