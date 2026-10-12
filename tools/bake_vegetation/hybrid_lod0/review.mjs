// Validates exported hybrid workloads and assembles matched review sheets.
import path from 'node:path';
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {hashFile,writeJson} from '../../baking/Files.mjs';
import {parseGlb} from '../lod0/Compress.mjs';
import {chromium} from 'playwright';
const json=async f=>JSON.parse(await readFile(f,'utf8'));
const names={london_plane:'London plane',silver_linden:'Silver linden',northern_red_oak:'Northern red oak',american_elm:'American elm',arrowwood_viburnum:'Arrowwood viburnum'};

export async function validate(options){
    const rows=[];
    for(const source of options.sources){
        const id=source.id,directory=path.join(options.output,id),model=await json(path.join(directory,'model.json'));
        const file=path.join(directory,id.split('/')[1]+'_lod0.glb'),{doc}=parseGlb(await readFile(file));
        if(model.referenceSha256!==source.sha256||!model.acceptedWoodPreserved||!model.sourceGroupsDisjoint)throw new Error('Source or partition mismatch '+id);
        const counts={wood:0,cards:0,detailed:0,simple:0};
        for(const mesh of doc.meshes){
            const role=mesh.name.includes('interior cards')?'cards':mesh.name.includes('detailed leaves')?'detailed':mesh.name.includes('simple volume')?'simple':'wood';
            for(const p of mesh.primitives){
                const n=doc.accessors[p.indices].count;if(n%3)throw new Error('Nontriangular export');counts[role]+=n/3;
                const mat=doc.materials[p.material];
                if(role==='cards'&&(mat.alphaMode!=='MASK'||!mat.doubleSided))throw new Error('Card cutout/backface mismatch');
                if(['detailed','simple'].includes(role)&&((mat.alphaMode??'OPAQUE')!=='OPAQUE'||!mat.doubleSided))throw new Error('Leaf meshes must be opaque and double-sided');
            }
        }
        if(counts.wood!==model.woodTriangles||counts.cards!==model.cardTriangles||counts.detailed!==model.detailedLeafTriangles||counts.simple!==model.simpleLeafTriangles)throw new Error('Triangle receipt differs from GLB '+id);
        rows.push({...model,glbSha256:(await hashFile(file)).sha256,exportedCounts:counts});
    }
    const total=key=>rows.reduce((s,r)=>s+r[key],0);
    const report={models:rows,totals:Object.fromEntries(['woodTriangles','cardTriangles','detailedLeafTriangles','simpleLeafTriangles','canopyTriangles','totalTriangles','detailedLeaves','simpleLeaves','cards'].map(k=>[k,total(k)])),gpuBenchmark:'Deferred by user: GPU busy',publication:'Staged only'};
    await writeJson(path.join(options.output,'summary.json'),report);
    await writeFile(path.join(options.output,'triangle-counts.csv'),'model,wood,interior cards,detailed leaves,simple leaves,foliage,total\n'+rows.map(r=>[r.id,r.woodTriangles,r.cardTriangles,r.detailedLeafTriangles,r.simpleLeafTriangles,r.canopyTriangles,r.totalTriangles].join(',')).join('\n')+'\n');
    return report;
}

