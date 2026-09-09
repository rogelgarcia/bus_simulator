// Capture the offline comparison page; this browser never opens the game or uses its profile.
import {chromium} from 'playwright';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';

const request=JSON.parse(await readFile(process.argv[2],'utf8'));
const browser=await chromium.launch({executablePath:request.browserExecutable,headless:true,args:['--disable-gpu']});
try{
    const page=await browser.newPage({viewport:{width:1648,height:1000},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(pathToFileURL(path.join(request.report,'index.html')).href);
    await page.evaluate(()=>document.body.classList.add('sheet-mode'));
    for(const pose of request.poses){
        await page.locator('#pose').selectOption(pose);
        await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(img=>img.closest('main')).map(img=>{img.loading='eager';return img.decode();}));});
        await page.locator('.pose').screenshot({path:path.join(request.report,pose+'_comparison.png'),timeout:60000});
        await page.evaluate(()=>{for(const grid of document.querySelectorAll('.grid'))if(!['S01','S02'].includes(grid.querySelector('img').dataset.light)){grid.previousElementSibling.remove();grid.remove();}});
        await page.locator('.pose').screenshot({path:path.join(request.report,pose+'_source_vs_2x.png'),timeout:60000});
    }
    await page.evaluate(()=>document.body.classList.remove('sheet-mode'));
    await page.locator('#pose').selectOption(request.poses.includes('pose_02')?'pose_02':request.poses[0]);
    await page.locator('#aces-ev').fill('0.5');await page.locator('#aces-ev').dispatchEvent('input');
    if(await page.locator('#aces-value').textContent()!=='+0.50 EV')throw new Error('ACES slider did not update');
    if(await page.locator('#agx-value').textContent()!=='0.00 EV')throw new Error('Tone exposure controls are coupled');
    await page.locator('#mode').selectOption('fixed');
    if(!await page.locator('#aces-ev').isDisabled())throw new Error('Fixed exposure must disable compensation offset');
    await page.locator('.tile img').first().click();
    await page.keyboard.press('ArrowRight');
    if(!(await page.locator('#caption').textContent()).includes('AgX'))throw new Error('Carousel keyboard navigation failed');
    await page.keyboard.press('Escape');
    if(await page.locator('#lightbox').isVisible())throw new Error('Carousel did not close');
    if(errors.length)throw new Error(errors.join('; '));
    console.log('AI563_SHEETS_COMPLETE='+request.poses.length+'; gallery interaction checks passed');
}finally{await browser.close();}
