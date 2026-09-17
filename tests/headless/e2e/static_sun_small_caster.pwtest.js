// Mixed blocker depths must not erase a nearby silhouette in a building penumbra.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';

test.use({ video: 'off', trace: 'off' });
test('finite sun keeps small-caster visibility with overlapping distant blockers', async ({ page }) => {
    test.setTimeout(120000);
    if (process.env.AI573_BASELINE === '1') for (const name of ['static_sun_depth', 'streamed_sun_depth']) {
        const source = await readFile(`tests/artifacts/screens/ai573_stop_sign_shadow/source/${name}.frag.glsl`, 'utf8');
        await page.route(`**/shaders/materials/${name}.frag.glsl`, route => route.fulfill({ body: source, contentType: 'text/plain' }));
    }
    await page.goto('/tests/headless/harness/index.html');
    const folder = `tests/artifacts/screens/ai573_stop_sign_shadow/${process.env.AI573_STAGE ?? 'current'}/fixture`;
    await mkdir(folder, { recursive: true });
    const results = [];
    for (const options of [{ building: false }, { sign: false }, {}, { slope: [.8, -.4] }, { streamed: false },
        { boundary: true }, { buildingEdge: .8 }, { signGap: 1, buildingGap: 30 }, { buildingEdge: 0 }]) {
        const result = await page.evaluate(async options => (await import('./../e2e/fixtures/small_caster_visibility.js')).smallCasterVisibility(options),
            { ...options, independentCaster: process.env.AI573_BASELINE !== '1' });
        const id = `${results.length}-${options.building === false ? 'sign' : options.sign === false ? 'building' : 'combined'}`;
        await writeFile(`${folder}/${id}.png`, Buffer.from(result.image, 'base64'));
        await writeFile(`${folder}/${id}-reference.png`, Buffer.from(result.reference, 'base64'));
        delete result.image; delete result.reference; results.push({ options, ...result });
    }
    await writeFile(`${folder}/results.json`, JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
    expect(results[2].edgeError, 'Combined finite-disc visibility around the plate must stay within 8% mean error').toBeLessThan(.08);
    expect(results[3].edgeError, 'An oblique receiver must preserve the mixed-depth silhouette').toBeLessThan(.08);
    expect(results[4].edgeError, 'Parent fallback remains bounded by its coarser texels').toBeLessThan(.18);
    expect(results[5].edgeError, 'Resident page guards preserve the silhouette across a detail boundary').toBeLessThan(.08);
    expect(results[6].maximum, 'A sign within the complete building umbra must not introduce light leaks').toBe(0);
    expect(results[7].edgeError, 'The correction is not tied to one pair of blocker depths').toBeLessThan(.08);
    expect(results[8].edgeError, 'The sign must remain connected through an overlapping building shadow edge').toBeLessThan(.08);
    expect(results[8].hiddenSignMaximum, 'The half hidden behind the building in the central depth map remains a complete sign umbra').toBeLessThan(.02);
});
