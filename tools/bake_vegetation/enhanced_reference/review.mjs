// Validates preserved baselines and assembles clearly labeled four-way botanical studies.

import path from 'node:path';

import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';

import {pathToFileURL} from 'node:url';

import {chromium} from 'playwright';

import {hashFile,writeJson} from '../../baking/Files.mjs';

import {validatePresentation,presentationContent} from './presentation_review.mjs';
import {validateSpatial,spatialContent} from './spatial_review.mjs';
import {validateVolume,volumeContent} from './volume_review.mjs';

const json=async f=>JSON.parse(await readFile(f,'utf8'));

const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');

const names={current:'Current reference',enhanced:'Enhanced reference',illustrative:'Supplied illustrative study',photographic:'Supplied photorealistic study'};

const views={full:'Full tree',trunk:'Trunk and branching',leaves:'Leaf area'};

const features={

    london_plane:'Muscular spreading forks and exfoliating olive/tan/cream bark. Alternate broad lobed leaves form overlapping branch groups with openings between major limbs.',

    silver_linden:'Upright leader and ascending laterals. A dense rounded-pyramidal crown combines connected foliage groups; heart-shaped leaves have a distinct pale underside.',

    northern_red_oak:'Substantial flared trunk and spreading mature limbs, with ridged bark. Alternate bristle-tipped lobed leaves gather around twig growth flushes.',

    american_elm:'Ascending leaders spread into an arching vase. Fine outer shoots droop; alternate serrated leaves form uneven branch fans.',

    arrowwood_viburnum:'Multiple unequal stems rise from the ground. Opposite toothed leaves fill a rounded shrub with irregular projecting shoots. Summer foliage is compared with a flowering photographic study.'

};

export async function validate(o){

    const models=[],renders=[];

    for(const id of o.models){

        const dir=path.join(o.output,id),row=await json(path.join(dir,'model.json'));

        if((await hashFile(path.join(dir,'enhanced.blend'))).sha256!==row.sha256)throw Error('Enhanced identity differs '+id);

        const geometry=o.geometryAudit.models.find(r=>r.id===id);

        if(!geometry?.passed||geometry.sha256!==row.sha256)throw Error('Missing saved mesh proof '+id);

        const source=o.sources.find(r=>r.id===id);if(row.baselineSha256!==source.sha256)throw Error('Wrong baseline '+id);

        const prior=o.previousSources.find(r=>r.id===id),proof=await json(path.join(dir,'renders.json')),expected=id.endsWith('mature_01')?((prior?11:6)+(row.dimensions.growth?.architecture==='distributed-plane'?2:0)+(prior&&['enhanced-plane-hierarchical-v6','enhanced-plane-apical-v7','enhanced-plane-branchlets-v8','enhanced-plane-foliage-v9','enhanced-plane-spaced-foliage-v11','enhanced-plane-dome-foliage-v12','enhanced-plane-organic-foliage-v13','enhanced-plane-spatial-growth-v14','enhanced-plane-open-leaves-v15','enhanced-plane-balanced-crown-v16'].includes(row.revision)?2:0)+(['enhanced-plane-branchlets-v8','enhanced-plane-foliage-v9','enhanced-plane-spaced-foliage-v11','enhanced-plane-dome-foliage-v12','enhanced-plane-organic-foliage-v13','enhanced-plane-spatial-growth-v14','enhanced-plane-open-leaves-v15','enhanced-plane-balanced-crown-v16'].includes(row.revision)?(prior?2:1):0)+(row.revision==='enhanced-plane-foliage-v9'?1:row.revision==='enhanced-plane-spaced-foliage-v11'?2:['enhanced-plane-dome-foliage-v12','enhanced-plane-organic-foliage-v13','enhanced-plane-spatial-growth-v14','enhanced-plane-open-leaves-v15','enhanced-plane-balanced-crown-v16'].includes(row.revision)?16:0)):row.revision==='enhanced-plane-posture-v10'?(prior?4:2):1;

        if(proof.renders.length!==expected+validatePresentation(proof.renders,id.endsWith('mature_01'))+validateSpatial(proof.renders,id.endsWith('mature_01'),row.revision)+validateVolume(proof.renders,id.endsWith('mature_01'),row.revision))throw Error('Incomplete views '+id);

        for(const image of proof.renders){

            if(image.sourceSha256!==(image.state==='current'?source.sha256:image.state==='previous'?prior?.sha256:row.sha256))throw Error('Stale render '+id);

            if((await hashFile(path.join(o.output,image.file))).sha256!==image.sha256)throw Error('Changed render '+image.file);

            renders.push({...image,id});

        }

        models.push(row);

    }

    const installed=[];

    for(const species of Object.keys(o.profiles))for(const role of ['bark','leaf_front','leaf_back']){

        const slug=`tree_ai_${species}_${role}`,config=path.join(o.root,'assets/public/pbr',slug,'pbr.material.config.js');

        const {default:entry}=await import(pathToFileURL(config));

        if(entry.provenance.source.type!=='AI generated')throw Error('Missing AI provenance');

        for(const item of entry.provenance.sourceFiles)if((await hashFile(path.join(path.dirname(config),item.file))).sha256!==item.sha256)throw Error('Installed material differs '+slug);

        installed.push({slug,configSha256:(await hashFile(config)).sha256});

    }

    const revisions=[...new Set(models.map(r=>r.revision))];

    const summary={revision:revisions.length===1?revisions[0]:'enhanced-mixed-reference',models,renders,geometryAudit:o.geometryAudit,installedMaterials:installed,baselinePreserved:true,previousEnhancedPreserved:!!o.previous,gpuBenchmarked:false};

    await writeJson(path.join(o.output,'summary.json'),summary);return summary;

}

