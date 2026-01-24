// Shared helpers for visual regression specs.
export async function bootHarness(page, { query = '?ibl=0&bloom=0' } = {}) {
    await page.goto(`/tests/headless/harness/index.html${query}`);
    await page.waitForFunction(() => window.__testHooks && window.__testHooks.version === 1);
}

export async function renderGoldenFrame(page, {
    scenarioId,
    seed,
    viewport = { width: 960, height: 540 },
    warmupTicks = 30,
    dt = 1 / 60
}) {
    return page.evaluate(async (args) => {
        const { scenarioId, seed, viewport, warmupTicks, dt } = args;
        window.__testHooks.setViewport(viewport.width, viewport.height);
        await window.__testHooks.loadScenario(scenarioId, { seed });
        window.__testHooks.setFixedDt(dt);
        window.__testHooks.step(warmupTicks, { render: true });
        return window.__testHooks.getMetrics();
    }, { scenarioId, seed, viewport, warmupTicks, dt });
}

export function screenshotName({ scenarioId, seed, width, height }) {
    const safe = (v) => String(v ?? '').replace(/[^a-z0-9._-]+/gi, '_');
    return `${safe(scenarioId)}__seed_${safe(seed)}__${width}x${height}.png`;
}
