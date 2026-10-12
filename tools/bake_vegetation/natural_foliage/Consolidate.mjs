// Authenticates selected reference candidates without copying or replacing their artifacts.
import path from 'node:path';
import {readFile,stat} from 'node:fs/promises';
import {hashFile,writeJson} from '../../baking/Files.mjs';

export async function candidateSelection(root,candidates){
    if(!candidates)throw new Error('Consolidation requires candidate directories in selection order');
    const base=path.join(root,'tests/artifacts/screens/vegetation_natural_foliage');
    const selected=new Map(),inputs=[];
    for(const directory of candidates.split(',').map(value=>path.resolve(root,value))){
        const relative=path.relative(base,directory);
        if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Candidate must be a natural-foliage artifact directory');
        const file=path.join(directory,'summary.json'),report=JSON.parse(await readFile(file,'utf8'));
        inputs.push(file);
        for(const model of report.models)selected.set(model.id,{directory,model,report});
    }
    for(const {directory,model,report} of selected.values()){
        const file=path.resolve(directory,model.file);
        inputs.push(file,path.join(path.dirname(file),'model.json'),path.join(path.dirname(file),'shoots.json'));
        inputs.push(...report.renders.filter(row=>row.id===model.id).map(row=>path.resolve(directory,row.file)));
    }
    return {selected,inputs:[...new Set(inputs)]};
}

export async function consolidate(options){
    const {selected}=await candidateSelection(options.root,options.candidates);
    const report={revision:'natural-shoots-v1',sourceSha256:options.sourceSha256,models:[],renders:[]};
    const target=path.join(options.output,'summary.json');
    if(await stat(target).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;}))throw new Error('Preserve existing consolidation: use a new output directory');
    const relative=file=>path.relative(options.output,file).replaceAll('\\','/');
    for(const id of options.models){
        const entry=selected.get(id);
        if(!entry)throw new Error('Missing reference candidate: '+id);
        const {directory,model,report:source}=entry,file=path.resolve(directory,model.file);
        const saved=JSON.parse(await readFile(path.join(path.dirname(file),'model.json'),'utf8'));
        if(source.sourceSha256!==options.sourceSha256||model.sourceSha256!==options.sourceSha256||
            !model.woodPreserved||!model.leafShellsPreserved||!model.rootSeating?.onlyRootsChanged||!model.rootSeating.attachmentsVerified||
            JSON.stringify(saved)!==JSON.stringify(model)||(await hashFile(file)).sha256!==model.sha256)throw new Error('Unauthenticated reference candidate: '+id);
        report.models.push({...model,file:relative(file),shoots:relative(path.join(path.dirname(file),'shoots.json')),
            candidate:relative(path.join(directory,'summary.json'))});
        const renders=source.renders.filter(row=>row.id===id);
        if(id.endsWith('/mature_01')&&renders.length!==16)throw new Error('Candidate requires all paired views: '+id);
        report.renders.push(...renders.map(row=>({...row,file:relative(path.resolve(directory,row.file))})));
    }
    await writeJson(target,report);
}
