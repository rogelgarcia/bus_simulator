// Preserve leaf silhouettes and lighting at bus distances with compact, culled geometry.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2Material } from './GrassDebugV2Material.js';
import { grassFieldDetailShader } from '../../shaders/materials/grass/GrassFieldDetailShaderLoader.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';

export const GRASS_FIELD_DETAIL = Object.freeze({ retainedFraction: .85, widthScale: 1.04, chunkMeters: 3 });

/** @param {{source: THREE.Mesh, width: number, depth: number}} options */
export function createGrassDebugV2FieldDetail({ source, width, depth }) {
    const input = source.geometry, index = input.index;
    if (!(width > 0 && depth > 0) || !index || index.count % 6 || !input.attributes.normal
        || !input.attributes.color || !input.attributes.uv || Array.isArray(source.material)) {
        throw new Error('Field detail requires indexed two-triangle leaves with normals, colors and UVs.');
    }
    input.computeBoundingBox();
    const { position, normal, color, uv } = input.attributes;
    const point = id => new THREE.Vector3().fromBufferAttribute(position, id);
    const config = GRASS_FIELD_DETAIL, ranked = [];
    for (let start = 0; start < index.count; start += 6) {
        let area = 0;
        for (let k = 0; k < 6; k += 3) {
            const a = point(index.getX(start + k));
            area += point(index.getX(start + k + 1)).sub(a).cross(point(index.getX(start + k + 2)).sub(a)).length();
        }
        ranked.push({ start, area });
    }
    ranked.sort((a, b) => b.area - a.area || a.start - b.start);
    const selected = ranked.slice(0, Math.round(ranked.length * config.retainedFraction)).sort((a, b) => a.start - b.start);
    const columns = Math.ceil(width / config.chunkMeters), rows = Math.ceil(depth / config.chunkMeters);
    const chunks = new Map(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3();
    const root = new THREE.Vector3(), tip = new THREE.Vector3(), axis = new THREE.Vector3(), p = new THREE.Vector3(), center = new THREE.Vector3();
    const decode = new THREE.Vector3(2 ** Math.ceil(Math.log2(config.chunkMeters / 2 + .5)),
        2 ** Math.ceil(Math.log2(Math.max(Math.abs(input.boundingBox.min.y), input.boundingBox.max.y))),
        2 ** Math.ceil(Math.log2(config.chunkMeters / 2 + .5)));
    for (const { start } of selected) {
        const ids = Array.from({ length: 6 }, (_, k) => index.getX(start + k));
        a.fromBufferAttribute(position, ids[0]); b.fromBufferAttribute(position, ids[2]);
        c.fromBufferAttribute(position, ids[1]); d.fromBufferAttribute(position, ids[5]);
        root.copy(a).add(b).multiplyScalar(.5); tip.copy(c).add(d).multiplyScalar(.5); axis.copy(b).sub(a).normalize();
        const col = THREE.MathUtils.clamp(Math.floor((root.x + width / 2) / config.chunkMeters), 0, columns - 1);
        const row = THREE.MathUtils.clamp(Math.floor((root.z + depth / 2) / config.chunkMeters), 0, rows - 1), key = row * columns + col;
        if (!chunks.has(key)) chunks.set(key, { center: new THREE.Vector3(-width / 2 + (col + .5) * config.chunkMeters, 0,
            -depth / 2 + (row + .5) * config.chunkMeters), positions: [], normals: [], colors: [], uvs: [], ids: [], bounds: new THREE.Box3() });
        const chunk = chunks.get(key); chunk.ids.push(start / 6);
        for (const id of ids) {
            p.fromBufferAttribute(position, id);
            center.copy(root).lerp(tip, (uv.getY(id) - .18) / (.82 * .9));
            p.addScaledVector(axis, p.clone().sub(center).dot(axis) * (config.widthScale - 1)).sub(chunk.center);
            chunk.bounds.expandByPoint(p);
            const components = [p.x / decode.x, p.y / decode.y, p.z / decode.z];
            if (components.some(v => Math.abs(v) > 1)) throw new Error('Leaf exceeds compact field chunk bounds.');
            chunk.positions.push(...components.map((v, k) => k === 1 ? Math.floor(v * 32767) : Math.round(v * 32767)));
            for (let k = 0; k < 3; k++) {
                const value = color.array[id * 3 + k];
                if (value < 0 || value > 1) throw new Error('Leaf color exceeds normalized compact color range.');
                chunk.normals.push(Math.round(normal.array[id * 3 + k] * 127));
                chunk.colors.push(Math.round(value * 255));
            }
            chunk.uvs.push(Math.round(uv.getX(id) * 65535), Math.round(uv.getY(id) * 65535));
        }
    }
    const material = createGrassDebugV2Material({ vertexColors: true, color: source.material.color,
        roughness: source.material.roughness, defines: { GRASS_LEAF_TRANSLUCENCY: 1, USE_UV: 1 } });
    material.name = 'GrassField-LOD3-Detail'; material.envMapIntensity = source.material.envMapIntensity;
    attachShaderMetadata(material, grassFieldDetailShader);
    registerMaterialShaderHook(material, { id: 'grass.field-detail.decode', variantKey: grassFieldDetailShader.variantKey,
        uniforms: { grassDetailDecode: { value: decode } },
        apply: shader => {
            if (!shader.vertexShader.includes('#include <begin_vertex>')) throw new Error('Field detail vertex contract changed.');
            shader.vertexShader = grassFieldDetailShader.fragmentSource + shader.vertexShader.replace('#include <begin_vertex>', grassFieldDetailShader.vertexSource);
        }
    });
    const group = new THREE.Group(); group.name = 'GrassField-LOD3-Detail';
    let geometryBytes = 0, maximumHeight = -Infinity;
    for (const [key, chunk] of chunks) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Int16BufferAttribute(chunk.positions, 3, true));
        geometry.setAttribute('normal', new THREE.Int8BufferAttribute(chunk.normals, 3, true));
        geometry.setAttribute('color', new THREE.Uint8BufferAttribute(chunk.colors, 3, true));
        geometry.setAttribute('uv', new THREE.Uint16BufferAttribute(chunk.uvs, 2, true));
        for (let i = 1; i < chunk.positions.length; i += 3) maximumHeight = Math.max(maximumHeight, chunk.positions[i] * decode.y / 32767);
        // Culling bounds use decoded metres, including the quantization tolerance.
        geometry.boundingBox = chunk.bounds.expandByScalar(Math.max(decode.x, decode.y, decode.z) / 32767);
        geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
        geometry.userData.grassLeafCount = chunk.ids.length;
        geometryBytes += Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, 0);
        const mesh = new THREE.Mesh(geometry, material); mesh.name = group.name + '-' + key;
        mesh.position.copy(chunk.center); mesh.receiveShadow = true; mesh.castShadow = false;
        mesh.userData.grassFieldDetail = true;
        group.add(mesh);
    }
    return Object.freeze({ group, material, decode, sourceLeafIds: Object.freeze(selected.map(leaf => leaf.start / 6)),
        getSnapshot: () => ({ strategy: 'compact-leaf-detail', definition: config, sourceLeaves: ranked.length, leaves: selected.length,
            triangles: selected.length * 2, trianglesPerLeaf: 2, chunks: group.children.length, geometryBytes, extraTextureBytes: 0,
            runtimeCaptures: false, shadowSource: 'LOD2', sourceHeight: input.boundingBox.max.y,
            maximumHeight, decode: decode.toArray() }),
        dispose() { group.children.forEach(mesh => mesh.geometry.dispose()); material.dispose(); }
    });
}
