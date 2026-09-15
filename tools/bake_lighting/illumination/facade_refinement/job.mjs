// Explicit, read-only city memory planning before optional facade rebaking.
import path from 'node:path';
import {mkdir} from 'node:fs/promises';
import {listFiles} from '../../../baking/Files.mjs';
const TOOL='tools/bake_lighting/illumination/facade_refinement';
export const facadePlanJob={
    id:'lighting/illumination/facade-plan',description:'Plan complete 8.25cm opaque facades inside the existing atlas budget',
    always:true,configurationPaths:[],codePaths:[TOOL,'src/app/illumination'],options:{input:String,layout:String,output:String},
    inputs:async ctx=>{
        if(!ctx.options.input||!ctx.options.layout||!ctx.options.output)throw new Error('input, layout and new output required');
        return ['job.json','atlas.json','source.bsib'].map(name=>path.resolve(ctx.root,ctx.options.input,name)).concat(path.resolve(ctx.root,ctx.options.layout),
            (await listFiles(path.join(ctx.root,'src/app/illumination'))).filter(file=>file.endsWith('.js')));
    },
    async run(ctx){
        if(ctx.publish||!ctx.options.input||!ctx.options.layout||!ctx.options.output)throw new Error('input, layout and new output required; plan cannot publish');
        const output=path.resolve(ctx.root,ctx.options.output);
        if(!output.startsWith(path.join(ctx.root,'tests/artifacts/screens')+path.sep))throw new Error('Plan outputs must remain under tests/artifacts/screens');
        await mkdir(output);
        await ctx.process(process.execPath,['--max-old-space-size=8192',path.join(ctx.root,TOOL,'Plan.mjs'),
            path.resolve(ctx.root,ctx.options.input),path.resolve(ctx.root,ctx.options.layout),output]);
        return {state:'validated',output,files:await listFiles(output)};
    }
};
