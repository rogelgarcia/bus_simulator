// @ts-check
// Verify the generated viewer and capture faithful four-way comparison sheets in an owned browser.
import path from 'node:path';
import {writeJson} from '../../../baking/Files.mjs';
import {withGameBrowser} from '../lighting_configurations/capture_baselines/GameBrowser.mjs';
/** @param {any} ctx @param {string} output */
export async function captureReview(ctx,output){
    const started=Date.now();const report=path.join(output,'report');
    await withGameBrowser(ctx,{width:2560,height:1536},async(page,url,browserVersion)=>{
        const errors=[];page.on('pageerror',error=>errors.push(error.message));
        const target=url+'/'+path.relative(ctx.root,path.join(report,'index.html')).split(path.sep).join('/');
        await page.goto(target,{waitUntil:'networkidle'});await page.waitForSelector('#gallery figure img');
        for(const pose of ['pose_01','pose_02','pose_03','pose_04','pose_05']){
            await page.selectOption('#pose',pose);
            for(const index of [0,2,4,6])await page.locator('#gallery figure input').nth(index).check();
            await page.click('#compare');await page.locator('#viewer').waitFor({state:'visible'});
            await page.waitForFunction(()=>[...document.querySelectorAll('#viewer img')].every(img=>img.complete&&img.naturalWidth>0));
            await page.locator('#viewer').screenshot({path:path.join(report,pose+'_daylight_comparison.png')});
            await page.click('#close');
            for(const index of [0,2,4,6])await page.locator('#gallery figure input').nth(index).uncheck();
        }
        await page.selectOption('#pose','pose_03');await page.locator('#gallery figure img').nth(2).click();
        const first=await page.locator('#large img').getAttribute('src');await page.keyboard.press('ArrowRight');const next=await page.locator('#large img').getAttribute('src');
        if(first===next)throw new Error('Viewer keyboard navigation failed');await page.keyboard.press('Escape');
        await page.check('#neutral');if(await page.locator('#gallery h2').filter({hasText:'neutral materials'}).count()!==3)throw new Error('Missing neutral-material rows');
        if(errors.length)throw new Error(errors.join('\n'));
        await writeJson(path.join(report,'viewer_checks.json'),{poseSheets:5,keyboardNavigation:true,neutralRows:3,errors,browserVersion,seconds:(Date.now()-started)/1000});
    });
}
