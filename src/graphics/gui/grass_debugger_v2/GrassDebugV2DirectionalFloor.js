// Blend the top capture with adjacent oblique reference captures around the canopy.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2FloorBake } from './GrassDebugV2FloorBake.js';
import { createGrassDebugV2FloorMaterial } from './GrassDebugV2FloorMaterial.js';
import { grassFloorDirectionalShader } from '../../shaders/materials/grass/GrassFloorDirectionalShaderLoader.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';

export const GRASS_V2_DIRECTIONAL_RECIPE = Object.freeze({
    resolution: 1024, elevationDegrees: 30,
    topBlendElevationDegrees: Object.freeze([35, 80]), azimuthOffsetsDegrees: Object.freeze([0])
});

/** @param {{renderer:THREE.WebGLRenderer, source:THREE.Group, ground:THREE.Mesh, topBake:Awaited<ReturnType<typeof createGrassDebugV2FloorBake>>, planeHeight:number, shadowDirection:THREE.Vector3,recipe?:Partial<typeof GRASS_V2_DIRECTIONAL_RECIPE>}} options */
export async function createGrassDebugV2DirectionalFloor({ renderer, source, ground, topBake, planeHeight, shadowDirection, recipe = {} }) {
    const merged = { ...GRASS_V2_DIRECTIONAL_RECIPE, ...recipe };
    const blend = merged.topBlendElevationDegrees, offsets = merged.azimuthOffsetsDegrees;
    if (!Number.isInteger(merged.resolution) || merged.resolution < 256 || merged.resolution > 4096
        || !Number.isFinite(merged.elevationDegrees) || merged.elevationDegrees < 30 || merged.elevationDegrees >= 90
        || !Array.isArray(blend) || blend.length !== 2 || !blend.every(Number.isFinite)
        || !(blend[0] >= 0 && blend[0] < blend[1] && blend[1] <= 90)
        || !Array.isArray(offsets) || offsets.length < 1 || offsets.length > 32
        || !offsets.every((angle, index) => Number.isFinite(angle) && angle >= 0 && angle < 360 && (index === 0 || angle > offsets[index - 1])))
        throw new Error('Directional grass recipe requires 1–32 increasing oblique headings within [0, 360) and an increasing top blend range.');
    if (!shadowDirection?.toArray().every(Number.isFinite) || Math.hypot(shadowDirection.x, shadowDirection.z) === 0
        || !Number.isFinite(planeHeight) || planeHeight < 0)
        throw new Error('Directional grass requires a finite surface height and a sun direction with a horizontal bearing.');
    const config = Object.freeze({ ...merged, topBlendElevationDegrees: Object.freeze([...blend]), azimuthOffsetsDegrees: Object.freeze([...offsets]) });
    const sourceMeshes = source.children.filter(mesh => mesh.isInstancedMesh);
    if (!sourceMeshes.length || sourceMeshes.some(mesh => !Number.isInteger(mesh.count) || mesh.count < 0
        || !mesh.geometry.index || mesh.geometry.index.count % 6 !== 0))
        throw new Error('Directional grass requires indexed, instanced leaf cards.');
    const sourceLeaves = sourceMeshes.reduce((sum, mesh) => sum + mesh.count, 0);
    const sourceLod = [...new Set(sourceMeshes.map(mesh => 'LOD3 · ' + mesh.geometry.index.count / 6))].join(' + ');
    const sunAzimuthDegrees = (THREE.MathUtils.radToDeg(Math.atan2(shadowDirection.x, shadowDirection.z)) + 360) % 360;
    const captureAzimuths = config.azimuthOffsetsDegrees.map(offset => ((sunAzimuthDegrees + offset) % 360 + 360) % 360);
    const bakes = [];
    try {
        for (const azimuthDegrees of captureAzimuths)
            bakes.push(await createGrassDebugV2FloorBake({ renderer, source, ground, resolution: config.resolution,
                elevationDegrees: config.elevationDegrees, azimuthDegrees, planeHeight, shadowDirection }));
    } catch (error) { bakes.forEach(bake => bake.dispose()); throw error; }
    const material = createGrassDebugV2FloorMaterial(topBake.textures);
    material.name = 'GrassV2DirectionalCanopy';
    material.defines = { ...material.defines, GRASS_FLOOR_DIRECTIONAL: 1 };
    const uniforms = { grassViewWeights: { value: new THREE.Vector3(1, 0, 0) } };
    const channels = [['albedo', 'Albedo'], ['normal', 'Normal'], ['roughness', 'Roughness'], ['visibility', 'Visibility']];
    for (const [channel, label] of channels)
        for (const [suffix, index] of [['A', 0], ['B', 1]]) uniforms['grassView' + label + suffix] = { value: bakes[index % bakes.length].textures[channel] };
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
    let state = { elevationDegrees: 90, azimuthDegrees: 0, indices: [0, 1 % bakes.length], weights: [1, 0, 0] };
    const updateCamera = (camera, surface) => {
        camera.getWorldPosition(eye); surface.worldToLocal(eye);
        const elevationDegrees = THREE.MathUtils.radToDeg(Math.atan2(eye.y, Math.hypot(eye.x, eye.z)));
        const azimuthDegrees = (THREE.MathUtils.radToDeg(Math.atan2(eye.x, eye.z)) + 360) % 360;
        const topWeight = THREE.MathUtils.smoothstep(elevationDegrees, ...config.topBlendElevationDegrees);
        let heading = (azimuthDegrees - sunAzimuthDegrees + 360) % 360;
        if (heading < config.azimuthOffsetsDegrees[0]) heading += 360;
        let first = bakes.length - 1;
        for (let index = 0; index < bakes.length - 1; index++) {
            if (heading < config.azimuthOffsetsDegrees[index + 1]) { first = index; break; }
        }
        const second = (first + 1) % bakes.length;
        const start = config.azimuthOffsetsDegrees[first];
        const end = config.azimuthOffsetsDegrees[second] + (second === 0 ? 360 : 0);
        const fraction = bakes.length === 1 ? 0 : (heading - start) / (end - start);
        // Keep only the bracketing views bound: capture count does not increase shader sampler usage.
        for (const [channel, label] of channels) {
            uniforms['grassView' + label + 'A'].value = bakes[first].textures[channel];
            uniforms['grassView' + label + 'B'].value = bakes[second].textures[channel];
        }
        uniforms.grassViewWeights.value.set(topWeight, (1 - topWeight) * (1 - fraction), (1 - topWeight) * fraction);
        state = { elevationDegrees, azimuthDegrees, indices: [first, second], weights: uniforms.grassViewWeights.value.toArray() };
    };
    return Object.freeze({ material, bakes: Object.freeze(bakes), updateCamera,
        getSnapshot: () => ({ recipe: { ...config, topBlendElevationDegrees: [...config.topBlendElevationDegrees], azimuthOffsetsDegrees: [...config.azimuthOffsetsDegrees] },
            topResolution: topBake.getSnapshot().resolution, sourceLod, sourceLeaves, viewCount: bakes.length, totalViewCount: bakes.length + 1, sunAzimuthDegrees, captureElevationDegrees: config.elevationDegrees,
            topBlendElevationDegrees: [...config.topBlendElevationDegrees], planeHeight, shadowDirection: shadowDirection.toArray(), state, captures: bakes.map(bake => bake.getSnapshot()) }),
        dispose: () => { material.dispose(); bakes.forEach(bake => bake.dispose()); }
    });
}
