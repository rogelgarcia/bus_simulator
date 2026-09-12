// Runs inside the real game; copies renderable source inputs without lighting hooks.
export async function exportGameScene(poses) {
    const THREE=await import('three');
    const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
    const {translatePhongF0,translateLegacyBus,translateDryGrass,createInteriorTexture,translateWindowInterior,captureUvTiling}=await import('/tools/bake_lighting/experiments/lighting_configurations/export_city/MaterialEquivalence.js');
    const contractResponse=await fetch('/tools/bake_lighting/experiments/material_calibration/export_contract.json');
    if(!contractResponse.ok)throw new Error('Material equivalence contract unavailable');
    const materialContract=await contractResponse.json(),interiorTexture=createInteriorTexture(materialContract);
    const {engine:e,sm}=window.__busSim,s=sm.current;
    s.city.disableStaticVisibility();e.scene.updateMatrixWorld(true);
    const exportScene=new THREE.Scene(),city=new THREE.Group(),bus=new THREE.Group();
    city.name='CITY_SOURCE';bus.name='BUS_SOURCE';exportScene.add(city,bus);
    const materialCache=new Map(),geometryCache=new Map(),audit=[],omitted=[],landmarks=[];
    const inverseBus=s.busAnchor.matrixWorld.clone().invert();
    function material(source,scope,role) {
        const cacheKey=scope+':'+role+':'+source.uuid;
        if(materialCache.has(cacheKey))return materialCache.get(cacheKey);
        if(source.isShaderMaterial)throw new Error(`Untranslated source shader ${source.name}; uniforms ${Object.keys(source.uniforms??{}).join(',')}`);
        let target;
        if(source.isMeshStandardMaterial)target=source.clone();
        else {
            target=new THREE.MeshPhysicalMaterial();
            for(const key of ['name','color','emissive','emissiveIntensity','map','emissiveMap','normalMap','normalScale','bumpMap','bumpScale','alphaMap','opacity','transparent','alphaTest','side','vertexColors']) {
                if(source[key]!==undefined)target[key]=source[key]?.clone&&!source[key].isTexture?source[key].clone():source[key];
            }
            target.roughness=source.isMeshPhongMaterial?Math.max(.12,Math.min(.95,Math.sqrt(2/((source.shininess??30)+2)))):.8;
            target.metalness=0;
            if(source.isMeshPhongMaterial)translatePhongF0(target,source);
            if(source.isMeshBasicMaterial && /sign|lamp|light|emissive/i.test(source.name)) {
                target.emissive.copy(source.color);target.emissiveMap=source.map;target.emissiveIntensity=1;
            }
        }
        target.name=`MAT_${materialCache.size}_${source.name||source.type}`;
        const busProxy=translateLegacyBus(target,source,scope,materialContract);
        const grassProxy=translateDryGrass(target,source,role,materialContract);
        const interiorProxy=translateWindowInterior(target,source,scope,materialContract,interiorTexture);
        const uvTiling=interiorProxy ? null : captureUvTiling(source);
        if (uvTiling && source.alphaMap) throw new Error('UV override plus independent alphaMap needs a slot-specific glTF adapter');
        const hooks=Object.keys(source.userData??{}).filter(key=>/shader|injected|variation|window|grass|asphalt/i.test(key));
        audit.push({id:target.name,originalName:source.name,scope,role,sourceType:source.type,translatedType:target.type,interiorProxy,busProxy,grassProxy,uvTiling,sourceSpecularF0:source.specular?.toArray(),translatedIor:target.ior,translatedSpecularIntensity:target.specularIntensity,
            color:source.color?.toArray(),roughness:target.roughness,metalness:target.metalness,opacity:target.opacity,
            normalScale:source.normalScale?.toArray(),bumpScale:source.bumpScale,hadBumpMap:!!source.bumpMap,
            removedLighting:{lightMap:!!source.lightMap,aoMap:!!source.aoMap},untranslatedProceduralHooks:hooks,
            approximation:busProxy?'Restrained legacy bus GGX appearance proxy; authored base colors/textures preserved':source.isMeshPhongMaterial?'Phong shininess approximated with GGX; source F0 converted to IOR and normalized tint':source.isMeshBasicMaterial?'Unlit color translated to diffuse except authored luminous signs':null});
        target.userData={};target.onBeforeCompile=()=>{};target.customProgramCacheKey=()=>'';
        target.lightMap=null;target.aoMap=null;target.envMap=null;target.polygonOffset=false;
        materialCache.set(cacheKey,target);return target;
    }
    function geometry(source) {
        if(geometryCache.has(source.uuid))return geometryCache.get(source.uuid);
        const g=source.clone();g.userData={};
        for(const key of Object.keys(g.attributes))if(!['position','normal','tangent','uv','uv1','color'].includes(key))g.deleteAttribute(key);
        geometryCache.set(source.uuid,g);return g;
    }
    let meshCount=0,instances=0,triangles=0;
    function collect(root, destination, transform, excludedRoots=[]) {
        root.traverseVisible(object=>{
            if(!object.isMesh)return;
            for(let ancestor=object;ancestor;ancestor=ancestor.parent)if(excludedRoots.includes(ancestor))return;
            const materials=Array.isArray(object.material)?object.material:[object.material];
            if(materials.some(m=>m.isShaderMaterial&&m.uniforms?.uHorizon&&m.uniforms?.uSunDir)) {
                omitted.push({name:object.name,reason:'Procedural sky is translated to a Cycles world and one owned sun'});return;
            }
            if(materials.some(m=>m.isShaderMaterial&&m.uniforms?.uRayCount&&m.uniforms?.uCoreGlow)) {
                omitted.push({name:object.name,reason:'Screen-space sun glare is an optical effect, not a light-blocking surface'});return;
            }
            if(!object.layers.test(e.camera.layers)||materials.every(m=>!m.visible||!m.colorWrite)) {omitted.push({name:object.name,reason:'not a camera-renderable surface'});return;}
            const role=destination===city&&['CityFloor','GroundTiles'].includes(object.name)?'dry-grass':'authored';
            const mat=materials.map(source=>material(source,destination===bus?'bus':'city',role)),g=geometry(object.geometry);
            const count=object.isInstancedMesh?object.count:1;
            for(let i=0;i<count;i++) {
                const matrix=object.matrixWorld.clone();
                if(object.isInstancedMesh) {const local=new THREE.Matrix4();object.getMatrixAt(i,local);matrix.multiply(local);instances++;}
                if(transform)matrix.premultiply(transform);
                const mesh=new THREE.Mesh(g,Array.isArray(object.material)?mat:mat[0]);
                mesh.name=`${destination.name}_${meshCount}_${object.name||'mesh'}`;
                mesh.matrix.copy(matrix);mesh.matrix.decompose(mesh.position,mesh.quaternion,mesh.scale);mesh.matrixAutoUpdate=false;
                if(object.instanceColor) {
                    const c=new THREE.Color().fromBufferAttribute(object.instanceColor,i);
                    const tinted=mat.map(m=>{const copy=m.clone();copy.color.multiply(c);return copy;});mesh.material=Array.isArray(object.material)?tinted:tinted[0];
                }
                destination.add(mesh);meshCount++;triangles+=(g.index?.count??g.attributes.position.count)/3;
                if(destination===city&&landmarks.length<60&&object.userData.staticVisibility===undefined) {
                    const v=new THREE.Vector3().fromBufferAttribute(g.attributes.position,0).applyMatrix4(matrix);
                    if(Math.abs(v.x)<300&&Math.abs(v.z)<300)landmarks.push({object:mesh.name,positionThree:v.toArray()});
                }
            }
        });
    }
    collect(s.city.group,city,null);collect(s.busAnchor,bus,inverseBus);
    // Traffic signals and other scene-owned static objects live outside city.group.
    collect(e.scene,city,null,[s.city.group,s.busAnchor]);
    exportScene.updateMatrixWorld(true);
    const busBounds=new THREE.Box3().setFromObject(bus);
    const lights=[];e.scene.traverse(object=>{if(object.isLight)lights.push({name:object.name,type:object.type,intensity:object.intensity,
        color:object.color.toArray(),groundColor:object.groundColor?.toArray(),position:object.getWorldPosition(new THREE.Vector3()).toArray(),target:object.target?.getWorldPosition(new THREE.Vector3()).toArray()});});
    const bytes=await new GLTFExporter().parseAsync(exportScene,{binary:true,onlyVisible:true,trs:false,maxTextureSize:Infinity});
    const data=new Uint8Array(bytes),chunkSize=1024*1024;
    for(let offset=0;offset<data.length;offset+=chunkSize) {
        const part=data.subarray(offset,offset+chunkSize);let binary='';
        for(let n=0;n<part.length;n+=8192)binary+=String.fromCharCode(...part.subarray(n,n+8192));
        await window.__writeSceneChunk(btoa(binary));
    }
    return {schemaVersion:1,status:'exported',threeRevision:THREE.REVISION,bytes:data.length,meshCount,instances,triangles,
        materials:audit,omitted,landmarks,busBounds:{min:busBounds.min.toArray(),max:busBounds.max.toArray()},
        lights,lighting:e.lightingSettings,atmosphere:e.atmosphereSettings,poses,
        limitations:['Procedural shader hooks listed per material are not executed in Cycles; source texture/PBR inputs are retained.',
            'Phong materials use a documented GGX approximation; no new glass transmission is invented for opaque source windows.',
            'Known legacy bus paint/trim/rubber/rim materials use the restrained GGX appearance proxy, not measured Phong-to-physical equivalence.',
            'CityFloor/GroundTiles use the documented dry-grass aggregate roughness adapter; runtime reflection suppression is not a glTF material property.',
            'Tagged city window interiors use gray-beige-silhouette-v1 opaque non-emissive UV proxies; they approximate appearance, not measured room geometry. Grass animation is omitted.',
            'Bump maps omitted by glTF are reported per material; normal maps are retained.',
            'Copied poses omit suspension and wheel steering state; loaded default rig is frozen.'],
        materialContract,sourcesPolicy:'Actual unculled city and rendered bus mesh; lighting/AO/env hooks removed only on export clones'};
}