export async function gallery(options){
    const summary=await json(path.join(options.output,'summary.json'));const rows=[];
    if(summary.models.length!==15)throw new Error('Gallery requires the complete fifteen-model set');
    const proofs=[];
    for(const model of summary.models){
        const directory=path.join(options.output,model.id),receipt=await json(path.join(directory,'renders.json'));
        const source=path.join(directory,model.id.split('/')[1]+'_lod0_review.glb');
        if(receipt.referenceSha256!==model.referenceSha256||receipt.renderedGlbSha256!==(await hashFile(source)).sha256)throw new Error('Render source hash mismatch '+model.id);
        for(const row of receipt.renders)proofs.push({id:model.id,file:row.file,...await hashFile(path.join(options.output,row.file))});
    }
    for(const s of Object.keys(names)){
        const r=await json(path.join(options.output,s,'mature_01','renders.json'));
        for(const view of ['full','reverse','leaves','bus']){
            const a=r.renders.find(r=>r.view===view&&r.state==='reference'),b=r.renders.find(r=>r.view===view&&r.state==='hybrid');
            if(JSON.stringify(a.camera)!==JSON.stringify(b.camera))throw new Error('Unmatched cameras');
            rows.push({species:s,view,a,b,ratio:b.occupiedPixels/a.occupiedPixels});
        }
    }
    const html=(content)=>`<!doctype html><html><head><meta charset="utf-8"><title>Hybrid LOD0 review</title><link rel="stylesheet" href="review.css"></head><body>${content}</body></html>`;
    const sheet=r=>`<section id="${r.species}_${r.view}"><h2>${names[r.species]} · ${r.view}</h2><div class="pair"><figure><figcaption>Updated reference</figcaption><img src="${r.a.file.replaceAll('\\','/')}"></figure><figure><figcaption>Hybrid LOD0 · ${(r.ratio*100).toFixed(1)}% projected coverage</figcaption><img src="${r.b.file.replaceAll('\\','/')}"></figure></div></section>`;
    await copyFile(path.join(options.root,'tools/bake_vegetation/hybrid_lod0/review.css'),path.join(options.output,'review.css'));
    const table=`<table><tr><th>Model / GLB</th><th>Wood + branchlets</th><th>Cards</th><th>Detailed leaves</th><th>Simple leaves</th><th>Total</th></tr>${summary.models.map(r=>`<tr><td><a href="${r.id}/${r.id.split('/')[1]}_lod0.glb" download>${r.id}</a></td>${[r.woodTriangles,r.cardTriangles,r.detailedLeafTriangles,r.simpleLeafTriangles,r.totalTriangles].map(n=>`<td>${n.toLocaleString()}</td>`).join('')}</tr>`).join('')}</table>`;
    const variants=Object.keys(names).map(s=>`<section><h2>${names[s]} · all mature forms</h2><div class="variants">${summary.models.filter(r=>r.id.startsWith(s+'/')).map(r=>`<figure><figcaption>${r.id.split('/')[1]} · ${r.totalTriangles.toLocaleString()} triangles · <a href="${r.id}/${r.id.split('/')[1]}_lod0.blend">Blender</a></figcaption><img src="${r.id}/full_hybrid.png"></figure>`).join('')}</div></section>`).join('');
    const atlases=`<section><h2>Flat branchlet and individual leaf atlases</h2><div class="atlases">${Object.keys(names).map(s=>`<figure><figcaption>${names[s]}</figcaption><a href="${s}/canopy/flat_authoring.blend"><img src="${s}/canopy/leaf_color.png"></a></figure>`).join('')}</div></section>`;
    await writeFile(path.join(options.output,'index.html'),html(`<h1>Hybrid LOD0</h1><p>Detailed silhouette leaves · simpler curved volume leaves · flat interior branchlets. CPU Cycles. GPU benchmarking deferred.</p><p>Staged review assets. Wind is unrigged; front/back tissue color is shared. Coverage is projected alpha, including wood, not physical crown volume.</p>${table}${variants}${atlases}${rows.map(sheet).join('')}`));
    await writeFile(path.join(options.output,'overview.html'),html(`<h1>Updated references → hybrid LOD0</h1>${rows.filter(r=>r.view==='full').map(sheet).join('')}`));
    await writeFile(path.join(options.output,'variants.html'),html(`<h1>All 15 hybrid LOD0 models</h1>${variants}`));
    const browser=await chromium.launch({executablePath:options.browserExecutable,headless:true,args:['--disable-gpu']});
    try{
        const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
        await page.goto(new URL('file:///'+path.join(options.output,'index.html').replaceAll('\\','/')).href);await page.locator('img').evaluateAll(images=>Promise.all(images.map(i=>i.decode())));
        for(const row of rows)await page.locator('#'+row.species+'_'+row.view).screenshot({path:path.join(options.output,row.species+'_'+row.view+'.png')});
        await page.goto(new URL('file:///'+path.join(options.output,'overview.html').replaceAll('\\','/')).href);await page.locator('img').evaluateAll(images=>Promise.all(images.map(i=>i.decode())));
        await page.screenshot({path:path.join(options.output,'overview.png'),fullPage:true});
        await page.goto(new URL('file:///'+path.join(options.output,'variants.html').replaceAll('\\','/')).href);await page.locator('img').evaluateAll(images=>Promise.all(images.map(i=>i.decode())));
        await page.screenshot({path:path.join(options.output,'all_variants.png'),fullPage:true});
    }finally{await browser.close();}
    await writeJson(path.join(options.output,'review.json'),{rows,proofs,coverageMetric:'Whole-tree rendered alpha above 0.5, including wood; not physical crown volume or FPS'});
}
