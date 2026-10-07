// Presents full-tree raytraced comparisons with explicit shared-billboard triangle accounting.
import path from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {hashFile,writeJson} from '../../baking/Files.mjs';

const names={london_plane:'London plane',silver_linden:'Silver linden',northern_red_oak:'Northern red oak',american_elm:'American elm',arrowwood_viburnum:'Arrowwood viburnum'};
export async function gallery(options){
    const boards=path.join(options.output,'boards');await mkdir(boards,{recursive:true});
    await writeFile(path.join(options.output,'gallery.css'),await readFile(new URL('./gallery.css',import.meta.url)));
    const renders=JSON.parse(await readFile(path.join(options.output,'comparisons/renders.json'),'utf8')).renders;
    const previousRenders=JSON.parse(await readFile(path.join(options.previous,'comparisons/renders.json'),'utf8')).renders;
    const browser=await chromium.launch({headless:true,executablePath:options.browserExecutable,args:['--allow-file-access-from-files']});
    const page=await browser.newPage({viewport:{width:2000,height:100},deviceScaleFactor:1});
    const header=title=>`<!doctype html><meta charset="utf-8"><title>${title}</title><link rel="stylesheet" href="../gallery.css"><h1>${title}</h1>`;
    const rows=[];
    try{
        for(const species of options.species){
            const manifest=JSON.parse(await readFile(path.join(options.output,species,'index.json'),'utf8'));
            for(const model of manifest.models)rows.push({species,...model});
            const revisionCards=[];
            for(const variant of ['mature_01','mature_02','mature_03']){
                revisionCards.push(`<h2>Mature ${variant.slice(-2)}</h2><div class="four">`);
                for(const level of [3,4])for(const before of [true,false]){
                    const directory=before?options.previous:options.output;
                    const row=(before?previousRenders:renders).find(r=>r.species===species&&r.variant===variant&&r.level===level&&r.azimuth===-72);
                    const model=path.join(directory,species,`${variant}_lod${level}_review.glb`);
                    if(!row||row.sha256!==(await hashFile(model)).sha256)throw new Error('Missing or stale before/after comparison');
                    const uri=path.relative(boards,path.join(directory,'comparisons',row.file)).replaceAll('\\','/');
                    revisionCards.push(`<figure><figcaption>${before?'Before':'Updated'} · LOD${level}<small>${before?'256 px foliage tiles':'512 px foliage tiles · shared cards'}</small></figcaption><img src="${uri}"></figure>`);
                }
                revisionCards.push('</div>');
            }
            const revisionFile=path.join(boards,species+'_before_after.html');
            await writeFile(revisionFile,header(names[species]+' · Foliage and bark revision')+'<p>Matched lighting and camera · unchanged triangle counts · corrected LOD3 stem color conversion</p>'+revisionCards.join(''));
            await page.goto(pathToFileURL(revisionFile).href);await page.evaluate(async()=>Promise.all([...document.images].map(i=>i.decode())));
            await page.screenshot({path:revisionFile.replace('.html','.png'),fullPage:true});
            for(const azimuth of [-72,18]){
                const cards=[];
                for(const variant of ['mature_01','mature_02','mature_03']){
                    cards.push(`<h2>Mature ${variant.slice(-2)}</h2><div class="four">`);
                    for(const level of [0,3,4,5]){
                        const row=renders.find(r=>r.species===species&&r.variant===variant&&r.level===level&&r.azimuth===azimuth);
                        if(!row)throw new Error('Missing distant comparison: '+species+'/'+variant+'/'+level);
                        const file=level===0?path.join(options.source,'lod0',species,variant,variant+'_lod0_review.glb'):path.join(options.output,species,variant+`_lod${level}_review.glb`);
                        if(row.sha256!==(await hashFile(file)).sha256)throw new Error('Stale distant comparison');
                        const record=manifest.models.find(m=>m.level===level&&m.id===variant);
                        const count=!record?'Accepted branchlet source':level===5?'2 total triangles · trunk + canopy':`${record.woodTriangles} wood + ${record.leafTriangles} leaf triangles`;
                        cards.push(`<figure><figcaption>LOD${level}<small>${count}</small></figcaption><img src="../comparisons/${row.file}"></figure>`);
                    }
                    cards.push('</div>');
                }
                const file=path.join(boards,`${species}_${azimuth}.html`);
                await writeFile(file,header(names[species]+' · Distant LODs')+`<p>Matched full-tree Cycles views · bus eye 2.2 m · azimuth ${azimuth}°</p>`+cards.join(''));
                await page.goto(pathToFileURL(file).href);await page.evaluate(async()=>Promise.all([...document.images].map(i=>i.decode())));
                await page.screenshot({path:file.replace('.html','.png'),fullPage:true});
            }
            const clusters=manifest.models.filter(m=>m.level===6);
            for(const cluster of clusters){
                const row=renders.find(r=>r.species===species&&r.variant===cluster.id&&r.level===6);
                if(!row||row.sha256!==(await hashFile(path.join(options.output,species,cluster.file.replace('.glb','_review.glb')))).sha256)throw new Error('Missing or stale cluster comparison');
            }
            const file=path.join(boards,species+'_clusters.html');
            await writeFile(file,header(names[species]+' · Ten-tree cluster plates')+'<p>Each plate: 10 represented trees, 2 triangles total, 0.2 triangles per tree.</p><div class="three">'+clusters.map(r=>`<figure><figcaption>${r.id.replace('_',' ')}<small>One shared trunk-and-canopy plate</small></figcaption><img src="../comparisons/${species}_${r.id}_lod6.png"></figure>`).join('')+'</div>');
            await page.goto(pathToFileURL(file).href);await page.evaluate(async()=>Promise.all([...document.images].map(i=>i.decode())));
            await page.screenshot({path:file.replace('.html','.png'),fullPage:true});
        }
    }finally{await browser.close();}
    const sections=options.species.map(species=>{
        const boardsHtml=['before_after','-72','18','clusters'].map((suffix,i)=>`<a href="boards/${species}_${suffix}.png">${['Before / after','Bus direction','Perpendicular direction','Ten-tree clusters'][i]}</a>`).join('');
        const downloads=rows.filter(r=>r.species===species).map(r=>`<a href="${species}/${r.file}" download>${r.id} · LOD${r.level}</a>`).join('');
        const textures=['color','normal','orm'].map(map=>`<a href="${species}/shared_leaf_${map}.ktx2" download>Shared foliage ${map}</a>`).join('');
        return `<section><h2>${names[species]}</h2><nav>${boardsHtml}</nav><a href="boards/${species}_before_after.png"><img src="boards/${species}_before_after.png" loading="lazy"></a><a href="boards/${species}_-72.png"><img src="boards/${species}_-72.png" loading="lazy"></a><nav>${downloads}</nav><p>Keep all three shared foliage textures beside the LOD3/4 models.</p><nav>${textures}</nav></section>`;
    }).join('');
    await writeFile(path.join(options.output,'index.html'),`<!doctype html><meta charset="utf-8"><title>Distant tree LOD review</title><link rel="stylesheet" href="gallery.css"><h1>Distant trees · Sharper foliage, shared cards</h1><p>LOD3/4 foliage tiles doubled from 256 to 512 pixels per side. 144 unique cards serve 270 placements across five species and three mature forms. LOD3 stem color conversion corrected; triangle counts unchanged. LOD5/6 are preserved.</p><a href="triangle-counts.csv">Download triangle counts</a>${sections}<p>Runtime LOD switching distances and gameplay placement are unchanged. Call the distant loader’s update(camera) before rendering a billboard. Cluster transforms are recorded in each species manifest; a plate must represent that same group.</p>`);
    await writeFile(path.join(options.output,'triangle-counts.csv'),'species,model,level,wood,leaves,mixed,represented_trees,triangles_per_tree\n'+rows.map(r=>[r.species,r.id,r.level,r.woodTriangles,r.leafTriangles,r.mixedTriangles,r.treeCount,r.trianglesPerTree].join(',')).join('\n')+'\n');
    await writeJson(path.join(options.output,'summary.json'),{models:rows.map(({species,id,level,woodTriangles,leafTriangles,mixedTriangles,treeCount,trianglesPerTree})=>({species,id,level,woodTriangles,leafTriangles,mixedTriangles,treeCount,trianglesPerTree})),runtimePerformanceMeasured:false});
}
