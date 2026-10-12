// Builds labeled comparison sheets after validating camera-matched rendered pairs.
import path from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {hashFile} from '../../baking/Files.mjs';

export async function closeupGallery(options){
    const report=JSON.parse(await readFile(path.join(options.output,'closeups.json'),'utf8'));
    await writeFile(path.join(options.output,'closeups.css'),await readFile(new URL('closeups.css',import.meta.url)));
    const browser=await chromium.launch({headless:true,executablePath:options.browserExecutable,args:['--allow-file-access-from-files']});
    const page=await browser.newPage({viewport:{width:2560,height:100},deviceScaleFactor:1});
    const boards=[];
    try{
        for(const species of options.species){
            const rows=report.renders.filter(row=>row.species===species),first=rows[0];
            if(rows.length!==4)throw new Error('Expected two complete foliage pairs: '+species);
            for(const view of ['branchlets','underside']){
                const pair=rows.filter(row=>row.view===view);
                if(pair.length!==2||new Set(pair.map(row=>row.representation)).size!==2||JSON.stringify(pair[0].camera)!==JSON.stringify(pair[1].camera))throw new Error('Unmatched leaf cameras');
            }
            for(const row of rows)if((await hashFile(path.join(options.output,row.file))).sha256!==row.sha256)throw new Error('Changed render: '+row.file);
            const body=`<h1>${first.name}</h1><p>${first.scientific} · Mature ${options.variant.slice(-2)} · Identical cameras, scale and lighting</p><main>${rows.map(row=>`<figure><figcaption>${row.representation==='reference'?'REFERENCE · Solid 3D leaves':'LOD0 · Alpha branchlet cards'}<small>${row.view==='branchlets'?'Outer canopy / branchlets':'Upward view / leaf undersides'} · ${row.camera.horizontalSpanMetres.toFixed(2)} m across</small></figcaption><img src="${row.file}"></figure>`).join('')}</main>`;
            const html=`<!doctype html><meta charset="utf-8"><title>${first.name} leaf comparison</title><link rel="stylesheet" href="closeups.css">${body}`;
            const file=path.join(options.output,species+'.html');await writeFile(file,html);
            await page.goto(pathToFileURL(file).href);await page.evaluate(async()=>Promise.all([...document.images].map(image=>image.decode())));
            const sizes=await page.locator('img').evaluateAll(images=>images.map(image=>[image.naturalWidth,image.naturalHeight]));
            if(sizes.some(([w,h])=>w!==options.width||h!==options.width*3/4))throw new Error('Unexpected render dimensions');
            await page.screenshot({path:path.join(options.output,species+'.png'),fullPage:true});
            boards.push(`<section><h2>${first.name}</h2><a href="${species}.png"><img src="${species}.png"></a><p><a href="${species}.html">Open full comparison</a></p></section>`);
        }
    }finally{await browser.close();}
    await writeFile(path.join(options.output,'index.html'),`<!doctype html><meta charset="utf-8"><title>Reference and LOD0 leaf close-ups</title><link rel="stylesheet" href="closeups.css"><h1>Leaf close-ups · Reference and LOD0</h1><p>Five species · two matched views each · headless Eevee · original assets unchanged</p>${boards.join('')}`);
}
