// Clip every grass representation and the complementary ground to one filtered vector contour.
// @ts-check
import * as THREE from 'three';
import { registerMaterialShaderHook, removeMaterialShaderHook } from '../../../shaders/core/MaterialShaderHookRegistry.js';
import { attachShaderMetadata } from '../../../shaders/core/ShaderLoader.js';
import { grassBoundaryShader } from '../../../shaders/materials/grass/GrassBoundaryShaderLoader.js';

const sections = source => Object.fromEntries([...source.matchAll(/\/\/ @section (\w+)\s*\n([\s\S]*?)(?=\/\/ @section|$)/g)].map(match => [match[1], match[2]]));
const vertex = sections(grassBoundaryShader.vertexSource), fragment = sections(grassBoundaryShader.fragmentSource);

/** @param {{bounds:{minX:number,minZ:number,maxX:number,maxZ:number},outline:{x:number,z:number}[],exclusions:{x:number,z:number}[][],exclusionGroups?:{loops:{x:number,z:number}[][],margin:number}[],resolution?:number}} input */
export function createGrassBoundaryMask({ bounds, outline, exclusions, exclusionGroups = [], resolution = 4096 }) {
    const width = bounds.maxX - bounds.minX, depth = bounds.maxZ - bounds.minZ;
    if (![bounds.minX, bounds.minZ, width, depth].every(Number.isFinite) || width <= 0 || depth <= 0
        || !Number.isInteger(resolution) || resolution < 64 || resolution > 4096
        || exclusionGroups.some(group => !Number.isFinite(group.margin) || group.margin < 0)
        || ![outline, ...exclusions, ...exclusionGroups.flatMap(group => group.loops)].every(loop => loop.length >= 3 && loop.every(p => Number.isFinite(p.x) && Number.isFinite(p.z))))
        throw new Error('[GrassBoundary] Expected finite contours, positive bounds and a 64–4096 resolution.');
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = resolution;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const draw = (loops, color, margin = 0) => {
        context.beginPath();
        for (const loop of loops) {
            loop.forEach((p, i) => context[i ? 'lineTo' : 'moveTo'](p.x, p.z));
            context.closePath();
        }
        context.fillStyle = color; context.fill('evenodd');
        if (margin > 0) { context.strokeStyle = color; context.lineWidth = 2 * margin; context.lineJoin = 'round'; context.stroke(); }
    };
    context.fillStyle = '#000'; context.fillRect(0, 0, resolution, resolution);
    context.setTransform(resolution / width, 0, 0, resolution / depth, -bounds.minX / width * resolution, -bounds.minZ / depth * resolution);
    draw([outline], '#fff'); draw(exclusions, '#000');
    for (const group of exclusionGroups) draw(group.loops, '#000', group.margin);
    const rgba = context.getImageData(0, 0, resolution, resolution).data, pixels = new Uint8Array(resolution * resolution);
    for (let i = 0; i < pixels.length; i++) pixels[i] = rgba[i * 4];
    const texture = new THREE.DataTexture(pixels, resolution, resolution, THREE.RedFormat);
    texture.minFilter = texture.magFilter = THREE.LinearFilter; texture.generateMipmaps = false; texture.needsUpdate = true;
    const read = (x, z) => pixels[Math.max(0, Math.min(resolution - 1, z)) * resolution + Math.max(0, Math.min(resolution - 1, x))] / 255;
    const sample = (x, z) => {
        if (x < bounds.minX || x >= bounds.maxX || z < bounds.minZ || z >= bounds.maxZ) return 0;
        const u = (x - bounds.minX) / width * resolution - .5, v = (z - bounds.minZ) / depth * resolution - .5;
        const ix = Math.floor(u), iz = Math.floor(v), fx = u - ix, fz = v - iz;
        return (read(ix, iz) * (1 - fx) + read(ix + 1, iz) * fx) * (1 - fz)
            + (read(ix, iz + 1) * (1 - fx) + read(ix + 1, iz + 1) * fx) * fz;
    };
    const bindings = new Set();
    return Object.freeze({ texture, bounds: Object.freeze({ ...bounds }), resolution, sample,
        intersectsCell(x, z) {
            for (const dx of [-.5, 0, .5]) for (const dz of [-.5, 0, .5]) if (sample(x + dx, z + dz) > 0) return true;
            return false;
        },
        bind(material, { inverse = false, enabled = { value: 1 } } = {}) {
            const uniforms = { grassBoundaryMap: { value: texture }, grassBoundaryBounds: { value: new THREE.Vector4(bounds.minX, bounds.minZ, 1 / width, 1 / depth) },
                grassBoundaryInverse: { value: inverse ? 1 : 0 }, grassBoundaryEnabled: enabled };
            attachShaderMetadata(material, grassBoundaryShader);
            registerMaterialShaderHook(material, { id: 'grass.boundary', priority: 300, variantKey: grassBoundaryShader.variantKey, uniforms,
                apply(shader) {
                    Object.assign(shader.uniforms, uniforms);
                    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + vertex.pars)
                        .replace('#include <project_vertex>', vertex.apply + '\n#include <project_vertex>');
                    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + fragment.pars)
                        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + fragment.apply);
                } });
            bindings.add(material);
        },
        dispose() { for (const material of bindings) removeMaterialShaderHook(material, 'grass.boundary'); bindings.clear(); texture.dispose(); }
    });
}
