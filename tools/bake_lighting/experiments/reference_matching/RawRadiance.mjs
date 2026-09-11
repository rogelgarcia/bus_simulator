// Capture scene-linear native beauty and ambient transport without changing lighting settings.
import path from 'node:path';
import {mkdir,open} from 'node:fs/promises';
import {writeJson} from '../../../baking/Files.mjs';

export async function rawRadiance(page, output) {
    await mkdir(output);
    const metadata = await page.evaluate(async () => {
        const THREE = await import('three');
        const engine = window.__busSim.engine, renderer = engine.renderer;
        const size = renderer.getDrawingBufferSize(new THREE.Vector2());
        const target = new THREE.WebGLRenderTarget(size.x,size.y,{type:THREE.FloatType,format:THREE.RGBAFormat});
        target.texture.colorSpace = THREE.LinearSRGBColorSpace;
        window.__ai562Raw = {THREE,engine,renderer,target,width:size.x,height:size.y};
        return {width:size.x,height:size.y,format:'little-endian RGBA float32, bottom-up',
            semantics:'Native scene render before display and postprocessing; combined and ambient retain material AO. Sun is combined minus ambient. The separate ambient_no_material_ao pass sets only material aoMapIntensity to zero and restores it before another frame. Ambient includes sky, baked diffuse, reflections and emission; it is not Cycles diffuse-indirect.'};
    });
    try {
        for (const pass of ['combined','ambient','ambient_no_material_ao']) {
            const byteLength = await page.evaluate(pass => {
                const {THREE,engine,renderer,target,width,height} = window.__ai562Raw;
                const previous={target:renderer.getRenderTarget(),tone:renderer.toneMapping,color:renderer.outputColorSpace};
                const lights=[], materials=new Map();
                engine.scene.traverse(object=>{if(object.isDirectionalLight)lights.push([object,object.intensity]);});
                if(pass==='ambient_no_material_ao')engine.scene.traverse(object=>{
                    for(const material of Array.isArray(object.material)?object.material:[object.material])
                        if(material?.aoMap&&!materials.has(material))materials.set(material,material.aoMapIntensity);
                });
                try {
                    if(pass!=='combined')for(const [light] of lights)light.intensity=0;
                    for(const material of materials.keys())material.aoMapIntensity=0;
                    renderer.toneMapping=THREE.NoToneMapping;renderer.outputColorSpace=THREE.LinearSRGBColorSpace;
                    renderer.setRenderTarget(target);renderer.clear();renderer.render(engine.scene,engine.camera);
                    const pixels=new Float32Array(width*height*4);renderer.readRenderTargetPixels(target,0,0,width,height,pixels);
                    window.__ai562Raw.bytes=new Uint8Array(pixels.buffer);
                    return pixels.byteLength;
                } finally {
                    for(const [material,intensity] of materials)material.aoMapIntensity=intensity;
                    for(const [light,intensity] of lights)light.intensity=intensity;
                    renderer.setRenderTarget(previous.target);renderer.toneMapping=previous.tone;renderer.outputColorSpace=previous.color;
                }
            },pass);
            // Bound browser strings and protocol messages for UHD float images.
            const file=await open(path.join(output,pass+'.rgba32f'),'wx');
            try {
                for(let offset=0;offset<byteLength;offset+=1048576){
                    const encoded=await page.evaluate(offset=>{
                        const bytes=window.__ai562Raw.bytes.subarray(offset,offset+1048576),parts=[];
                        for(let i=0;i<bytes.length;i+=32768)parts.push(String.fromCharCode(...bytes.subarray(i,i+32768)));
                        return btoa(parts.join(''));
                    },offset);
                    await file.write(Buffer.from(encoded,'base64'));
                }
            } finally {
                await file.close();
                await page.evaluate(()=>{delete window.__ai562Raw.bytes;});
            }
        }
    } finally {
        await page.evaluate(()=>{window.__ai562Raw.target.dispose();delete window.__ai562Raw;});
    }
    await writeJson(path.join(output,'metadata.json'),metadata);
}
