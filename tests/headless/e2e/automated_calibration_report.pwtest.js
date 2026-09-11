// Verify the actual calibration report's images, selection and keyboard carousel.
import {test,expect} from '@playwright/test';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';

test('AI567 real report preserves candidate identity across selection, grid and carousel',async({page})=>{
    test.skip(!process.env.AI567_REPORT,'Set AI567_REPORT to the completed report/index.html');
    test.setTimeout(180000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1920,height:1080});
    const file=path.resolve(process.env.AI567_REPORT),directory=path.join(path.dirname(file),'qa');await mkdir(directory,{recursive:true});
    await page.goto(pathToFileURL(file).href);
    const inventory=await page.evaluate(async()=>{
        const rows=[];for(const item of window.calibrationReport.images){const img=new Image();img.src=item.image;await img.decode();rows.push({id:item.id,width:img.naturalWidth,height:img.naturalHeight});}return rows;
    });
    expect(inventory.length).toBeGreaterThan(200);
    for(const pose of ['pose_01','pose_02','pose_03','pose_04','pose_05'])for(const tone of ['aces','agx']){
        await page.locator('#pose').selectOption(pose);await page.locator('#tone').selectOption(tone);await page.locator('#defaults').click();
        await expect(page.locator('#gallery input:checked')).toHaveCount(3);
        await page.locator('#compare').click();await expect(page.locator('#comparison')).toBeVisible();await expect(page.locator('#comparisonImages figure')).toHaveCount(3);
        const fits=await page.evaluate(()=>{const footer=document.querySelector('#comparison footer').getBoundingClientRect();return [...document.querySelectorAll('#comparisonImages figure')].every(f=>f.getBoundingClientRect().bottom<=footer.top);});expect(fits).toBe(true);
        await page.locator('#singleMode').click();await expect(page.locator('#comparisonImages figure')).toHaveCount(1);await expect(page.locator('#comparisonImages figcaption').first()).toContainText('Fresh game');
        await page.locator('#singleMode').blur();await page.keyboard.press('ArrowRight');await expect(page.locator('#comparisonImages figcaption').first()).toContainText('Final');
        await page.locator('#thumbnails button').last().click();await expect(page.locator('#jump')).toHaveValue('2');
        await page.keyboard.press('Escape');await expect(page.locator('#comparison')).not.toBeVisible();
    }
    await page.locator('#pose').selectOption('pose_03');await page.locator('#tone').selectOption('aces');await page.locator('#filter').selectOption('all');
    await expect(page.locator('#gallery figure')).toHaveCount(24);
    await page.locator('#clear').click();await page.locator('#gallery input').nth(1).check();await page.locator('#gallery input').nth(4).check();await page.locator('#compare').click();
    await expect(page.locator('#comparisonImages figure')).toHaveCount(2);await page.keyboard.press('Escape');
    await page.locator('#filter').selectOption('shortlist');
    for(const pose of ['pose_02','pose_03']){
        await page.locator('#pose').selectOption(pose);await page.locator('#defaults').click();await page.locator('#compare').click();
        await page.evaluate(async()=>{await Promise.all([...document.querySelectorAll('#comparisonImages img')].map(i=>i.decode()));});
        await page.screenshot({path:path.join(directory,pose+'_comparison.png')});await page.keyboard.press('Escape');
    }
    expect(errors).toEqual([]);await writeFile(path.join(directory,'validation.json'),JSON.stringify({inventory,errors,poseToneSelections:10,selection:true,carousel:true},null,2));
});
