// Recompile captured production variants to isolate driver warnings from package loading.
import {test,expect} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';

test.use({video:'off',trace:'off'});
test('Captured baked shaders compile without divergent texture gradients or undefined irradiance',async({page})=>{
    test.skip(!process.env.BAKED_SHADER_CAPTURE,'Set BAKED_SHADER_CAPTURE to a replay shaders.json.');
    test.setTimeout(180000);
    const captured=JSON.parse(await readFile(process.env.BAKED_SHADER_CAPTURE,'utf8'));
    const functionSource=(text,start,end)=>text.slice(text.indexOf(start),text.indexOf(end));
    const replacements=await Promise.all([
        ['lighting/calibrated_diffuse_ibl.frag.glsl','before-calibrated.glsl'],
        ['lighting/finite_sun_shadow.frag.glsl','before-finite.glsl'],
        ['materials/dynamic_sun_shadow.frag.glsl','before-dynamic.glsl']
    ].map(async([file,old])=>[await readFile('tests/artifacts/screens/baked_shader_loading/'+old,'utf8'),await readFile('src/graphics/shaders/'+file,'utf8')]));
    for(const [file,old,start,end] of [
        ['static_sun_depth.frag.glsl','before-static.glsl','highp float staticSunDepthLinearCompare(','highp vec4 staticSunDepthLookup('],
        ['streamed_sun_depth.frag.glsl','before-streamed.glsl','highp vec2 staticSunStreamVisibility(','highp vec2 staticSunStreamLookup(']
    ]) replacements.push([functionSource(await readFile('tests/artifacts/screens/baked_shader_loading/'+old,'utf8'),start,end),functionSource(await readFile('src/graphics/shaders/materials/'+file,'utf8'),start,end)]);
    const specialize=process.env.BAKED_SHADER_EXPERIMENT==='final-specialization';
    const cases=captured.filter(p=>/X3595|X4000/.test(p.log)).sort((a,b)=>b.shaders[1].source.length-a.shaders[1].source.length).slice(0,specialize?1:3);
    expect(cases.length,'The capture must contain the reported driver warnings.').toBeGreaterThan(0);
    await page.goto('/tests/headless/harness/index.html?ibl=0');
    const result=await page.evaluate(async({cases,replacements,specialize})=>{
        const gl=document.createElement('canvas').getContext('webgl2');
        const parallel=gl.getExtension('KHR_parallel_shader_compile');
        const results=[];
        for(const entry of cases)for(const mode of specialize?['after','specialized']:['before','after']){
            const started=performance.now(),program=gl.createProgram(),shaders=[];
            for(const source of entry.shaders){
                let text=source.source.replaceAll('\r\n','\n');
                if(mode!=='before')for(const [old,next] of replacements)text=text.replace(old.replaceAll('\r\n','\n').trim(),next.replaceAll('\r\n','\n').trim());
                if(mode==='specialized')text=text.replace('uniform int staticSunDepthDebugMode;', 'const int staticSunDepthDebugMode = 0;');
                const shader=gl.createShader(source.type);gl.shaderSource(shader,text);gl.compileShader(shader);gl.attachShader(program,shader);shaders.push(shader);
            }
            gl.linkProgram(program);
            if(parallel)while(!gl.getProgramParameter(program,parallel.COMPLETION_STATUS_KHR))await new Promise(resolve=>setTimeout(resolve,16));
            results.push({id:entry.id,mode,ms:performance.now()-started,linked:gl.getProgramParameter(program,gl.LINK_STATUS),log:gl.getProgramInfoLog(program)});
            gl.deleteProgram(program);shaders.forEach(s=>gl.deleteShader(s));
        }
        gl.getExtension('WEBGL_lose_context')?.loseContext();return results;
    },{cases,replacements,specialize});
    await mkdir('tests/artifacts/screens/baked_shader_loading',{recursive:true});
    await writeFile('tests/artifacts/screens/baked_shader_loading/'+(specialize?'specialized':'isolated')+'.json',JSON.stringify(result,null,2));
    console.log(JSON.stringify(result));
    for(const entry of result){expect(entry.linked).toBe(true);if(entry.mode!=='before')expect(entry.log).not.toMatch(/X3595|X4000/);}
});
