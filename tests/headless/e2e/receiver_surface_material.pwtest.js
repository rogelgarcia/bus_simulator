import test, { expect } from '@playwright/test';
test.use({ launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11'] } });

test('Complete surface lighting replaces ambient once and retains shared sun visibility and normal response', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('/tests/headless/harness/index.html');
    const result = await page.evaluate(async () => {
        const T = await import('three');
        const { registerMaterialShaderHook } = await import('/src/graphics/shaders/core/MaterialShaderHookRegistry.js');
        const { STATIC_SUN_DEPTH_DIRECT_ANCHOR: anchor } = await import('/src/graphics/illumination/static_sun_depth/StaticSunDepthShaderContract.js');
        const { installEnhancedReceiverBindings } = await import('/src/graphics/illumination/receiver_lightmaps/EnhancedReceiverMaterialAdapter.js');
        const { encodeReceiverRgb9e5 } = await import('/src/app/illumination/receiver_lightmaps/ReceiverHdrEncoding.js');
        const { createReceiverHdrTexture } = await import('/src/graphics/illumination/receiver_lightmaps/ReceiverHdrTexture.js');
        const renderer = new T.WebGLRenderer(); renderer.setSize(64,64); renderer.toneMapping = T.NoToneMapping;
        const target = new T.WebGLRenderTarget(64,64,{type:T.FloatType}); renderer.setRenderTarget(target);
        const scene = new T.Scene(), camera = new T.PerspectiveCamera(45,1,.1,10); camera.position.z=3;
        const normal = new T.DataTexture(new Float32Array([.5,.5,1,1]),1,1,T.RGBAFormat,T.FloatType); normal.needsUpdate=true;
        const material = new T.MeshStandardMaterial({color:0xffffff,roughness:1,normalMap:normal});
        const { applyMaterialVariationToMeshStandardMaterial } = await import('/src/graphics/assets3d/materials/MaterialVariationSystem.js');
        applyMaterialVariationToMeshStandardMaterial(material, { config: { enabled: true, globalIntensity: 0 } });
        const original = new T.PlaneGeometry(2,2), object = new T.Mesh(original,material); scene.add(object);
        const ambient = new T.HemisphereLight(0xffffff,0xffffff,12); scene.add(ambient);
        const sun = new T.DirectionalLight(0xffffff,4); sun.position.z=3;
        const staticVisibility = {value:1}, movingVisibility = {value:1};
        const hybrid = registerMaterialShaderHook(material,{id:'test.shared_sun',priority:200,apply(shader) {
            shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 staticSunDepthPointDirectionView; uniform float testStaticVisibility; uniform float testMovingVisibility; void staticSunDepthApplyDirectional() {}');
            shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', T.ShaderChunk.lights_fragment_begin.replaceAll(anchor,
                '{ directLight.color *= testStaticVisibility * testMovingVisibility; ' + anchor + ' }'));
            Object.assign(shader.uniforms,{staticSunDepthPointDirectionView:{value:new T.Vector3(0,0,1)},testStaticVisibility:staticVisibility,testMovingVisibility:movingVisibility});
        }});
        const coordinates = new Float32Array(7*4);
        for (let i=0;i<6;i++) { const v=original.index.getX(i); coordinates.set([original.attributes.uv.getX(v),original.attributes.uv.getY(v),0,1],(i+1)*4); }
        const table = new T.DataTexture(coordinates,7,1,T.RGBAFormat,T.FloatType); table.needsUpdate=true;
        const packed = encodeReceiverRgb9e5(new Float32Array(Array.from({length:4},()=>[1,.5,.25,1]).flat()));
        const mip = encodeReceiverRgb9e5(new Float32Array([.5,1,2,1]));
        const atlas = createReceiverHdrTexture(renderer,[{data:new Uint32Array(packed.buffer),width:2,height:2,depth:1},
            {data:new Uint32Array(mip.buffer),width:1,height:1,depth:1}]);
        const direct = new T.DataArrayTexture(new Float32Array([100,100,100,1]),1,1,1); direct.type=T.FloatType; direct.needsUpdate=true;
        const uniforms = {receiverAtlasMapping:{value:table},receiverDirectAtlas:{value:direct},receiverIndirectAtlas:{value:atlas},
            receiverDirectEnabled:{value:1},receiverIndirectEnabled:{value:1},receiverDebugMode:{value:0},receiverMaxMip:{value:0},receiverAtlasEnabled:{value:1},receiverLightingBlend:{value:1}};
        for (const channel of ['Direct','Indirect']) for (const kind of ['Scale','Bias']) uniforms[`receiver${channel}${kind}`] = {value:Array.from({length:24},()=>new T.Vector4().setScalar(kind==='Scale'?1:0))};
        const mapping = {profile:{irradianceRepresentation:'surface-diffuse-v1',directRepresentation:'hybrid-sun-visibility-v1'},objects:[{id:'plane',referenceCount:6,base:1}]};
        let binding = installEnhancedReceiverBindings(mapping,new Map([['plane',object]]),uniforms,coordinates);
        const read = () => { renderer.render(scene,camera); const p=new Float32Array(4); renderer.readRenderTargetPixels(target,32,32,1,1,p); return [...p]; };
        const indirect=read(); scene.remove(ambient); const noAmbient=read();
        scene.add(sun); const full=read();
        staticVisibility.value=.5; movingVisibility.value=.25; const shadow=read();
        uniforms.receiverDirectEnabled.value=0; const directOff=read(); uniforms.receiverDirectEnabled.value=1;
        normal.image.data.set([.8,.5,.9,1]); normal.needsUpdate=true; const tilted=read();
        scene.remove(sun); const tiltedIndirect=read();
        const counts=[];
        for (let i=0;i<6;i++) {
            binding.restore(); read();
            binding=installEnhancedReceiverBindings(mapping,new Map([['plane',object]]),uniforms,coordinates); read();
            counts.push(renderer.info.programs.length);
        }
        binding.restore(); hybrid.remove();
        const restored=object.geometry===original;
        const mipMaterial=new T.ShaderMaterial({glslVersion:T.GLSL3,uniforms:{hdrMap:{value:atlas}},
            vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
            fragmentShader:'uniform highp sampler2DArray hdrMap;out vec4 resultColor;void main(){resultColor=vec4(textureLod(hdrMap,vec3(.5,.5,0.),1.).rgb,1.);}'});
        object.material=mipMaterial; const mipValue=read(); mipMaterial.dispose();
        const glError=renderer.getContext().getError();
        target.dispose(); table.dispose(); atlas.dispose(); direct.dispose(); normal.dispose(); material.dispose(); original.dispose(); renderer.dispose();
        return {indirect,noAmbient,full,shadow,directOff,tilted,tiltedIndirect,counts,restored,glError,mipValue};
    });
    expect(errors).toEqual([]); expect(result.glError).toBe(0); expect(result.restored).toBe(true);
    for (let c=0;c<3;c++) {
        expect(result.indirect[c]).toBeCloseTo([1,.5,.25][c]/Math.PI,4);
        expect(result.noAmbient[c]).toBeCloseTo(result.indirect[c],5);
        expect(result.tiltedIndirect[c]).toBeCloseTo(result.indirect[c],5);
        expect(result.shadow[c]-result.indirect[c]).toBeCloseTo((result.full[c]-result.indirect[c])*.125,4);
        expect(result.directOff[c]).toBeCloseTo(result.shadow[c],5);
    }
    expect(result.tilted[0]).toBeLessThan(result.shadow[0]);
    expect(result.mipValue.slice(0,3)).toEqual([.5,1,2]);
    expect(new Set(result.counts.slice(1)).size).toBe(1);
});

