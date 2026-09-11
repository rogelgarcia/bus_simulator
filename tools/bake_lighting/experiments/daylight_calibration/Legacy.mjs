// @ts-check
// Preserve old artistic controls with their original exposure and provenance, outside physical scoring.
import path from 'node:path';
import {mkdir,readFile,copyFile} from 'node:fs/promises';
import {writeJson,hashFile} from '../../../baking/Files.mjs';
import {authenticated} from '../lighting_configurations/StageInputs.mjs';
/** @param {any} ctx @param {string} output */
export async function preserveLegacy(ctx,output){
    if(!ctx.options['legacy-run'])return;
    const source=path.resolve(ctx.root,ctx.options['legacy-run']);await authenticated(path.join(source,'report/manifest.json'));
    const experiment=JSON.parse(await readFile(path.join(source,'experiment.json'),'utf8'));
    const identity=JSON.parse(await readFile(path.join(output,'inputs/identity.json'),'utf8'));
    if(path.resolve(experiment.sourceRun)!==path.resolve(identity.sourceRun))throw new Error('Legacy controls use a different city baseline');
    const destination=path.join(output,'report/legacy');await mkdir(destination,{recursive:true});const records=[];
    for(const pose of identity.poses)for(const light of ['S01','S02','S04','S08','F04','U04'])for(const tone of ['aces','agx']){
        const stem=pose.id+'_'+light+'_'+tone+'_matched_+0';
        const metadata=JSON.parse(await readFile(path.join(source,'report/images',stem+'.json'),'utf8'));
        const image=path.join(source,'report/images',stem+'.png');if((await hashFile(image)).sha256!==metadata.sha256)throw new Error('Legacy image hash mismatch');
        await copyFile(image,path.join(destination,stem+'.png'));await copyFile(path.join(source,'report/images',stem+'.json'),path.join(destination,stem+'.json'));
        records.push({...metadata,image:'legacy/'+stem+'.png',label:'Legacy '+light+' · '+tone+' · '+metadata.exposureEV.toFixed(3)+' EV (old matching policy)'});
    }
    await writeJson(path.join(destination,'controls.json'),{source,policy:'Artistic ratios retained verbatim. Old card-matched exposures, not physical-calibration candidates.',records});
}
