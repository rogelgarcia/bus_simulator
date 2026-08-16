// Headless browser test: switching between cascade tiers must never crash.
//
// Lowering the cascade count (cascade/med -> cascade/low) used to kill the
// renderer with "cannot read properties of undefined (reading 'toArray')".
// Three's CSM keeps ONE Vector2 array per material and truncates it to the live
// cascade count every update, while uniform upload is driven by whichever
// PROGRAM a mesh currently holds — and a material can hold several. Any program
// still declaring a larger CSM_CASCADES then reads past the end of the array.
// Only lowering the count can do it; raising it just leaves entries unread.
import test, { expect } from '@playwright/test';

const POSE_URL = '/?pose=civic_center_curve_front&coreTests=0';

async function bootPose(page) {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err?.message ?? String(err)));
    await page.goto(POSE_URL);
    await page.waitForFunction(
        () => window.__busSim?.sm?.currentName === 'game_mode' && !!window.__busSim?.sm?.current?.busAnchor,
        null,
        { timeout: 55_000 }
    );
    await page.evaluate(() => {
        const { engine, sm } = window.__busSim;
        // The pose harness pauses the game loop but the rAF render loop keeps
        // running and re-stomps the camera every frame.
        sm.current._updateChaseCamera = () => {};
        for (let i = 0; i < 60; i += 1) { engine.context.city.update(engine); engine.renderFrame(); }
    });
    return errors;
}

async function applyAndRender(page, type, quality, frames = 12) {
    return page.evaluate(({ type, quality, frames }) => {
        const { engine } = window.__busSim;
        const city = engine.context.city;
        try {
            engine.setShadowSettings({ ...engine.shadowSettings, type, quality });
            city.applyShadowSettings(engine);
            for (let i = 0; i < frames; i += 1) { city.update(engine); engine.renderFrame(); }
        } catch (e) {
            return { error: String(e?.message ?? e).split('\n')[0], cascades: city._csm?.cascades ?? 0 };
        }
        return { error: null, cascades: city._csm?.cascades ?? 0 };
    }, { type, quality, frames });
}

test('Shadows: every type x quality transition survives, including cascade downshifts', async ({ page }) => {
    // Booting the city is ~30 s and each switch recompiles thousands of
    // materials, so this needs well past the 60 s default.
    test.setTimeout(240_000);
    const errors = await bootPose(page);

    // Deliberately includes every downward cascade step, which is the direction
    // that crashes; a fixed low->med->high sweep would miss all of them.
    const sequence = [
        ['cascade', 'high'], ['cascade', 'med'], ['cascade', 'low'],
        ['cascade', 'high'], ['cascade', 'low'],
        ['cascade', 'med'], ['cascade', 'low'],
        ['single', 'high'], ['cascade', 'med'], ['cascade', 'low'],
        ['single', 'low'], ['off', 'low'], ['cascade', 'high'], ['cascade', 'low']
    ];
    const expectedCascades = { high: 4, med: 3, low: 2 };

    for (const [type, quality] of sequence) {
        const res = await applyAndRender(page, type, quality);
        expect(res.error, `${type}/${quality} threw`).toBeNull();
        if (type === 'cascade') {
            expect(res.cascades, `${type}/${quality} cascade count`).toBe(expectedCascades[quality]);
        } else {
            expect(res.cascades, `${type}/${quality} must tear the cascades down`).toBe(0);
        }
    }

    expect(errors, 'no page errors across the switch sequence').toEqual([]);
});

test('Shadows: a program declaring more cascades than the live count still uploads', async ({ page }) => {
    const errors = await bootPose(page);

    // The failure needs a program whose CSM_CASCADES exceeds the live count.
    // Reaching that through gameplay depends on which material variants happen
    // to hold stale programs, so force it: run at 2 cascades and push a
    // registered material's define to the 4-cascade maximum.
    const result = await page.evaluate(() => {
        const { engine } = window.__busSim;
        const city = engine.context.city;
        engine.setShadowSettings({ ...engine.shadowSettings, type: 'cascade', quality: 'low' });
        city.applyShadowSettings(engine);
        for (let i = 0; i < 20; i += 1) { city.update(engine); engine.renderFrame(); }

        let victim = null;
        city.group.traverse((o) => {
            if (victim || !o.isMesh || !o.visible) return;
            const m = Array.isArray(o.material) ? o.material[0] : o.material;
            if (m?.defines?.USE_CSM) victim = m;
        });
        if (!victim) return { ok: false, reason: 'no CSM-registered material found' };

        victim.defines.CSM_CASCADES = 4;
        victim.needsUpdate = true;
        try {
            city.update(engine);
            engine.renderFrame();
        } catch (e) {
            return { ok: false, reason: String(e?.message ?? e).split('\n')[0] };
        }
        const len = city._csm.csm.shaders.get(victim)?.uniforms?.CSM_cascades?.value?.length ?? 0;
        return { ok: true, uniformLength: len, liveCascades: city._csm.cascades };
    });

    expect(result.reason ?? null, 'forced 4-cascade program must render at 2 cascades').toBeNull();
    expect(result.ok).toBe(true);
    expect(result.liveCascades).toBe(2);
    // The array is held at the maximum any program can declare, not the live count.
    expect(result.uniformLength).toBe(4);
    expect(errors, 'no page errors').toEqual([]);
});
