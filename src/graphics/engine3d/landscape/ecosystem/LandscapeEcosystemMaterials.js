// Builds the ecosystem instance materials (AI 599 D4): one ShaderMaterial per layer and LOD band over the shared lighting cells, the asset's textures and impostor tables, rebuilt as a set for a lighting tier or the diagnostic views.
// @ts-check
// Design: a material is a compile-time variant (mesh or impostor, textured, variant count, lighting tier, diagnostics) with the band's fade span,
// the layer's alignment and the asset's height as uniforms; the lighting cells, the wind, contact and diagnostic cells are shared objects, so one
// update reaches every material. A set is immutable once built: a tier or diagnostics change builds a new set (uniform cells bind at the first
// link, so materials are never mutated after linking), compiles it and swaps it in.
import * as THREE from 'three';
import { attachShaderMetadata } from '../../../shaders/core/ShaderLoader.js';
import { createLandscapeEcosystemShaderPayload } from '../../../shaders/materials/landscape/LandscapeEcosystemShaderLoader.js';
import { ecosystemLayerPriorityOrder } from '../../../../app/landscape/index.js';
import { ecosystemDiagnosticColor, ecosystemLodBands } from './LandscapeEcosystemModel.js';

/** The material key of a layer's LOD band. @param {string} layerId @param {number} level */
export function ecosystemMaterialKey(layerId, level) { return `${layerId}/${level}`; }

/**
 * @param {{recipe:any,assetSets:any,lighting:any,lightingTier:string,diagnostics:boolean,shared:{uEcosystemWind:any,uEcosystemContact:any,uEcosystemDiagnostic:any}}} options
 * @returns {Readonly<{tier:string,diagnostics:boolean,entries:ReadonlyMap<string, Readonly<{key:string,layer:any,band:any,asset:any,lod:any,material:any,orderIndex:number}>>,dispose():void}>}
 */
export function createEcosystemMaterialSet({ recipe, assetSets, lighting, lightingTier, diagnostics, shared }) {
    if (!lighting?.uniforms) throw new Error('[LandscapeEcosystem] The materials need the view lighting');
    const order = ecosystemLayerPriorityOrder(recipe), entries = new Map();
    order.forEach((layerId, orderIndex) => {
        const layer = recipe.layers[layerId], asset = assetSets.get(layer.assetSet), bands = ecosystemLodBands(layer);
        for (const band of bands) {
            const lod = asset.lods.find(entry => entry.level === band.level);
            if (!lod) throw new Error(`[LandscapeEcosystem] asset set ${asset.id} has no LOD ${band.level} for layer ${layerId}`);
            const impostor = lod.impostor !== null, payload = createLandscapeEcosystemShaderPayload({ kind: impostor ? 'impostor' : 'mesh', textured: lod.textured, lightingTier, diagnostics, variants: lod.textured ? asset.variants : 1 });
            const uniforms = { ...lighting.uniforms, ...shared,
                uEcosystemBand: { value: new THREE.Vector4(band.fadeIn[0], band.fadeIn[1], band.fadeOut[0], band.fadeOut[1]) },
                uEcosystemAsset: { value: new THREE.Vector4(asset.heightMeters, layer.alignment.sinkMeters, layer.alignment.sinkScalesWithSize ? 1 : 0, layer.alignment.slopeWeight) },
                uEcosystemLodColor: { value: new THREE.Vector3(...ecosystemDiagnosticColor('lod', band.index)) }, uEcosystemLayerColor: { value: new THREE.Vector3(...ecosystemDiagnosticColor('layer', orderIndex)) } };
            if (lod.textured) {
                lod.textures.variants.forEach((textures, variant) => { uniforms[`uEcosystemColor${variant}`] = { value: textures.color }; uniforms[`uEcosystemNormal${variant}`] = { value: textures.normal }; uniforms[`uEcosystemOrm${variant}`] = { value: textures.orm }; });
                if (lod.textures.leaf) Object.assign(uniforms, { uEcosystemLeafColor: { value: lod.textures.leaf.color }, uEcosystemLeafNormal: { value: lod.textures.leaf.normal }, uEcosystemLeafOrm: { value: lod.textures.leaf.orm } });
            }
            if (impostor) Object.assign(uniforms, { uEcosystemImpostorViews: { value: lod.impostor.views }, uEcosystemImpostorFrames: { value: lod.impostor.frames }, uEcosystemImpostorVariant: { value: lod.impostor.shape } });
            const material = new THREE.ShaderMaterial({ vertexShader: payload.vertexSource, fragmentShader: payload.fragmentSource, uniforms, side: lod.textured ? THREE.DoubleSide : THREE.FrontSide });
            material.name = `Landscape ecosystem ${layerId} LOD ${band.level}`;
            attachShaderMetadata(material, payload);
            const key = ecosystemMaterialKey(layerId, band.level);
            entries.set(key, Object.freeze({ key, layer, band, asset, lod, material, orderIndex }));
        }
    });
    return Object.freeze({ tier: lightingTier, diagnostics, entries, dispose() { for (const entry of entries.values()) entry.material.dispose(); } });
}
