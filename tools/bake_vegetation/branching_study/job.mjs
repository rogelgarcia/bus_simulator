// Stages a reproducible 2D architecture study without touching the enhanced 3D assets.
import path from 'node:path';
import {mkdir,copyFile,writeFile,readFile,stat} from 'node:fs/promises';
import {listFiles,hashFile,writeJson} from '../../baking/Files.mjs';
import {generate,presets} from './model.mjs';
import {species} from './species.mjs';
import {svg} from './draw.mjs';
import {within,referenceImage,readStudies} from './references.mjs';
import {createReview} from './review.mjs';
import {withBakeBrowser} from '../../baking/Browser.mjs';
const TOOL='tools/bake_vegetation/branching_study';
const pageFiles=['index.html','study.css','app.mjs','help.mjs','help-popup.mjs','model.mjs','architecture.mjs','ramification.mjs','support.mjs','roots.mjs','parameters.mjs','species.mjs','geometry.mjs','draw.mjs','review.css'];
export const branchingStudyJob={
    id:'vegetation/branching-study',description:'Shared V2 species architecture, authenticated references and three-seed SVG/Chromium review',
    always:true,configurationPaths:['browserExecutable'],codePaths:[TOOL],
    defaults:{reference:'',studies:'','complete-studies':'',output:'tests/artifacts/screens/vegetation_branching_study/review'},
    options:{reference:String,studies:String,'complete-studies':String,output:String},
    async inputs(ctx){
        if(!ctx.options.reference)throw Error('Supply the user branching reference');
        const refs=[...await readStudies(ctx.root,ctx.options.studies),...await readStudies(ctx.root,ctx.options['complete-studies'])];
        return [path.resolve(ctx.root,ctx.options.reference),...['studies','complete-studies'].filter(key=>ctx.options[key]).map(key=>path.resolve(ctx.root,ctx.options[key])),...refs.map(r=>r.file),...await listFiles(path.join(ctx.root,TOOL))];
    },
    async run(ctx){
        if(ctx.publish)throw Error('2D studies cannot publish vegetation assets');
        const output=path.resolve(ctx.root,ctx.options.output),reference=path.resolve(ctx.root,ctx.options.reference);
        if(!within(path.join(ctx.root,'tests/artifacts/screens/vegetation_branching_study'),output)||within(output,reference))throw Error('Use isolated study output');
        const referenceIdentity=await referenceImage(reference),referenceName='reference'+referenceIdentity.extension;
        const refs=await readStudies(ctx.root,ctx.options.studies),complete=await readStudies(ctx.root,ctx.options['complete-studies']);
        if([...refs,...complete].some(row=>within(output,row.file)))throw Error('Keep supplied references outside the bake output');
        if(await stat(path.join(output,'manifest.json')).catch(error=>{if(error.code!=='ENOENT')throw error;return null;}))throw Error('Preserve the existing review; choose a new output');
        await mkdir(output,{recursive:true});
        const study=generate(presets.american_elm);if(!study.audit.passed)throw Error('Invalid default branch structure');
        for(const name of pageFiles)await copyFile(path.join(ctx.root,TOOL,name),path.join(output,name));
        await writeFile(path.join(output,'index.html'),(await readFile(path.join(output,'index.html'),'utf8')).replaceAll('reference.png',referenceName));
        await copyFile(reference,path.join(output,referenceName));
        await writeJson(path.join(output,'default-graph.json'),study);
        await writeFile(path.join(output,'default-tree.svg'),svg(study.paths,{roots:study.roots,soil:true}));
        const input=await hashFile(reference),copy=await hashFile(path.join(output,referenceName));
        if(input.sha256!==copy.sha256)throw Error('Reference copy changed');
        const files=[];
        const extra=[],images={},presetAudits={};
        await mkdir(path.join(output,'presets'),{recursive:true});await mkdir(path.join(output,'references'),{recursive:true});
        for(const row of refs){
            const name=`references/${row.id}${row.extension}`;await copyFile(row.file,path.join(output,name));extra.push(name);
            if((await hashFile(path.join(output,name))).sha256!==row.sha256)throw Error('Reference copy changed: '+row.id);
            images[row.id]={file:name,caption:'Supplied newer visual reference · '+species[row.id].name,source:row.file,originalSource:row.originalSource,sha256:row.sha256};
        }
        for(const row of complete){
            const name=`references/${row.id}-complete${row.extension}`;await copyFile(row.file,path.join(output,name));extra.push(name);
            if((await hashFile(path.join(output,name))).sha256!==row.sha256)throw Error('Complete study copy changed: '+row.id);
            const image={file:name,caption:'Supplied complete silhouette study',source:row.file,originalSource:row.originalSource,sha256:row.sha256};
            if(images[row.id])images[row.id].complete=image;else images[row.id]=image;
        }
        for(const id of Object.keys(species)){
            const graph=generate(presets[id]);if(!graph.audit.passed||graph.stopped.budget||graph.roots.stopped.budget)throw Error('Invalid species starting point: '+id);
            presetAudits[id]={...graph.audit,branches:graph.paths.length,rootAxes:graph.roots.paths.length};
            await writeJson(path.join(output,`presets/${id}.json`),graph);await writeFile(path.join(output,`presets/${id}.svg`),svg(graph.paths,{roots:graph.roots,soil:true}));
            extra.push(`presets/${id}.json`,`presets/${id}.svg`);
        }
        const comparison=await createReview(output,images);extra.push(...comparison.files);
        await writeJson(path.join(output,'study-data.json'),{images,presetAudits,reference:referenceName,seeds:comparison.records});
        const browser=await withBakeBrowser(ctx,{width:1800,height:1200},async(page,url,version)=>{
            const errors=[];page.on('pageerror',error=>errors.push(error.message));
            const route='/'+path.relative(ctx.root,output).split(path.sep).join('/');
            await page.goto(url+route+'/comparison.html');
            await page.locator('img').evaluateAll(async images=>{for(const image of images){image.loading='eager';await image.decode();}});
            for(const id of Object.keys(species)){
                const name=`comparisons/${id}-review.png`;await page.locator('#'+id).screenshot({path:path.join(output,name)});extra.push(name);
            }
            await page.goto(url+route+'/ramification.html');
            await page.locator('img').evaluateAll(async images=>{for(const image of images){image.loading='eager';await image.decode();}});
            for(const id of Object.keys(species)){
                const name=`comparisons/${id}-levels.png`;await page.locator('#'+id).screenshot({path:path.join(output,name)});extra.push(name);
            }
            await page.goto(url+route+'/index.html');await page.waitForFunction(()=>window.branchStudy?.audit.passed);
            const editorSettings=await page.evaluate(()=>window.branchStudy.settings);
            if(JSON.stringify(editorSettings)!==JSON.stringify(study.settings))throw Error('Editor controls changed the baked preset');
            await page.locator('.reference img').evaluateAll(async images=>{await Promise.all(images.map(image=>image.decode()));});
            await page.screenshot({path:path.join(output,'editor.png'),fullPage:true});extra.push('editor.png');
            if(errors.length)throw Error('Study browser errors: '+errors.join('; '));
            return {engine:'Chromium SVG rasterization',version,viewport:{width:1800,height:1200},errors};
        });
        for(const name of [...pageFiles,referenceName,'default-graph.json','default-tree.svg','study-data.json',...extra])files.push({name,...await hashFile(path.join(output,name))});
        await writeJson(path.join(output,'manifest.json'),{format:'vegetation-branching-study',version:2,codeIdentity:ctx.key,browser,referenceUsage:images,seedAudits:comparison.records,source:{file:reference,...input},files,audit:study.audit,presetAudits});
        await ctx.assertInputsStable();
        return {state:'validated',directory:output,files:await listFiles(output)};
    },
    async validate(result){
        const manifest=JSON.parse(await readFile(path.join(result.directory,'manifest.json'),'utf8'));
        if(!manifest.audit.passed||Object.values(manifest.seedAudits).some(rows=>rows.length<3||rows.some(row=>!row.audit.passed||row.stopped.budget)))throw Error('Invalid branch study');
        for(const row of manifest.files)if((await hashFile(path.join(result.directory,row.name))).sha256!==row.sha256)throw Error('Study artifact changed');
    }
};
