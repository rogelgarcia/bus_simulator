// Use the same canopy material for field rendering and candidate evaluation.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2FloorMaterial } from './GrassDebugV2FloorMaterial.js';
import { grassFieldCanopyNormalShader, grassFieldCanopyShadowParsShader, grassFieldCanopyShadowShader, grassFieldCanopyCoverageShader, grassFieldCanopyLightingShader, grassFieldCanopySamplingShader, grassFieldCanopyDistanceShader, grassFieldCanopyColorShader, grassFieldCanopyFacingShader, grassFieldCanopySpecularShader, grassFieldCanopyShadowCaptureShader, grassFieldCanopyReliefParsShader, grassFieldCanopyReliefShader } from '../../shaders/materials/grass/GrassFieldCanopyShaderLoader.js?v=lod4-shadow-fast-1';
import { grassFloorLightingShader } from '../../shaders/materials/grass/GrassFloorFacingShaderLoader.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';
import { applyGrassDebugV2CanopyDistanceAppearance } from './GrassDebugV2DistanceAppearance.js';

/** @param {{texturesByLayer:object,secondaryTexturesByLayer?:object,shadowUniforms:object,resolution:number,tileMeters:number,filterFootprint:number,sourceHeight:number,distanceStart?:number,distanceEnd?:number,farScale?:number,relief?:{flattenStart:number,flattenEnd:number,nearScale:number,growStart:number,growEnd:number}|null}} options */
export function createGrassDebugV2CanopyMaterials({texturesByLayer,secondaryTexturesByLayer=null,shadowUniforms,resolution,tileMeters,filterFootprint,sourceHeight,distanceStart=24,distanceEnd=80,farScale=2,relief=null}) {
    if (!(distanceStart >= 0 && distanceEnd > distanceStart && farScale >= 1)) throw new Error('Canopy distance scale requires increasing positive distances and a scale of at least one.');
    if (relief && !(relief.nearScale > 0 && relief.nearScale <= 1 && relief.growStart >= 0 && relief.growEnd > relief.growStart
        && relief.flattenStart >= relief.growEnd && relief.flattenEnd > relief.flattenStart)) throw new Error('Canopy relief requires a positive near scale and ordered growth/fade ranges.');
    if (secondaryTexturesByLayer && Object.keys(texturesByLayer).some(layer => !secondaryTexturesByLayer[layer])) throw new Error('Every canopy layer needs its second tile variation.');
    const materials=Object.fromEntries(Object.entries(texturesByLayer).map(([layer,textures])=>{
        const second = secondaryTexturesByLayer?.[layer] ?? textures;
        const uniforms = { grassCanopyTileVisibility: { value: textures.visibility },
            grassCanopyAlbedoB: { value: second.albedo }, grassCanopyNormalB: { value: second.normal },
            grassCanopyRoughnessB: { value: second.roughness }, grassCanopyVisibilityB: { value: second.visibility },
            grassCanopyDistance: { value: new THREE.Vector3(distanceStart,distanceEnd,farScale) }, ...shadowUniforms };
        const material=createGrassDebugV2FloorMaterial(textures,{canopyOcclusionStrength:0,canopyContrast:0});
        material.userData.grassCanopyTileVisibility = uniforms.grassCanopyTileVisibility;
        material.userData.grassCanopyDistance = uniforms.grassCanopyDistance;
        material.userData.grassCanopySampling = Object.freeze({ variants: secondaryTexturesByLayer ? 2 : 1, tileMeters,
            farTileMeters: tileMeters * farScale, distanceStart, distanceEnd, blend: 'linear-radiance', filtering: 'native-mip-anisotropic' });
        material.name='GrassFieldCanopy-'+layer;material.side=THREE.FrontSide;
        if (relief) {
            material.name += '-Relief'; material.side = THREE.DoubleSide;
            material.defines.GRASS_RELIEF_FLATTEN_START = relief.flattenStart.toFixed(1);
            material.defines.GRASS_RELIEF_FLATTEN_END = relief.flattenEnd.toFixed(1);
            material.defines.GRASS_RELIEF_NEAR_SCALE = relief.nearScale.toFixed(3);
            material.defines.GRASS_RELIEF_GROW_START = relief.growStart.toFixed(1);
            material.defines.GRASS_RELIEF_GROW_END = relief.growEnd.toFixed(1);
            material.defines.GRASS_RELIEF_TILE_METERS = tileMeters.toFixed(3);
        }
        material.defines.GRASS_FIELD_CANOPY_LITTER = layer === 'all' ? 1 : 0;
        material.defines.GRASS_FIELD_CANOPY_FILTER = (filterFootprint * resolution / tileMeters).toFixed(9);
        material.defines.GRASS_FIELD_CANOPY_RESOLUTION = resolution.toFixed(1);
        material.defines.GRASS_FIELD_CANOPY_SOURCE_HEIGHT = sourceHeight.toFixed(9);
        if (secondaryTexturesByLayer) material.defines.GRASS_FIELD_CANOPY_PAIR = 1;
        const payloads = [grassFieldCanopyNormalShader, grassFieldCanopyShadowParsShader, grassFieldCanopyShadowShader,
            grassFieldCanopyCoverageShader, grassFieldCanopyLightingShader, grassFieldCanopySamplingShader, grassFieldCanopyDistanceShader,
            grassFieldCanopyColorShader, grassFieldCanopyFacingShader, grassFieldCanopySpecularShader, grassFieldCanopyShadowCaptureShader];
        if (relief) payloads.push(grassFieldCanopyReliefParsShader, grassFieldCanopyReliefShader);
        for (const payload of payloads) attachShaderMetadata(material, payload);
        registerMaterialShaderHook(material,{id:'grass.field-canopy.world-normal',priority:20,variantKey:payloads.map(p=>p.variantKey).join('|'),
            uniforms,
            apply: shader => {
                Object.assign(shader.uniforms, uniforms);
                const anchor = 'normal = normalize( tbn * mapN );';
                const outgoing = 'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;';
                if (!shader.fragmentShader.includes(anchor)
                    || !shader.fragmentShader.includes(outgoing)
                    || !shader.fragmentShader.includes(grassFloorLightingShader.fragmentSource)
                    || !shader.fragmentShader.includes('diffuseColor.rgb = max(diffuseColor.rgb - grassFloorSoilColor'))
                    throw new Error('Canopy floor-material shader contract changed.');
                shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + grassFieldCanopyShadowParsShader.vertexSource)
                    .replace('#include <shadowmap_vertex>', '#include <shadowmap_vertex>\n' + grassFieldCanopyShadowShader.vertexSource);
                const lights = THREE.ShaderChunk.lights_fragment_begin;
                if (!lights.includes('vDirectionalShadowCoord[ i ]')) throw new Error('Canopy shadow-coordinate contract changed.');
                shader.fragmentShader = shader.fragmentShader.replace(anchor, grassFieldCanopyNormalShader.fragmentSource)
                    .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n' + grassFieldCanopyShadowCaptureShader.fragmentSource)
                    .replace(outgoing, grassFieldCanopySpecularShader.fragmentSource + '\n' + outgoing)
                    .replace(grassFloorLightingShader.fragmentSource, grassFieldCanopyLightingShader.fragmentSource)
                    .replace('grassFacingSourceNormal = normal * max(grassFloorNormalLength, 0.35);', grassFieldCanopyFacingShader.fragmentSource)
                    .replace('#include <common>', '#include <common>\n' + grassFieldCanopySamplingShader.fragmentSource + '\n' + grassFieldCanopyShadowParsShader.fragmentSource)
                    .replace('diffuseColor.rgb = max(diffuseColor.rgb - grassFloorSoilColor', grassFieldCanopyCoverageShader.fragmentSource + '\n' + grassFieldCanopyColorShader.fragmentSource + '\ndiffuseColor.rgb = max(diffuseColor.rgb - grassFloorSoilColor')
                    .replace('#include <lights_fragment_begin>', lights.replaceAll('vDirectionalShadowCoord[ i ]', grassFieldCanopyShadowShader.fragmentSource).replaceAll('getShadow( directionalShadowMap', 'grassCanopyShadow( directionalShadowMap'));
                shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', THREE.ShaderChunk.map_fragment)
                    .replace('#include <roughnessmap_fragment>', THREE.ShaderChunk.roughnessmap_fragment);
                for (const [map, uv, secondary] of [['map','vMapUv','grassCanopyAlbedoB'],['normalMap','vNormalMapUv','grassCanopyNormalB'],['roughnessMap','vRoughnessMapUv','grassCanopyRoughnessB']]) {
                    const sample = new RegExp('texture2D\\(\\s*' + map + ',\\s*' + uv + '\\s*\\)', 'g');
                    if (!sample.test(shader.fragmentShader)) throw new Error('Missing canopy sample: ' + map);
                    shader.fragmentShader = shader.fragmentShader.replace(sample, 'grassFieldCanopySample(' + map + ', ' + secondary + ', ' + uv + ')');
                }
                for (const chunk of ['tonemapping_fragment','colorspace_fragment','fog_fragment','premultiplied_alpha_fragment','dithering_fragment']) {
                    const include = '#include <' + chunk + '>';
                    if (!shader.fragmentShader.includes(include)) throw new Error('Missing canopy output stage: ' + chunk);
                    shader.fragmentShader = shader.fragmentShader.replace(include, '');
                }
                shader.fragmentShader += '\n' + grassFieldCanopyDistanceShader.fragmentSource;
                if (relief) {
                    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + grassFieldCanopyReliefParsShader.vertexSource)
                        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + grassFieldCanopyReliefShader.vertexSource);
                    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + grassFieldCanopyReliefParsShader.fragmentSource)
                        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + grassFieldCanopyReliefShader.fragmentSource)
                        .replace('normal *= faceDirection;', '');
                }
            }
        });
        applyGrassDebugV2CanopyDistanceAppearance(material);
        return [layer,material];
    }));
    return materials;
}