test('Enhanced coplanar repair preserves interpolated lightmap coordinates and restores source geometry',async({page})=>{
    await page.goto('/tests/headless/harness/index.html');
    const result=await page.evaluate(async()=>{
        const T=await import('three');
        const {repairEnhancedReceiverCoplanarGeometry}=await import('/src/graphics/illumination/receiver_lightmaps/EnhancedReceiverCoplanarGeometry.js');
        const original=new T.BufferGeometry();
        original.setAttribute('position',new T.Float32BufferAttribute([0,0,0,2,0,0,0,0,2, 1,0,0,3,0,0,1,0,2],3));
        const uv=new Float32Array(6*4);
        for(let i=0;i<6;i++)uv.set([original.attributes.position.getX(i)/3,original.attributes.position.getZ(i)/2,0,1],i*4);
        const copy=original.clone();copy.setAttribute('receiverAtlasCoordinate',new T.Float32BufferAttribute(uv,4));
        const fixed=repairEnhancedReceiverCoplanarGeometry(copy,original,{}),geometry=fixed.geometry;
        let error=0;
        for(let i=0;i<geometry.attributes.position.count;i++){
            error=Math.max(error,Math.abs(geometry.attributes.receiverAtlasCoordinate.getX(i)-geometry.attributes.position.getX(i)/3),
                Math.abs(geometry.attributes.receiverAtlasCoordinate.getY(i)-geometry.attributes.position.getZ(i)/2));
        }
        const result={overlappingTriangles:fixed.overlappingTriangles,removedArea:fixed.removedArea,error,
            sourceCount:original.attributes.position.count,sourceMapping:!!original.attributes.receiverAtlasCoordinate,
            drawCount:geometry.drawRange.count,count:geometry.attributes.position.count};
        original.dispose();geometry.dispose();return result;
    });
    expect(result.overlappingTriangles).toBe(1);expect(result.removedArea).toBeCloseTo(.5,8);
    expect(result.error).toBeLessThan(1e-6);expect(result.sourceCount).toBe(6);expect(result.sourceMapping).toBe(false);
    expect(result.drawCount).toBe(result.count);
});
