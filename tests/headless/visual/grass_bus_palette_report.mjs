// Build the matched bus-scene color and repetition comparison from the rendering test artifacts.
import { readFile, writeFile } from 'node:fs/promises';

const root = 'tests/artifacts/screens/grass_debug_v2/bus_palette';
const [before, after] = await Promise.all(['before', 'after'].map(phase => readFile(`${root}/${phase}/results.json`, 'utf8').then(JSON.parse)));
const repetitionRows = after.repeats.map(row => {
    const old = before.repeats.find(item => item.lod === row.lod);
    return `<tr><td>${row.lod}</td><td>${old.correlationX2m.toFixed(2)} / ${old.correlationZ2m.toFixed(2)}</td><td>${row.correlationX2m.toFixed(2)} / ${row.correlationZ2m.toFixed(2)}</td></tr>`;
}).join('');
await writeFile(`${root}/index.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Bus grass — palette and repetition</title>
<style>body{margin:24px;background:#142119;color:#deeadb;font:16px system-ui}a{color:#bddda5}label{display:inline-grid;gap:8px;margin:0 20px 16px 0}select{padding:9px;background:#283d2b;color:inherit}figure{margin:0;position:relative;width:100%;aspect-ratio:1360/952;background:#111}figure img{position:absolute;inset:0;width:100%;height:100%}#after{clip-path:inset(0 0 0 50%)}.tag{position:absolute;top:16px;background:#12271cdd;padding:12px}.right{right:16px}.left{left:16px}#line{position:absolute;top:0;bottom:0;left:50%;width:1px;background:white}table{border-collapse:collapse}td,th{padding:8px 20px;text-align:left;border-bottom:1px solid #456}p{max-width:1000px;line-height:1.5}</style>
<h1>Bus grass: matched colors and varied placement</h1><p>Identical cameras, lighting, ranges and dissolve widths. The latest version matches the canopy to darker roots visible from elevated views, and varies the blade arrangement and texture coordinates.</p>
<p><a href="/debug_tools/grass_debug_v2.html?grass=baked&revision=bus-palette-11">Open updated live scene</a></p>
<label>Camera<select id="pose"><option value="overview">Overview</option><option value="bus">Bus camera</option><option value="grass">Along the grass</option><option value="high">Elevated view</option></select></label>
<label>LOD<select id="lod"><option>AUTO</option><option>LOD2</option><option>LOD3</option><option>LOD4</option><option>LOD5</option></select></label>
<label>Before / after split<input id="split" type="range" value="50" min="0" max="100"></label>
<figure><img id="before" alt="Previous baked grass"><img id="after" alt="Updated baked grass"><span class="tag left">Before</span><span class="tag right">Updated</span><div id="line"></div></figure>
<p>The largest tested adjacent color-channel difference is now 6.1 / 255 across the 20, 30 and 40 m switches in four camera poses. The old overview LOD4→5 difference reached 36 / 255. This measures average color; geometry and silhouettes still differ.</p>
<table><caption>Two-meter repetition correlation (horizontal / longitudinal; lower is less repeated)</caption><tr><th>LOD</th><th>Before</th><th>Updated</th></tr>${repetitionRows}</table>
<p>LOD5 still samples one color texture and one cached external shadow. Angle correction and UV variation run on vertices; there is no live sun or normal lighting. No new blade geometry or color textures.</p>
<script>const q=id=>document.getElementById(id);function update(){for(const phase of ['before','after'])q(phase).src=phase+'/'+q('pose').value+'-'+q('lod').value+'.png';q('after').style.clipPath='inset(0 0 0 '+q('split').value+'%)';q('line').style.left=q('split').value+'%'}for(const id of ['pose','lod','split'])q(id).addEventListener('input',update);update();</script></html>`);
console.log('Wrote ' + root + '/index.html');
