// Reads clipboard recording text and optionally writes a replay pose or expanded data.
import { readFile, writeFile } from 'node:fs/promises';
import { decodeFrameRecording, recordingFramePose } from '../../src/app/gameplay/recording/FrameRecording.js';
const args=process.argv.slice(2), input=args[0];
if (!input) throw new Error('Usage: node tools/gameplay_recording/decode.mjs input.busrec [--frame 0xHEX --out pose.json] [--out expanded.json]');
const get=flag=>args.includes(flag) ? args[args.indexOf(flag)+1] : null;
const recording=await decodeFrameRecording(await readFile(input,'utf8'));
const frame=get('--frame'), output=get('--out');
if (frame!==null) {
    const index=recording.columns.frame.findIndex(value=>value===Number(frame));
    if (index<0) throw new Error(`Frame ${frame} was not recorded.`);
    const pose=recordingFramePose(recording,index), text=JSON.stringify(pose,null,2);
    if (output) await writeFile(output,text); else console.log(text);
} else if (output) {
    await writeFile(output,JSON.stringify({metadata:recording.metadata,count:recording.count,
        columns:Object.fromEntries(Object.entries(recording.columns).map(([key,value])=>[key,Array.from(value)]))}));
} else {
    console.log(JSON.stringify({frames:recording.count,firstFrame:recording.columns.frame[0],
        lastFrame:recording.columns.frame.at(-1),metadata:recording.metadata},null,2));
}
