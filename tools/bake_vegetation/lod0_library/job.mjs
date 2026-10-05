// Publishes validated LOD0 library assets separately from detailed references and city placement.
// @ts-check
import path from 'node:path';
import {mkdir} from 'node:fs/promises';
import {listFiles} from '../../baking/Files.mjs';
import {publishBakeDirectory} from '../../baking/Publication.mjs';
import {packageLod0Library,validateLod0Library} from './Package.mjs';

export const lod0LibraryJob={
    id:'vegetation/lod0-library', description:'Validate and install accepted core-canopy LOD0 models in the opt-in game library', always:true,
    outputs:['assets/public/vegetation_lod0'], defaults:{source:'tests/artifacts/screens/ai591_core_canopies/final'}, options:{source:String},
    async inputs(ctx) {
        const files=await listFiles(path.resolve(ctx.root,ctx.options.source));
        return [...files.filter(file=>/(?:revision\.json|model\.json|compression\.json|_lod0\.glb|reference-(?:sources|material-approximations)\.json)$/.test(file)),
            ...await listFiles(path.join(ctx.root,'tools/bake_vegetation/lod0_library'))];
    },
    async run(ctx) {
        const source=path.resolve(ctx.root,ctx.options.source), relative=path.relative(path.join(ctx.root,'tests/artifacts/screens'),source);
        if(!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('LOD0 library requires a separate reviewed source');
        const directory=path.join(ctx.stage,'library'); await mkdir(directory,{recursive:true});
        await packageLod0Library(source,directory); await ctx.assertInputsStable();
        const result={state:'validated',directory,files:await listFiles(directory)};
        if(ctx.publish) {
            const destination=path.join(ctx.root,'assets/public/vegetation_lod0');
            await publishBakeDirectory(directory,destination); await validateLod0Library({directory:destination});
            result.state='published'; result.files.push(...await listFiles(destination));
        }
        return result;
    },validate:validateLod0Library
};
