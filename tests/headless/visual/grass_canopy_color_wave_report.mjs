// Compare the real forward-motion captures at the reported bus pose.
import { readFile, writeFile } from 'node:fs/promises';
const root = 'tests/artifacts/screens/grass_debug_v2/canopy_color_wave';
const before = JSON.parse(await readFile(`${root}/before/results.json`, 'utf8'));
const after = JSON.parse(await readFile(`${root}/after/results.json`, 'utf8'));
const frames = [-20.934, -18.934, -16.934, -14.934, -12.934, -10.934, -8.934, -6.934];
const range = data => {
    const values = data.results.filter(row => row.mode === 'LOD5').map(row => row.patch.luma);
    return Math.max(...values) - Math.min(...values);
};
await writeFile(`${root}/index.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><title>Grass mip brightness correction</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{background:#15231d;color:#e3eee5;font:17px system-ui;margin:25px}main{max-width:1360px;margin:auto}a{color:#c2dd95}select,button{background:#2a4332;color:inherit;font:inherit;padding:9px;border:1px solid #758f6a;border-radius:5px}label{display:inline-flex;align-items:center;gap:10px;margin:8px 24px 18px 0}#view{position:relative;aspect-ratio:1360/952}img{position:absolute;width:100%;height:100%}#before{clip-path:inset(0 50% 0 0)}#line{position:absolute;left:50%;height:100%;border-left:1px solid #fff9}.labels{position:absolute;inset:12px 12px auto;display:flex;justify-content:space-between}.labels span{padding:10px;background:#15231ddd}p{line-height:1.5}input{width:200px}</style>
<main><h1>Grass: stable mip brightness</h1><p>The 58% brightness step between texture levels has been removed. Prepared highlights and a constant tint now match the blade palette; the shared angle correction follows grazing tips. No additional texture fetches or draws.</p>
<label>Grass <select id="mode"><option>AUTO</option><option>LOD5</option></select></label>
<label>Split <input id="split" type="range" min="0" max="100" value="50"></label>
<label>Forward movement <input id="frame" type="range" min="0" max="7" value="4"></label><button id="play">Play forward / back</button>
<div id="view"><img id="after" alt="Corrected canopy palette"><img id="before" alt="Previous mip brightness step"><div id="line"></div><div class="labels"><span>Before (v15)</span><span>After (v17)</span></div></div>
<p>Fixed ground-patch brightness change in forced LOD5 over 14 m: <strong>${range(before).toFixed(2)} → ${range(after).toFixed(2)} / 255</strong>. AUTO supports the captured motion sequence; forced LOD5 shows the supplied camera pose. Fine texture shimmer and natural view-dependent shading can remain.</p>
<p><a href="../../../../../debug_tools/grass_debug_v2.html?grass=baked&revision=canopy-palette-17">Open updated bus scene</a> · <a href="before/results.json">Before measurements</a> · <a href="after/results.json">After measurements</a></p></main>
<script>
const positions=${JSON.stringify(frames)},mode=document.querySelector('#mode'),frame=document.querySelector('#frame'),split=document.querySelector('#split'),play=document.querySelector('#play');let playing=false,direction=1;
function update(){const z=mode.value==='LOD5'?-12.934:positions[Number(frame.value)];for(const side of ['before','after'])document.querySelector('#'+side).src=side+'/'+mode.value+'-'+z+'.png';frame.disabled=mode.value==='LOD5';play.disabled=frame.disabled;}
mode.onchange=()=>{playing=false;play.textContent='Play forward / back';update()};frame.oninput=update;split.oninput=()=>{document.querySelector('#before').style.clipPath='inset(0 '+(100-split.value)+'% 0 0)';document.querySelector('#line').style.left=split.value+'%'};
play.onclick=()=>{playing=!playing;play.textContent=playing?'Pause':'Play forward / back'};setInterval(()=>{if(playing){let next=Number(frame.value)+direction;if(next<0||next>7){direction*=-1;next=Number(frame.value)+direction;}frame.value=next;update();}},450);update();
</script></html>`);
