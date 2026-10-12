// Shared prepared leaf color, root occlusion and linear color mipmaps for the lab and gameplay.
// @ts-check
import * as THREE from 'three';
import { grassBakedAppearanceShader } from '../../../shaders/materials/grass/GrassBakedAppearanceShaderLoader.js?v=canopy-palette-17';
import { grassViewCardsShader } from '../../../shaders/materials/grass/GrassViewCardsShaderLoader.js';
import { grassPlateCoverageShader } from '../../../shaders/materials/grass/GrassPlateShaderLoader.js';
import { attachShaderMetadata } from '../../../shaders/core/ShaderLoader.js';
import { registerMaterialShaderHook } from '../../../shaders/core/MaterialShaderHookRegistry.js';

const sections = source => Object.fromEntries([...source.matchAll(/\/\/ @section (\w+)\s*\n([\s\S]*?)(?=\/\/ @section|$)/g)].map(match => [match[1], match[2]]));
const rootShade = height => .225 + .675 * Math.max(0, Math.min(1, height));
const litterColorGain = [1.82, 1.92, 1.68];

// A flat overhead capture exposes more litter than the bus sees through upright leaves.
// Reuse leaf-only captures to fill that coverage before filtering, retaining the authored palette.
function fillCanopyCoverage(maps, leaves, layers) {
    const size = maps[0].image.width;
    const offsets = [[.37, .61], [.71, .23]].slice(0, layers - 1).map(pair => pair.map(value => Math.round(value * size)));
    for (const [variant, map] of maps.entries()) {
        const output = map.image.data;
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            const rgb = [output[i], output[i + 1], output[i + 2]];
            for (const [dx, dy] of offsets) {
                const sx = x + dx, sy = y + dy;
                const source = leaves[(variant + Math.floor(sx / size) + Math.floor(sy / size)) % 2];
                const j = ((sy % size) * size + sx % size) * 4, alpha = source[j + 3];
                // Match the exposed leaf brightness in the baked LOD2 bus views.
                for (let c = 0; c < 3; c++) rgb[c] = rgb[c] * (1 - alpha) + source[j + c] * 1.14;
            }
            for (let c = 0; c < 3; c++) output[i + c] = Math.min(255, Math.round(rgb[c]));
        }
        map.needsUpdate = true;
    }
}

/** Clone and bake the same height-dependent color into every geometric LOD. */
export function createBakedGrassSource(source, { leafContrast = 1, leafVariation = 0 } = {}) {
    if (!Number.isFinite(leafContrast) || leafContrast < 0 || leafContrast > 1) throw new Error('Leaf contrast must be in [0, 1].');
    if (!Number.isFinite(leafVariation) || leafVariation < 0 || leafVariation > .5) throw new Error('Leaf variation must be in [0, .5].');
    const mesh = source.clone(false), geometry = source.geometry.clone();
    geometry.computeBoundingBox();
    const { position, color } = geometry.attributes, height = geometry.boundingBox.max.y;
    const tint = source.material.color;
    for (let i = 0; i < color.count; i++) {
        const shade = rootShade(position.getY(i) / height);
        color.setXYZ(i, color.getX(i) * tint.r * shade, color.getY(i) * tint.g * shade, color.getZ(i) * tint.b * shade);
    }
    // Preserve each leaf's area-weighted palette while reducing bright-tip dominance at grazing angles.
    if (leafContrast < 1 || leafVariation > 0) {
        const index = geometry.index, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
        for (const [leafIndex, range] of source.userData.grassLeafRanges.entries()) {
            const ids = new Set(), sum = [0, 0, 0]; let area = 0;
            for (let i = range.start; i < range.start + range.count; i += 3) {
                const triangle = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
                triangle.forEach(id => ids.add(id));
                a.fromBufferAttribute(position, triangle[0]); b.fromBufferAttribute(position, triangle[1]).sub(a); c.fromBufferAttribute(position, triangle[2]).sub(a);
                const weight = b.cross(c).length(); area += weight;
                for (let channel = 0; channel < 3; channel++) sum[channel] += weight * triangle.reduce((total, id) => total + color.array[id * 3 + channel], 0) / 3;
            }
            // The same indexed leaf gets the same variation in every geometric LOD and card capture.
            let hash = Math.imul(leafIndex + 1, 1597334677); hash = Math.imul(hash ^ hash >>> 16, 2246822519);
            const variation = 1 + ((hash >>> 0) / 4294967296 * 2 - 1) * leafVariation;
            for (const id of ids) for (let channel = 0; channel < 3; channel++) color.array[id * 3 + channel] = THREE.MathUtils.lerp(sum[channel] / area, color.array[id * 3 + channel], leafContrast) * variation;
        }
    }
    color.needsUpdate = true; mesh.geometry = geometry; mesh.userData = { ...source.userData };
    return mesh;
}

