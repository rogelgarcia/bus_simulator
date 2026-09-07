// Verifies scope controls against effective bake status and persisted drafts without loading a city.
import test, { expect } from '@playwright/test';
import { existsSync } from 'node:fs';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
if(existsSync(chrome))test.use({launchOptions:{executablePath:chrome}});
test('AO scope UI follows effective indirect and retains both parameter banks',async({page})=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/tests/headless/harness/index.html');
    await page.addStyleTag({content:'.hidden{display:none!important} body{overflow:auto} #harness-canvas,#harness-ui{display:none}'});
    await page.evaluate(async()=>{
        const{OptionsUI}=await import('/src/graphics/gui/options/OptionsUI.js');
        const{sanitizeAmbientOcclusionSettings,saveAmbientOcclusionSettings,loadSavedAmbientOcclusionSettings}=await import('/src/graphics/visuals/postprocessing/AmbientOcclusionSettings.js');
        window.testAoStatus={state:'loading',effective:{direct:false,indirect:false},activationBlend:1};
        window.testAoUi=new OptionsUI({initialAmbientOcclusion:sanitizeAmbientOcclusionSettings({mode:'off',gtao:{intensity:1.37},dynamic:{intensity:.7}}),
            getBakedLightingDebugInfo:()=>({receiverLightmaps:window.testAoStatus}),onLiveChange:d=>window.testAoDraft=d,
            onSave:d=>{saveAmbientOcclusionSettings(d.ambientOcclusion);window.testAoSaved=loadSavedAmbientOcclusionSettings();}});
        window.testAoUi.mount();window.testAoUi._tab='graphics';window.testAoUi._renderTab();
    });
    const scope=page.locator('.options-row').filter({has:page.locator('.options-row-label',{hasText:/^Scope$/})});
    const dynamic=page.locator('.options-row').filter({has:page.locator('.options-row-label',{hasText:/^Dynamic contact AO$/})});
    await expect(scope.getByRole('button',{name:'All',exact:true})).toHaveClass(/is-active/);
    await page.evaluate(()=>{window.testAoStatus={state:'active',effective:{direct:true,indirect:true},activationBlend:1};window.testAoUi._refreshDebug();});
    await expect(scope.getByRole('button',{name:'Dynamic Only',exact:true})).toHaveClass(/is-active/);
    await expect(dynamic.getByRole('button',{name:'Off',exact:true})).toHaveClass(/is-active/);
    await dynamic.getByRole('button',{name:'On',exact:true}).click();
    const radius=page.locator('.options-row').filter({has:page.locator('.options-row-label',{hasText:/^Dynamic AO radius \(m\)$/})}).locator('input[type=number]');
    await radius.fill('2.7');await radius.dispatchEvent('change');
    await scope.getByRole('button',{name:'All',exact:true}).click();
    await expect(page.locator('.options-row').filter({has:page.locator('.options-row-label',{hasText:/^GTAO intensity$/})})).toBeVisible();
    const saved=await page.evaluate(()=>{const ui=window.testAoUi;ui.onSave(ui.getDraft());return window.testAoSaved;});
    expect(saved.indirectScope).toBe('all');expect(saved.gtao.intensity).toBe(1.37);expect(saved.dynamic.radius).toBe(2.7);
    await scope.getByRole('button',{name:'Dynamic Only',exact:true}).click();
    await page.evaluate(()=>{window.testAoStatus={state:'fallback',effective:{direct:false,indirect:false},activationBlend:1};window.testAoUi._refreshDebug();});
    await expect(scope.getByRole('button',{name:'All',exact:true})).toHaveClass(/is-active/);
    expect(await page.evaluate(()=>window.testAoUi.getDraft().ambientOcclusion.indirectScope)).toBe('dynamic');
    const cancelled = await page.evaluate(async () => {
        const { OptionsState } = await import('/src/states/OptionsState.js');
        const original = { ambientOcclusion: window.testAoSaved };
        const edited = { ambientOcclusion: window.testAoUi.getDraft().ambientOcclusion };
        let restored = null, bakeChanges = 0, closed = false;
        const state = new OptionsState({
            setAmbientOcclusionSettings: settings => { restored = settings; },
            setBakedLightingSettings: () => { bakeChanges++; }
        }, { popOverlay: () => { closed = true; } });
        state._overlay = true;
        state._original = original; state._initialDraft = structuredClone(original); state._appliedDraft = edited;
        state._cancel();
        return { restored, bakeChanges, closed };
    });
    expect(cancelled.restored).toEqual(saved); expect(cancelled.bakeChanges).toBe(0); expect(cancelled.closed).toBe(true);
    await page.evaluate(()=>window.testAoUi.unmount());expect(errors).toEqual([]);
});
