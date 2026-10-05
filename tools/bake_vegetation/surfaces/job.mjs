// Authenticates scan sources and stages a separate, editable surface revision for review.
// @ts-check
import path from 'node:path';
import { readFile, mkdir, copyFile, cp } from 'node:fs/promises';
import { listFiles, hashFile, writeJson } from '../../baking/Files.mjs';
import { bakeOption } from '../../baking/Options.mjs';
import { runHeadlessBake } from '../../baking/Blender.mjs';
import { writeGallery } from '../showcase/Gallery.mjs';

const TOOL = 'tools/bake_vegetation/surfaces';
const width = value => { const n=Number(value); if (!Number.isInteger(n)||n<640||n>3840||n%16) throw new Error('Invalid render width'); return n; };
export const surfacesJob = {
    id:'vegetation/surfaces', blender:true, always:true, configurationPaths:['executable','renderDevice'],
    description:'Rebuild 15 mature review specimens with photographic bark relief and solid scan-textured leaves',
    defaults:{phase:'all',width:2560,samples:128,views:'all'},
    options:{phase:bakeOption.choice(['all','build','render','leaves']),width,samples:bakeOption.samples,device:bakeOption.device,views:String,scene:String},
    async inputs(ctx) {
        const files=(await listFiles(path.join(ctx.root,'tools/bake_vegetation'))).filter(file=>/\.(py|mjs|json)$/.test(file));
        const catalog=JSON.parse(await readFile(path.join(ctx.root,TOOL,'sources.json'),'utf8'));
        for(const source of Object.values(catalog.sources)) for(const map of Object.values(source.maps)) files.push(path.join(ctx.root,map.file));
        const recipes=JSON.parse(await readFile(path.join(ctx.root,TOOL,'recipes.json'),'utf8'));
        for(const species of Object.keys(recipes)) files.push(path.join(ctx.root,'assets/public/vegetation',species,'index.json'));
        files.push(...['basecolor.jpg','normal_gl.png','arm.png'].map(file=>path.join(ctx.root,'assets/public/pbr/brown_mud',file)));
        files.push(path.join(ctx.root,'assets/public/lighting/hdri/kloofendal_43d_clear_puresky_4k.hdr'));
        if(['render','leaves'].includes(ctx.options.phase)) {
            if(!ctx.options.scene) throw new Error('render requires scene=<validated scene directory>');
            files.push(path.resolve(ctx.root,ctx.options.scene,'scene.json'),path.resolve(ctx.root,ctx.options.scene,'mature_tree_arboretum.blend'));
            if(ctx.options.phase==='leaves') files.push(...await listFiles(path.resolve(ctx.root,ctx.options.scene,'pbr')));
        }
        return files;
    },
    async run(ctx) {
        if(ctx.publish) throw new Error('Surface review cannot replace published game assets');
        const directory=path.join(ctx.root,'tests/artifacts/screens/ai586_photo_pbr',`run-${Date.now()}`);
        await mkdir(directory,{recursive:true});
        const source=ctx.options.phase==='render'?path.resolve(ctx.root,ctx.options.scene):directory;
        const catalog=JSON.parse(await readFile(path.join(ctx.root,TOOL,'sources.json'),'utf8'));
        for(const entry of Object.values(catalog.sources)) for(const map of Object.values(entry.maps)) {
            const actual=await hashFile(path.join(ctx.root,map.file));
            if(actual.sha256!==map.sha256||actual.bytes!==map.bytes) throw new Error('Scan authentication failed: '+map.file);
        }
        const previous=ctx.env;ctx.env={...ctx.env,OMP_NUM_THREADS:'4',OPENBLAS_NUM_THREADS:'2',TBB_NUM_THREADS:'4'};
        try {
            if(ctx.options.phase!=='render') {
                if(ctx.options.phase==='leaves') {
                    const previousScene=path.resolve(ctx.root,ctx.options.scene);
                    await cp(path.join(previousScene,'pbr'),path.join(source,'pbr'),{recursive:true});
                    await runHeadlessBake(ctx,TOOL+'/releaf.py',[previousScene,source]);
                } else await runHeadlessBake(ctx,TOOL+'/build.py',[ctx.root,source]);
                await copyFile(path.join(ctx.root,TOOL,'sources.json'),path.join(source,'sources.json'));
                await copyFile(path.join(ctx.root,TOOL,'recipes.json'),path.join(source,'material-approximations.json'));
            }
            const manifest=JSON.parse(await readFile(path.join(source,'scene.json'),'utf8'));
            if(manifest.schema!=='vegetation-cycles-showcase-v3'||manifest.inventory.length!==15||manifest.views.length!==26||manifest.plots.length!==5) throw new Error('Incomplete photo PBR scene');
            for(const model of manifest.inventory) {
                if(model.barkAppearance.revision!=='photographic-pbr-v1'||!model.closedLeafShells||model.sourceBoundsErrorMetres>2e-5
                    ||model.woodyDetail.boundaryEdges||model.woodyDetail.nonManifoldEdges||model.woodyDetail.syntheticSurfaceNoise!==false) throw new Error('Invalid photo PBR specimen');
            }
            if(!['build','leaves'].includes(ctx.options.phase)) {
                const views=ctx.options.views==='all'?manifest.views.map(v=>v.id):ctx.options.views.split(',');
                if(new Set(views).size!==views.length||views.some(id=>!manifest.views.some(v=>v.id===id))) throw new Error('Invalid camera selection');
                const options={...ctx.options,device:ctx.options.device??ctx.config.renderDevice};
                const optionFile=path.join(directory,'render-options.json');await writeJson(optionFile,options);
                await runHeadlessBake(ctx,'tools/bake_vegetation/showcase/render.py',[source,directory,optionFile]);
                const report=JSON.parse(await readFile(path.join(directory,'renders.json'),'utf8'));
                if(report.renders.length!==views.length||report.engine!=='CYCLES') throw new Error('Incomplete render set');
                const hashes=new Set();
                for(const render of report.renders) {
                    const file=path.join(directory,render.file),png=await readFile(file),hash=await hashFile(file);
                    if(png.readUInt32BE(16)!==options.width||png.readUInt32BE(20)!==options.width*9/16||hashes.has(hash.sha256)) throw new Error('Invalid or duplicate evidence');
                    hashes.add(hash.sha256);
                }
                await writeGallery(directory,source,manifest,report);
            }
        } finally {ctx.env=previous;}
        await ctx.assertInputsStable();
        ctx.log.line(ctx.id,`Photo PBR scene: ${source}; evidence: ${directory}`);
        return {state:'validated',directory,scene:source,files:await listFiles(directory)};
    }
};
