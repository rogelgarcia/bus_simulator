// Staging must preserve all HDR layers/mips and never upload the atlas again on first use.
import { test, expect } from '@playwright/test';

test('Staged receiver uploads match bulk uploads, remain cached, and cancel cleanly', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html');
    const result = await page.evaluate(async () => {
        const T = await import('three');
        const { createReceiverHdrTexture } = await import('/src/graphics/illumination/receiver_lightmaps/ReceiverHdrTexture.js');
        const { prepareReceiverTexture } = await import('/src/graphics/illumination/receiver_lightmaps/ReceiverTexturePreparation.js');
        const { encodeReceiverRgb9e5 } = await import('/src/app/illumination/receiver_lightmaps/ReceiverHdrEncoding.js');
        const renderer = new T.WebGLRenderer(), gl = renderer.getContext();
        const levels = [8,4,2].map((size, mip) => {
            const rgba = new Float32Array(size*size*3*4);
            for (let layer=0;layer<3;layer++) for(let i=0;i<size*size;i++) rgba.set([.12*(layer+1),.09*(mip+1),.02*(i+1),1],(layer*size*size+i)*4);
            return { width:size,height:size,depth:3,data:new Uint32Array(encodeReceiverRgb9e5(rgba).buffer) };
        });
        const bulk = createReceiverHdrTexture(renderer, levels), staged = createReceiverHdrTexture(renderer, levels);
        renderer.initTexture(bulk);
        const metrics = await prepareReceiverTexture(renderer, staged, levels, new AbortController().signal);
        const scene = new T.Scene(), camera = new T.Camera(), geometry = new T.PlaneGeometry(2,2);
        const material = new T.RawShaderMaterial({ glslVersion:T.GLSL3,
            uniforms:{atlas:{value:bulk},layer:{value:0},mip:{value:0}},
            vertexShader:'in vec3 position; in vec2 uv; out vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position,1.);}',
            fragmentShader:'precision highp float; precision highp sampler2DArray; uniform sampler2DArray atlas; uniform float layer; uniform float mip; in vec2 vUv; out vec4 color; void main(){color=vec4(textureLod(atlas,vec3(vUv,layer),mip).rgb,1.);}' });
        scene.add(new T.Mesh(geometry,material));
        const target = new T.WebGLRenderTarget(8,8);
        let uploads = 0; const upload = gl.texSubImage3D.bind(gl);
        gl.texSubImage3D = (...args) => { uploads++; return upload(...args); };
        const read = (texture,layer,mip) => {
            material.uniforms.atlas.value=texture; material.uniforms.layer.value=layer; material.uniforms.mip.value=mip;
            renderer.setRenderTarget(target); renderer.render(scene,camera);
            const pixels=new Uint8Array(8*8*4); renderer.readRenderTargetPixels(target,0,0,8,8,pixels); return pixels;
        };
        let equal = true;
        for(let layer=0;layer<3;layer++) for(let mip=0;mip<3;mip++) {
            const a=read(bulk,layer,mip),b=read(staged,layer,mip);equal&&=a.every((v,i)=>v===b[i]);
        }
        const repeatedUploads=uploads;
        // Large enough to cross the byte budget; cancellation leaves no live GPU allocation after owner disposal.
        const large = createReceiverHdrTexture(renderer,[{width:1024,height:1024,depth:4,data:new Uint32Array(1024*1024*4)}]);
        const controller = new AbortController();
        const pending = prepareReceiverTexture(renderer,large,large.mipmaps,controller.signal);
        controller.abort(); const cancelled = await pending.then(()=>null,e=>e.name);
        const invalidated=renderer.properties.get(large).__version!==large.version;
        const callbackRestored=typeof large.onUpdate==='function'&&large.source.dataReady===true;large.dispose();
        const mappingData = new Float32Array([.25,.5,.75,1,.75,.5,.25,1]);
        const mapping = new T.DataTexture(mappingData,2,1,T.RGBAFormat,T.FloatType);
        mapping.needsUpdate=true;
        await prepareReceiverTexture(renderer,mapping,[mapping.image],new AbortController().signal);
        const expected = new T.DataTexture(mappingData.slice(),2,1,T.RGBAFormat,T.FloatType);expected.needsUpdate=true;
        const plain = new T.MeshBasicMaterial({map:mapping,toneMapped:false});scene.children[0].material=plain;
        renderer.render(scene,camera); const a=new Uint8Array(256);renderer.readRenderTargetPixels(target,0,0,8,8,a);
        plain.map=expected;renderer.render(scene,camera);const b=new Uint8Array(256);renderer.readRenderTargetPixels(target,0,0,8,8,b);
        const mappingEqual=a.every((v,i)=>v===b[i]), error=gl.getError();
        for(const resource of [bulk,staged,mapping,expected,plain,material,geometry,target])resource.dispose();
        const textures=renderer.info.memory.textures;renderer.dispose();
        return {equal,mappingEqual,repeatedUploads,cancelled,invalidated,callbackRestored,error,textures,bytes:metrics.bytes};
    });
    expect(result).toEqual({equal:true,mappingEqual:true,repeatedUploads:0,cancelled:'AbortError',invalidated:true,callbackRestored:true,error:0,textures:0,bytes:(64+16+4)*3*4});
});
