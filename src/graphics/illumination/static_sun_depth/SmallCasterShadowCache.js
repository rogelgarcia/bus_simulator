// Preserves opaque prop silhouettes hidden by distant casters in a single-depth bake.
// The independent, immutable layers are built in a worker and uploaded incrementally.
import * as THREE from 'three';

const SIZE = 256, CELL = 8, MAX_BYTES = 32 * 1024 * 1024, DATA_WIDTH = 256;
export const SMALL_CASTER_MEMORY_RESERVATION = Object.freeze({ cpuBytes: MAX_BYTES, gpuBytes: MAX_BYTES });

export function smallCasterUniforms() {
    return {
        smallSunEnabled: { value: 0 }, smallSunLayers: { value: null },
        smallSunData: { value: null },
        smallSunGridBounds: { value: new THREE.Vector4() }
    };
}

function collect(root, matrix) {
    const positions = [], bounds = new THREE.Box3(), point = new THREE.Vector3();
    root.updateWorldMatrix(true, true);
    root.traverse(source => {
        if (!source.isMesh) return;
        if (source.isInstancedMesh || source.isSkinnedMesh || source.isBatchedMesh || source.customDepthMaterial) throw new Error('Unsupported small-caster geometry');
        const materials = Array.isArray(source.material) ? source.material : [source.material];
        const geometry = source.geometry, attribute = geometry.attributes.position, indices = geometry.index;
        const transform = new THREE.Matrix4().multiplyMatrices(matrix, source.matrixWorld);
        const groups = Array.isArray(source.material) ? geometry.groups : [{ start: 0, count: indices?.count ?? attribute.count, materialIndex: 0 }];
        for (const group of groups) {
            const material = materials[group.materialIndex];
            if (!material || material.visible === false) continue;
            if (material.alphaTest > 0 || material.alphaHash || material.displacementMap || material.clippingPlanes?.length || material.transmission > 0 || material.transparent && material.opacity < 1) throw new Error('Small-caster cache requires opaque, undisplaced traffic props');
            const start = Math.max(group.start, geometry.drawRange.start);
            const end = Math.min(group.start + group.count, geometry.drawRange.start + geometry.drawRange.count);
            for (let i = start; i < end; i++) {
                point.fromBufferAttribute(attribute, indices ? indices.getX(i) : i).applyMatrix4(transform);
                positions.push(point.x, point.y, point.z); bounds.expandByPoint(point);
            }
        }
    });
    if (positions.length === 0) return null;
    const extent = bounds.getSize(new THREE.Vector3());
    bounds.min.x -= Math.max(.002, extent.x / (SIZE - 4) * 2); bounds.max.x += Math.max(.002, extent.x / (SIZE - 4) * 2);
    bounds.min.y -= Math.max(.002, extent.y / (SIZE - 4) * 2); bounds.max.y += Math.max(.002, extent.y / (SIZE - 4) * 2);
    bounds.min.z -= .002; bounds.max.z += .002;
    return { positions: new Float32Array(positions), bounds: [...bounds.min.toArray(), ...bounds.max.toArray()], size: SIZE };
}

function floatTexture(values, width, height) {
    const data = new Float32Array(width * height * 4); data.set(values);
    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
    texture.minFilter = texture.magFilter = THREE.NearestFilter; texture.generateMipmaps = false; texture.needsUpdate = true;
    return texture;
}

