// Matched historical and adjacent LOD comparisons with independently selectable images.
import { writeFile } from 'node:fs/promises';

export async function writeGrassBakedConsistencyReport(output, data) {
    const options = selected => data.versions.map(version => `<optgroup label="${version.label}">${data.levels.map(lod => {
        const value = `${version.id}:${lod}`;
        return `<option value="${value}"${value === selected ? ' selected' : ''}>${version.label} · ${lod}</option>`;
    }).join('')}</optgroup>`).join('');
    await writeFile(`${output}/index.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Grass LOD appearance comparison</title><style>
*{box-sizing:border-box}body{margin:0;background:#17231c;color:#edf4e7;font:16px system-ui}main{max-width:1540px;margin:auto;padding:20px}h1{font-size:25px;margin:0 0 8px}p{line-height:1.5;max-width:1100px}a{color:#c1e695}.controls{display:flex;flex-wrap:wrap;gap:14px;align-items:end;margin:20px 0}label{display:flex;flex-direction:column;gap:5px}select,button{font:inherit;padding:8px;background:#283d2b;color:inherit;border:1px solid #74946a;border-radius:4px}button{cursor:pointer}figure{margin:0;position:relative;aspect-ratio:1360/900;overflow:hidden;background:#223428}figure img{position:absolute;inset:0;width:100%}.tag{position:absolute;top:12px;padding:8px 12px;background:#182b21e8}.left{left:12px}.right{right:12px}#divider{position:absolute;top:0;bottom:0;width:1px;background:#e8f1dfb0;pointer-events:none}.note{color:#bdcbbb;font-size:14px}#metrics{font-variant-numeric:tabular-nums}input[type=range]{width:200px}nav{display:flex;flex-wrap:wrap;gap:18px}</style>
<main><h1>Grass · matching the distance bands</h1>
<nav><a id="live" href="#">Open right view in the live lab</a><a href="../all_lod_benchmark/index.html#performance">Earlier performance results</a><a href="results.json">Measurements</a></nav>
<p>LOD2 reaches 20 m; LOD3 covers 20–30 m; LOD4 covers 30–40 m; LOD5 is the far texture beyond 40 m. Narrow blends finish at each limit. Every bus pose keeps the game camera's 4.5 m height, tilt and field of view. No roof or posts.</p>
<div class="controls"><button id="band3">20–30 m · LOD2 / 3</button><button id="band4">30–40 m · LOD3 / 4</button><button id="band5">40–50 m · LOD4 / 5</button><label>Show full scene<input id="full-scene" type="checkbox"></label></div>
<div class="controls"><label>Bus view<select id="pose">${data.poses.map(pose => `<option${pose === 'bus_25m_front' ? ' selected' : ''}>${pose}</option>`).join('')}</select></label>
<label>Left version / LOD<select id="left-lod">${options('detailed:LOD2')}</select></label>
<label>Right version / LOD<select id="lod">${options('detailed:LOD3')}</select></label>
<label>Split<input id="split" type="range" min="0" max="100" value="50"></label><button id="swap">Swap sides</button></div>
<div class="controls"><strong id="left-label"></strong><span>← left · right →</span><strong id="right-label"></strong></div>
<figure><img id="right" alt="Tuned grass"><img id="left" alt="Reference grass"><span id="divider"></span></figure>
<p id="metrics" class="note"></p>
<p>The default crop shows the middle half of the image at 2× magnification, around the selected distance band. Measurements exclude grass outside that band. Use “Show full scene” for the complete camera view, including out-of-range foreground. The camera pose itself is measured to the layout center.</p>
<p>Range matched v9 replaces the broad LOD3/4 tuft cards with spatially distributed individual LOD2 blades. Width and baked color compensate for the reduced leaf count while retaining shaded roots and blade faces. This uses more triangles than v8 cards, fewer than LOD2, and removes the card atlas and billboard projection for these levels. Detailed canopy v10 keeps those same blades and restores LOD5 texture detail with linear filtering, 16× anisotropy and prepared mip contrast. The 1K maps, shader and geometry are unchanged. Its leaf/cavity variation is visible again, with a less uniformly green palette. V9 remains available for before/after comparison. LOD5 is still a flat surface without upright blade parallax. V5 and v6 are removed from these menus; the other comparisons remain selectable. These captures are visual comparisons, not performance timings.</p>
<script>
const rows=${JSON.stringify(data.rows)},versions=${JSON.stringify(data.versions)},el=id=>document.getElementById(id);
function selection(id){const [version,lod]=el(id).value.split(':');return {version,lod,info:versions.find(item=>item.id===version)};}
function update(){
 const pose=el('pose').value,left=selection('left-lod'),right=selection('lod');
 for(const [side,item] of [['left',left],['right',right]]){el(side).src=pose+'-'+item.version+'-'+item.lod+'.png';el(side+'-label').textContent=item.info.label+' · '+item.lod;}
 el('left').style.clipPath='inset(0 '+(100-el('split').value)+'% 0 0)';el('divider').style.left=el('split').value+'%';
 el('live').href='/debug_tools/grass_baked_lighting_scene.html?revision=lod-canopy-detail-10&shelter=0&strategy='+right.info.strategy+'&appearance='+right.info.appearance+'&lod='+right.lod+'&pose='+pose;
 const a=rows.find(r=>r.pose===pose&&r.lod===left.lod&&r.version===left.version),b=rows.find(r=>r.pose===pose&&r.lod===right.lod&&r.version===right.version);
 const crop=!el('full-scene').checked&&a.crop,figure=document.querySelector('figure');
 figure.style.aspectRatio=crop?'680/'+crop.height:'1360/900';
 for(const image of figure.querySelectorAll('img')){image.style.width=crop?'200%':'100%';image.style.left=crop?'-50%':'0';image.style.top=crop?(-crop.top/crop.height*100)+'%':'0';image.style.bottom='auto';}
 const split=Number(el('split').value);el('left').style.clipPath='inset(0 '+(crop?75-split/2:100-split)+'% 0 0)';
 el('metrics').textContent=(a.band?'Measured ground distance '+a.band.join('–')+' m. ':'')+'Green coverage: '+(a.greenCoverage*100).toFixed(1)+'% → '+(b.greenCoverage*100).toFixed(1)+'%. Mean RGB: '+a.rgb.map(Math.round).join(' / ')+' → '+b.rgb.map(Math.round).join(' / ')+'. Fine-detail contrast: '+a.detailContrast.toFixed(1)+' → '+b.detailContrast.toFixed(1)+'. Matching averages alone does not imply matching depth.';
}
for(const id of ['pose','left-lod','lod','split','full-scene'])el(id).addEventListener('input',update);
for(const [id,distance,from,to] of [['band3',25,2,3],['band4',35,3,4],['band5',45,4,5]])el(id).onclick=()=>{const direction=el('pose').value.split('_')[2]||'front';el('pose').value='bus_'+distance+'m_'+direction;el('left-lod').value='detailed:LOD'+from;el('lod').value='detailed:LOD'+to;el('full-scene').checked=false;update();};
el('swap').onclick=()=>{const previous=el('lod').value;el('lod').value=el('left-lod').value;el('left-lod').value=previous;update();};
const selectHash=()=>{if(location.hash==='#lod5')el('band5').click();};window.addEventListener('hashchange',selectHash);update();selectHash();
</script></main></html>`);
}
