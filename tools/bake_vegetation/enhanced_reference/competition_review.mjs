// Validates and presents shared shoot pruning without replacing species-specific geometry checks.
import path from 'node:path';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {hashFile,writeJson} from '../../baking/Files.mjs';
import {photographicStudies} from './source_studies.mjs';

export function validateCompetition(row,renders){
    const expected=row.id.endsWith('mature_01')?17:13;
    if(renders.length!==expected)throw Error('Incomplete competition views: '+row.id);
    if(row.canopyVisibility?.views.length!==3)throw Error('Missing competition visibility: '+row.id);
    for(const view of row.canopyVisibility.views){
        if(view.visibleFoliageRetention<.98||view.worstRegionChangePoints< -5)throw Error('Pruning lost useful crown coverage: '+row.id+' / '+view.view);
        const pair=['previous','enhanced'].map(state=>renders.find(r=>r.state===state&&r.view==='visibility_'+view.view));
        if(pair.some(r=>!r)||JSON.stringify(pair[0].camera)!==JSON.stringify(pair[1].camera))throw Error('Competition cameras differ');
    }
    if(row.shootCompetitionReview.sourceSha256!==row.previousSha256)throw Error('Wrong competition source');
}

export async function galleryCompetition(o,summary){
    const profiles=Object.fromEntries(Object.entries(o.profiles).filter(([s])=>summary.models.some(m=>m.id.startsWith(s+'/'))));
    for(const s of Object.keys(profiles))if(summary.models.filter(m=>m.id.startsWith(s+'/')).length!==3)throw Error('Competition gallery requires three forms');
    await mkdir(path.join(o.output,'references'),{recursive:true});
    const references=await photographicStudies(o.source,profiles),copied=[];
    for(const [species,p] of Object.entries(profiles))for(const style of ['illustrative','photographic']){
        const record=references.find(r=>r.species===species&&r.variant===1),source=style==='illustrative'?path.join(o.source,p.study):record.source;
        const file=`references/${species}_${style}.${style==='illustrative'?'jpg':'png'}`;await copyFile(source,path.join(o.output,file));
        const hash=await hashFile(source);if((await hashFile(path.join(o.output,file))).sha256!==hash.sha256)throw Error('Study copy differs');
        copied.push({species,style,source,file,...hash});
    }
    await copyFile(path.join(o.root,'tools/bake_vegetation/enhanced_reference/review.css'),path.join(o.output,'review.css'));
    const card=(file,title)=>`<div class="cell"><div class="caption"><h3>${title}</h3>Click to open the full-resolution image</div><a href="${file}" target="_blank"><img class="image" src="${file}" alt="${title}"></a></div>`;
    const frame=(id,state,view,title)=>card(`${id}/${state}_${view}.png`,title);
    const html=(title,content)=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><link rel="stylesheet" href="review.css"></head><body><main>${content}</main></body></html>`;
    const sections=[];const sheets=[];
    for(const [species,p] of Object.entries(profiles)){
        const models=summary.models.filter(m=>m.id.startsWith(species+'/')),hero=models[0].id;
        let content=`<section id="${species}"><h1>${p.name} — competing branchlets</h1><p>Thin shoots sharing a stronger shoot's growth space are removed when the crown retains useful coverage. Surviving branches, leaves and leaf shapes stay in place.</p><table><tr><th>Model</th><th>Removed shoots</th><th>Leaves before → after</th><th>Visible foliage retained: front / side / rear</th></tr>`;
        content+=models.map(m=>`<tr><td>${m.id.split('/')[1]}</td><td>${m.shootCompetitionReview.alreadyApplied?'Already cleaned':m.shootCompetitionReview.removedShoots.toLocaleString()}</td><td>${m.previousLeafCount.toLocaleString()} → ${m.leafCount.toLocaleString()}</td><td>${m.canopyVisibility.views.map(v=>(100*v.visibleFoliageRetention).toFixed(1)+'%').join(' / ')}</td></tr>`).join('')+'</table>';
        content+=`<h2>Three mature forms</h2><div class="variants">${models.map(m=>frame(m.id,'enhanced','full',m.id.split('/')[1])).join('')}</div>`;
        content+=`<h2>Branchlet before and after</h2><div class="pair">${frame(hero,'previous','shoot','Before — isolated branchlet')}${frame(hero,'enhanced','shoot','After — isolated branchlet')}</div>`;
        content+=`<h2>Same branchlet inside the crown</h2><div class="pair">${frame(hero,'previous','leaves','Before — in the crown')}${frame(hero,'enhanced','leaves','After — in the crown')}</div>`;
        content+=`<h2>Full-tree comparison</h2><div class="pair">${frame(hero,'previous','full','Before')}${frame(hero,'enhanced','full','After')}</div>`;
        for(const m of models)content+=`<h2>${m.id.split('/')[1]} — other sides</h2><div class="pair">${frame(m.id,'enhanced','volume_side','Side')}${frame(m.id,'enhanced','volume_rear','Rear')}</div>`;
        content+=`<h2>Supplied species examples</h2><div class="pair">${card(`references/${species}_illustrative.jpg`,'Supplied illustrative study')}${card(`references/${species}_photographic.png`,'Supplied photorealistic study')}</div><p>Supplied examples are original AI images. Coverage uses matched EEVEE masks with wood visible and a fixed before-crown envelope; natural gaps between clusters remain included. <a href="${hero}/visibility.json">Measurements</a> · <a href="${hero}/enhanced.blend">Blender source</a></p></section>`;
        sections.push(content);const file=species+'_competition.html';await writeFile(path.join(o.output,file),html(p.name,content));sheets.push({file,png:species+'_competition.png'});
    }
    await writeFile(path.join(o.output,'index.html'),html('All species — shoot competition',`<h1>Branchlet competition — all species</h1><p>EEVEE geometry review. Click any render for the original image.</p><nav>${Object.entries(profiles).map(([s,p])=>`<a href="#${s}">${p.name}</a>`).join(' · ')}</nav>${sections.join('')}<footer><a href="summary.json">Model and render validation</a> · <a href="source-studies.json">Reference identities</a></footer>`));
    const browser=await chromium.launch({executablePath:o.browserExecutable,headless:true,args:['--disable-gpu']});
    try{const tab=await browser.newPage({viewport:{width:1800,height:1000}});for(const sheet of sheets){await tab.goto(pathToFileURL(path.join(o.output,sheet.file)).href);await tab.evaluate(async()=>Promise.all([...document.images].map(i=>i.decode())));await tab.screenshot({path:path.join(o.output,sheet.png),fullPage:true});}}finally{await browser.close();}
    await writeJson(path.join(o.output,'source-studies.json'),copied);await writeJson(path.join(o.output,'gallery.json'),{sheets,sourceImages:copied});
}
