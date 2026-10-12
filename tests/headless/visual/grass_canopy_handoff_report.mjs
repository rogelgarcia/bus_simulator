// Assemble the actual renders and raw measurements from the reported seam poses.
import { readFile, writeFile } from 'node:fs/promises';

const root = 'tests/artifacts/screens/grass_debug_v2/canopy_handoff';
const before = JSON.parse(await readFile(`${root}/hardware-before/results.json`, 'utf8'));
const after = JSON.parse(await readFile(`${root}/final/results.json`, 'utf8'));
const jitter = JSON.parse(await readFile(`${root}/final/transition-only.json`, 'utf8'));
const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
const names = { bus: 'Bus camera', high: 'High camera', oblique: 'Oblique camera' };
const motion = (data, pose) => mean(data.results.find(row => row.pose === pose && row.motion).motion.slice(1)
    .flatMap(frame => frame.bins.filter(bin => [35, 37, 39].includes(bin.distance)).map(bin => bin.motion)));
const rows = Object.entries(names).map(([pose, name]) => {
    const old = jitter.rows.find(row => row.pose === pose && row.style === 'dissolve');
    const current = jitter.rows.find(row => row.pose === pose && row.style === 'canopy');
    return `<tr><td>${name}</td><td>${(100 * (1 - motion(after, pose) / motion(before, pose))).toFixed(1)}%</td><td>${(100 * (1 - current.changedFraction / old.changedFraction)).toFixed(1)}%</td><td>${old.rms.toFixed(2)} → ${current.rms.toFixed(2)}</td></tr>`;
}).join('');
await writeFile(`${root}/index.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><title>Grass canopy handoff</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{margin:24px;background:#14231c;color:#e1eadf;font:17px system-ui}main{max-width:1250px;margin:auto}a{color:#b9d797}select,button{font:inherit;background:#294230;color:inherit;padding:10px;border:1px solid #70966b;border-radius:5px}label{display:inline-flex;align-items:center;gap:10px;margin:10px 25px 15px 0}input{width:220px}#view{position:relative;width:100%;aspect-ratio:1040/952;background:#24352a}#view img{position:absolute;width:100%;height:100%;object-fit:fill}#left{clip-path:inset(0 50% 0 0)}#line{position:absolute;left:50%;height:100%;border-left:1px solid #fff8}#labels{position:absolute;inset:14px 14px auto;display:flex;justify-content:space-between}#labels span{background:#10231dde;padding:10px}table{border-collapse:collapse;width:100%;font-size:15px}td,th{border-bottom:1px solid #537054;padding:10px;text-align:left}p{line-height:1.55}.note{color:#becbbd}button[aria-pressed=true]{background:#4c7041}</style><main>
<h1>Grass: continuous canopy handoff</h1><p>Same camera, before and after. LOD4 blends into the finer far texture over 31.5–40 m. The near blades retain depth and opaque coverage.</p>
<label>Camera <select id="pose">${Object.entries(names).map(([id, name]) => `<option value="${id}">${name}</option>`).join('')}</select></label><label>Split <input id="split" type="range" min="0" max="100" value="50"></label><button id="motion" aria-pressed="false">Play small camera-motion loop</button>
<div id="view"><img id="right" alt="Continuous handoff"><img id="left" alt="Previous dissolve"><div id="line"></div><div id="labels"><span>Before · dissolve</span><span>After · continuous canopy</span></div></div>
<p class="note">The motion loop covers 0.24 m, using five actual captures in each direction. Ordinary grass aliasing remains; the new fade removes the abrupt pixel exchange at the final handoff. A flat texture still cannot reproduce every blade silhouette.</p>
<table><thead><tr><th>Pose</th><th>Less motion variation</th><th>Fewer fade-only jumps &gt;8 RGB</th><th>Fade-only RMS · before → after</th></tr></thead><tbody>${rows}</tbody></table>
<p class="note">Motion variation is mean absolute luminance change for 1 cm translations in the 35–39 m interior strip. Fade-only results hold the camera still and advance the final fade by 2 cm per step. All captures use RTX 3060 / D3D11, 1040 × 952, DPR 1.</p>
<p class="note">Final GPU cost is inconclusive: the soil-only baseline varied from 0.59 to 26.11 ms across rounds. The raw timing run is retained below, but its averages are unsuitable for claiming a speed improvement or regression. It used four rotating-order rounds × 64 queries per mode and pose, switching old/new fade logic, overlap width and UV frequency on the same prepared assets.</p>
<p><a href="../../../../../debug_tools/grass_debug_v2.html?grass=baked&revision=canopy-color-16">Open live bus scene</a> · <a href="final/results.json">Motion and GPU measurements</a> · <a href="final/transition-only.json">Fade-only measurements</a></p>
<script>const pose=document.querySelector('#pose'),split=document.querySelector('#split'),left=document.querySelector('#left'),right=document.querySelector('#right'),line=document.querySelector('#line'),motion=document.querySelector('#motion');let playing=false,frame=0;const frames=[0,6,12,18,24,18,12,6];function update(){const suffix=playing?'motion-'+frames[frame%frames.length]:'AUTO';left.src='hardware-before/'+pose.value+'-'+suffix+'.png';right.src='final/'+pose.value+'-'+suffix+'.png';}pose.onchange=()=>{frame=0;update()};split.oninput=()=>{left.style.clipPath='inset(0 '+(100-split.value)+'% 0 0)';line.style.left=split.value+'%'};motion.onclick=()=>{playing=!playing;motion.setAttribute('aria-pressed',playing);motion.textContent=playing?'Pause motion loop':'Play small camera-motion loop';frame=0;update()};setInterval(()=>{if(playing){frame++;update()}},180);update();</script></main></html>`);
