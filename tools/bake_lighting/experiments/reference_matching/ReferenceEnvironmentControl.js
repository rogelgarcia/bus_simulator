// @ts-check
// Diagnostic toggle only: F0 .04 opaque dielectrics, no local geometry reflections.
import * as THREE from 'three';
import {registerMaterialShaderHook} from '../../../../src/graphics/shaders/core/MaterialShaderHookRegistry.js';
import {environmentReferenceShader as source,environmentReferenceApply as apply} from '../../../../src/graphics/shaders/materials/EnvironmentReferenceShaderLoader.js';
import {referenceWhiteEnergy} from './EnvironmentFixture.mjs';

/** Install reversible view-dependent GGX integration on explicitly selected fixture materials. */
export function referenceEnvironmentControl(materials,whiteCells,sampleCount=64){
    if(![64,256].includes(sampleCount))throw new Error('Reference sample count must be 64 or 256');
    const {roughness,noV,pixels}=referenceWhiteEnergy(whiteCells);
    const texture=new THREE.DataTexture(pixels,7,8,THREE.RGBAFormat,THREE.FloatType);texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
    const uniforms={referenceEnvironmentEnabled:{value:false},referenceEnvironmentSamples:{value:sampleCount},referenceWhiteEnergy:{value:texture},referenceRoughness:{value:roughness},referenceNoV:{value:noV}};
    const hooks=[];
    try{for(const material of new Set(materials))hooks.push(registerMaterialShaderHook(material,{id:'diagnostics.environment_reference',priority:9000,variantKey:source.variantKey+'.'+apply.variantKey,uniforms,
        apply(shader){
            const anchor='#include <aomap_fragment>';
            if(!shader.fragmentShader.includes(anchor)||!shader.fragmentShader.includes('void main() {'))throw new Error('Missing environment shader boundary');
            Object.assign(shader.uniforms,uniforms);
            shader.fragmentShader=shader.fragmentShader.replace('void main() {',source.fragmentSource+'\nvoid main() {');
            shader.fragmentShader=shader.fragmentShader.replace(anchor,apply.fragmentSource);
        }}));}catch(error){for(const hook of hooks)hook.remove();texture.dispose();throw error;}
    return Object.freeze({setEnabled(value){uniforms.referenceEnvironmentEnabled.value=value===true;},dispose(){for(const hook of hooks)hook.remove();texture.dispose();}});
}

/** Match the existing opaque-building selection, restricted to this fixture's BSDF. */
export function buildingReferenceMaterials(root){
    const materials=new Set();
    root.traverse(object=>{
        if(!object.isMesh)return;
        for(let ancestor=object;ancestor;ancestor=ancestor.parent)if(ancestor.name==='windows')return;
        for(const material of Array.isArray(object.material)?object.material:[object.material]){
            if(!material?.isMeshStandardMaterial||material.isMeshPhysicalMaterial||material.transparent||material.metalness!==0
                ||material.userData?.buildingWindowGlass||material.userData?.windowInterior
                ||material.userData?.iblNoAutoEnvMapIntensity!==true)continue;
            materials.add(material);
        }
    });
    if(!materials.size)throw new Error('No eligible F0 .04 opaque building materials');
    return [...materials];
}
