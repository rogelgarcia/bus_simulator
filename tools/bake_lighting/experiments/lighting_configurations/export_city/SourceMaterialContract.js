// Record which authored appearance inputs a texture-only glTF reference omits.
export function describeSourceMaterial(source, {busProxy, grassProxy, interiorProxy} = {}) {
    const cfg=source.userData?.materialVariationConfig;
    const bundle=value=>Object.fromEntries(Object.entries(value??{}).map(([key,item])=>{
        const numbers=typeof item?.toArray==='function' ? item.toArray()
            : ['x','y','z','w'].filter(component=>component in (item??{})).map(component=>item[component]);
        if(!numbers.length||!numbers.every(Number.isFinite))throw new Error('Unserializable material variation uniform: '+key);
        return [key,numbers];
    }));
    const omitted=[];
    if(cfg)omitted.push('procedural material variation');
    if(Object.keys(source.userData??{}).some(key=>key!=='materialVariationConfig'&&/shader|injected|variation|window|grass|asphalt/i.test(key)))
        omitted.push('other untranslated material shader inputs');
    if(source.aoMap)omitted.push('authored texture AO on indirect lighting');
    if(source.bumpMap)omitted.push('bump map');
    if(busProxy||grassProxy||interiorProxy)omitted.push('documented appearance proxy');
    if(!source.isMeshStandardMaterial)omitted.push('source BRDF translation');
    return {schemaVersion:1,kind:'source-texture-reference',
        productionMaterialInputsEquivalent:omitted.length===0, omitted,
        proceduralSource:cfg ? {normalized:structuredClone(cfg.normalized),
            uniforms:bundle(cfg.uniforms),debugUniforms:bundle(cfg.debugUniforms),cornerDist:!!cfg.cornerDist} : null,
        calibrationPolicy:omitted.length ? 'Appearance comparison only unless the game control also removes these inputs. Do not infer illumination error from unmatched beauty.'
            : 'Source PBR inputs retained; renderer BRDF, filtering and geometric visibility remain separate controls.'};
}