/** Resolve the packed source channels once; runtime uses only opaque RGB. */
export function createBakedGrassColorMaps(bake, renderer, { leafLayers = 1, contrast = 1, natural = false, understoryGain = 1 } = {}) {
    if (!Number.isInteger(leafLayers) || leafLayers < 1 || leafLayers > 3) throw new Error('Baked coverage requires 1–3 prepared leaf layers.');
    if (!Number.isFinite(contrast) || contrast < 1 || contrast > 2) throw new Error('Prepared texture contrast must be in [1, 2].');
    if (!Number.isFinite(understoryGain) || understoryGain <= 0 || understoryGain > 1) throw new Error('Understory gain must be in (0, 1].');
    const leaves = [];
    const maps = [0, 1].map(variant => {
        const albedo = bake.readPixels('all', 'albedo', variant), normal = bake.readPixels('all', 'normal', variant);
        const soil = bake.readPixels('all', 'roughness', variant), pixels = new Uint8Array(albedo.length);
        const visibility = bake.readPixels('all', 'visibility', variant);
        const leaf = leafLayers > 1 ? new Float32Array(albedo.length) : null;
        if (leaf) leaves.push(leaf);
        const size = Math.sqrt(pixels.length / 4), visibilitySize = Math.sqrt(visibility.length), scale = visibilitySize / size;
        if (!Number.isInteger(scale) || scale < 1) throw new Error('Baked grass visibility must match or be an integer multiple of the color resolution.');
        for (let i = 0; i < pixels.length; i += 4) {
            const coverage = Math.max(1, normal[i + 3]), height = Math.min(1, albedo[i + 3] / coverage);
            const up = Math.min(1, Math.abs(normal[i + 2] / coverage * 2 - 1));
            const shade = natural ? (.045 + .955 * Math.pow(height, .8)) * (.65 + .35 * height) * (.5 + .65 * up) : rootShade(height);
            const start = Math.floor(i / 4 / size) * scale * visibilitySize + (i / 4 % size) * scale;
            let visible = 0;
            for (let y = 0; y < scale; y++) for (let x = 0; x < scale; x++) visible += visibility[start + y * visibilitySize + x];
            visible /= 255 * scale * scale;
            for (let c = 0; c < 3; c++) {
                const ground = soil[i + [0, 2, 3][c]];
                if (leaf) leaf[i + c] = Math.max(0, albedo[i + c] - ground) * shade;
                pixels[i + c] = Math.min(255, Math.round(Math.max(0, albedo[i + c] - ground) * shade * 1.2
                    + ground * litterColorGain[c] * (natural ? .22 + .43 * visible : .4 + .6 * visible)));
            }
            pixels[i + 3] = 255;
            if (leaf) leaf[i + 3] = normal[i + 3] / 255;
        }
        const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
        texture.name = 'BakedGrassColor-' + variant; texture.colorSpace = THREE.NoColorSpace;
        texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); texture.needsUpdate = true;
        return texture;
    });
    if (leafLayers > 1) fillCanopyCoverage(maps, leaves, leafLayers);
    if (contrast > 1) for (const map of maps) {
        const pixels = map.image.data, mean = [0, 0, 0];
        for (let i = 0; i < pixels.length; i += 4) for (let c = 0; c < 3; c++) mean[c] += pixels[i + c] / (pixels.length / 4);
        const meanLuma = mean[0] * .2126 + mean[1] * .7152 + mean[2] * .0722;
        for (let i = 0; i < pixels.length; i += 4) {
            const luma = pixels[i] * .2126 + pixels[i + 1] * .7152 + pixels[i + 2] * .0722;
            const gain = luma > 0 ? Math.max(0, meanLuma + (luma - meanLuma) * contrast) / luma : 0;
            for (let c = 0; c < 3; c++) pixels[i + c] = Math.round(THREE.MathUtils.clamp(natural ? pixels[i + c] * gain : mean[c] + (pixels[i + c] - mean[c]) * contrast, 0, 255));
        }
    }
    if (understoryGain < 1) for (const map of maps) {
        const pixels = map.image.data;
        for (let i = 0; i < pixels.length; i += 4) for (let c = 0; c < 3; c++) pixels[i + c] = Math.round(pixels[i + c] * understoryGain);
    }
    return maps;
}

