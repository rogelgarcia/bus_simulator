// Verify independent tone controls, native baseline menus and keyboard carousel ordering.
import {test,expect} from '@playwright/test';
import {buildGallery} from '../../../tools/bake_lighting/experiments/lighting_configurations/report/Gallery.mjs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';

test('Lighting gallery keeps AgX look local and navigates baseline before tones',async({page})=>{
    const images=[],pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    for(const quality of ['pilot','final']){
        for(const gameTone of ['aces','agx','neutral'])for(const gameGrade of ['off','vivid','warm','cool'])images.push({id:`${quality}_${gameTone}_${gameGrade}`,pose:'pose_01',light:'G01',quality,gameTone,gameGrade,file:pixel,width:1920,height:1080});
        for(const transform of ['T0','T1','T2'])for(const exposureStops of [-1,-.5,0,.5,1])for(const grade of transform==='T1'?['neutral','warm','cool','restrained','soft_contrast']:['neutral'])images.push({id:`${quality}_${transform}_${exposureStops}_${grade}`,pose:'pose_01',light:'L01',quality,transform,exposureStops,grade,file:pixel,width:1920,height:1080});
    }
    await page.route('https://fonts.googleapis.com/**',route=>route.abort());
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setContent(await buildGallery({runId:'test',poses:[{id:'pose_01',busId:'bus_01'}],lights:[{id:'L01',label:'Clear daylight'}],images}));
    await page.evaluate(async()=>{await Promise.all([...document.images].map(image=>image.decode()));});
    await expect(page.locator('.tone-panel')).toHaveCount(3);
    await expect(page.locator('.tone-panel[data-tone="T1"] select')).toHaveCount(1);
    await expect(page.locator('.tone-panel[data-tone="T0"] select,.tone-panel[data-tone="T2"] select')).toHaveCount(0);
    const slider=page.getByRole('slider',{name:'ACESFilmic exposure'});await expect(slider).toHaveAttribute('step','.5');await slider.fill('0.5');
    await expect(page.locator('.image-row [data-tone="T0"] figcaption')).toContainText('+0.5 EV');
    await expect(page.locator('.image-row [data-tone="T1"] figcaption')).toContainText('0.0 EV');
    await page.getByLabel('AgX look',{exact:true}).selectOption('warm');
    await expect(page.locator('.image-row [data-tone="T1"] figcaption')).toContainText('Warm');
    await page.locator('#baseline-tone').selectOption('neutral');await page.locator('#baseline-grade').selectOption('cool');
    await expect(page.locator('.baseline-row figcaption')).toContainText('neutral · cool');
    await expect(page.locator('.image-row [data-tone="T0"] figcaption')).toContainText('+0.5 EV');
    await page.locator('.image-row [data-tone="T1"] button').click();
    await expect(page.locator('#viewer')).toBeVisible();await expect(page.locator('#viewer-title')).toContainText('L01');
    await page.keyboard.press('ArrowLeft');await expect(page.locator('#viewer-detail')).toContainText('ACESFilmic · +0.5 EV');
    await page.keyboard.press('ArrowLeft');await expect(page.locator('#viewer-title')).toContainText('Game reference');
    await expect(page.locator('#viewer-detail')).toContainText('neutral · cool');
    await expect(page.getByRole('button',{name:'Previous image',exact:true})).toBeDisabled();
    await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');
    await expect(page.locator('#viewer-detail')).toContainText('ACES 2.0');await page.keyboard.press('Escape');await expect(page.locator('#viewer')).not.toBeVisible();
    await page.locator('#quality').selectOption('pilot');await expect(page.locator('.image-row [data-tone="T1"] figcaption')).toContainText('Warm');
    expect(errors).toEqual([]);
});

test('Generated lighting gallery loads real matrices and retains sticky controls',async({page})=>{
    test.skip(!process.env.AI560_GALLERY,'Set AI560_GALLERY to a completed report/index.html');
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setViewportSize({width:1920,height:1080});
    await page.goto(pathToFileURL(path.resolve(process.env.AI560_GALLERY)).href);
    await expect(page.locator('.pose-group')).toHaveCount(5);
    await expect(page.locator('.image-row')).toHaveCount(15);
    await page.locator('#pose').selectOption('pose_01');
    const results=[];
    for(const quality of ['final','pilot']){
        await page.locator('#quality').selectOption(quality);
        await expect(page.locator('.image-row')).toHaveCount(quality==='final'?3:6);
        for(const grade of ['neutral','warm','cool','restrained','soft_contrast']){await page.getByLabel('AgX look',{exact:true}).selectOption(grade);await expect(page.locator('.missing')).toHaveCount(0);}
        for(const tone of ['ACESFilmic','AgX','ACES 2.0'])for(const ev of ['-1','-0.5','0','0.5','1']){await page.getByRole('slider',{name:`${tone} exposure`,exact:true}).fill(ev);await expect(page.locator('.missing')).toHaveCount(0);}
        for(const tone of ['aces','agx','neutral'])for(const grade of ['vivid','off','warm','cool']){await page.locator('#baseline-tone').selectOption(tone);await page.locator('#baseline-grade').selectOption(grade);await expect(page.locator('.baseline-row .missing')).toHaveCount(0);}
        await page.evaluate(async()=>{await Promise.all([...document.querySelectorAll('main img')].map(image=>{image.loading='eager';return image.decode();}));});
        results.push({quality,rows:await page.locator('.image-row').count()});
    }
    await page.locator('#quality').selectOption('final');await page.locator('#baseline-tone').selectOption('aces');await page.locator('#baseline-grade').selectOption('vivid');await page.getByLabel('AgX look',{exact:true}).selectOption('neutral');
    for(const tone of ['ACESFilmic','AgX','ACES 2.0'])await page.getByRole('slider',{name:`${tone} exposure`,exact:true}).fill('0');
    await page.evaluate(()=>scrollTo(0,700));const header=await page.locator('#tone-settings').boundingBox();expect(header.y).toBeGreaterThanOrEqual(-1);expect(header.y).toBeLessThan(2);
    const directory=path.resolve('tests/artifacts/screens/illumination_560/gallery_qa');await mkdir(directory,{recursive:true});
    await page.screenshot({path:path.join(directory,'sticky-columns.png')});
    await page.locator('.image-row [data-tone="T1"] button').first().click();await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowLeft');await expect(page.locator('#viewer-title')).toContainText('Game reference');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');
    await page.locator('#viewer-image').evaluate(image=>image.decode());await page.screenshot({path:path.join(directory,'carousel.png')});await page.keyboard.press('Escape');
    expect(errors).toEqual([]);await writeFile(path.join(directory,'validation.json'),JSON.stringify({results,errors,stickyTop:header.y,baselineCombinations:24,controls:'three independent EV sliders; AgX-only look; ordered carousel'},null,2));
});