function sourceImage(species,state,view,p){

    const file=`references/${species}_${state}.${state==='illustrative'?'jpg':'png'}`;

    if(view==='full')return `<img class="image" src="${file}">`;

    const photo=state==='photographic',w=photo?1254:2400,h=photo?1254:1792;

    const shrub=species==='arrowwood_viburnum';

    const rect=view==='trunk'?(shrub?[.30,.57,.43,.40]:photo?[.33,.50,.35,.47]:[.35,.48,.32,.43]):photo?[.15,.19,.37,.32]:[.17,.21,.37,.40];

    return `<svg class="image" viewBox="${rect[0]*w} ${rect[1]*h} ${rect[2]*w} ${rect[3]*h}" preserveAspectRatio="xMidYMid slice"><image href="${file}" width="${w}" height="${h}"/></svg>`;

}

function panel(species,state,view,p){

    const image=['current','previous','enhanced'].includes(state)?`<a href="${species}/mature_01/${state}_${view}.png"><img class="image" src="${species}/mature_01/${state}_${view}.png"></a>`:sourceImage(species,state,view,p);

    const note=view.startsWith('wood_')?'Actual revised model · foliage hidden · neutral clay':['current','previous','enhanced'].includes(state)?(view==='leaves'?'CPU Cycles · outer shoots with soft fill':'Headless Blender · CPU Cycles'):view==='full'?'Original supplied AI image':'Crop of supplied AI image · original detail resolution';

    return `<div class="cell"><div class="caption"><h3>${view.startsWith('wood_')?'Revised wood structure':state==='previous'?'Previous enhanced reference':names[state]}</h3><div class="muted">${note}</div></div>${image}</div>`;

}

function group(species,view,p){return `<h2 class="viewlabel">${views[view]}</h2><div class="grid">${Object.keys(names).map(state=>panel(species,state,view,p)).join('')}</div>`;}

function variantPanel(row){const groups=row.crowding?.branchletSpacing?.acceptedSprays??row.crownLobes;return `<div class="cell"><div class="caption"><a href="${row.file}">${row.id.split('/')[1]} · Blender source</a><br>${row.leafCount.toLocaleString()} leaves · ${groups} crown groups</div><img class="image" src="${row.id}/enhanced_full.png"></div>`;}

const page=(title,content,sheet=false)=>`<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title><link rel="stylesheet" href="review.css"></head><body><main class="${sheet?'sheet':''}">${content}</main></body></html>`;

