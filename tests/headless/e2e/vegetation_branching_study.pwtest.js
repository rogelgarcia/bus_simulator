// Exercises the baked prompt 649 study, reference loading, controls, help and export.
import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const directory='tests/artifacts/screens/vegetation_branching_study/649_ramification_followup/review_v4';
const ids=['london_plane','silver_linden','northern_red_oak','american_elm','arrowwood_viburnum'];
// Node and Chromium may differ in the last bits of trigonometric results.
function graphDifference(actual,expected){
    let maxError=0,mismatch=null;
    function visit(a,b,key){
        if(typeof a==='number'&&typeof b==='number'){
            maxError=Math.max(maxError,Math.abs(a-b));return;
        }
        if(a&&b&&typeof a==='object'&&typeof b==='object'){
            if(JSON.stringify(Object.keys(a))!==JSON.stringify(Object.keys(b)))mismatch??=key;
            for(const k of Object.keys(b))visit(a[k],b[k],key+'.'+k);
        }else if(a!==b)mismatch??=key;
    }
    visit(actual,expected,'paths');return {maxError,mismatch};
}
test('species presets, shared-base ownership and view-only exposure survive UI editing and export',async({page})=>{
    test.setTimeout(120000);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setViewportSize({width:1800,height:1200});await page.goto('/'+directory+'/index.html');
    await page.waitForFunction(()=>window.branchStudy?.audit.passed);
    await expect(page.locator('#studyHelp')).toBeHidden();
    for(const id of ids){
        await page.locator('#preset').selectOption(id);
        expect(await page.evaluate(()=>window.branchStudy.audit.passed)).toBe(true);
        const baked=JSON.parse(await fs.readFile(directory+`/presets/${id}.json`,'utf8'));
        expect(await page.evaluate(()=>window.branchStudy.settings)).toEqual(baked.settings);
        const difference=graphDifference(await page.evaluate(()=>window.branchStudy.paths),baked.paths);
        expect(difference.mismatch).toBeNull();expect(difference.maxError).toBeLessThan(1e-10);
        await expect(page.locator('#preset')).toHaveValue(id);
        await expect(page.locator('#referenceImage')).toHaveAttribute('src',`references/${id}.jpg`);
        await expect(page.locator('#completeReferenceImage')).toHaveAttribute('src',`references/${id}-complete.png`);
        expect(await page.locator('.reference img').evaluateAll(async images=>{await Promise.all(images.map(i=>i.decode()));return images.every(i=>i.naturalWidth>0);})).toBe(true);
        await expect(page.locator('#competition')).not.toBeChecked();
    }
    expect(await page.evaluate(()=>window.branchStudy.base.anchors.length)).toBe(11);
    const graph=await page.evaluate(()=>JSON.stringify(window.branchStudy));
    await page.locator('#rootView').selectOption('surface');
    await page.locator('#exposureDepth').evaluate(input=>{input.value='.2';input.dispatchEvent(new Event('input',{bubbles:true}));});
    expect(await page.evaluate(()=>JSON.stringify(window.branchStudy))).toBe(graph);
    const label=page.locator('label').filter({has:page.locator('#rootView')}).locator('.help-title');
    await label.focus();await expect(page.locator('#studyHelp')).toBeVisible();await expect(page.locator('#studyHelpBody')).toContainText('graph is identical');
    await page.keyboard.press('Escape');await expect(page.locator('#studyHelp')).toBeHidden();
    await label.click();await expect(page.locator('#studyHelp')).toBeVisible();await page.keyboard.press('Escape');
    await page.locator('#tree polygon[data-branch]').first().dispatchEvent('click');await expect(page.locator('#axisInfo')).toContainText('basal-cane');
    const pending=page.waitForEvent('download');await page.locator('#export').click();const downloaded=await pending;
    const model=JSON.parse(await fs.readFile(await downloaded.path(),'utf8'));expect(model.base.anchors).toHaveLength(11);expect(model.version).toBe(9);expect(model.audit.passed).toBe(true);
    await page.locator('#nextSeed').click();expect(await page.evaluate(()=>window.branchStudy.settings.seed)).toBe(32);
    await page.locator('#reset').click();expect(await page.evaluate(()=>window.branchStudy.settings.seed)).toBe(31);
    await page.locator('#competition').check();await page.locator('#reset').click();await expect(page.locator('#competition')).not.toBeChecked();
    await page.locator('summary').filter({hasText:'Plant base'}).click();
    await page.locator('#basalCount').evaluate(input=>{input.value='7';input.dispatchEvent(new Event('input',{bubbles:true}));});
    expect(await page.evaluate(()=>window.branchStudy.base.anchors.length)).toBe(7);await expect(page.locator('#preset')).toHaveValue('custom');
    await page.locator('#reset').click();expect(await page.evaluate(()=>window.branchStudy.base.anchors.length)).toBe(11);
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    for(const image of await page.locator('.reference img').all()){
        const box=await image.boundingBox();expect(box.height).toBeGreaterThan(150);expect(box.width).toBeGreaterThan(250);
    }
    await page.screenshot({path:directory+'/ui-mobile.png',fullPage:true});
    await fs.writeFile(directory+'/ui-validation.json',JSON.stringify({errors,checkedSpecies:ids,basalEditing:true,exposurePreservesGraph:true,exportRoundTrip:true,popups:true,mobileWidth:390},null,2));
    expect(errors).toEqual([]);
});

