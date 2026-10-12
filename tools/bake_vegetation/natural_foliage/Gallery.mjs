// Labels paired reference renders and exposes coverage and crowding measurements.
import path from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {writeJson} from '../../baking/Files.mjs';

const NAMES={london_plane:'London plane',silver_linden:'Silver linden',northern_red_oak:'Northern red oak',american_elm:'American elm',arrowwood_viburnum:'Arrowwood viburnum'};
export async function gallery(options){
    const report=JSON.parse(await readFile(path.join(options.output,'summary.json'),'utf8'));
    const metrics=[];const species=[...new Set(report.renders.map(row=>row.id.split('/')[0]))];
    await writeFile(path.join(options.output,'gallery.css'),await readFile(new URL('gallery.css',import.meta.url)));
    const browser=await chromium.launch({headless:true,executablePath:options.browserExecutable,args:['--allow-file-access-from-files']});
    const page=await browser.newPage({viewport:{width:2560,height:100},deviceScaleFactor:1});
    try{
        for(const kind of species){
            const model=report.models.find(row=>row.id===kind+'/mature_01'),renders=report.renders.filter(row=>row.id===model.id);
            const coverage=renders.filter(row=>row.state==='before'&&row.view.startsWith('full')).map(row=>{
                const after=renders.find(r=>r.view===row.view&&r.state==='after');
                if(!after||JSON.stringify(row.camera)!==JSON.stringify(after.camera))throw new Error('Unmatched reference views');
                return {view:row.view,ratio:after.occupiedPixels/row.occupiedPixels};
            });
            if(coverage.length!==4||coverage.some(row=>row.ratio<options.minimumCoverage))throw new Error('Reference silhouette coverage fell below the review gate: '+kind);
            metrics.push({id:model.id,oldLeaves:model.oldLeafCount,newLeaves:model.leafCount,reductionPercent:model.reductionPercent,
                minimumCoverage:Math.min(...coverage.map(row=>row.ratio)),maximumCoverage:Math.max(...coverage.map(row=>row.ratio)),coverage,
                crowdingBefore:model.crowdingBefore,crowdingAfter:model.crowdingAfter});
            for(const [name,filter] of [['closeups',row=>['branchlets','underside'].includes(row.view)],['isolated',row=>row.view.startsWith('isolated')],['full',row=>row.view.startsWith('full')]]){
                const rows=renders.filter(filter);
                const title=`${NAMES[kind]} · ${name==='isolated'?'Isolated branchlet':name==='full'?'Full canopy':'Leaf close-ups'}`;
                const body=`<h1>${title}</h1><p>Previous reference → revised reference · ${model.oldLeafCount.toLocaleString()} → ${model.leafCount.toLocaleString()} leaves (${model.reductionPercent.toFixed(1)}% fewer)</p><main>${rows.map(row=>`<figure><figcaption>${row.state==='before'?'BEFORE · Original reference':'AFTER · Curved natural shoots'}<small>${row.view.replaceAll('_',' ')} · Same camera and light</small></figcaption><img src="${row.file}"></figure>`).join('')}</main>`;
                const file=path.join(options.output,kind+'_'+name+'.html');await writeFile(file,`<!doctype html><meta charset="utf-8"><title>${title}</title><link rel="stylesheet" href="gallery.css">${body}`);
                await page.goto(pathToFileURL(file).href);await page.evaluate(async()=>Promise.all([...document.images].map(image=>image.decode())));
                const sizes=await page.locator('img').evaluateAll(images=>images.map(image=>[image.naturalWidth,image.naturalHeight]));
                if(sizes.some(([w,h])=>w!==options.width||h!==Math.floor(options.width*3/4)))throw new Error('Incomplete reference renders');
                await page.screenshot({path:file.replace(/\.html$/,'.png'),fullPage:true});
            }
        }
    }finally{await browser.close();}
    await writeJson(path.join(options.output,'comparison-metrics.json'),metrics);
    const table=`<table><tr><th>Species</th><th>Old leaves</th><th>New leaves</th><th>Reduction</th><th>Silhouette coverage retained</th></tr>${metrics.map(row=>`<tr><td>${NAMES[row.id.split('/')[0]]}</td><td>${row.oldLeaves.toLocaleString()}</td><td>${row.newLeaves.toLocaleString()}</td><td>${row.reductionPercent.toFixed(1)}%</td><td>${(row.minimumCoverage*100).toFixed(1)}–${(row.maximumCoverage*100).toFixed(1)}%</td></tr>`).join('')}</table>`;
    await writeFile(path.join(options.output,'index.html'),`<!doctype html><meta charset="utf-8"><title>Natural reference foliage</title><link rel="stylesheet" href="gallery.css"><h1>Natural reference foliage</h1><p>Reference models only · Curved tapered stems, unequal shoots and less crowded leaves</p>${table}<p>Coverage is opaque projected area from four matched views, including unchanged wood. It is not a physical volume measurement.</p>${species.map(kind=>`<section><h2>${NAMES[kind]}</h2><nav><a href="${kind}_closeups.png">Canopy close-ups</a><a href="${kind}_isolated.png">Isolated branchlets</a><a href="${kind}_full.png">Four full-tree angles</a></nav><a href="${kind}_isolated.html"><img src="${kind}_isolated.png"></a></section>`).join('')}`);
}
