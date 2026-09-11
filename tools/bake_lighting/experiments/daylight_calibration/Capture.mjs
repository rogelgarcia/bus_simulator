// @ts-check
// Capture disposable native fixtures without changing the player's lighting or bake state.
import path from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {writeJson,hashFile} from '../../../baking/Files.mjs';
import {withGameBrowser} from '../lighting_configurations/capture_baselines/GameBrowser.mjs';
/** @param {any} ctx @param {string} output @param {any} request */
export async function captureGame(ctx,output,request){
    const start=Date.now(),directory=path.join(output,'game',ctx.key.slice(0,16)+'-'+start);await mkdir(directory,{recursive:true});
    const old=await readFile(path.join(output,'game.json')).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
    if(old)await writeFile(path.join(directory,'previous_game_manifest.json'),old);
    const daylight=JSON.parse(await readFile(path.join(output,'daylight.json'),'utf8'));
    await withGameBrowser(ctx,{width:512,height:512},async(page,url,browserVersion)=>{
        const errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.goto(url+'/tests/headless/harness/index.html',{waitUntil:'load'});await page.waitForFunction(()=>!!window.__testHooks);
        const records=[];
        for(const profile of daylight.profiles){
            const jobs=['sun','sky','combined'].flatMap(mode=>['horizontal','east','north'].map(kind=>({mode,kind})));
            jobs.push({mode:'combined',kind:'spheres'});
            if(profile.model==='atmosphere')jobs.push(...['shadow_near','shadow_far'].map(kind=>({mode:'sun',kind})));
            if(profile.id==='D01')jobs.push({mode:'legacy_hemi',kind:'horizontal'});
            for(const item of jobs){
                const result=await page.evaluate(async options=>{await window.__testHooks.loadScenario('daylight_calibration',options);return window.__testHooks.getMetrics();},
                    {...item,profile,exposure:daylight.exposureMultiplier,skyUrl:url+'/'+path.relative(ctx.root,profile.skyFile).split(path.sep).join('/')});
                const m=result.scenario??result;if(!m.linearRgbaFloat32)throw new Error('Native fixture produced no pixels');
                const raw=path.join(directory,m.id+'.rgba32f'),png=path.join(directory,m.id+'.png');
                await writeFile(raw,Buffer.from(m.linearRgbaFloat32,'base64'));await writeFile(png,Buffer.from(m.png.split(',')[1],'base64'));
                const {linearRgbaFloat32,png:ignored,...metadata}=m;records.push({...metadata,...item,profile:profile.id,raw,png,...await hashFile(raw)});
            }
        }
        if(errors.length)throw new Error(errors.join('\n'));
        const result={schemaVersion:1,records,seconds:(Date.now()-start)/1000,browserVersion,errors};
        await writeJson(path.join(directory,'manifest.json'),result);await writeJson(path.join(output,'game.json'),result);
    });
}
