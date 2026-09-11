// Inventory actual runtime material inputs without retuning the player's assets.
export async function runtimeAudit(options={}){
    const THREE=await import('three');
    const {engine:e,sm}=window.__busSim,s=sm.current;
    s.city.disableStaticVisibility();e.scene.updateMatrixWorld(true);
    const records=[],sources=new Map(),textures=new Map(),meshes=new Map();
    const decode=x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4;
    function texture(t){
        if(textures.has(t.uuid))return textures.get(t.uuid).id;
        const img=t.image,id='texture_'+textures.size,src=img?.currentSrc||img?.src||null;
        const result={id,name:t.name,url:src?.startsWith('data:')?'embedded':src,colorSpace:t.colorSpace,flipY:t.flipY,channel:t.channel,repeat:t.repeat.toArray(),offset:t.offset.toArray(),rotation:t.rotation,wrapS:t.wrapS,wrapT:t.wrapT,width:img?.width,height:img?.height,userData:plain(t.userData,2)};
        textures.set(t.uuid,result);
        if(img&&options.statistics!==false){
            let pixels;
            if(img.data){
                const stride=img.data.length/(img.width*img.height),scale=img.data instanceof Uint8Array||img.data instanceof Uint8ClampedArray?255:1;
                pixels=[];const step=Math.max(1,Math.floor(img.width*img.height/4096));
                const sample=v=>t.type===THREE.HalfFloatType?THREE.DataUtils.fromHalfFloat(v):v/scale;
                for(let i=0;i<img.width*img.height;i+=step)pixels.push([0,1,2,3].map(c=>c<stride?sample(img.data[i*stride+c]):1));
            }else if(img instanceof HTMLImageElement||img instanceof HTMLCanvasElement||img instanceof ImageBitmap||img instanceof OffscreenCanvas){
                const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,64,64);
                const bytes=ctx.getImageData(0,0,64,64).data;pixels=[];for(let i=0;i<bytes.length;i+=4)pixels.push([...bytes.slice(i,i+4)].map(v=>v/255));
                result.thumbnail=canvas.toDataURL('image/png');
            }else{
                result.statisticsUnavailable='GPU-only or unsupported image source; CPU bytes unavailable';
            }
            if(pixels){
                result.encodedMean=[0,1,2,3].map(c=>pixels.reduce((n,p)=>n+p[c],0)/pixels.length);
                result.linearMean=[0,1,2].map(c=>pixels.reduce((n,p)=>n+(t.colorSpace===THREE.SRGBColorSpace?decode(p[c]):p[c]),0)/pixels.length);
                result.channelRanges=[0,1,2,3].map(c=>{const a=pixels.map(p=>p[c]).sort((a,b)=>a-b);return [a[0],a[Math.floor(a.length*.05)],a[Math.floor(a.length*.5)],a[Math.floor(a.length*.95)],a.at(-1)];});
                result.samples=pixels.length;result.statisticsScope='Texture samples before material/vertex/procedural multipliers; mip/resampling may differ from GPU sampling.';
            }
        }
        return id;
    }
    function plain(v,depth=3,seen=new Set()){
        if(v===null||['number','string','boolean'].includes(typeof v))return typeof v==='string'&&v.length>20000?v.slice(0,20000):v;
        if(v?.isTexture)return {texture:texture(v)};
        if(v?.toArray)return v.toArray();
        if(typeof v!=='object'||depth<0||seen.has(v))return undefined;
        seen.add(v);const out=Array.isArray(v)?v.slice(0,24).map(x=>plain(x,depth-1,seen)):Object.fromEntries(Object.entries(v).filter(([k])=>!['shader','registries'].includes(k)).slice(0,80).map(([k,x])=>[k,plain(x,depth-1,seen)]));seen.delete(v);return out;
    }
    function material(m,obj,scope){
        if(sources.has(m.uuid)){sources.get(m.uuid).uses++;return;}
        const id='MAT_'+sources.size+'_'+(m.name||m.type),r={id,name:m.name,type:m.type,scope,uses:1,exampleObject:obj.name,objectUserData:plain(obj.userData),worldMatrix:obj.matrixWorld.toArray(),inputs:{},textures:{},userData:plain(m.userData),cacheKey:m.customProgramCacheKey?.()};
        sources.set(m.uuid,r);meshes.set(id,{material:m,object:obj});records.push(r);
        for(const k of ['color','emissive','specular','shininess','roughness','metalness','ior','specularIntensity','specularColor','clearcoat','clearcoatRoughness','normalMapType','normalScale','bumpScale','aoMapIntensity','lightMapIntensity','envMapIntensity','opacity','transparent','alphaTest','side','vertexColors','emissiveIntensity','toneMapped'])if(m[k]!==undefined)r.inputs[k]=plain(m[k]);
        for(const k of ['map','normalMap','roughnessMap','metalnessMap','bumpMap','aoMap','lightMap','alphaMap','emissiveMap','specularMap','envMap'])if(m[k])r.textures[k]=texture(m[k]);
        const uv=obj.geometry.attributes.uv,col=obj.geometry.attributes.color;
        r.geometry={uvCount:uv?.count??0,uvFirst:uv?[uv.getX(0),uv.getY(0)]:null,vertexColorFirst:col?[col.getX(0),col.getY(0),col.getZ(0)]:null,instanced:!!obj.isInstancedMesh,instanceColorFirst:obj.instanceColor?[obj.instanceColor.getX(0),obj.instanceColor.getY(0),obj.instanceColor.getZ(0)]:null};
    }
    function collect(root,scope,excluded=[]){root.traverseVisible(obj=>{
        if(!obj.isMesh)return;for(let p=obj;p;p=p.parent)if(excluded.includes(p))return;
        const mats=Array.isArray(obj.material)?obj.material:[obj.material];
        if(mats.some(m=>m.isShaderMaterial&&(m.uniforms?.uHorizon&&m.uniforms?.uSunDir||m.uniforms?.uRayCount&&m.uniforms?.uCoreGlow)))return;
        if(!obj.layers.test(e.camera.layers)||mats.every(m=>!m.visible||!m.colorWrite))return;
        for(const m of mats)material(m,obj,scope);
    });}
    collect(s.city.group,'city');collect(s.busAnchor,'bus');collect(e.scene,'scene',[s.city.group,s.busAnchor]);
    window.__materialAudit={records,textures,meshes};
    return {schemaVersion:1,threeRevision:THREE.REVISION,records,textures:[...textures.values()],lighting:e.lightingSettings,baked:e.getBakedLightingDebugInfo().status};
}
