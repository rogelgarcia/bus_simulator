// Evaluate the native material shader on object-surface charts, without lighting or screen projection.
import * as THREE from 'three';
import {createSurfaceAtlas} from './SurfaceAtlas.js';
import {registerMaterialShaderHook} from '/src/graphics/shaders/core/MaterialShaderHookRegistry.js';

export async function createSurfaceMaterialExporter(renderer) {
    const names=['surface_export.vert.glsl','surface_export_project.vert.glsl','surface_export.frag.glsl','surface_export_output.frag.glsl'];
    const [vertex,project,fragment,output]=await Promise.all(names.map(async name=>{
        const response=await fetch('/src/graphics/shaders/materials/'+name);
        if(!response.ok)throw new Error('Missing surface export shader '+name);return response.text();
    }));
    const uniforms={surfaceExportPass:{value:0}};
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(55,1,.1,2000);
    camera.position.set(0,100,300);camera.lookAt(0,0,0);camera.updateMatrixWorld();
    function plan(sourceObject,id,pixelsPerMeter){
        if(sourceObject.isInstancedMesh||sourceObject.isSkinnedMesh)throw new Error('Surface export requires ordinary static mesh: '+id);
        const slots=Array.isArray(sourceObject.material)?sourceObject.material:[sourceObject.material];
        if(slots.some(m=>!m.isMeshStandardMaterial||m.transparent||m.transmission>0))throw new Error('Surface export requires opaque PBR slots: '+id);
        for(const m of slots)if(m.userData?.materialVariationConfig?.normalized?.texBlend?.enabled)throw new Error('View-distance material blending needs an explicit export policy: '+id);
        const geometry=sourceObject.geometry.index?sourceObject.geometry.toNonIndexed():sourceObject.geometry.clone();
        const position=geometry.attributes.position,world=new Float32Array(position.count*3),p=new THREE.Vector3();
        for(let i=0;i<position.count;i++){p.fromBufferAttribute(position,i).applyMatrix4(sourceObject.matrixWorld);p.toArray(world,i*3);}
        const materialIndices=new Uint32Array(position.count/3);
        for(const group of geometry.groups)for(let i=group.start/3;i<(group.start+group.count)/3;i++)materialIndices[i]=group.materialIndex;
        const atlas=createSurfaceAtlas(world,materialIndices,{pixelsPerMeter});
        geometry.setAttribute('surfaceExportUv',new THREE.BufferAttribute(atlas.uv,2));
        return {geometry,atlas};
    }
    async function evaluate(sourceObject, targetObject, sourceMaterials, id, prepared) {
        const {geometry,atlas}=prepared,pixelsPerMeter=atlas.pixelsPerMeter;
        const slots=Array.isArray(sourceObject.material)?sourceObject.material:[sourceObject.material];
        const mesh=new THREE.Mesh(geometry,sourceObject.material);mesh.matrix.copy(sourceObject.matrixWorld);mesh.matrixAutoUpdate=false;mesh.frustumCulled=false;
        const registrations=[],state={target:renderer.getRenderTarget(),tone:renderer.toneMapping,color:renderer.outputColorSpace,clear:renderer.getClearColor(new THREE.Color()),alpha:renderer.getClearAlpha()};
        const target=new THREE.WebGLRenderTarget(atlas.width,atlas.height,{type:THREE.FloatType,format:THREE.RGBAFormat,depthBuffer:false});
        const materialState=slots.map(m=>({m,side:m.side,depthTest:m.depthTest,depthWrite:m.depthWrite}));
        try {
            for(const material of new Set(slots)){
                material.side=THREE.DoubleSide;material.depthTest=false;material.depthWrite=false;
                registrations.push(registerMaterialShaderHook(material,{id:'export.surface-inputs',priority:20000,variantKey:'1',uniforms,
                    apply(shader){
                        Object.assign(shader.uniforms,uniforms);
                        shader.vertexShader=vertex+shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\n'+project);
                        const at=shader.fragmentShader.indexOf('#include <opaque_fragment>');
                        if(at<0)throw new Error('Surface output anchor missing');
                        shader.fragmentShader=fragment+shader.fragmentShader.slice(0,at)+output+'\n}';
                    }}));
            }
            scene.add(mesh);renderer.toneMapping=THREE.NoToneMapping;renderer.outputColorSpace=THREE.LinearSRGBColorSpace;renderer.setClearColor(0,0);renderer.setRenderTarget(target);
            const files={};
            for(const [pass,name]of ['color','orm','normal'].entries()){
                uniforms.surfaceExportPass.value=pass;renderer.clear();renderer.render(scene,camera);
                const data=new Float32Array(atlas.width*atlas.height*4);renderer.readRenderTargetPixels(target,0,0,atlas.width,atlas.height,data);
                const bytes=new Uint8Array(data.buffer),file=id+'_'+name+'.rgba32f';
                for(let offset=0;offset<bytes.length;offset+=1048576){
                    const chunk=bytes.subarray(offset,offset+1048576),parts=[];
                    for(let n=0;n<chunk.length;n+=16384)parts.push(String.fromCharCode(...chunk.subarray(n,n+16384)));
                    await window.__writeSurfaceChunk(file,btoa(parts.join('')),offset===0);
                }
                files[name]=file;
            }
            const exported=geometry.clone();exported.deleteAttribute('surfaceExportUv');
            for(const name of Object.keys(exported.attributes))if(!['position','normal','tangent','uv','color'].includes(name))exported.deleteAttribute(name);
            exported.setAttribute('uv1',new THREE.BufferAttribute(atlas.uv,2));targetObject.geometry=exported;
            return {schemaVersion:1,id,object:targetObject.name,width:atlas.width,height:atlas.height,pixelsPerMeter,padding:atlas.padding,charts:atlas.charts,files,
                materials:sourceMaterials.map(m=>m.name),normalSpace:'Three world XYZ encoded 0..1',aoPolicy:'Separate artistic indirect-occlusion input; never multiplied into physical Base Color',
                sampling:'Native shader in camera-independent planar surface atlas; fixed texel derivatives, original textures and procedural uniforms. View-distance blending rejected.'};
        } finally {
            scene.remove(mesh);for(const r of registrations)r.remove();
            for(const {m,side,depthTest,depthWrite}of materialState){m.side=side;m.depthTest=depthTest;m.depthWrite=depthWrite;}
            renderer.setRenderTarget(state.target);renderer.toneMapping=state.tone;renderer.outputColorSpace=state.color;renderer.setClearColor(state.clear,state.alpha);
            geometry.dispose();target.dispose();
        }
    }
    return Object.freeze({plan,evaluate});
}