/** Alpha-weight RGB while averaging coverage, avoiding dark empty texels and threshold inflation. */
export function setBakedGrassCardMipmaps(texture) {
    let { data, width, height } = texture.image;
    const mipmaps = [{ data, width, height }];
    while (width > 1 || height > 1) {
        const w = Math.max(1, width >> 1), h = Math.max(1, height >> 1), next = new Uint8Array(w * h * 4);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            let alpha = 0; const rgb = [0, 0, 0], fallback = [0, 0, 0];
            for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
                const i = (Math.min(height - 1, y * 2 + dy) * width + Math.min(width - 1, x * 2 + dx)) * 4;
                alpha += data[i + 3];
                for (let c = 0; c < 3; c++) { rgb[c] += data[i + c] * data[i + 3]; fallback[c] += data[i + c]; }
            }
            const o = (y * w + x) * 4;
            for (let c = 0; c < 3; c++) next[o + c] = Math.round(alpha ? rgb[c] / alpha : fallback[c] / 4);
            next[o + 3] = Math.round(alpha / 4);
        }
        data = next; width = w; height = h; mipmaps.push({ data, width, height });
    }
    texture.mipmaps = mipmaps; texture.generateMipmaps = false; texture.needsUpdate = true;
}

/** @param {{maps?:THREE.Texture[],vertexColors?:boolean,shadowUniforms:object,settings:object,card?:object}} options */
export function createBakedGrassMaterial({ maps = [], vertexColors = false, shadowUniforms, settings, card = null }) {
    const material = new THREE.MeshBasicMaterial({ color: settings.radiance, map: maps[0] ?? null, vertexColors, side: card ? THREE.FrontSide : THREE.DoubleSide,
        alphaTest: card ? .5 : 0, alphaToCoverage: !!card, fog: true });
    material.name = 'Grass-BakedAppearance'; material.defines = {};
    const vertex = sections(grassBakedAppearanceShader.vertexSource), fragment = sections(grassBakedAppearanceShader.fragmentSource);
    const uniforms = { bakedGrassVisibility: shadowUniforms.grassCanopyShadowVisibility,
        bakedGrassShadowBounds: shadowUniforms.grassCanopyShadowBounds,
        bakedGrassShadowStrength: settings.shadows, bakedGrassBrightness: settings.brightness };
    if (maps.length === 2) { material.defines.BAKED_GRASS_PAIR = 1; uniforms.bakedGrassAlternate = { value: maps[1] }; }
    attachShaderMetadata(material, grassBakedAppearanceShader);
    registerMaterialShaderHook(material, { id: 'grass.baked-appearance', priority: 20,
        variantKey: grassBakedAppearanceShader.variantKey, uniforms,
        apply(shader) {
            Object.assign(shader.uniforms, uniforms);
            shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + vertex.pars)
                .replace('#include <project_vertex>', vertex.project + '\n#include <project_vertex>');
            shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + fragment.pars)
                .replace('#include <map_fragment>', fragment.map)
                .replace('#include <opaque_fragment>', fragment.shade + '\n#include <opaque_fragment>');
        }
    });
    if (card) {
        material.defines.GRASS_RIBBON_CARD = 1; material.defines.USE_UV = 1;
        if (card.profile === 'bridge') material.defines.GRASS_CARD_RANDOM_LAYOUT = 1;
        const cardVertex = sections(grassViewCardsShader.vertexSource);
        const pitch = THREE.MathUtils.degToRad(card.pitchDegrees), cosine = Math.cos(pitch);
        const cardUniforms = { grassViewCardShape: { value: new THREE.Vector4(card.cardWidthMeters, card.frameHeightMeters, Math.sin(pitch), cosine) },
            grassViewCardSpan: { value: new THREE.Vector2(card.groundSpanMeters, card.sourceHeightMeters + .02 / cosine) } };
        [grassViewCardsShader, grassPlateCoverageShader].forEach(payload => attachShaderMetadata(material, payload));
        registerMaterialShaderHook(material, { id: 'grass.baked-cards', priority: 30,
            variantKey: grassViewCardsShader.variantKey + grassPlateCoverageShader.variantKey, uniforms: cardUniforms,
            apply(shader) {
                Object.assign(shader.uniforms, cardUniforms);
                shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + cardVertex.pars)
                    .replace('#include <begin_vertex>', cardVertex.begin);
                shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', sections(grassViewCardsShader.fragmentSource).map)
                    .replace('#include <alphatest_fragment>', grassPlateCoverageShader.fragmentSource);
            }
        });
    }
    return material;
}
