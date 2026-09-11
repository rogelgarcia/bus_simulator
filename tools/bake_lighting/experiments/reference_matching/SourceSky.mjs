// Convert authenticated calibrated sky radiance to the runtime HDR format.
import path from 'node:path';
import {mkdir,readFile,copyFile} from 'node:fs/promises';
import {writeJson,listFiles} from '../../../baking/Files.mjs';
import {authenticated,receipt,resultFiles} from '../lighting_configurations/StageInputs.mjs';
import {TOOL,outputPath} from './Baseline.mjs';

export async function sourceSky(ctx){
    if(!ctx.options['source-run']||!ctx.options.output)throw new Error('source-run and new output required');
    const source=path.resolve(ctx.root,ctx.options['source-run']),output=outputPath(ctx.root,ctx.options.output);
    await authenticated(path.join(source,'afternoon_receipt.json'));
    const measured=JSON.parse(await readFile(path.join(source,'measurements.json'),'utf8'));
    if(!measured.checks.length||measured.checks.some(c=>!c.passed))throw new Error('Daylight physical checks have not passed');
    const profile=measured.profiles.find(p=>p.id==='E55');
    if(!profile||profile.defaults.sun.angularDiameterDeg!==.53)throw new Error('Expected validated 55-degree finite sun');
    await mkdir(path.dirname(output),{recursive:true});await mkdir(output);
    await writeJson(path.join(output,'request.json'),{source,output,profile});
    await ctx.process(ctx.config.pythonExecutable,[path.join(ctx.root,TOOL,'source_sky.py'),output]);
    const files=await listFiles(output);
    if(ctx.publish){
        const destination=path.join(ctx.root,'assets/public/lighting/calibrated');await mkdir(destination,{recursive:true});
        for(const name of ['clear-afternoon-55.hdr','clear-afternoon-55.json']){const file=path.join(destination,name);await copyFile(path.join(output,name),file);files.push(file);}
    }
    const manifest=path.join(output,'sky_receipt.json');
    return resultFiles(await receipt(manifest,ctx.key,{output,published:ctx.publish},files),manifest);
}
