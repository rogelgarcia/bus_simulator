// Capture scene-linear native beauty and ambient transport without changing lighting settings.
import path from 'node:path';
import {mkdir,open} from 'node:fs/promises';
import {writeJson} from '../../../baking/Files.mjs';

export async function rawRadiance(page, output, {materialDiagnostics = false, receiverTrace = false, materialParity = false, reflectionParity = false, sourceParity = false, resolvedParity = false, primaryControls = false, geometryAudit = false, environmentReference = null} = {}) {
    if (receiverTrace && !materialDiagnostics) throw new Error('Receiver tracing requires diagnostic material outputs');
    if (materialParity && (!materialDiagnostics || receiverTrace)) throw new Error('Material parity requires diagnostic materials without receiver tracing');
    await mkdir(output);
    const metadata = await page.evaluate(async materialDiagnostics => {
        const THREE = await import('three');
        const engine = window.__busSim.engine, renderer = engine.renderer;
        const size = renderer.getDrawingBufferSize(new THREE.Vector2());
        const target = new THREE.WebGLRenderTarget(size.x,size.y,{type:THREE.FloatType,format:THREE.RGBAFormat});
        target.texture.colorSpace = THREE.LinearSRGBColorSpace;
        const registrations=[],uniforms={lightingDiagnosticOutput:{value:0}};
        if(materialDiagnostics){
            const {registerMaterialShaderHook}=await import('/src/graphics/shaders/core/MaterialShaderHookRegistry.js');
            const {lightingDiagnosticShaders:source}=await import('/src/graphics/shaders/materials/LightingDiagnosticShaderLoader.js');
            const materials=new Set();
            engine.scene.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:[o.material])
                if(m?.isMeshStandardMaterial||m?.isMeshPhongMaterial||m?.isMeshLambertMaterial)materials.add(m);});
            for(const material of materials)registrations.push(registerMaterialShaderHook(material,{
                id:'diagnostics.lighting_output',priority:10000,variantKey:source.variantKey,uniforms,
                apply(shader){
                    if(!shader.fragmentShader.includes('#include <opaque_fragment>'))throw new Error('Missing diagnostic output anchor');
                    Object.assign(shader.uniforms,uniforms);
                    if(!shader.vertexShader.includes('#include <project_vertex>'))throw new Error('Missing diagnostic position anchor');
                    shader.vertexShader=source.vertexDeclarations+shader.vertexShader.replace('#include <project_vertex>',source.position);
                    shader.fragmentShader=source.declarations+shader.fragmentShader.replace('#include <opaque_fragment>',source.apply);
                }
            }));
        }
        window.__ai562Raw = {THREE,engine,renderer,target,width:size.x,height:size.y,registrations,uniforms};
        return {width:size.x,height:size.y,format:'little-endian RGBA float32, bottom-up',
            threeRevision:THREE.REVISION,authoredAoShader:THREE.ShaderChunk.aomap_fragment,
            exposure:renderer.toneMappingExposure,diagnosticMaterials:registrations.length,
            semantics:'Native scene render before display and postprocessing; combined and ambient retain material AO. Sun is combined minus ambient. The separate ambient_no_material_ao pass sets only material aoMapIntensity to zero and restores it before another frame. Ambient includes sky, baked diffuse, reflections and emission; it is not Cycles diffuse-indirect.'};
    },materialDiagnostics);
    try {
        if(primaryControls||geometryAudit)metadata.primaryControls=await page.evaluate(async()=>{
            const {primarySurfaceControl}=await import('/tools/bake_lighting/experiments/reference_matching/PrimarySurfaceControl.js');
            const control=primarySurfaceControl(window.__busSim.sm.current.city.buildings.group);
            window.__ai562Raw.primaryControl=control;
            return {materials:control.materials,roughness:0.85,normal:'nonPerturbedNormal',secondaryTransport:'existing immutable bake'};
        });
        if(environmentReference){
            metadata.environmentReference=await page.evaluate(async config=>{
                const {referenceEnvironmentControl,buildingReferenceMaterials}=await import('/tools/bake_lighting/experiments/reference_matching/ReferenceEnvironmentControl.js');
                const materials=buildingReferenceMaterials(window.__busSim.sm.current.city.buildings.group);
                window.__ai562Raw.environmentControl=referenceEnvironmentControl(materials,config.whiteCells,config.samples);
                return {materials:materials.length,samples:config.samples,energyFixture:config.fixture,
                    policy:'Diagnostic specular only; F0 .04 opaque buildings. Native authored AO retained. Global PMREM reused; no local visibility. Toggle changes a uniform only.'};
            },environmentReference);
        }
        const passes=geometryAudit
            ? ['combined','geometric__normal','geometric__position','geometric__face_normal','combined_restored']
            : primaryControls
            ? ['combined','combined_no_material_ao','diffuse_no_material_ao','indirect_no_material_ao','direct_no_material_ao','environment_specular_no_material_ao','normal','albedo','roughness','receiver_atlas','receiver_irradiance','receiver_lod',
                ...['geometric','geometric_constant','normal_constant'].flatMap(v=>['diffuse_no_material_ao','environment_specular_no_material_ao','normal','roughness'].map(p=>v+'__'+p)),'combined_restored']
            : environmentReference
            ? ['combined','reference_combined','reference_environment_specular_no_material_ao','combined_restored']
            : resolvedParity
            ? ['combined','combined_no_material_ao','diffuse','diffuse_no_material_ao','direct_no_material_ao','indirect_no_material_ao','direct_specular_no_material_ao','environment_specular_no_material_ao','normal','albedo','roughness','texture_ao','combined_restored']
            : sourceParity
            ? ['combined','combined_no_material_ao','albedo','roughness','source_combined_no_material_ao','source_diffuse_no_material_ao','source_albedo','source_roughness','combined_restored']
            : reflectionParity
            ? ['combined','combined_no_material_ao','diffuse_no_material_ao','direct_specular_no_material_ao','environment_specular_no_material_ao','normal','roughness','texture_ao',
                'flat_combined_no_material_ao','flat_diffuse_no_material_ao','flat_direct_specular_no_material_ao','flat_environment_specular_no_material_ao','flat_normal','combined_restored']
            : materialParity
            ? ['combined','combined_no_material_ao','diffuse','diffuse_no_material_ao','direct_no_material_ao','indirect_no_material_ao','albedo','combined_restored']
            : receiverTrace
            ? ['combined','albedo','receiver_atlas','receiver_irradiance','receiver_lod','indirect_no_material_ao','direct_no_material_ao','combined_restored']
            : ['combined','ambient','ambient_no_material_ao'];
        if(materialDiagnostics&&!receiverTrace&&!materialParity)passes.push('combined_no_material_ao','diffuse','diffuse_no_material_ao','albedo','combined_restored');
        if(materialParity)metadata.semantics='Scene-linear material control. Texture AO intensity is zero only in _no_material_ao passes and restored before the next frame. Direct is live named-sun diffuse; indirect includes sky and all baked diffuse bounce. Albedo is game diffuseColor, not demodulated irradiance. Combined minus diffuse includes specular and any emission.';
        metadata.passes=passes;
        for (const pass of passes) {
            if(materialDiagnostics)console.log('Material diagnostic pass: '+pass);
            const byteLength = await page.evaluate(async pass => {
                const {THREE,engine,renderer,target,width,height,uniforms} = window.__ai562Raw;
                const previous={target:renderer.getRenderTarget(),tone:renderer.toneMapping,color:renderer.outputColorSpace};
                const lights=[], materials=new Map(), normals=new Map();
                engine.scene.traverse(object=>{if(object.isDirectionalLight)lights.push([object,object.intensity]);});
                if(pass.endsWith('_no_material_ao'))engine.scene.traverse(object=>{
                    for(const material of Array.isArray(object.material)?object.material:[object.material])
                        if(material?.aoMap&&!materials.has(material))materials.set(material,material.aoMapIntensity);
                });
                if(pass.startsWith('flat_'))engine.scene.traverse(object=>{
                    for(const material of Array.isArray(object.material)?object.material:[object.material])
                        if(material?.normalMap&&!normals.has(material))normals.set(material,material.normalScale.clone());
                });
                let source;
                try {
                    const parts=pass.split('__');
                    window.__ai562Raw.primaryControl?.set(parts.length===2?parts[0]:'native');
                    if(pass.startsWith('source_')) {
                        const {sourceMaterialControl}=await import('/tools/bake_lighting/experiments/lighting_configurations/export_city/SourceMaterialControl.js');
                        source=sourceMaterialControl(engine.scene);
                        window.__ai562Raw.sourceMaterialAudit=source.variation;
                    }
                    if(pass.startsWith('ambient'))for(const [light] of lights)light.intensity=0;
                    window.__ai562Raw.environmentControl?.setEnabled(pass.startsWith('reference_'));
                    const key=parts[parts.length-1].replace(/^(flat|source|reference)_/, '');
                    uniforms.lightingDiagnosticOutput.value=({albedo:2,receiver_atlas:3,receiver_irradiance:4,receiver_lod:5,
                        indirect_no_material_ao:6,direct_no_material_ao:7,direct_specular_no_material_ao:8,
                        environment_specular_no_material_ao:9,normal:10,roughness:11,texture_ao:12,position:13,face_normal:14})[key]??(key.startsWith('diffuse')?1:0);
                    for(const material of materials.keys())material.aoMapIntensity=0;
                    for(const material of normals.keys())material.normalScale.set(0,0);
                    renderer.toneMapping=THREE.NoToneMapping;renderer.outputColorSpace=THREE.LinearSRGBColorSpace;
                    renderer.setRenderTarget(target);renderer.clear();renderer.render(engine.scene,engine.camera);
                    const pixels=new Float32Array(width*height*4);renderer.readRenderTargetPixels(target,0,0,width,height,pixels);
                    window.__ai562Raw.bytes=new Uint8Array(pixels.buffer);
                    return pixels.byteLength;
                } finally {
                    source?.restore();
                    window.__ai562Raw.primaryControl?.set('native');
                    window.__ai562Raw.environmentControl?.setEnabled(false);
                    for(const [material,intensity] of materials)material.aoMapIntensity=intensity;
                    for(const [material,scale] of normals)material.normalScale.copy(scale);
                    for(const [light,intensity] of lights)light.intensity=intensity;
                    uniforms.lightingDiagnosticOutput.value=0;
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
        if(sourceParity)metadata.sourceMaterialAudit=await page.evaluate(()=>window.__ai562Raw.sourceMaterialAudit);
    } finally {
        await page.evaluate(()=>{window.__ai562Raw.primaryControl?.dispose();window.__ai562Raw.environmentControl?.dispose();for(const hook of window.__ai562Raw.registrations)hook.remove();window.__ai562Raw.target.dispose();delete window.__ai562Raw;});
    }
    await writeJson(path.join(output,'metadata.json'),metadata);
}
