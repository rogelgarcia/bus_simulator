// Authenticated on-disk handoffs for independent experiment stages.
import path from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import { readJson, verifyFiles, TOOL, ARTIFACTS } from './Inputs.mjs';
import { digest, hashFile, writeJson } from '../../../baking/Files.mjs';

export function artifactPath(root, value) {
    const resolved=path.resolve(root,value),base=path.join(root,ARTIFACTS);
    if(!resolved.startsWith(base+path.sep))throw new Error(`Experiment output/input must stay under ${base}`);
    return resolved;
}
export async function loadRun(ctx) {
    const explicit=ctx.options.run;
    if(!explicit)throw new Error('This standalone stage requires --set lighting/experiments/configurations:run=tests/artifacts/screens/illumination_560/runs/<run-id>');
    const root=artifactPath(ctx.root,explicit);
    const run=await readJson(path.join(root,'inputs/prepared.json'));
    if(run.schemaVersion!==1 || path.resolve(run.runRoot)!==root)throw new Error('Prepared run path/schema mismatch');
    await verifyFiles(ctx.root,[...run.source.files,...run.bakes.files,...run.configuration]);
    return run;
}
export async function config(ctx, run, name) {
    const file=path.join(ctx.root,TOOL,'config',`${name}.json`);
    const value=await readJson(file),hash=await hashFile(file);
    if(value.schemaVersion!==1)throw new Error(`Unsupported ${name} schema`);
    await writeJson(path.join(run.runRoot,'inputs',`${name}-${hash.sha256.slice(0,12)}.json`),value);
    return {value,hash};
}
export async function authenticated(file) {
    const result=await readJson(file);
    if(result.schemaVersion!==1 || result.status!=='validated')throw new Error(`Unvalidated upstream manifest: ${file}`);
    for(const item of result.files??[]) {
        const current=await hashFile(item.file);
        if(current.sha256!==item.sha256)throw new Error(`Upstream output changed: ${item.file}`);
    }
    return result;
}
export async function cache(file,key) {
    try { const value=await authenticated(file);return value.key===key?value:null; }
    catch(error) {if(error.code!=='ENOENT' && !/Upstream output changed|Unvalidated upstream/.test(error.message))throw error;return null;}
}
export async function receipt(file,key,data,files) {
    const value={schemaVersion:1,status:'validated',key,...data,files:[]};
    for(const output of files)value.files.push({file:output,...await hashFile(output)});
    await writeJson(file,value);return value;
}
export async function codeIdentity(root, names) {
    const files=[];
    for(const name of names)files.push({name,...await hashFile(path.join(root,TOOL,name))});
    return digest(files);
}
export const resultFiles=(manifest,file)=>({state:'validated',manifest:file,files:[file,...manifest.files.map(item=>item.file)]});
export const stageOptions={run:String,quality:value=>{if(!['pilot','final'].includes(value))throw new Error('quality must be pilot or final');return value;},
    poses:String,lights:String};
export function selectIds(all, selection, label) {
    if(!selection||selection==='all')return all;
    const result=selection.split(',');
    if(new Set(result).size!==result.length||result.some(id=>!all.includes(id)))throw new Error(`Unknown/duplicate ${label}: ${selection}`);
    return result;
}
