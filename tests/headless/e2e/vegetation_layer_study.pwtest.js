// Exercises actual calibrated study artifacts, persistence and export across all model variants.
import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';

const directory='tests/artifacts/screens/vegetation_layer_study/20261016_layers_v1';
const url='/'+directory+'/index.html';
const documentConfig=page=>page.locator('#json-output').inputValue().then(JSON.parse);
test('all references render and geometry edits propagate in four views without changing other models',async({page,context})=>{
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setViewportSize({width:1460,height:1080});await page.goto(url);
    await page.waitForFunction(()=>document.body.dataset.loading==='false');
    await expect(page.locator('#species button')).toHaveCount(5);await expect(page.locator('#views canvas')).toHaveCount(4);
    const initial=await documentConfig(page);expect(initial.models).toHaveLength(15);
    const calibration=await page.evaluate(async()=>{
        const {project}=await import('./model.js'),study=await(await fetch('study.json')).json();
        return Math.max(...study.models.flatMap(m=>m.views.flatMap(v=>v.landmarks.map(p=>Math.hypot(...project(p.world,v).map((x,i)=>x-p.uv[i]))))));
    });expect(calibration).toBeLessThan(.00001);
    const canvas=page.locator('#views canvas').first(),box=await canvas.boundingBox();
    const center=await page.evaluate(async()=>{const {project}=await import('./model.js'),study=await(await fetch('study.json')).json();return project(study.models[0].preset.center,study.models[0].views[0]);});
    await page.mouse.move(box.x+center[0]*box.width,box.y+center[1]*box.height);await page.mouse.down();await page.mouse.move(box.x+center[0]*box.width+30,box.y+center[1]*box.height-15,{steps:5});await page.mouse.up();
    const moved=await documentConfig(page);expect(moved.models[0].center[0]).toBeGreaterThan(initial.models[0].center[0]);expect(moved.models[0].center[2]).toBeGreaterThan(initial.models[0].center[2]);expect(moved.models[0].center[1]).toBe(initial.models[0].center[1]);expect(moved.models.slice(1)).toEqual(initial.models.slice(1));
    await page.reload();await page.waitForFunction(()=>document.body.dataset.loading==='false');expect((await documentConfig(page)).models[0].center).toEqual(moved.models[0].center);
    await page.getByRole('button',{name:'Inner',exact:true}).click();await page.getByRole('spinbutton',{name:'Width · X diameter',exact:true}).fill('999');await page.getByRole('spinbutton',{name:'Width · X diameter',exact:true}).press('Tab');
    const resized=await documentConfig(page);expect(resized.models[0].layers[0].radii[0]).toBeLessThan(resized.models[0].layers[1].radii[0]);
    await page.getByRole('button',{name:'Restore this model’s preset'}).click();expect((await documentConfig(page)).models[0].center).toEqual(initial.models[0].center);
    const species=page.locator('#species button');
    for(let s=0;s<5;s++){
        await species.nth(s).click();await page.waitForFunction(()=>document.body.dataset.loading==='false');
        for(let v=0;v<3;v++){
            await page.locator('#variants button').nth(v).click();await page.waitForFunction(()=>document.body.dataset.loading==='false');
            await expect(page.locator('#views img')).toHaveCount(4);
            await expect.poll(()=>page.locator('#views img').evaluateAll(images=>images.every(image=>image.complete&&image.naturalWidth===896))).toBe(true);
        }
    }
    await page.locator('#species button').first().click();await page.waitForFunction(()=>document.body.dataset.loading==='false');
    await page.locator('#reviewed').check();const exported=await documentConfig(page);
    await context.grantPermissions(['clipboard-read','clipboard-write']);await page.getByRole('button',{name:'Copy JSON',exact:true}).click();
    expect(JSON.parse(await page.evaluate(()=>navigator.clipboard.readText()))).toEqual(exported);
    const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download JSON'}).click();const download=await downloadPromise;
    expect(JSON.parse(await fs.readFile(await download.path(),'utf8'))).toEqual(exported);
    await page.locator('#import-file').setInputFiles({name:'valid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});await expect(page.locator('#export-status')).toHaveText('Imported all model configurations.');
    const invalid=structuredClone(exported);invalid.models[0].source.sha256='changed';await page.locator('#import-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});await expect(page.locator('#export-status')).toContainText('Import rejected');expect(await documentConfig(page)).toEqual(exported);
    await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:directory+'/editor-desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:directory+'/editor-mobile.png',fullPage:true});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});
