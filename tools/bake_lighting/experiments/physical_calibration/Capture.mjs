// Records native linear pixels and display vectors from the deterministic game harness.
// @ts-check
import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {writeJson,hashFile} from '../../../baking/Files.mjs';
import {withGameBrowser} from '../lighting_configurations/capture_baselines/GameBrowser.mjs';

/** @param {any} ctx @param {string} output @param {any} defaults */
export async function captureGame(ctx,output,defaults){
    const started=Date.now(),directory=path.join(output,'game');await mkdir(directory,{recursive:true});
    return withGameBrowser(ctx,{width:defaults.width,height:defaults.width},async(page,url,browserVersion)=>{
        const errors=[];page.on('pageerror',e=>errors.push(e.message));
        page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
        await page.goto(url+'/tests/headless/harness/index.html',{waitUntil:'load'});
        await page.waitForFunction(()=>!!window.__testHooks);
        const records=[];
        for(const fixture of [...defaults.fixtures,null]){
            const start=Date.now();
            const result=await page.evaluate(async options=>{
                await window.__testHooks.loadScenario('physical_lighting_calibration',options);
                return window.__testHooks.getMetrics();
            },{fixture,width:defaults.width,orthoScale:defaults.orthoScale,vectors:fixture?null:defaults.vectors});
            const metrics=result.scenario??result;
            if(!metrics.linearRgbaFloat32)throw new Error('Missing native raw capture: '+JSON.stringify(Object.keys(result)));
            const raw=path.join(directory,metrics.id+'.rgba32f'),png=path.join(directory,metrics.id+'.png');
            await writeFile(raw,Buffer.from(metrics.linearRgbaFloat32,'base64'));
            await writeFile(png,Buffer.from(metrics.png.split(',')[1],'base64'));
            const toneFile=path.join(directory,'three_tonemapping.glsl');
            await writeFile(toneFile,metrics.shaderToneSource);
            const {linearRgbaFloat32,png:ignored,shaderToneSource,...metadata}=metrics;
            records.push({...metadata,raw,png,rawHash:await hashFile(raw),pngHash:await hashFile(png),toneHash:await hashFile(toneFile),seconds:(Date.now()-start)/1000});
            ctx.log.line(ctx.id,'Captured '+metadata.id);
        }
        await page.evaluate(()=>window.__testHooks.unloadScenario());
        if(errors.length)throw new Error('Native capture errors: '+errors.join('\n'));
        const result={schemaVersion:1,records,browserVersion,seconds:(Date.now()-started)/1000,errors};
        await writeJson(path.join(output,'game.json'),result);
        return result;
    });
}
