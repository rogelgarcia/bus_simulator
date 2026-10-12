// Presents the authenticated showroom movie and its four-angle full-tree previews.
import path from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {hashFile,writeJson} from '../../baking/Files.mjs';

export async function showroomGallery(options){
    const video=JSON.parse(await readFile(path.join(options.output,'video.json'),'utf8'));
    if((await hashFile(path.join(options.output,video.file))).sha256!==video.sha256)throw new Error('Showroom movie changed');
    await writeFile(path.join(options.output,'showroom.css'),await readFile(new URL('showroom.css',import.meta.url)));
    const frames=[1,1+options.fps*options.seconds/4,1+options.fps*options.seconds/2,1+options.fps*options.seconds*3/4].map(Math.floor);
    const rows=[],images=[];
    for(const chapter of video.chapters){
        const proof=JSON.parse(await readFile(path.join(options.output,chapter.species,'proof.json'),'utf8'));
        if(proof.renderIdentity!==options.renderIdentity||proof.sourceSha256!==chapter.sourceSha256)throw new Error('Preview source differs from the movie');
        const files=frames.map(frame=>`${chapter.species}/proof_${String(frame).padStart(4,'0')}.png`);
        for(const file of files)images.push({file,...await hashFile(path.join(options.output,file))});
        rows.push(`<section><h2>${chapter.name}</h2><p>${chapter.scientific} · ${chapter.foliageInstances.toLocaleString('en-US')} solid leaves</p><div class="angles">${files.map((file,i)=>`<a href="${file}"><img src="${file}" alt="${chapter.name}, view ${i+1}"></a>`).join('')}</div></section>`);
    }
    const header='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="showroom.css">';
    await writeFile(path.join(options.output,'index.html'),`${header}<title>Reference tree showcase</title><h1>Reference tree showcase</h1><p>Full 3D foliage · Headless Eevee · ${video.width} × ${video.height} · ${video.fps} fps · ${video.durationSeconds} seconds</p><video controls preload="metadata" poster="${images[0].file}" src="${video.file}"></video>${rows.join('')}`);
    const preview=path.join(options.output,'previews.html');
    const index=JSON.parse(await readFile(options['reference-index'],'utf8'));
    const caption=index.revision==='natural-shoots-coverage-v1'?'Approximately 10% more projected coverage for the four trees. Arrowwood unchanged.':'Detailed reference wood, curved branchlets and solid 3D leaves.';
    await writeFile(preview,`${header}<title>Reference tree previews</title><h1>Reference trees</h1><p>${caption}</p><main class="overview">${video.chapters.map(chapter=>`<a href="${chapter.species}/proof_0001.png"><img src="${chapter.species}/proof_0001.png" alt="${chapter.name}"></a>`).join('')}</main>`);
    const browser=await chromium.launch({headless:true,executablePath:options.browserExecutable,args:['--allow-file-access-from-files']});
    try{
        const page=await browser.newPage({viewport:{width:2560,height:100},deviceScaleFactor:1});
        await page.goto(pathToFileURL(preview).href);await page.evaluate(async()=>Promise.all([...document.images].map(image=>image.decode())));
        if((await page.locator('img').evaluateAll(images=>images.map(image=>[image.naturalWidth,image.naturalHeight]))).some(([w,h])=>w!==options.width||h!==options.width*9/16))throw new Error('Unexpected preview size');
        await page.screenshot({path:path.join(options.output,'previews.png'),fullPage:true});
    }finally{await browser.close();}
    await writeJson(path.join(options.output,'gallery.json'),{video:video.sha256,images});
}
