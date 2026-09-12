// Explicit source-to-glTF material approximations; applied only to export clones.
import * as THREE from 'three';

export function captureUvTiling(source) {
    const config=source.userData?.uvTilingConfig;
    if (!config) return null;
    // Three's material clone serializes userData, so inherited vectors may be plain objects.
    const pair=value=>Array.isArray(value)?value.slice(0,2):[value?.x,value?.y];
    const result={tiling:pair(config.tiling),offset:pair(config.offset),rotation:config.rotation};
    if (![...result.tiling,...result.offset,result.rotation].every(Number.isFinite)) throw new Error('Invalid material UV override');
    return result;
}

export function translatePhongF0(target,source){
    const rgb=source.specular.toArray(),peak=Math.max(...rgb);
    if(rgb.some(v=>!Number.isFinite(v)||v<0)||peak>=1)throw new Error(`Unsupported Phong F0: ${source.name}`);
    target.specularIntensity=peak>0?1:0;
    const root=Math.sqrt(peak);
    target.ior=(1+root)/(1-root);
    target.specularColor.setRGB(...rgb.map(v=>peak>0?v/peak:1));
}

// Legacy highlight strength is not a physical surface measurement. Restrict the
// appearance adapter to known bus roles instead of changing city transport.
export function translateLegacyBus(target,source,scope,contract){
    if(scope!=='bus'||!source.isMeshPhongMaterial)return null;
    const profile=contract.legacyBus?.materials[source.name.toLowerCase()];
    if(!profile)return null;
    target.roughness=profile.roughness;target.metalness=0;
    target.ior=profile.ior;target.specularIntensity=profile.specularIntensity;
    target.specularColor.setRGB(1,1,1);target.clearcoat=0;
    return contract.legacyBus.id;
}

// Flattened lawns need a dry aggregate lobe; their runtime reflection suppression
// cannot be represented by glTF. Apply only to explicitly selected terrain clones.
export function translateDryGrass(target,source,role,contract){
    if(role!=='dry-grass'||!source.isMeshStandardMaterial)return null;
    const c=contract.dryGrass;
    target.metalness=0;target.metalnessMap=null;
    if(source.roughnessMap){
        const input=source.roughnessMap,canvas=document.createElement('canvas');
        canvas.width=input.image.width;canvas.height=input.image.height;
        const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(input.image,0,0);
        const pixels=context.getImageData(0,0,canvas.width,canvas.height);
        for(let i=1;i<pixels.data.length;i+=4)pixels.data[i]=Math.round(255*(c.minimumRoughness+(1-c.minimumRoughness)*Math.min(1,pixels.data[i]/255*source.roughness)));
        context.putImageData(pixels,0,0);
        target.roughnessMap=input.clone();target.roughnessMap.source=new THREE.Source(canvas);
        target.roughnessMap.colorSpace=THREE.NoColorSpace;target.roughnessMap.needsUpdate=true;target.roughness=1;
    }else target.roughness=Math.max(c.minimumRoughness,source.roughness);
    return c.id;
}

export function createInteriorTexture(contract){
    const c=contract.windowInterior,n=c.size,canvas=document.createElement('canvas');canvas.width=n;canvas.height=n;
    const context=canvas.getContext('2d'),pixels=context.createImageData(n,n);
    const colors=[c.backgroundLinear,c.alternateLinear,c.silhouetteLinear].map(rgb=>new THREE.Color().fromArray(rgb).convertLinearToSRGB().toArray().map(v=>Math.round(v*255)));
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
        let color=(Math.floor(x/16)+Math.floor(y/16)+c.seed)%2===0?colors[1]:colors[0];
        if(x%16>4&&x%16<11&&y%16>3&&y%16<12)color=colors[2];
        pixels.data.set([...color,255],(y*n+x)*4);
    }
    context.putImageData(pixels,0,0);
    const texture=new THREE.CanvasTexture(canvas);texture.name=c.id;texture.colorSpace=THREE.SRGBColorSpace;
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.magFilter=THREE.NearestFilter;
    return texture;
}

export function translateWindowInterior(target,source,scope,contract,texture){
    if(scope!=='city'||!contract.windowInterior.selectorKeys.some(key=>source.userData?.[key]))return null;
    const c=contract.windowInterior;
    target.color.setRGB(1,1,1);target.map=texture;
    target.metalness=0;target.roughness=c.roughness;target.roughnessMap=null;
    target.emissive.setRGB(0,0,0);target.emissiveMap=null;target.emissiveIntensity=0;
    // A procedural opaque room surface stays opaque; do not invent transmission.
    target.transparent=false;target.opacity=1;target.alphaMap=null;target.alphaTest=0;
    if('transmission' in target)target.transmission=0;
    return c.id;
}
