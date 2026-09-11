// One reproducible hypothesis iteration; immutable stage receipts authenticate resumable work.
import path from 'node:path';
import {mkdir,access,readFile} from 'node:fs/promises';
import {capture} from './Capture.mjs';
import {reference} from './Reference.mjs';
import {review} from './Review.mjs';
import {outputPath,TOOL} from './Baseline.mjs';
import {authenticated,receipt,resultFiles} from '../lighting_configurations/StageInputs.mjs';
import {sourceFiles,snapshotFiles} from '../lighting_configurations/Inputs.mjs';
import {writeJson,hashFile,digest} from '../../../baking/Files.mjs';
import {candidateInputs} from './CandidateInputs.mjs';

export async function productionWorkflow(ctx) {
    const validatedCandidate = await candidateInputs(ctx);
    return workflow({...ctx, validatedCandidate});
}

export async function workflow(ctx){
    if(ctx.publish||!ctx.options.output||!ctx.options['source-run']||!ctx.options.baseline)throw new Error('Specify new iteration output, calibrated source-run and preserved baseline; publication is separate');
    const output=outputPath(ctx.root,ctx.options.output);await mkdir(output,{recursive:true});
    const signature=digest({source:await snapshotFiles(ctx.root,await sourceFiles(ctx.root)),candidate:ctx.validatedCandidate?.files,sky:await hashFile(path.resolve(ctx.root,ctx.options['source-run'],'afternoon_receipt.json')),options:ctx.options,review:await hashFile(path.join(ctx.root,TOOL,'review.json'))});
    const plan=path.join(output,'plan.json'),exists=async file=>access(file).then(()=>true,()=>false);
    if(await exists(plan)){
        const previous=JSON.parse(await readFile(plan,'utf8'));if(previous.signature!==signature)throw new Error('Inputs changed: keep previous images and choose a new iteration directory');
    }else await writeJson(plan,{signature,options:ctx.options,createdAt:new Date().toISOString()});
    const start=Date.now(),steps=[];
    const run=async(name,receiptName,action,options)=>{
        const folder=path.join(output,name),file=path.join(folder,receiptName),t=Date.now();
        let reused=false;
        if(await exists(file)){await authenticated(file);reused=true;}
        else {if(await exists(folder))throw new Error('Interrupted stage preserved at '+folder+'; use a new iteration');await action({...ctx,options:{...ctx.options,...options,output:folder}});}
        steps.push({name,seconds:(Date.now()-t)/1000,reused,receipt:file});await writeJson(path.join(output,'progress.json'),steps);
        return folder;
    };
    const game=await run('game','capture_receipt.json',capture,{mode:ctx.options.mode??'current'});
    const rendered=await run('reference','reference_receipt.json',reference,{capture:game,mode:ctx.options['blender-mode']??'headed'});
    const gallery=await run('review','review_receipt.json',review,{reference:rendered,iterations:[ctx.options.baseline,ctx.options.history,game].filter(Boolean).join(',')});
    const file=path.join(output,'workflow_receipt.json');return resultFiles(await receipt(file,ctx.key,{output,gallery,seconds:(Date.now()-start)/1000,steps},[plan,...steps.map(s=>s.receipt)]),file);
}