export class SmallCasterShadowCache {
    constructor(binding, renderer) {
        this.binding = binding; this.renderer = renderer; this.textures = []; this.disposed = false;
        this.metrics = { objects: 0, triangles: 0, gpuBytes: 0, cpuBytes: 0, state: 'off' };
    }
    async prepare(roots, { signal } = {}) {
        signal?.throwIfAborted();
        if (this.disposed || this.metrics.state !== 'off') throw new Error('Small-caster cache preparation requires a fresh owner');
        if (!roots.length || this.binding.uniforms.staticSunDepthFilterPolicy.value.w <= 0) return;
        const u = this.binding.uniforms, layers = [];
        this.metrics.state = 'preparing';
        for (const root of roots) {
            const layer = collect(root, u.staticSunDepthWorldToLight.value);
            if (layer) layers.push(layer);
        }
        if (!layers.length) { this.metrics.state = 'empty'; return; }
        const gl = this.renderer.getContext(), bytes = layers.length * SIZE * SIZE * 2;
        if (layers.length > gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS) || bytes > MAX_BYTES) throw new Error('Small-caster cache exceeds bounded layer budget');
        const tangent = u.staticSunDepthFilterPolicy.value.w, bounds = new THREE.Box2();
        const expanded = layers.map(layer => {
            const [x, y, z, endX, endY] = layer.bounds;
            const margin = Math.max(0, u.staticSunDepthDepthRange.value.y - z) * tangent;
            const box = new THREE.Box2(new THREE.Vector2(x - margin, y - margin), new THREE.Vector2(endX + margin, endY + margin));
            bounds.union(box); return box;
        });
        const width = Math.max(1, Math.ceil((bounds.max.x - bounds.min.x) / CELL));
        const height = Math.max(1, Math.ceil((bounds.max.y - bounds.min.y) / CELL));
        if (width * height > 65536) throw new Error('Small-caster index exceeds bounded grid budget');
        const cells = Array.from({ length: width * height }, () => []), data = new Array(width * height * 4).fill(0);
        layers.forEach((layer, index) => {
            const [x, y, z, endX, endY, endZ] = layer.bounds;
            data.push(x, y, endX, endY, z, endZ, SIZE, 0);
            const box = expanded[index];
            for (let cy = Math.max(0, Math.floor((box.min.y - bounds.min.y) / CELL)); cy <= Math.min(height - 1, Math.floor((box.max.y - bounds.min.y) / CELL)); cy++) {
                for (let cx = Math.max(0, Math.floor((box.min.x - bounds.min.x) / CELL)); cx <= Math.min(width - 1, Math.floor((box.max.x - bounds.min.x) / CELL)); cx++) cells[cy * width + cx].push(index);
            }
        });
        cells.forEach((ids, index) => {
            data[index * 4] = data.length / 4; data[index * 4 + 1] = ids.length;
            for (const id of ids) data.push(id, 0, 0, 0);
        });
        const dataHeight = Math.ceil(data.length / 4 / DATA_WIDTH);
        const residentBytes = bytes + DATA_WIDTH * dataHeight * 16;
        const inputBytes = layers.reduce((sum, layer) => sum + layer.positions.byteLength, 0);
        if (residentBytes + inputBytes + SIZE * SIZE * 6 > MAX_BYTES) throw new Error('Small-caster layers, index and worker input exceed reserved memory');
        const pool = new THREE.DataArrayTexture(new Uint8Array(bytes).fill(255), SIZE, SIZE, layers.length);
        pool.format = THREE.RGFormat; pool.type = THREE.UnsignedByteType;
        pool.minFilter = pool.magFilter = THREE.NearestFilter; pool.generateMipmaps = false; pool.needsUpdate = true;
        this.textures = [pool, floatTexture(data, DATA_WIDTH, dataHeight)];
        this.worker = new Worker(new URL('./SmallCasterDepthWorker.js', import.meta.url), { type: 'module' });
        const cancel = () => this.dispose();
        signal?.addEventListener('abort', cancel, { once: true });
        try {
            this.renderer.initTexture(pool);
            for (let i = 0; i < layers.length; i++) {
                if (this.disposed) throw new Error('Small-caster cache disposed during preparation');
                this.metrics.triangles += layers[i].positions.length / 9;
                const raw = await new Promise((resolve, reject) => {
                    this.rejectPending = reject;
                    this.worker.onmessage = ({ data }) => data.error ? reject(new Error(data.error)) : resolve(data.raw);
                    this.worker.onerror = error => reject(new Error(error.message));
                    this.worker.postMessage(layers[i], [layers[i].positions.buffer]);
                });
                this.rejectPending = null;
                pool.image.data.set(raw, i * SIZE * SIZE * 2);
                pool.addLayerUpdate(i); pool.needsUpdate = true; this.renderer.initTexture(pool);
                await new Promise(resolve => requestAnimationFrame(resolve));
            }
            if (this.disposed) throw new Error('Small-caster preparation cancelled');
            for (const texture of this.textures.slice(1)) this.renderer.initTexture(texture);
            u.smallSunLayers.value = pool; u.smallSunData.value = this.textures[1];
            u.smallSunGridBounds.value.set(bounds.min.x, bounds.min.y, width, height); u.smallSunEnabled.value = 1;
            this.metrics = { ...this.metrics, state: 'ready', objects: layers.length,
                gpuBytes: this.textures.reduce((sum, texture) => sum + texture.image.data.byteLength, 0) };
            this.metrics.cpuBytes = this.metrics.gpuBytes;
        } finally { signal?.removeEventListener('abort', cancel); this.worker?.terminate(); this.worker = null; this.rejectPending = null; }
    }
    dispose() {
        this.disposed = true; this.rejectPending?.(new Error('Small-caster preparation cancelled'));
        this.worker?.terminate(); this.worker = null;
        this.binding.uniforms.smallSunEnabled.value = 0;
        for (const key of ['smallSunLayers', 'smallSunData']) this.binding.uniforms[key].value = null;
        for (const texture of this.textures) texture.dispose(); this.textures = [];
        this.metrics.state = 'disposed'; this.metrics.cpuBytes = this.metrics.gpuBytes = 0;
    }
}
