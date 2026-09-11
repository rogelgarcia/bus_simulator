// Laboratory-only output probes preserve the original shader hooks and mesh UVs.
import * as THREE from 'three';
import {BusMaterialVariants} from '../../../src/graphics/illumination/diffuse_probes/BusMaterialVariants.js';
import {generatedNormalToTangent} from '../../../tools/bake_lighting/experiments/material_calibration/NormalChannels.mjs';

function encode(pixels){
    const bytes=new Uint8Array(pixels.buffer);let value='';
    for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return btoa(value);
}
export async function probeRuntime(ids){
    const {engine,sm}=window.__busSim,renderer=engine.renderer;
    engine.stop();
    const previous={tone:renderer.toneMapping,color:renderer.outputColorSpace,shadow:renderer.shadowMap.enabled};
    const target=new THREE.WebGLRenderTarget(128,128,{type:THREE.FloatType});
    const results=[];
    try{
        renderer.toneMapping=THREE.NoToneMapping;renderer.outputColorSpace=THREE.LinearSRGBColorSpace;renderer.shadowMap.enabled=false;
        for(const id of ids){
            const {material:original,object}=window.__materialAudit.meshes.get(id);
            const box=new THREE.Box3().setFromObject(object),center=box.getCenter(new THREE.Vector3()),extent=box.getSize(new THREE.Vector3()),size=Math.max(extent.x,extent.y,extent.z);
            const sampleMatrix=object.matrixWorld.clone();if(object.isInstancedMesh){const instance=new THREE.Matrix4();object.getMatrixAt(0,instance);sampleMatrix.multiply(instance);}
            const normal=object.geometry.attributes.normal?new THREE.Vector3().fromBufferAttribute(object.geometry.attributes.normal,0).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(sampleMatrix)):new THREE.Vector3(0,1,0);
            const indices=[0,1,2].map(i=>object.geometry.index?.getX(i)??i),positions=indices.map(i=>new THREE.Vector3().fromBufferAttribute(object.geometry.attributes.position,i).applyMatrix4(sampleMatrix));
            const uv=object.geometry.attributes.uv,uvs=uv?indices.map(i=>new THREE.Vector2().fromBufferAttribute(uv,i)):null;
            const worldArea=positions[1].clone().sub(positions[0]).cross(positions[2].clone().sub(positions[0])).length()/2;
            const uvArea=uvs?Math.abs(uvs[1].clone().sub(uvs[0]).cross(uvs[2].clone().sub(uvs[0])))/2:0;
            const camera=new THREE.OrthographicCamera(-size*.51,size*.51,size*.51,-size*.51,.01,size*5+10);
            camera.position.copy(center).addScaledVector(normal,size+1);if(normal.y)camera.up.set(0,0,-1);camera.lookAt(center);
            const scene=new THREE.Scene(),mesh=object.clone(false);mesh.matrixAutoUpdate=false;mesh.matrix.copy(object.matrixWorld);mesh.frustumCulled=false;mesh.visible=true;scene.add(mesh);
            const invisible=new THREE.MeshBasicMaterial({visible:false});
            const modes=original.isMeshStandardMaterial?['baseColor','roughness','normal']:['baseColor','normal'];
            if(original.normalMap?.name.startsWith('AsphaltFineNormal_'))modes.push('normal_corrected');
            for(const mode of modes){
                // Material.copy JSON-serializes userData, including enormous baked texture arrays.
                // This isolated, stopped renderer needs shared hook resources, never copies of them.
                const userData=original.userData;let m;
                try{original.userData={};m=original.clone();}finally{original.userData=userData;}
                m.userData={...userData};m.defines={...original.defines};m.side=THREE.DoubleSide;
                let correctedMap;
                if(mode==='normal_corrected'){
                    correctedMap=original.normalMap.clone();correctedMap.source=new THREE.Source({...original.normalMap.image,data:generatedNormalToTangent(original.normalMap.image.data)});correctedMap.needsUpdate=true;m.normalMap=correctedMap;
                }
                m.customProgramCacheKey=()=>original.customProgramCacheKey()+'|AI566|'+mode;
                m.onBeforeCompile=(shader,r)=>{
                    original.onBeforeCompile(shader,r);
                    if(!shader.fragmentShader.includes('#include <opaque_fragment>'))throw new Error('Unsupported final shader boundary: '+id);
                    const expression=mode==='baseColor'?'diffuseColor.rgb':mode==='roughness'?'vec3(roughnessFactor)':'normal * 0.5 + 0.5';
                    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`gl_FragColor = vec4(${expression}, 1.0); return;`);
                };
                mesh.material=Array.isArray(object.material)?object.material.map(v=>v===original?m:invisible):m;
                renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.clear();renderer.render(scene,camera);
                const pixels=new Float32Array(128*128*4);renderer.readRenderTargetPixels(target,0,0,128,128,pixels);
                results.push({id,mode,width:128,height:128,raw:encode(pixels),defines:original.defines,worldBounds:[box.min.toArray(),box.max.toArray()],firstTriangle:{worldAreaMeters2:worldArea,uvArea,metersPerUvSqrtArea:uvArea?Math.sqrt(worldArea/uvArea):null},scope:'Projected original mesh UV/vertex/instance/procedural inputs; transparent geometry forced double sided for parameter audit.'});m.dispose();correctedMap?.dispose();
            }
            invisible.dispose();
        }
        // Exercise real vehicle material ownership on a detached copy, leaving the game controller alone.
        function detachedTree(object){
            const userData=object.userData;let copy;
            // The rig root contains controller back-references; this test only needs render meshes.
            try{object.userData={};copy=object.clone(false);}finally{object.userData=userData;}
            for(const child of object.children)copy.add(detachedTree(child));return copy;
        }
        const root=detachedTree(sm.current.busAnchor),originals=[];root.traverse(o=>{if(o.isMesh)originals.push([o,o.material]);});
        const manager=new BusMaterialVariants({scene:engine.scene,lightingSettings:engine.lightingSettings,getDynamicIlluminationObjects:()=>[{id:'vehicle.audit',root}]});
        const cycles=[],failures=[];
        for(let cycle=0;cycle<3;cycle++){
            for(let mask=0;mask<8;mask++){
                manager.configure({enabled:false,materials:false,probes:false,glassReflections:!!(mask&1),bodyReflections:!!(mask&2),rimShine:!!(mask&4)});
                for(const [mesh,m] of originals){
                    const a=Array.isArray(m)?m:[m],b=Array.isArray(mesh.material)?mesh.material:[mesh.material];
                    if(a.some((v,i)=>v.color&&!v.color.equals(b[i].color)))failures.push('Color changed at '+mesh.name);
                }
            }
            manager.configure({enabled:false,materials:false,probes:false,glassReflections:false,bodyReflections:false,rimShine:false});
            if(originals.some(([o,m])=>o.material!==m))failures.push('Original reference not restored');
            cycles.push(manager.getDiagnostics());
        }
        if(cycles[1].cachedVariants!==cycles[2].cachedVariants)failures.push('Unbounded variant cache');
        manager.dispose();
        return {results,toggles:{cycles,combinations:24,failures,scope:'Detached actual bus meshes; ownership/color/cache checks. No production performance claim.'}};
    }finally{
        renderer.setRenderTarget(null);target.dispose();renderer.toneMapping=previous.tone;renderer.outputColorSpace=previous.color;renderer.shadowMap.enabled=previous.shadow;
    }
}
