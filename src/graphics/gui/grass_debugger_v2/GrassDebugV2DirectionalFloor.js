// Blend top, sun-facing and opposite reference captures by camera elevation and sun-relative heading.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2FloorBake } from './GrassDebugV2FloorBake.js';
import { createGrassDebugV2FloorMaterial } from './GrassDebugV2FloorMaterial.js';
import { grassFloorDirectionalShader } from '../../shaders/materials/grass/GrassFloorDirectionalShaderLoader.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';

/** @param {{renderer:THREE.WebGLRenderer, source:THREE.Group, ground:THREE.Mesh, topBake:Awaited<ReturnType<typeof createGrassDebugV2FloorBake>>, planeHeight:number, shadowDirection:THREE.Vector3}} options */
export async function createGrassDebugV2DirectionalFloor({ renderer, source, ground, topBake, planeHeight, shadowDirection }) {
    const sunAzimuthDegrees = (THREE.MathUtils.radToDeg(Math.atan2(shadowDirection.x, shadowDirection.z)) + 360) % 360;
    const captureAzimuths = [sunAzimuthDegrees, (sunAzimuthDegrees + 180) % 360];
    const bakes = [];
    try {
        for (const azimuthDegrees of captureAzimuths)
            bakes.push(await createGrassDebugV2FloorBake({ renderer, source, ground, resolution: 1024,
                elevationDegrees: 30, azimuthDegrees, planeHeight, shadowDirection }));
    } catch (error) { bakes.forEach(bake => bake.dispose()); throw error; }
    const material = createGrassDebugV2FloorMaterial(topBake.textures);
    material.name = 'GrassV2DirectionalCanopy';
    material.defines = { ...material.defines, GRASS_FLOOR_DIRECTIONAL: 1 };
    const uniforms = { grassViewWeights: { value: new THREE.Vector3(1, 0, 0) } };
    for (const [channel, label] of [['albedo', 'Albedo'], ['normal', 'Normal'], ['roughness', 'Roughness'], ['visibility', 'Visibility']])
        for (const [suffix, index] of [['A', 0], ['B', 1]]) uniforms['grassView' + label + suffix] = { value: bakes[index].textures[channel] };
    attachShaderMetadata(material, grassFloorDirectionalShader);
    registerMaterialShaderHook(material, {
        id: 'grass.floor.directional', priority: 100, variantKey: grassFloorDirectionalShader.variantKey, uniforms,
        apply: shader => {
            Object.assign(shader.uniforms, uniforms);
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', '#include <common>\n' + grassFloorDirectionalShader.fragmentSource)
                .replace('#include <map_fragment>', THREE.ShaderChunk.map_fragment)
                .replace('#include <roughnessmap_fragment>', THREE.ShaderChunk.roughnessmap_fragment);
            for (const [map, uv, label] of [['map', 'vMapUv', 'Albedo'], ['normalMap', 'vNormalMapUv', 'Normal'], ['roughnessMap', 'vRoughnessMapUv', 'Roughness']]) {
                const sample = new RegExp('texture2D\\(\\s*' + map + ',\\s*' + uv + '\\s*\\)', 'g');
                if (!sample.test(shader.fragmentShader)) throw new Error('Directional floor ' + map + ' sampling contract changed.');
                shader.fragmentShader = shader.fragmentShader.replace(sample,
                    'grassViewSample(' + map + ', grassView' + label + 'A, grassView' + label + 'B, ' + uv + ')');
            }
        }
    });
    const eye = new THREE.Vector3();
    let state = { elevationDegrees: 90, azimuthDegrees: 0, indices: [0, 1], weights: [1, 0, 0] };
    const updateCamera = (camera, surface) => {
        camera.getWorldPosition(eye); surface.worldToLocal(eye);
        const elevationDegrees = THREE.MathUtils.radToDeg(Math.atan2(eye.y, Math.hypot(eye.x, eye.z)));
        const azimuthDegrees = (THREE.MathUtils.radToDeg(Math.atan2(eye.x, eye.z)) + 360) % 360;
        const topWeight = THREE.MathUtils.smoothstep(elevationDegrees, 35, 80);
        const sunWeight = 0.5 + 0.5 * Math.cos(THREE.MathUtils.degToRad(azimuthDegrees - sunAzimuthDegrees));
        uniforms.grassViewWeights.value.set(topWeight, (1 - topWeight) * sunWeight, (1 - topWeight) * (1 - sunWeight));
        state = { elevationDegrees, azimuthDegrees, indices: [0, 1], weights: uniforms.grassViewWeights.value.toArray() };
    };
    return Object.freeze({ material, bakes: Object.freeze(bakes), updateCamera,
        getSnapshot: () => ({ sourceLod: 'LOD3 · 10', sourceLeaves: 4000, viewCount: 2, totalViewCount: 3, sunAzimuthDegrees, captureElevationDegrees: 30,
            topBlendElevationDegrees: [35, 80], planeHeight, shadowDirection: shadowDirection.toArray(), state, captures: bakes.map(bake => bake.getSnapshot()) }),
        dispose: () => { material.dispose(); bakes.forEach(bake => bake.dispose()); }
    });
}
