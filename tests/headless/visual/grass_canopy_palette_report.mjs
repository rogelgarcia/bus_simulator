// Review exact-camera captures of the palette correction and its LOD4 reference.
import { readFile, writeFile } from 'node:fs/promises';
const root = 'tests/artifacts/screens/grass_debug_v2/canopy_palette';
const versions = ['before', 'after'];
const summaries = [];
for (const version of versions) {
    const { results } = JSON.parse(await readFile(`${root}/${version}/results.json`, 'utf8'));
    const near = results.find(row => row.pose.name === 'reported' && row.mode === 'LOD4');
    const far = results.find(row => row.pose.name === 'reported' && row.mode === 'LOD5');
    summaries.push(Math.max(...near.bins.flatMap((bin, i) => bin.distance >= 31 && bin.distance <= 39
        ? bin.rgb.map((value, c) => Math.abs(value - far.bins[i].rgb[c])) : [])));
}
const options = versions.flatMap(version => ['AUTO', 'LOD2', 'LOD3', 'LOD4', 'LOD5'].map(mode =>
    `<option value="${version}/${mode}">${version === 'before' ? 'Previous v16' : 'Corrected v17'} · ${mode}</option>`)).join('');
await writeFile(`${root}/index.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><title>Grass palette: LOD4 to LOD5</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{background:#15231d;color:#e3eee5;font:17px system-ui;margin:24px}main{max-width:1700px;margin:auto}a{color:#c2dd95}select{background:#2a4332;color:inherit;font:inherit;padding:9px;border:1px solid #758f6a;border-radius:5px}label{display:inline-flex;align-items:center;gap:10px;margin:8px 24px 18px 0}#view{position:relative;aspect-ratio:1808/912}img{position:absolute;width:100%;height:100%}#leftImage{clip-path:inset(0 50% 0 0)}#line{position:absolute;left:50%;height:100%;border-left:1px solid #fff9}.labels{position:absolute;inset:12px 12px auto;display:flex;justify-content:space-between}.labels span{padding:10px;background:#15231ddd}p{line-height:1.5}input{width:180px}</style>
<main><h1>Grass: bounded highlights, closer endpoint colors</h1>
<p>Same camera, fields and lighting. LOD5's pale tips are compressed during texture preparation; dark roots remain. No extra textures, draws or lighting. A small grazing-angle adjustment shares the existing canopy color helper.</p>
<label>View <select id="pose"><option value="reported">Reported bus pose</option><option value="high">Elevated</option><option value="grazing">Grazing</option></select></label>
<label>Left <select id="left">${options}</select></label><label>Right <select id="right">${options}</select></label>
<label>Split <input id="split" type="range" min="0" max="100" value="50"></label>
<div id="view"><img id="rightImage" alt="Right selected grass version"><img id="leftImage" alt="Left selected grass version"><div id="line"></div><div class="labels"><span id="leftLabel"></span><span id="rightLabel"></span></div></div>
<p>Largest sampled average RGB-channel difference between forced LOD4 and LOD5 at 31–39 m in the reported view: <strong>${summaries[0].toFixed(1)} → ${summaries[1].toFixed(1)} / 255</strong>. This measures color agreement, not identical geometry. The flat far surface still has a different pattern and silhouette.</p>
<p><a href="../../../../../debug_tools/grass_debug_v2.html?grass=baked&revision=canopy-palette-17">Open bus scene</a> · <a href="before/results.json">Before measurements</a> · <a href="after/results.json">After measurements</a></p></main>
<script>
const pose=document.querySelector('#pose'),left=document.querySelector('#left'),right=document.querySelector('#right'),split=document.querySelector('#split');
left.value='before/AUTO';right.value='after/AUTO';
function update(){for(const side of ['left','right']){const select=document.querySelector('#'+side),[version,mode]=select.value.split('/');document.querySelector('#'+side+'Image').src=version+'/'+pose.value+'-'+mode+'.png';document.querySelector('#'+side+'Label').textContent=select.selectedOptions[0].textContent;}}
pose.onchange=left.onchange=right.onchange=update;split.oninput=()=>{document.querySelector('#leftImage').style.clipPath='inset(0 '+(100-split.value)+'% 0 0)';document.querySelector('#line').style.left=split.value+'%'};update();
</script></html>`);
