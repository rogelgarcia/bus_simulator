// Packages camera-matched four-way tree boards and separate foliage-card studies.
import path from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {hashFile,writeJson} from '../../baking/Files.mjs';

const names={london_plane:'London plane',silver_linden:'Silver linden',northern_red_oak:'Northern red oak',american_elm:'American elm',arrowwood_viburnum:'Arrowwood viburnum'};
const json=async file=>JSON.parse(await readFile(file,'utf8'));
const format=number=>number.toLocaleString('en-US');

export async function gallery(options) {
    const directory=path.join(options.output,'boards'); await mkdir(directory,{recursive:true});
    await writeFile(path.join(options.output,'gallery.css'),await readFile(new URL('gallery.css',import.meta.url)));
    const renders=(await json(path.join(options.output,'comparisons/renders.json'))).renders;
    const browser=await chromium.launch({headless:true,executablePath:options.browserExecutable,args:['--allow-file-access-from-files']});
    const page=await browser.newPage({viewport:{width:1920,height:1100},deviceScaleFactor:1});
    const capture=async(file,width)=>{
        await page.setViewportSize({width,height:100}); await page.goto(pathToFileURL(file).href);
        await page.evaluate(async()=>Promise.all([...document.images].map(im=>im.decode())));
        await page.screenshot({path:file.replace(/\.html$/,'.png'),fullPage:true});
    };
    const records=[], species=[...new Set(options.models.map(id=>id.split('/')[0]))];
    try {
        for (const id of options.models) {
            const [kind,variant]=id.split('/'), rows=[], stats=[];
            for(const level of [0,1]) {
                stats[level]=await json(path.join(options.output,`lod${level}`,id,'model.json'));
                for(const state of ['before','after']) {
                    const row=renders.find(r=>r.model===id&&r.representation===`lod${level}_${state}`);
                    if(!row || row.sourceGlbSha256!==(await hashFile(row.source)).sha256) throw new Error('Missing or stale final comparison: '+id);
                    rows.push(row);
                }
            }
            if(rows.some(r=>JSON.stringify(r.camera)!==JSON.stringify(rows[0].camera)||r.samples!==rows[0].samples||r.width!==rows[0].width||r.device!==rows[0].device)) throw new Error('Comparison conditions differ');
            const title=`${names[kind]} · Mature ${variant.slice(-2)}`, stem=id.replace('/','_');
            await writeFile(path.join(directory,stem+'.html'),`<!doctype html><meta charset="utf-8"><title>${title}</title><link rel="stylesheet" href="../gallery.css"><body class="board"><h1>${title}</h1><p>Full trees · 2.2 m bus eye height · identical camera, sky, sunlight and ground</p><main class="four">${rows.map((r,i)=>`<figure><figcaption>LOD${Math.floor(i/2)} · ${i%2?'Branchlet revision':'Previous cards'}<small>${format(stats[Math.floor(i/2)].woodTriangles)} wood + ${format(stats[Math.floor(i/2)].canopyTriangles)} leaf triangles</small></figcaption><img src="../comparisons/${r.file}"></figure>`).join('')}</main></body>`);
            await capture(path.join(directory,stem+'.html'),2400);
            records.push({id,title,board:`boards/${stem}.png`,lod0:stats[0],lod1:stats[1]});
        }
        for(const kind of species) {
            const title=names[kind]+' · Exterior branchlets';
            await writeFile(path.join(directory,kind+'_cards.html'),`<!doctype html><meta charset="utf-8"><title>${title}</title><link rel="stylesheet" href="../gallery.css"><body class="cards"><h1>${title}</h1><p>Original photographic leaves attached to branching twigs. Each image is a set of three edge-card variants.</p>${[0,1].map(level=>`<h2>LOD${level}</h2><figure class="alpha"><img src="../lod${level}/${kind}/canopy/branchlets.png"></figure>`).join('')}</body>`);
            await capture(path.join(directory,kind+'_cards.html'),1600);
        }
        const overview=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="gallery.css"><body class="overview"><h1>New branchlet canopies · LOD0 and LOD1</h1><p>All five species · mature form 01 · full-tree views from bus height</p>${species.map(kind=>`<section><h2>${names[kind]}</h2><main class="two">${[0,1].map(level=>`<figure><figcaption>LOD${level} · rebuilt edge cards</figcaption><img src="comparisons/${kind}_mature_01_lod${level}_after.png"></figure>`).join('')}</main></section>`).join('')}</body>`;
        await writeFile(path.join(options.output,'overview.html'),overview); await capture(path.join(options.output,'overview.html'),1440);
        const cardOverview=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="gallery.css"><body class="overview"><h1>Connected branchlets · LOD0 exterior cards</h1>${species.map(kind=>`<h2>${names[kind]}</h2><figure class="alpha"><img src="lod0/${kind}/canopy/branchlets.png"></figure>`).join('')}</body>`;
        await writeFile(path.join(options.output,'branchlets.html'),cardOverview); await capture(path.join(options.output,'branchlets.html'),1440);
    } finally {await browser.close();}
    await writeFile(path.join(options.output,'index.html'),`<!doctype html><meta charset="utf-8"><title>Branchlet canopy review</title><link rel="stylesheet" href="gallery.css"><h1>Branchlet canopy review · LOD0 and LOD1</h1><p>Connected shoots replace leaf grids in all 15 mature forms at both levels. Wood and triangle counts are preserved.</p><nav><a href="overview.png">New trees overview</a><a href="branchlets.png">Leaf card overview</a><a href="triangle-counts.csv">Triangle counts</a></nav>${species.map(kind=>`<section><h2>${names[kind]}</h2><a href="boards/${kind}_cards.png"><img class="card-preview" src="boards/${kind}_cards.png" loading="lazy"></a>${records.filter(r=>r.id.startsWith(kind+'/')).map(r=>`<article><h3>${r.title}</h3><nav>${[0,1].map(level=>`<a href="lod${level}/${r.id}/${r.id.split('/')[1]}_lod${level}.glb" download>LOD${level} GLB</a><a href="lod${level}/${r.id}/${r.id.split('/')[1]}_lod${level}.blend" download>LOD${level} Blender</a>`).join('')}</nav><a href="${r.board}"><img src="${r.board}" loading="lazy"></a></article>`).join('')}</section>`).join('')}`);
    await writeFile(path.join(options.output,'triangle-counts.csv'),'model,lod0_wood,lod0_leaves,lod1_wood,lod1_leaves\n'+records.map(r=>[r.id,r.lod0.woodTriangles,r.lod0.canopyTriangles,r.lod1.woodTriangles,r.lod1.canopyTriangles].join(',')).join('\n')+'\n');
    const totals=Object.fromEntries([0,1].map(level=>[`lod${level}`,{wood:records.reduce((sum,r)=>sum+r[`lod${level}`].woodTriangles,0),leaves:records.reduce((sum,r)=>sum+r[`lod${level}`].canopyTriangles,0)}]));
    await writeJson(path.join(options.output,'summary.json'),{models:records.map(r=>({id:r.id,board:r.board})),totals,
        runtime:{fps:null,frameTime:null,reason:'Offline asset review; no gameplay integration or timing benchmark'},
        comparison:{engine:'Cycles',device:renders[0].device,width:renders[0].width,height:renders[0].height,samples:renders[0].samples,eyeHeight:2.2}});
    console.log(`[Branchlets] ${records.length} four-way comparisons and ${species.length} isolated card studies`);
}
