// Measures whole-engine render submission time, frame pacing and asynchronous GPU queries in the game page.
export async function measureGamePerformance(){
    const e=window.__busSim.engine,renderer=e.renderer,original=e.updateFrame,frames=[],cpu=[],gpu=[];
    const summary=values=>{if(!values.length)return null;const a=[...values].sort((x,y)=>x-y);return {count:a.length,mean:a.reduce((x,y)=>x+y,0)/a.length,median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],maximum:a.at(-1)};};
    const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');let last=0,submission=0;
    let calls=0;
    e.updateFrame=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{submission=performance.now()-start;calls++;}};
    try{
        await new Promise(resolve=>{let remaining=240;const tick=now=>{if(remaining<=180&&last){frames.push(now-last);cpu.push(submission);const ms=e._gpuFrameTimer?.getLastMs?.();if(Number.isFinite(ms))gpu.push(ms);}last=now;if(--remaining<=0)resolve();else requestAnimationFrame(tick);};requestAnimationFrame(tick);});
        if(calls<180)throw new Error('CPU timing did not observe the active frame path');
        return {warmupFrames:60,sampleFrames:180,frameMs:summary(frames),frameSubmissionCpuMs:summary(cpu),gpuMs:summary(gpu),gpuPolicy:'Existing asynchronous whole-render timer; last completed query may repeat across sampled frames.',cpuPolicy:'Wall duration of GameEngine.updateFrame including simulation, preparation and render submission; excludes refresh waiting.',renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'unavailable',drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,programs:renderer.info.programs.length,memory:{...renderer.info.memory},jsHeapBytes:performance.memory?.usedJSHeapSize??null};
    }finally{e.updateFrame=original;}
}
