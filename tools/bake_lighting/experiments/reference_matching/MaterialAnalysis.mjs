// Reprocess captured pixels independently; no game reload or Blender render is needed.
import path from 'node:path';
import {mkdir,readFile} from 'node:fs/promises';
import {withGameBrowser} from '../lighting_configurations/capture_baselines/GameBrowser.mjs';
import {authenticated,receipt,resultFiles} from '../lighting_configurations/StageInputs.mjs';
import {listFiles} from '../../../baking/Files.mjs';
import {TOOL,outputPath} from './Baseline.mjs';

export async function analyzeMaterialCapture(ctx,input,output) {
    const read=async file=>JSON.parse(await readFile(path.join(input,file),'utf8'));
    const request=await read('request.json'),before=await read('game_before.json'),after=await read('game_after.json');
    await authenticated(path.join(request.input,'comparison_receipt.json'));
    if((await read('browser_errors.json')).length)throw new Error('Capture contains browser errors');
    for(const key of ['actualPose','lighting','atmosphere','graphics','savedSettings','sourceHashes'])
        if(JSON.stringify(before[key])!==JSON.stringify(after[key]))throw new Error('Capture changed '+key);
    for(const state of [before,after])if(state.baked.status.effectiveMode!=='baked'||!state.baked.receiverLightmaps.effective.indirect||state.baked.receiverLightmaps.activationBlend!==1)
        throw new Error('Capture lacks fully applied indirect lighting');
    await ctx.process(ctx.config.pythonExecutable,[path.join(ctx.root,TOOL,'material_analysis.py'),input,output]);
    await withGameBrowser(ctx,{width:2400,height:498},async page=>{
        for(const [name,panels]of Object.entries({ao_comparison:[['combined','Game'],['combined_no_material_ao','Game · material AO off'],['cycles_combined','Cycles']],
            diffuse_comparison:[['diffuse','Game diffuse'],['diffuse_no_material_ao','Game diffuse · material AO off'],['cycles_diffuse','Cycles diffuse']]})){
            const images=await Promise.all(panels.map(async([file,label])=>({label,src:'data:image/png;base64,'+(await readFile(path.join(output,file+'.png'))).toString('base64')})));
            for(const crop of [false,true]){
                await page.setViewportSize({width:2400,height:crop?408:498});
                const style=crop?'width:1335.65px;height:751.30px;max-width:none;transform:translate(-417.4px,0)':'width:800px;height:450px';
                await page.setContent(`<html><style>*{box-sizing:border-box}body{margin:0;background:#12181e;color:#e1e7ec;font:24px Arial;display:flex}section{width:800px;overflow:hidden}header{height:48px;padding:10px 15px}figure{margin:0;height:${crop?360:450}px;overflow:hidden}img{display:block;${style}}</style>${images.map(im=>`<section><header>${im.label}</header><figure><img src="${im.src}"></figure></section>`).join('')}</html>`);
                await page.evaluate(()=>Promise.all([...document.images].map(im=>im.decode())));
                await page.screenshot({path:path.join(output,name+(crop?'_facade':'')+'.png')});
            }
        }
    });
}

export async function materialAnalysis(ctx) {
    if(ctx.publish||!ctx.options.input||!ctx.options.output)throw new Error('input and new output required; diagnostic only');
    const input=outputPath(ctx.root,ctx.options.input),output=outputPath(ctx.root,ctx.options.output);
    await mkdir(path.dirname(output),{recursive:true});await mkdir(output);
    await analyzeMaterialCapture(ctx,input,output);
    const file=path.join(output,'material_analysis_receipt.json');
    return resultFiles(await receipt(file,ctx.key,{input,output,diagnosticOnly:true,publicationEligible:false},[...await listFiles(input),...await listFiles(output)]),file);
}
