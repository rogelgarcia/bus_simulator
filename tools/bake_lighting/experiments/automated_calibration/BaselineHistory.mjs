// @ts-check
// Retain every failed capture before retrying the established baseline collector.
import path from 'node:path';
import {cp,mkdir,stat} from 'node:fs/promises';
import {outputPath} from './Plan.mjs';
export async function preserveBaselineAttempt(root,output){
    const resolved=outputPath(root,output),runtime=path.join(resolved,'runtime');
    const previous=await stat(runtime).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
    if(!previous)return null;
    const destination=path.join(resolved,'baseline_attempts',String(Date.now()));
    await mkdir(destination,{recursive:true});await cp(runtime,path.join(destination,'runtime'),{recursive:true,errorOnExist:true,force:false});
    return destination;
}
