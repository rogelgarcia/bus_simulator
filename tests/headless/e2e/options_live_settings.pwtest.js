// Checks that live edits and Cancel touch only the settings the user changed.
import test, { expect } from '@playwright/test';

test('Options restores edited settings without replaying unrelated source settings', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html');
    const result = await page.evaluate(async () => {
        const { OptionsState } = await import('/src/states/OptionsState.js');
        const calls = [];
        const engine = {
            setLightingSettings: value => calls.push(['lighting', value]),
            setAmbientOcclusionSettings: value => calls.push(['ao', value.mode]),
            setBakedLightingSettings: value => calls.push(['baked', value.receivers.indirect])
        };
        const state = new OptionsState(engine, {});
        const initial = { lighting: { ibl: { enabled: true } }, ambientOcclusion: { mode: 'gtao' },
            bakedLighting: { receivers: { enhanced: true, indirect: true } } };
        state._original = { ...structuredClone(initial), lighting: { ibl: { enabled: true, hdrUrl: '/original.hdr' } } };
        state._initialDraft = structuredClone(initial);
        state._appliedDraft = structuredClone(initial);
        const edited = structuredClone(initial);
        edited.ambientOcclusion.mode = 'off';
        state._applyDraft(edited);
        edited.bakedLighting.receivers.indirect = false;
        state._applyDraft(edited);
        state._applyDraft(edited);
        state._restoreOriginal();
        const unrelated = calls.splice(0);
        const lightingEdit = structuredClone(initial);
        lightingEdit.lighting.ibl.enabled = false;
        state._applyDraft(lightingEdit);
        state._restoreOriginal();
        return { unrelated, restoredLighting: calls };
    });
    expect(result.unrelated).toEqual([['ao', 'off'], ['baked', false], ['ao', 'gtao'], ['baked', true]]);
    expect(result.restoredLighting).toEqual([
        ['lighting', { ibl: { enabled: false } }],
        ['lighting', { ibl: { enabled: true, hdrUrl: '/original.hdr' } }]
    ]);
});
