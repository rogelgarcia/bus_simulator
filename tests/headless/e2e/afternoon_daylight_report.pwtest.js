// Check the rendered comparison's complete image inventory and preserve review screenshots.
import {test,expect} from '@playwright/test';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';

test('Afternoon report compares all five poses at both tones and three elevations',async({page})=>{
    test.skip(!process.env.AFTERNOON_REPORT,'Set AFTERNOON_REPORT to the completed index.html');
    const file=path.resolve(process.env.AFTERNOON_REPORT),output=path.join(path.dirname(file),'qa');await mkdir(output,{recursive:true});
    await page.setViewportSize({width:1920,height:1080});await page.goto(pathToFileURL(file).href);
    await expect(page.locator('.grid')).toHaveCount(10);await expect(page.locator('img')).toHaveCount(30);
    const sizes=await page.locator('img').evaluateAll(async images=>Promise.all(images.map(async img=>{img.loading='eager';await img.decode();return [img.naturalWidth,img.naturalHeight];})));
    expect(sizes.every(v=>v[0]===1920&&v[1]===1080)).toBe(true);
    for(const [pose,index] of [['pose_02',2],['pose_03',4]]){
        await page.locator('.grid').nth(index).screenshot({path:path.join(output,pose+'_aces_comparison.png')});
    }
    await writeFile(path.join(output,'validation.json'),JSON.stringify({images:sizes.length,sizes,poses:5,tones:2,elevations:3},null,2));
});
