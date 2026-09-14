// Uniform-only controls keep baked transport resident and restore authored shading.
import {registerMaterialShaderHook} from '../../../../src/graphics/shaders/core/MaterialShaderHookRegistry.js';
import {primarySurfaceShaders as source} from '../../../../src/graphics/shaders/materials/PrimarySurfaceShaderLoader.js';
import {buildingReferenceMaterials} from './ReferenceEnvironmentControl.js';

export function primarySurfaceControl(root) {
    const uniforms={primaryGeometricNormal:{value:false},primaryConstantRoughness:{value:false}},hooks=[];
    try { for(const material of buildingReferenceMaterials(root))hooks.push(registerMaterialShaderHook(material,{
        id:'diagnostics.primary_surface',priority:9500,variantKey:source.variantKey,uniforms,
        apply(shader) {
            for(const anchor of ['#include <clearcoat_normal_fragment_begin>','#include <lights_physical_fragment>'])
                if(!shader.fragmentShader.includes(anchor))throw new Error('Missing primary diagnostic anchor: '+anchor);
            Object.assign(shader.uniforms,uniforms);
            shader.fragmentShader=source.declarations+shader.fragmentShader
                .replace('#include <clearcoat_normal_fragment_begin>',source.normal)
                .replace('#include <lights_physical_fragment>',source.roughness);
        }
    })); } catch(error) {for(const h of hooks)h.remove();throw error;}
    return {materials:hooks.length,set(variant) {
        uniforms.primaryGeometricNormal.value=['geometric','geometric_constant'].includes(variant);
        uniforms.primaryConstantRoughness.value=['normal_constant','geometric_constant'].includes(variant);
    },dispose(){for(const h of hooks)h.remove();}};
}