test('every species comparison includes both references, complete geometry, close-ups and three seeds',async({page})=>{
    await page.goto('/'+directory+'/comparison.html');
    for(const id of ids){
        const section=page.locator('#'+id);await expect(section.locator('figure')).toHaveCount(10);
        for(const image of await section.locator('img').all()){
            expect(await image.evaluate(async image=>{image.loading='eager';await image.decode();return image.naturalWidth>0;})).toBe(true);
            const src=await image.getAttribute('src');await expect(image.locator('..')).toHaveAttribute('href',src);
        }
    }
});


test('ramification tiers add real descendants and replay the exact hierarchy',async({page})=>{
    await page.goto('/'+directory+'/index.html');await page.waitForFunction(()=>window.branchStudy?.audit.passed);
    await page.locator('#preset').selectOption('london_plane');
    const before=await page.evaluate(()=>window.branchStudy);
    expect(before.settings.ramificationLevels).toBe(6);expect(before.growthLevels).toBe(7);
    expect(before.paths.filter(p=>p.level===1)).toHaveLength(7);
    await page.locator('#primaryLimbs').evaluate(input=>{input.value='5';input.dispatchEvent(new Event('input',{bubbles:true}));});
    expect(await page.evaluate(()=>window.branchStudy.paths.filter(p=>p.level===1).length)).toBe(5);
    await page.locator('#reset').click();
    await expect(page.locator('#stage')).toHaveAttribute('max','7');
    await page.locator('#stage').evaluate(input=>{input.value='1';input.dispatchEvent(new Event('input',{bubbles:true}));});
    await expect(page.locator('#stageValue')).toHaveText('Framework 1 / 1');
    await expect(page.locator('#tree polygon[data-branch]')).toHaveCount(before.paths.filter(p=>p.level<=1).length);
    await page.locator('#ramificationLevels').evaluate(input=>{input.value='5';input.dispatchEvent(new Event('input',{bubbles:true}));});
    const after=await page.evaluate(()=>window.branchStudy);
    expect(after.paths.length).toBeLessThan(before.paths.length);expect(after.growthLevels).toBe(6);
    for(const axis of after.paths)expect(axis.points).toEqual(before.paths.find(p=>p.key===axis.key).points);
    await expect(page.locator('#stageValue')).toHaveText('Fork tier 5 / 5');
    await page.locator('#reset').click();expect(await page.evaluate(()=>window.branchStudy.paths.length)).toBe(before.paths.length);
    await page.locator('#colors').check();await page.locator('#forks').check();
    await page.setViewportSize({width:1800,height:1200});
    await page.screenshot({path:directory+'/ui-hierarchy.png',fullPage:true});
    await page.goto('/'+directory+'/ramification.html');
    for(const id of ids){
        const figures=page.locator('#'+id+' figure');await expect(figures).toHaveCount(6);
        for(const image of await figures.locator('img').all())expect(await image.evaluate(async img=>{img.loading='eager';await img.decode();return img.naturalWidth>0;})).toBe(true);
        for(const figure of await figures.all()){
            const imageBox=await figure.locator('img').boundingBox(),linkBox=await figure.locator('a').boundingBox(),captionBox=await figure.locator('figcaption').boundingBox();
            expect(imageBox.y+imageBox.height).toBeLessThanOrEqual(linkBox.y+linkBox.height+1);
            expect(captionBox.y).toBeGreaterThanOrEqual(imageBox.y+imageBox.height-1);
        }
    }
});
