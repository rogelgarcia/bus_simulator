// Exports reproducible comparisons from the same graph used in the editor.
import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {writeJson} from '../../baking/Files.mjs';
import {generate,presets,descendants} from './model.mjs';
import {species} from './species.mjs';
import {samplePath} from './geometry.mjs';
import {svg} from './draw.mjs';
export const reviewSeeds=Object.freeze([1,31,92]);
const figure=(file,label)=>`<figure><a href="${file}" target="_blank"><img src="${file}" alt="${label}" loading="lazy"></a><figcaption>${label}</figcaption></figure>`;
export async function createReview(output,images){
    const records={},sections=[],hierarchies=[],files=[];
    await mkdir(path.join(output,'comparisons'),{recursive:true});
    const save=async(file,content)=>{await writeFile(path.join(output,file),content);files.push(file);};
    for(const [id,p] of Object.entries(species)){
        const models=reviewSeeds.map(seed=>generate({...presets[id],seed}));
        for(const m of models)if(!m.audit.passed||m.stopped.budget||m.roots.stopped.budget)throw Error(`Invalid species/seed: ${id}/${m.settings.seed}`);
        const model=models[1],scaffold=model.paths.find(p=>p.role==='scaffold')??model.paths.find(p=>p.kind==='basal-cane'),subset=descendants(model,scaffold.id);
        const attachment=model.paths.filter(p=>p.parent>=0&&p.parentT<.98).sort((a,b)=>{
            const score=p=>p.baseRadius*Math.abs(Math.sin(p.heading-samplePath(model.paths[p.parent],p.parentT).heading));
            return score(b)-score(a);
        })[0]??scaffold;
        const frame=samplePath(attachment,.14).point,junction=Math.max(attachment.baseRadius*8,attachment.span*.35);
        const baseWidth=Math.max(model.settings.baseDiameter*3,model.settings.basalSpread*1.8),baseHeight=model.settings.baseDiameter*2.5;
        const views={whole:svg(model.paths,{roots:model.roots,soil:true}),branches:svg(subset,{forks:true}),
            junction:svg([model.paths[attachment.parent],...model.paths.filter(p=>p.parent===attachment.parent)].filter(Boolean),{viewBox:[frame[0]-junction,frame[1]-junction,frame[0]+junction,frame[1]+junction]}),
            roots:svg(model.paths,{roots:model.roots,soil:true,viewBox:[-baseWidth,-Math.min(model.settings.rootDepth,baseHeight),baseWidth,baseHeight]}),
            exposure:svg(model.paths,{roots:model.roots,viewBox:[-baseWidth,-baseHeight*.35,baseWidth,baseHeight],exposure:model.settings.baseDiameter*.1})};
        for(const [view,drawing] of Object.entries(views))await save(`comparisons/${id}-${view}.svg`,drawing);
        records[id]=models.map(m=>({seed:m.settings.seed,branches:m.paths.length,rootAxes:m.roots.paths.length,audit:m.audit,stopped:m.stopped}));
        for(const m of models){
            const prefix=`comparisons/${id}-seed-${m.settings.seed}`;
            await save(prefix+'.svg',svg(m.paths,{roots:m.roots,soil:true}));
            await writeJson(path.join(output,prefix+'.json'),m);files.push(prefix+'.json');
        }
        const ref=images[id];
        const stages=[...new Set([model.settings.depth,model.settings.depth+1,model.settings.depth+Math.ceil(model.settings.ramificationLevels/2),model.growthLevels])];
        const tiers=[];
        for(const stage of stages){
            const file=`comparisons/${id}-level-${stage}.svg`;
            await save(file,svg(model.paths,{stage}));
            const count=model.paths.filter(p=>p.level<=stage).length;
            tiers.push(figure(file,`${stage===model.settings.depth?'Primary framework':'Daughter-fork tier '+(stage-model.settings.depth)} · ${count} axes`));
        }
        const canopy=`comparisons/${id}-canopy.svg`;await save(canopy,svg(model.paths));
        const forkNodes=model.paths.filter(p=>p.children.filter(id=>model.paths[id].parentT===1).length>1).length;
        hierarchies.push(`<section id="${id}"><h2>${p.name}</h2><div class="comparison-row hierarchy-row">${ref?figure(ref.complete?.file??ref.file,'Supplied branching reference'):''}${figure(canopy,'Generated branching hierarchy · seed 31')}</div><h3>${model.settings.depth} framework level(s) + ${model.settings.ramificationLevels} daughter-fork levels</h3><div class="detail-grid">${tiers.join('')}</div><p>${forkNodes} tips divide into multiple daughters. Intermediate side branches attach before the tip. Short or thin candidates may stop early; levels describe topology, not age. Every stage uses the same graph and framing.</p></section>`);
        sections.push(`<section id="${id}"><h2>${p.name} <small>${p.botanical}</small></h2><div class="comparison-row">${ref?figure(ref.file,'Supplied newer reference · '+p.name):''}${ref?.complete?figure(ref.complete.file,'Supplied complete study · '+p.name):''}${figure(`comparisons/${id}-whole.svg`,'Generated SVG · complete plant / soil section · seed 31')}</div><div class="detail-grid">${figure(`comparisons/${id}-branches.svg`,'Generated SVG · isolated connected branch structure')}${figure(`comparisons/${id}-junction.svg`,'Generated SVG · attachment close-up')}${figure(`comparisons/${id}-roots.svg`,'Generated SVG · root crown / soil section')}${figure(`comparisons/${id}-exposure.svg`,'Generated SVG · surface exposure mask / elevation')}</div><h3>Seeds 1 / 31 / 92</h3><div class="seed-grid">${models.map(m=>figure(`comparisons/${id}-seed-${m.settings.seed}.svg`,`Generated SVG · seed ${m.settings.seed} · ${m.paths.length} axes`)).join('')}</div><p>${p.mapping} ${p.limitation}</p></section>`);
    }
    const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>649 · V2 species reference review</title><link rel="stylesheet" href="review.css"></head><body><main><header><p>649 / SHARED V2 / 2D ARCHITECTURE</p><h1>Five species, connected structure.</h1><p>Supplied references beside generated SVG studies. Images open at full resolution. Drawings are fitted individually. Root sections and surface masks are schematic elevations, not perspective reconstructions or inferred rooting depths.</p><nav><a href="index.html">Interactive study</a> · ${Object.entries(species).map(([id,p])=>`<a href="#${id}">${p.name}</a>`).join(' · ')}</nav></header>${sections.join('')}</main></body></html>`;
    await save('comparison.html',html);
    await save('ramification.html',`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Branch bifurcations and levels</title><link rel="stylesheet" href="review.css"></head><body><main><header><p>SHARED V2 / BRANCH HIERARCHY</p><h1>Bifurcations, level by level.</h1><p>The trunk is a simple support. Compare how primary limbs divide into smaller branches. Curvature and wood surface detail are outside this review.</p><nav><a href="index.html">Interactive study</a> · <a href="comparison.html">All references and three seeds</a></nav></header>${hierarchies.join('')}</main></body></html>`);
    return {records,files};
}
