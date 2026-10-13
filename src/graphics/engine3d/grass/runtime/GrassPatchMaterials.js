// Share baked lighting while adding immutable tile placement and continuous litter-to-canopy shading.
// @ts-check
import * as THREE from 'three';
import { createSharedUniformMaterialVariant, registerMaterialShaderHook } from '../../../shaders/core/MaterialShaderHookRegistry.js';
import { attachShaderMetadata } from '../../../shaders/core/ShaderLoader.js';
import { grassPatchShader } from '../../../shaders/materials/grass/GrassPatchShaderLoader.js';

const sections = source => Object.fromEntries([...source.matchAll(/\/\/ @section (\w+)\s*\n([\s\S]*?)(?=\/\/ @section|$)/g)].map(match => [match[1], match[2]]));
const vertex = sections(grassPatchShader.vertexSource), fragment = sections(grassPatchShader.fragmentSource);

/** @param {{asset:object,distances:number[],groundY:number,terminalTransition?:'dissolve'|'rise'}} input */
export function createGrassPatchMaterials({ asset, distances, groundY, terminalTransition = 'dissolve' }) {
    const camera = { value: new THREE.Vector3() }, mode = { value: -1 };
    const starts = distances.map((distance, i) => distance - (distance - (distances[i - 1] ?? 0)) * .3);
    const bands = distances.map((distance, i) => new THREE.Vector4(i ? starts[i - 1] : -2, i ? distances[i - 1] : -1, starts[i], distance));
    const materials = [];
    const rise = terminalTransition === 'rise';
    const sinkHeight = rise ? Math.max(...asset.bridge.templates.map(template => template.boundingBox.max.y)) + .01 : 0;
    const create = (source, band, surface = false, handoff = false) => {
        const material = createSharedUniformMaterialVariant(source);
        if (handoff) material.defines[rise ? 'GRASS_PATCH_RISE' : 'GRASS_PATCH_HANDOFF'] = 1;
        if (surface) {
            if (asset.leafFill) material.defines.GRASS_PATCH_LEAF_FILL = 1;
            material.map = null;
            delete material.defines.BAKED_GRASS_PAIR;
            delete material.defines.BAKED_GRASS_TILE_VARIATION;
            delete material.defines.BAKED_GRASS_CANOPY_VIEW;
            material.defines.GRASS_PATCH_SURFACE = 1;
        }
        const uniforms = { grassPatchCamera: camera, grassPatchMode: mode, grassPatchBand: { value: band }, grassPatchGroundY: { value: groundY } };
        if (handoff && rise) Object.assign(uniforms, { grassPatchRiseBand: { value: new THREE.Vector2(distances[3], distances[4]) },
            grassPatchSinkHeight: { value: sinkHeight } });
        if (surface || handoff) Object.assign(uniforms, {
            grassPatchCanopyA: { value: asset.maps.canopy[0] }, grassPatchCanopyB: { value: asset.maps.canopy[1] },
            grassPatchCanopyScale: { value: asset.manifest.canopyUvScale }, grassPatchCanopyColor: { value: asset.canopy.materials.all.color },
            grassPatchHandoffBand: { value: rise ? new THREE.Vector2(starts[3], distances[3]) : new THREE.Vector2(distances[3], starts[4]) }
        });
        if (surface) {
            const litterHook = asset.litterMaterial;
            if (asset.leafFill) Object.assign(uniforms, { grassLeafFillMap: { value: asset.leafFill.texture },
                grassLeafFillExtent: { value: asset.leafFill.manifest.extent }, grassLeafFillStrength: { value: 1 } });
            Object.assign(uniforms, { grassPatchLitterA: { value: asset.maps.litter[0] }, grassPatchLitterB: { value: asset.maps.litter[1] },
                grassPatchLitterGain: { value: new THREE.Vector3(litterHook.color.r / source.color.r, litterHook.color.g / source.color.g, litterHook.color.b / source.color.b) } });
        }
        attachShaderMetadata(material, grassPatchShader);
        registerMaterialShaderHook(material, { id: 'grass.immutable-patch', priority: 10,
            variantKey: grassPatchShader.variantKey + (surface ? ':surface' : ':blades'), uniforms,
            apply(shader) {
                Object.assign(shader.uniforms, uniforms);
                shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + vertex.pars)
                    .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + vertex.begin);
                shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + fragment.pars)
                    .replace('#include <clipping_planes_fragment>', fragment.mask + '\n#include <clipping_planes_fragment>')
                    .replace('#include <opaque_fragment>', fragment.handoff + '\n#include <opaque_fragment>');
                if (surface) shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', fragment.map);
            } });
        materials.push(material); return material;
    };
    const leaves = bands.map((band, level) => create(asset.sources.LOD2.material, band, false, level === 4));
    const surface = create(asset.canopy.materials.all, bands[4], true);
    return Object.freeze({ leaves, surface, camera, mode, bands, materials,
        dispose() { materials.forEach(material => material.dispose()); } });
}
