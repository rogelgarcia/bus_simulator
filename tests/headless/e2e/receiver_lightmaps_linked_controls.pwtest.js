// Migrates the original linked preview controls to the standard indirect control.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
if(existsSync(chrome))test.use({launchOptions:{executablePath:chrome,args:['--use-angle=d3d11']}});

test('Receiver illumination: indirect owns enhancement and survives Save Cancel Reset',async({page,browser})=>{
    await page.setViewportSize({width:1280,height:900});
    await page.goto('/tests/headless/harness/index.html');
    await page.addStyleTag({url:'/src/graphics/gui/shared/styles.css'});
    await page.addStyleTag({url:'/src/graphics/gui/options/styles.css'});
    await page.evaluate(async()=>{
        const {OptionsUI}=await import('/src/graphics/gui/options/OptionsUI.js');
        const {getResolvedBakedLightingSettings,saveBakedLightingSettings}=await import('/src/app/illumination/runtime/index.js');
        window.indirectChanges=[];
        window.mountIndirect=()=>{
            const ui=new OptionsUI({initialTab:'baked_lighting',initialBakedLighting:getResolvedBakedLightingSettings(),
                onLiveChange:d=>window.indirectChanges.push(structuredClone(d.bakedLighting)),
                onSave:d=>{saveBakedLightingSettings(d.bakedLighting);ui.unmount();},onCancel:()=>ui.unmount()});
            ui.mount();
        };window.mountIndirect();
    });
    const indirect=page.getByRole('checkbox',{name:'Enable baked indirect illumination',exact:true});
    const toggle=()=>page.locator('.options-row',{hasText:'Enable baked indirect illumination'}).locator('.options-toggle-switch').click();
    await expect(page.getByRole('checkbox',{name:'Enable baked direct illumination',exact:true})).toHaveCount(0);
    await expect(page.getByRole('checkbox',{name:'Enhanced baked illumination (AI 548)',exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Link direct and indirect illumination',exact:true})).toHaveCount(0);
    await toggle();await expect(indirect).toBeChecked();
    expect(await page.evaluate(()=>window.indirectChanges.at(-1).receivers)).toMatchObject({indirect:true,direct:false,enhanced:true,linked:false});
    await page.getByRole('button',{name:'Save',exact:true}).click();await page.evaluate(()=>window.mountIndirect());
    await expect(indirect).toBeChecked();await toggle();
    await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.evaluate(()=>window.mountIndirect());
    await expect(indirect).toBeChecked();
    await page.getByRole('button',{name:'Reset',exact:true}).click();await expect(indirect).not.toBeChecked();
    const output='tests/artifacts/screens/illumination_535/final';await mkdir(output,{recursive:true});
    await page.locator('#ui-options').screenshot({path:output+'/options.png'});
    const hardware=await page.evaluate(()=>{const gl=document.createElement('canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');
        return{userAgent:navigator.userAgent,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,platform:navigator.platform};});
    await writeFile(output+'/hardware.json',JSON.stringify({...hardware,browser:browser.version()},null,2));
});
