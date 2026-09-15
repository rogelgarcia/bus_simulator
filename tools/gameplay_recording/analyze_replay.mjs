// Summarizes submission-matched replay costs and recurrence at recorded route locations.
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { distribution } from '../bake_lighting/shadows/streamed/FrameSamples.mjs';

const [outputArg, ...inputs] = process.argv.slice(2);
if (!outputArg || !inputs.length) throw new Error('Usage: node tools/gameplay_recording/analyze_replay.mjs <artifact-output-directory> <frames.json> [...]');
const output = path.resolve(outputArg), allowed = path.resolve('tests/artifacts/screens');
if (!output.startsWith(allowed + path.sep)) throw new Error('Output must be under tests/artifacts/screens/');
const metrics = ['gpu', 'cpu', 'frameMs'], runs = [], groups = new Map();
for (const input of inputs) {
    const data = JSON.parse(await readFile(input, 'utf8'));
    if (!data.frames?.length || !data.finalTimer || data.initialTimer.disjointCount !== data.finalTimer.disjointCount)
        throw new Error('Missing frames or invalid GPU provenance: ' + input);
    const run = path.basename(path.dirname(input)), laps = [];
    for (const lap of [...new Set(data.frames.map(f => f.lap))]) {
        const frames = data.frames.filter(f => f.lap === lap), excursions = [];
        for (let i = 0; i < frames.length; i++) {
            const f = frames[i], neighbours = frames.slice(Math.max(0,i-30),Math.min(frames.length,i+31));
            const causes = metrics.filter(key => {
                if (!Number.isFinite(f[key])) return false;
                const median = distribution(neighbours.map(n => n[key])).median;
                return f[key] > Math.max(1.75 * median, median + 10);
            });
            if (!causes.length) continue;
            const previous = frames[i-1] || f;
            const row = {...f,hex:f.sourceFrame.toString(16),causes,
                uploadsDelta:(f.streamingUploads||0)-(previous.streamingUploads||0),
                requestsDelta:(f.streamingRequests||0)-(previous.streamingRequests||0),
                programsDelta:f.programs-previous.programs,texturesDelta:f.textures-previous.textures,
                longTasks:data.longTasks.filter(task => task.start < f.startMs + f.cpu && task.start + task.ms > f.startMs - (f.frameMs||0))};
            excursions.push(row);
            const bucket = Math.floor(f.sourceFrame/32)*32;
            const group = groups.get(bucket) || {hex:bucket.toString(16),passes:new Set(),events:0};
            group.passes.add(`${run}/${lap}`); group.events++; groups.set(bucket,group);
        }
        laps.push({lap,frames:frames.length,matchedGpu:frames.filter(f=>Number.isFinite(f.gpu)).length,
            timings:Object.fromEntries(metrics.map(key=>[key,distribution(frames.map(f=>f[key]))])),
            above50ms:Object.fromEntries(metrics.map(key=>[key,frames.filter(f=>f[key]>50).length])),
            excursions,worst: Object.fromEntries(metrics.map(key=>[key,[...frames].filter(f=>Number.isFinite(f[key])).sort((a,b)=>b[key]-a[key]).slice(0,5)]))});
    }
    runs.push({run,input,laps,longTasks:data.longTasks,initialTimer:data.initialTimer,finalTimer:data.finalTimer});
}
const recurrence = [...groups.values()].map(g=>({...g,passes:[...g.passes]})).sort((a,b)=>b.passes.length-a.passes.length);
await mkdir(output,{recursive:true});
await writeFile(path.join(output,'analysis.json'),JSON.stringify({policy:'Excursion: over both 1.75x and local median +10ms (61-frame centred window, same lap). Recurrence bins are 32 source frames; inspect individual events before inferring a route cause. CPU phases overlap and must not be summed.',runs,recurrence},null,2));
const lines=['# Repeated route timing','', '| Run / lap | GPU median / p99 / max | CPU median / p99 / max | Interval median / p99 / max | Excursions |','|---|---:|---:|---:|---:|'];
for(const run of runs)for(const lap of run.laps){
    const values=metrics.map(key=>{const s=lap.timings[key];return [s.median,s.p99,s.maximum].map(v=>v.toFixed(2)).join(' / ');});
    lines.push(`| ${run.run} / ${lap.lap+1} | ${values.join(' | ')} | ${lap.excursions.length} |`);
}
await writeFile(path.join(output,'summary.md'),lines.join('\n')+'\n');
console.log(lines.join('\n'));
console.log('Recurrent source bins:',JSON.stringify(recurrence.slice(0,10)));
