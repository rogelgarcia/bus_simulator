// Lightweight projections of the real spatial graph while Blender review resources are occupied.
import path from 'node:path';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {generate3D,presets} from '../branching_study/model3d.mjs';
import {svg} from '../branching_study/draw.mjs';
import {writeJson,listFiles,hashFile} from '../../baking/Files.mjs';
import {withBakeBrowser} from '../../baking/Browser.mjs';
export async function preview(ctx,output,ids,seeds,references){
    const models=[];let content='';
    await copyFile(path.join(ctx.root,'tools/bake_vegetation/ramification3d/review.css'),path.join(output,'review.css'));
    for(const id of ids){
        content+=`<section id="${id}"><h2>${id}</h2><p>3D graph projection only · saved EEVEE mesh review pending</p><div class="references"><img src="${references.find(r=>r.id===id&&r.collection==='complete-studies').file}"></div>`;
        for(const seed of seeds){
            const folder=path.join(output,id,'seed-'+seed),graph=generate3D({...presets[id],seed});await mkdir(folder,{recursive:true});
            await writeJson(path.join(folder,'graph.json'),graph);models.push({species:id,seed,audit:graph.audit,stopped:graph.stopped});
            content+=`<h3>Seed ${seed}</h3><div class="views">`;
            for(const [name,angle] of [['front',0],['side',Math.PI/2],['oblique',Math.PI/4],['rear_oblique',-Math.PI/4]]){
                const paths=graph.paths.map(p=>({...p,points:p.points.map(([x,y,z])=>[x*Math.cos(angle)+z*Math.sin(angle),y])}));
                const file=`${id}/seed-${seed}/${name}.svg`;await writeFile(path.join(output,file),svg(paths));
                content+=`<figure><img src="${file}"><figcaption>${name}</figcaption></figure>`;
            }
            content+='</div>';
        }
        content+='</section>';
    }
    await writeFile(path.join(output,'index.html'),`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="review.css"><title>Spatial graph preview</title></head><body>${content}</body></html>`);
    await withBakeBrowser(ctx,{width:1920,height:1080},async(page,url)=>{
        await page.goto(url+'/'+path.relative(ctx.root,output).split(path.sep).join('/')+'/index.html');
        await page.locator('img').evaluateAll(async imgs=>{for(const img of imgs)await img.decode();});
        for(const id of ids)await page.locator('#'+id).screenshot({path:path.join(output,id,'preview.png')});
    });
    const files=[];for(const file of await listFiles(output))files.push({file:path.relative(output,file).split(path.sep).join('/'),...await hashFile(file)});
    await writeJson(path.join(output,'manifest.json'),{format:'shared-ramification-3d-preview',complete:false,models,references,files});
    await ctx.assertInputsStable();return {state:'validated',directory:output,files:await listFiles(output)};
}
