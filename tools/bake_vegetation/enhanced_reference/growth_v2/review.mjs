// Presents the single-specimen growth study with authenticated geometry, comparisons and branch diagnostics.
// @ts-check
import path from 'node:path';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {hashFile,writeJson} from '../../../baking/Files.mjs';
import {photographicStudies} from '../source_studies.mjs';

export function validateGrowth(row,renders){
    const expected=['full','volume_side','volume_rear','volume_above','bare','wood_crown','crown','attached',...['front','side','above','under'].flatMap(v=>['shoot_'+v,'twig_'+v])];
    if(renders.length!==22||!row.growthCore.graphAudit.passed)throw Error('Incomplete growth-core study');
    for(const view of expected)if(renders.filter(r=>r.state==='enhanced'&&r.view===view).length!==1)throw Error('Missing growth view '+view);
    for(const view of ['full','volume_side','volume_above','crown','bare','wood_crown']){
        const pair=['previous','enhanced'].map(state=>renders.find(r=>r.state===state&&r.view===view));
        if(pair.some(r=>!r)||JSON.stringify(pair[0].camera)!==JSON.stringify(pair[1].camera))throw Error('Growth comparison cameras differ');
    }
}

export async function galleryGrowth(o,summary){
    if(summary.models.length!==1)throw Error('Review one specimen before generalizing the new growth core');
    const row=summary.models[0],id=row.id,p=o.profiles.american_elm;
    await mkdir(path.join(o.output,'references'),{recursive:true});
    const studies=await photographicStudies(o.source,{american_elm:p}),references=[];
    const items=[{source:path.join(o.source,p.study),file:'references/elm_illustrative.jpg',label:'Supplied illustrative elm study'},
        {source:studies[0].source,file:'references/elm_photographic.png',label:'Supplied photorealistic elm study (AI image)'}];
    if(o['crown-study'])items.push({source:o['crown-study'],file:'references/user_growth_direction.png',label:'User-supplied branching reference'});
    for(const item of items){await copyFile(item.source,path.join(o.output,item.file));const hash=await hashFile(item.source);if((await hashFile(path.join(o.output,item.file))).sha256!==hash.sha256)throw Error('Changed reference copy');references.push({...item,...hash});}
    await copyFile(path.join(o.root,'tools/bake_vegetation/enhanced_reference/review.css'),path.join(o.output,'review.css'));
    const card=(file,title)=>`<div class="cell"><div class="caption"><h3>${title}</h3>Click for the full-resolution image</div><a href="${file}" target="_blank"><img class="image" src="${file}" alt="${title}"></a></div>`;
    const frame=(state,view,title)=>card(`${id}/${state}_${view}.png`,title);
    let body=`<h1>American elm — clearer branch hierarchy</h1><p>One specimen · EEVEE geometry study · ${row.leafCount.toLocaleString()} leaves. Long unbranched growth stops at a bounded reach. Ordinary side buds make single shoots; stronger tips can fork. Young wood carries leaves directly, and support thickness follows downstream reach. The lower scaffold, roots, bark and detailed leaf assets are retained. Experimental artistic growth approximation.</p><nav><a href="#wood">Wood structure</a> · <a href="#branch">Branch study</a> · <a href="#tree">Whole tree</a> · <a href="#examples">Examples</a></nav>`;
    body+=`<section id="wood"><h2>Branch hierarchy — matching cameras</h2><div class="pair">${frame('previous','bare','Previous growth study')}${frame('enhanced','bare','Revised branching')}</div><h3>Supporting limbs and fine branches</h3><div class="pair">${frame('previous','wood_crown','Previous — close-up')}${frame('enhanced','wood_crown','Revised — close-up')}</div></section>`;
    body+=`<section id="branch"><h2>Actual branch from this tree</h2><p>Leaves alternate at twig nodes with coherent local orientation, limited variation and gravity-related bending. The bare views use the same saved geometry.</p>`;
    for(const [view,label] of [['front','Leaf faces'],['side','Edge view'],['above','Oblique view'],['under','Underneath']])body+=`<h3>${label}</h3><div class="pair">${frame('enhanced','shoot_'+view,'Leaves and supporting branchlets')}${frame('enhanced','twig_'+view,'Same branch — leaves hidden')}</div>`;
    body+=`<div class="pair">${frame('enhanced','attached','Same branch inside the crown')}${frame('enhanced','bare','Connected wood structure')}</div></section>`;
    body+=`<section id="tree"><h2>Full-tree comparison</h2><p>Each pair uses the same camera, lighting, resolution and renderer. Coverage and visual acceptance remain under review; leaf count alone is not a fullness measure.</p>`;
    for(const [view,label] of [['full','Front'],['volume_side','Side'],['volume_above','Above'],['crown','Upper canopy close-up']])body+=`<h3>${label}</h3><div class="pair">${frame('previous',view,'Previous growth study')}${frame('enhanced',view,'Revised branching')}</div>`;
    body+=`<div class="pair">${frame('enhanced','volume_rear','Rear')}${frame('enhanced','bare','Wood hierarchy')}</div></section>`;
    body+=`<section id="examples"><h2>Supplied elm examples</h2><div class="variants">${references.map(r=>card(r.file,r.label)).join('')}</div></section><footer><a href="${id}/enhanced.blend">Blender model</a> · <a href="${id}/architecture.json">Connected growth graph</a> · <a href="summary.json">Saved-mesh and render validation</a></footer>`;
    await writeFile(path.join(o.output,'index.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>American elm — growth core v2</title><link rel="stylesheet" href="review.css"></head><body><main>${body}</main></body></html>`);
    await writeJson(path.join(o.output,'source-studies.json'),references);
}
