// Summarize runtime inputs without treating texture averages as measured material truth.
export function summarizeInventory(runtime,source,defaults,profiles){
    const textures=new Map(runtime.textures.map(t=>[t.id,t])),materials=new Map(runtime.records.map(m=>[m.id,m]));
    const correspondence=source.filter(s=>!materials.has(s.id)||s.sourceType!==materials.get(s.id).type||s.color?.some((v,i)=>Math.abs(v-materials.get(s.id).inputs.color[i])>1e-7)).map(s=>s.id);
    if(correspondence.length||source.length!==runtime.records.length)throw new Error('Runtime/export material identity changed: '+correspondence.slice(0,5));
    const rows=defaults.materials.map(item=>{
        if(!item.source)return item;
        const m=materials.get(item.source),s=source.find(s=>s.id===item.source),map=textures.get(m.textures.map),rough=textures.get(m.textures.roughnessMap);
        const color=m.inputs.color.map((v,i)=>v*(map?.linearMean?.[i]??1)),roughness=Math.max(.04,(m.inputs.roughness??s.roughness)*(rough?.linearMean?.[1]??1));
        const chosen=profiles.plausible.bus[m.name],f0=chosen?.f0??.04;
        const fixture={color,roughness,metalness:m.inputs.metalness??0,ior:1.5,specularIntensity:1};
        if(chosen){fixture.roughness=chosen.roughness;fixture.metalness=0;fixture.ior=(1+Math.sqrt(f0))/(1-Math.sqrt(f0));}
        if(item.id==='glazing')Object.assign(fixture,profiles.plausible.buildingGlazing);
        if(item.id==='interior')Object.assign(fixture,{color:[.18,.16,.13],roughness:.8,metalness:0});
        return {...item,fixture,classification:chosen||item.id==='glazing'?'plausible proposal':'texture-average fixture; not exhaustive shader parity',runtime:m,export:s,textureMeanColor:color,roughnessProduct:roughness,
            maps:Object.fromEntries(Object.entries(m.textures).filter(([k])=>k!=='envMap').map(([k,id])=>[k,textures.get(id)])),
            normalAudit:{scale:m.inputs.normalScale,handedness:'normal_gl assets use positive tangent Y; signed source scales recorded',limitation:Math.abs(m.inputs.normalScale[0])!==Math.abs(m.inputs.normalScale[1])?'Anisotropic strength needs exporter adapter':null},
            phongF0:m.type==='MeshPhongMaterial'?{source:m.inputs.specular,oldGgxF0:m.inputs.specular.map(v=>v*.04),interpretation:'Copying Phong F0 into a dielectric tint attenuates normal-incidence reflection again; lobe shape is still an approximation.'}:null};
    });
    const colorErrors=[],dataErrors=[];
    for(const m of runtime.records)for(const [role,id] of Object.entries(m.textures)){
        const t=textures.get(id);if(['map','emissiveMap'].includes(role)&&t.colorSpace!=='srgb')colorErrors.push({id:m.id,role,texture:id,colorSpace:t.colorSpace});
        if(['roughnessMap','metalnessMap','normalMap','aoMap','alphaMap'].includes(role)&&t.colorSpace==='srgb')dataErrors.push({id:m.id,role,texture:id});
    }
    const generatedNormalIds=runtime.records.filter(m=>textures.get(m.textures.normalMap)?.name?.startsWith(profiles.conversion.generatedAsphaltNormal.texturePrefix)).map(m=>m.id);
    return {schemaVersion:1,rows,sourceCount:source.length,correspondenceErrors:correspondence,colorEncodingReview:colorErrors,dataEncodingErrors:dataErrors,generatedNormalIds,windowIds:runtime.records.filter(m=>m.userData.windowInterior||m.userData.windowFakeDepth).map(m=>m.id),glazingIds:runtime.records.filter(m=>m.userData.buildingWindowGlass).map(m=>m.id),grassIds:runtime.records.filter(m=>textures.get(m.textures.map)?.url?.includes('/grass_004/')).map(m=>m.id),limitations:['Texture means include resampling; final GPU samples are separate. No asset has measured material identity. AO/color correlation cannot establish baked-in illumination.']};
}