export async function gallery(o){

    const summary=await validate(o),profiles=Object.fromEntries(Object.entries(o.profiles).filter(([s])=>summary.models.some(r=>r.id.startsWith(s+'/'))));

    for(const s of Object.keys(profiles))if([1,2,3].some(v=>!summary.models.some(r=>r.id===`${s}/mature_0${v}`)))throw Error('Gallery requires three mature forms per selected species');

    await mkdir(path.join(o.output,'references'),{recursive:true});const sources=[];

    if(o['wood-study']){

        const target=path.join(o.output,'references/london_plane_leafless.png'),hash=await hashFile(o['wood-study']);

        await copyFile(o['wood-study'],target);if((await hashFile(target)).sha256!==hash.sha256)throw Error('Leafless study copy differs');

        sources.push({species:'london_plane',style:'leafless',source:o['wood-study'],...hash});

    }

    if(o['foliage-study']){

        const source=o['foliage-study'],hash=await hashFile(source),target=path.join(o.output,'references/london_plane_foliage.png');

        await copyFile(source,target);if((await hashFile(target)).sha256!==hash.sha256)throw Error('Foliage study copy differs');

        sources.push({species:'london_plane',style:'foliage',source,...hash});

    }

    for(const [s,p] of Object.entries(profiles))for(const style of ['illustrative','photographic']){

        const source=style==='illustrative'?path.join(o.source,p.study):path.join(o.source,'mature_trees_showroom/mature_trees_showroom',s,s+'_01.png');

        const target=path.join(o.output,'references',`${s}_${style}.${style==='illustrative'?'jpg':'png'}`);await copyFile(source,target);

        const hash=await hashFile(source);if((await hashFile(target)).sha256!==hash.sha256)throw Error('Reference copy differs');sources.push({species:s,style,source,...hash});

    }

    await copyFile(path.join(o.root,'tools/bake_vegetation/enhanced_reference/review.css'),path.join(o.output,'review.css'));

    const sheets=[];let index='<h1>Enhanced botanical references</h1><p class="intro">Current and enhanced 3D models beside the two supplied AI image styles. Compare species features, not matching silhouettes. The two models share studio lighting; supplied studies have baked lighting and their details are labeled crops.</p><p>All earlier references are preserved. '+summary.models.length+' mature models use installed AI-generated PBR, separate leaf fronts/backs and actual curved leaves. GPU performance has not been measured.</p><nav>'+Object.entries(profiles).map(([s,p])=>`<a href="#${s}">${p.name}</a>`).join('')+'</nav>';

    let overview='<h1>Species fidelity — four reference versions</h1><p>3D reference renders and supplied AI style studies. Shapes may differ.</p>';

    let variants='<h1>Enhanced references — mature forms</h1><p>Three distinct growth seeds and crown proportions for each species. Editable Blender files are linked in the gallery.</p>';

    index+='<p><a href="overview.png">Four-way species overview</a> · <a href="mature_forms.png">All enhanced mature forms</a></p>';

    for(const [s,p] of Object.entries(profiles)){

        const title=`${p.name} · ${p.botanical}`,all=Object.keys(views).map(v=>group(s,v,p)).join('');

        const filename=s+'_comparison.html';await writeFile(path.join(o.output,filename),page(title,`<h1>${title}</h1>${all}`,true));sheets.push({file:filename,png:s+'_comparison.png'});

        for(const v of Object.keys(views)){const file=`${s}_${v}.html`;await writeFile(path.join(o.output,file),page(title,`<h1>${title} — ${views[v]}</h1>${group(s,v,p)}`,true));sheets.push({file,png:`${s}_${v}.png`});}

        const presentation=presentationContent(summary,s,title);
        const volume=volumeContent(summary,s,title);
        if(volume){
            const file=s+'_volume.html';await writeFile(path.join(o.output,file),page(title+' — crown depth',volume,true));sheets.push({file,png:s+'_volume.png'});
            index+=`<section id="${s}_volume"><p><a href="${file}">Front, side, rear and elevated crown views</a></p>${volume}</section>`;
        }
        const spatial=spatialContent(summary,s);
        if(spatial){
            const file=s+'_spatial.html';await writeFile(path.join(o.output,file),page(title+' — spatial growth',spatial,true));sheets.push({file,png:s+'_spatial.png'});
            index+=`<section id="${s}_spatial"><p><a href="${file}">Branch angles and leaf curvature comparisons</a></p>${spatial}</section>`;
        }
        if(presentation){

            const file=s+'_poses.html';await writeFile(path.join(o.output,file),page(title+' — viewing angles',presentation,true));sheets.push({file,png:s+'_poses.png'});

            index+=`<section id="${s}_poses"><p><a href="${file}">Viewing angles and branchlet close-ups</a></p>${presentation}</section>`;

        }

        let changes='';

        if(summary.models.some(r=>r.id===s+'/mature_01'&&r.revision==='enhanced-oak-fork-shoulders-v8')){
            const content=`<h1>${title} — fork shoulders</h1><p>Parent/child size and opening angle shape each connection. Bark follows the limbs and blends across the union. Saved-file checks confirm unchanged growth, fine branches and leaves.</p><div class="grid">${panel(s,'previous','trunk',p)}${panel(s,'enhanced','trunk',p)}${panel(s,'enhanced','wood_fork',p)}${panel(s,'photographic','trunk',p)}</div>`;
            const file=s+'_forks.html';await writeFile(path.join(o.output,file),page(title+' — fork shoulders',content,true));sheets.push({file,png:s+'_forks.png'});
            index+=`<section id="${s}_forks"><p><a href="${file}">Fork comparison</a></p>${content}</section>`;
        }

        if(summary.models.some(r=>r.id===s+'/mature_01'&&['enhanced-plane-dome-foliage-v12','enhanced-plane-organic-foliage-v13','enhanced-plane-spatial-growth-v14','enhanced-plane-open-leaves-v15','enhanced-plane-balanced-crown-v16'].includes(r.revision))){

            const pairs=[0,1,2].map(i=>{

                const records=['previous','enhanced'].map(state=>summary.renders.find(r=>r.id===s+'/mature_01'&&r.state===state&&r.view==='coverage_'+i));

                if(records.some(r=>!r?.foliageCoverage))throw Error('Missing foliage coverage masks');

                if(JSON.stringify(records[0].camera)!==JSON.stringify(records[1].camera))throw Error('Coverage cameras differ');

                const gain=(records[1].foliageCoverage.fraction/records[0].foliageCoverage.fraction-1)*100;

                return `<h2>Road-height view ${i+1} — ${gain>=0?'+':''}${gain.toFixed(1)}% visible foliage area</h2><div class="pair">${['previous','enhanced'].map(state=>`<div class="cell"><div class="caption"><h3>${state==='previous'?'Previous reference':'Revised reference'}</h3>Camera height 2.7 m · same leaf count</div><img class="image" src="${s}/mature_01/${state}_road_${i}.png"></div>`).join('')}</div>`;

            }).join('');

            const edge=`<h2>Same branchlet viewed from its edge</h2><div class="pair">${['previous','enhanced'].map(state=>`<div class="cell"><div class="caption"><h3>${state==='previous'?'Previous reference':'Revised leaf geometry'}</h3>Actual leaf and twig geometry</div><img class="image" src="${s}/mature_01/${state}_shoot_edge.png"></div>`).join('')}</div>`;

            const file=s+'_canopy.html';await writeFile(path.join(o.output,file),page(title+' — crown coverage',`<h1>${title} — canopy coverage and blade depth</h1><p>Three matched viewpoints around the tree. Coverage measures foliage-only alpha area; bark, shadows and ground are excluded. No leaves were added.</p>${pairs}${edge}`,true));sheets.push({file,png:s+'_canopy.png'});

            index+=`<section><h2>Leaf geometry and canopy coverage</h2><p><a href="${file}">Road-height comparisons and branchlet edge view</a></p>${pairs}</section>`;

        }

        const adjusted=summary.models.filter(r=>r.id.startsWith(s+'/')&&r.revision==='enhanced-plane-posture-v10');

        if(adjusted.length){

            const comparison=adjusted.map(row=>['full','bare'].map(view=>`<h2>${row.id.split('/')[1]} - ${view==='full'?'foliage':'wood structure'}</h2><div class="pair">${['previous','enhanced'].map(state=>`<div class="cell"><div class="caption"><h3>${state==='previous'?'Before - low horizontal limb':'After - ascending scaffold'}</h3>${state==='enhanced'?'All leaf instances retained and moved with their supporting limb':'Preserved v9 reference'}</div><img class="image" src="${row.id}/${state}_${view}.png"></div>`).join('')}</div>`).join('')).join('');

            const file=s+'_posture.html';await writeFile(path.join(o.output,file),page(title+' - limb posture',`<h1>${title} - lower limb correction</h1>${comparison}`,true));sheets.push({file,png:s+'_posture.png'});

            index+=`<section><h2>Lower limb correction</h2><p>The first specimen is preserved byte-for-byte. Only the marked branch system in the other two specimens is raised.</p><p><a href="${s}_posture.png">Before/after leafy and bare-wood comparison</a></p>${comparison}</section>`;

        }

        if(o.previous){const revision=summary.models.some(r=>r.id===s+'/mature_01'&&['enhanced-plane-foliage-v9','enhanced-plane-spaced-foliage-v11','enhanced-plane-dome-foliage-v12','enhanced-plane-organic-foliage-v13','enhanced-plane-spatial-growth-v14','enhanced-plane-open-leaves-v15','enhanced-plane-balanced-crown-v16'].includes(r.revision))?'foliage':'fork';changes=['full','trunk'].map(v=>`<h2>${views[v]} — ${revision} revision</h2><div class="grid">${panel(s,'previous',v,p)}${panel(s,'enhanced',v,p)}${panel(s,'enhanced',v==='full'?'wood_full':'wood_fork',p)}${panel(s,'photographic',v,p)}</div>`).join('');const file=s+'_growth_changes.html';await writeFile(path.join(o.output,file),page(title+' — reference revision',`<h1>${title}</h1>${changes}`,true));sheets.push({file,png:s+'_growth_changes.png'});changes=`<p><a href="${s}_growth_changes.png">Before/after ${revision} comparison</a></p>${changes}`;}

        index+=`<section id="${s}"><h2>${title}</h2><p>${features[s]}</p>${changes}<p><a href="${s}_comparison.png">Complete comparison sheet</a> · ${Object.keys(views).map(v=>`<a href="${s}_${v}.png">${views[v]}</a>`).join(' · ')}</p>${all}<h3>Three enhanced mature forms</h3><div class="variants">`;

        const forms=summary.models.filter(r=>r.id.startsWith(s+'/')).map(variantPanel).join('');

        index+=forms;variants+=`<h2>${title}</h2><div class="variants">${forms}</div>`;

        index+='</div></section>';overview+=`<h2>${title}</h2><div class="grid">${Object.keys(names).map(state=>panel(s,state,'full',p)).join('')}</div>`;

        if(summary.models.some(r=>r.id===s+'/mature_01'&&r.revision==='enhanced-plane-branchlets-v8')){

            const twigPanel=(state,title)=>`<div class="cell"><div class="caption"><h3>${title}</h3>Foliage hidden - same branch and camera - neutral clay</div><a href="${s}/mature_01/${state}_wood_branchlets.png"><img class="image" src="${s}/mature_01/${state}_wood_branchlets.png"></a></div>`;

            const content=`<h1>${title} - outer branchlets</h1><div class="pair">${o.previous?twigPanel('previous','Previous - long fine sprays'):''}${twigPanel('enhanced','Revised - short spreading forks')}</div>`;

            const file=s+'_branchlets.html';await writeFile(path.join(o.output,file),page(title+' - branchlets',content,true));sheets.push({file,png:s+'_branchlets.png'});

            index+=`<section><p><a href="${s}_branchlets.png">Matched branchlet close-up</a></p>${content}</section>`;

        }

        if(s==='london_plane'&&o['foliage-study']){

            const spaced=summary.models.some(r=>r.id===s+'/mature_01'&&['enhanced-plane-spaced-foliage-v11','enhanced-plane-dome-foliage-v12','enhanced-plane-organic-foliage-v13','enhanced-plane-spatial-growth-v14','enhanced-plane-open-leaves-v15','enhanced-plane-balanced-crown-v16'].includes(r.revision));

            const before=spaced?`<div class="cell"><div class="caption"><h3>Previous foliage</h3>Same saved branchlet; paired local framing</div><img class="image" src="${s}/mature_01/previous_shoot.png"></div>`:'';

            const study=`<h1>${title} - foliage study</h1><div class="${spaced?'variants':'pair'}">${before}<div class="cell"><div class="caption"><h3>New reference foliage</h3>Actual leaf and wood geometry isolated from the saved tree</div><img class="image" src="${s}/mature_01/enhanced_shoot.png"></div><div class="cell"><div class="caption"><h3>Supplied branchlet study</h3>Original user-supplied image</div><img class="image" src="references/london_plane_foliage.png"></div></div>`;

            const file=s+'_foliage_study.html';await writeFile(path.join(o.output,file),page(title+' - foliage study',study,true));sheets.push({file,png:s+'_foliage_study.png'});

            index+=`<section>${study}<p><a href="${s}_foliage_study.png">Leafy shoot comparison</a></p></section>`;

        }

        if(s==='london_plane'&&o['wood-study']){

            const hierarchy=summary.models.some(r=>r.id===s+'/mature_01'&&['enhanced-plane-hierarchical-v6','enhanced-plane-apical-v7','enhanced-plane-branchlets-v8','enhanced-plane-foliage-v9','enhanced-plane-spaced-foliage-v11','enhanced-plane-dome-foliage-v12','enhanced-plane-organic-foliage-v13','enhanced-plane-spatial-growth-v14','enhanced-plane-open-leaves-v15','enhanced-plane-balanced-crown-v16'].includes(r.revision))&&o.previous;

            const old=view=>hierarchy?`<div class="cell"><div class="caption"><h3>Previous enhanced reference</h3>${view==='bare'?'Foliage hidden':'Root crown'} · CPU Cycles</div><img class="image" src="${s}/mature_01/previous_${view}.png"></div>`:'';

            const study=`<div class="${hierarchy?'variants':'pair'}">${old('bare')}<div class="cell"><div class="caption"><h3>Revised reference — foliage hidden</h3>Actual wood and fine branchlets · CPU Cycles</div><img class="image" src="${s}/mature_01/enhanced_bare.png"></div><div class="cell"><div class="caption"><h3>Supplied leafless study</h3>Original user-supplied image</div><img class="image" src="references/london_plane_leafless.png"></div>${old('roots')}<div class="cell"><div class="caption"><h3>Revised root crown</h3>Continuous basal flutes and grounded roots</div><img class="image" src="${s}/mature_01/enhanced_roots.png"></div><div class="cell"><div class="caption"><h3>Supplied root detail</h3>Crop of the same original image</div><svg class="image" viewBox="240 835 780 400" preserveAspectRatio="xMidYMid meet"><image href="references/london_plane_leafless.png" width="1254" height="1254"/></svg></div></div>`;

            const file=s+'_wood_study.html';await writeFile(path.join(o.output,file),page(title+' — wood and roots',`<h1>${title} — wood and roots</h1>${study}`,true));sheets.push({file,png:s+'_wood_study.png'});

            index+=`<section><h2>Leafless structure and root crown</h2><p><a href="${s}_wood_study.png">Wood and root comparison</a></p>${study}</section>`;

        }

    }

    index+='<footer>Source PBR is AI generated. Normal, height and roughness are inferred proxies, not scans. Crown growth is an artistic botanical approximation. Source pictures are not newly rendered 3D reconstructions. <a href="summary.json">Model and render validation</a> · <a href="source-studies.json">Source image identities</a></footer>';

    await writeFile(path.join(o.output,'index.html'),page('Enhanced botanical references',index));await writeFile(path.join(o.output,'overview.html'),page('Four-way species overview',overview,true));sheets.push({file:'overview.html',png:'overview.png'});

    await writeFile(path.join(o.output,'mature_forms.html'),page('Enhanced mature forms',variants,true));sheets.push({file:'mature_forms.html',png:'mature_forms.png'});

    const browser=await chromium.launch({executablePath:o.browserExecutable,headless:true,args:['--disable-gpu','--disable-software-rasterizer']});

    try{const tab=await browser.newPage({viewport:{width:3840,height:1200},deviceScaleFactor:1});for(const row of sheets){await tab.goto(pathToFileURL(path.join(o.output,row.file)).href);await tab.evaluate(async()=>{await Promise.all([...document.images].map(i=>i.decode()));await document.fonts.ready;});await tab.screenshot({path:path.join(o.output,row.png),fullPage:true});}}finally{await browser.close();}

    await writeJson(path.join(o.output,'source-studies.json'),sources);await writeJson(path.join(o.output,'gallery.json'),{sheets:await Promise.all(sheets.map(async s=>({...s,...await hashFile(path.join(o.output,s.png))}))),sourceImages:sources});

}
