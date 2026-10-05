// Draws the near pass of the runtime surface cache: the uncached terrain program over the tiles near the camera, blended over the cached frame.
// @ts-check
// AI577 D6 (landscape-surface-cache-near-v1, contract in LandscapeSurfaceCacheNearField.js). Each selected rendered tile gets two proxy meshes that share
// its geometry and its uniform cells (morph, edges, appearance, lighting, planning): one draws the surface rows within the tile's reach, the other its
// skirts (draw ranges set around their own draws), with the near program at render order 1 into the view's own scene, so the opaque pass draws them
// after the cached tiles: depth-tested less-or-equal against the depth the cached frame wrote (with a small polygon offset toward the camera), so
// hidden fragments never shade, and blended by their weight over the cached color while the destination alpha stays (the canvas composites its
// alpha); where it owns a fragment completely its weight 1 replaces the cached color. The near program is the uncached frame program plus an early
// footprint test; it links through KHR_parallel_shader_compile while the cached frame alone draws, the pass starts only once it is ready, and linked
// programs stay by key. A proxy leaves with its tile (the tile geometry's dispose event removes it at once). A tile's steepest slope (the smallest
// vertical normal component of its vertices) bounds its reach and is computed once per tile.
import * as THREE from 'three';
import { createLandscapeShaderPayload } from '../../shaders/materials/landscape/LandscapeShaderLoader.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { LANDSCAPE_SURFACE_CACHE_NEAR, landscapeSurfaceCacheNearBand, landscapeSurfaceCacheNearRanges, landscapeSurfaceCacheNearReach, selectLandscapeSurfaceCacheNearTiles } from './LandscapeSurfaceCacheNearField.js';

const COMPILE_WAIT_MS = 60000, PROGRAM_CACHE = 3;

export class LandscapeSurfaceCacheNearPass {
    /** @param {{renderer:any,scene:any,band?:{start:number,end:number},mode?:'on'|'off'}} options scene is the view scene the frame renders */
    constructor({ renderer, scene, band = landscapeSurfaceCacheNearBand(), mode = 'on' }) {
        if (!LANDSCAPE_SURFACE_CACHE_NEAR.modes.includes(mode)) throw new Error(`[LandscapeSurfaceCache] near mode must be one of ${LANDSCAPE_SURFACE_CACHE_NEAR.modes.join(', ')}; received ${mode}`);
        Object.assign(this, { renderer, scene, band, mode });
        this.inspect = false;
        /** @type {Map<any, {surface:any,skirt:any,material:any,geometry:any,release:()=>void,ranges:any}>} proxies by tile model */
        this.proxies = new Map();
        /** @type {WeakMap<any, number>} cosine of each tile geometry's steepest slope */
        this.slopes = new WeakMap();
        this.program = { key: null, payload: null, material: null, ready: false, started: 0, milliseconds: null, timedOut: false, compiles: 0 };
        // linked near programs by key: a program variant switched back reuses its linked program (the probe material keeps it alive)
        this.programs = new Map();
        this.compiles = 0;
        this.active = false;
        this.reach = 0;
        this.selected = 0;
        this.disposed = false;
    }

    /**
     * @param {'on'|'off'} mode @param {{startTexels?:number,endTexels?:number,inspect?:boolean}} [band] the hand-over band in mip-0 texels (defaults: the
     *   contract); inspect marks the near pass's fragments magenta (blended by their weight) instead of shading them
     */
    configure(mode, band = {}) {
        if (!LANDSCAPE_SURFACE_CACHE_NEAR.modes.includes(mode)) throw new Error(`[LandscapeSurfaceCache] near mode must be one of ${LANDSCAPE_SURFACE_CACHE_NEAR.modes.join(', ')}; received ${mode}`);
        this.band = landscapeSurfaceCacheNearBand(band);
        this.inspect = band.inspect === true;
        this.mode = mode;
    }

    #payload(stream) {
        return createLandscapeShaderPayload('terrain', { coverageSlots: stream.coverageSlots, materialSampling: stream.materialSampling, lightingTier: stream.lightingTier,
            terrainAppearance: stream.programVariant.terrainAppearance, surfaceCacheNear: true });
    }

    #material(payload, uniforms) {
        const [factor, units] = LANDSCAPE_SURFACE_CACHE_NEAR.nearOffset;
        const material = new THREE.ShaderMaterial({ vertexShader: payload.vertexSource, fragmentShader: payload.fragmentSource, vertexColors: true, uniforms,
            blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
            depthWrite: true, depthFunc: THREE.LessEqualDepth, polygonOffset: true, polygonOffsetFactor: factor, polygonOffsetUnits: units });
        attachShaderMetadata(material, payload);
        return material;
    }

    // the near program of the tiles' compile-time switches, linked once per key on an unrendered probe of the overview tile and kept by key
    #ensureProgram(stream, root, camera) {
        const key = `${stream.coverageSlots}|${stream.materialSampling}|${stream.lightingTier}|${stream.programVariant.terrainAppearance}`;
        if (this.program.key !== key) {
            this.#clearProxies();
            let entry = this.programs.get(key);
            if (!entry) {
                const payload = this.#payload(stream), material = this.#material(payload, root.mesh.material.uniforms), probe = new THREE.Mesh(root.mesh.geometry, material);
                probe.frustumCulled = false;
                this.renderer.compile(probe, camera, this.scene);
                this.renderer.getContext().flush();
                entry = { key, payload, material, ready: false, started: performance.now(), milliseconds: null, timedOut: false, compiles: ++this.compiles };
                this.programs.set(key, entry);
                for (const [old, cached] of this.programs) if (this.programs.size > PROGRAM_CACHE && old !== key) { cached.material.dispose(); this.programs.delete(old); }
            }
            this.program = entry;
        }
        if (!this.program.ready) {
            const program = this.renderer.properties.get(this.program.material).currentProgram, elapsed = performance.now() - this.program.started;
            if (program?.isReady() || elapsed > COMPILE_WAIT_MS) Object.assign(this.program, { ready: true, milliseconds: elapsed, timedOut: !program?.isReady() });
        }
        return this.program.ready;
    }

    // the smallest vertical component of the tile's vertex normals (signed 16-bit, normalized): the cosine of its steepest slope
    #slopeCosine(model) {
        const geometry = model.mesh.geometry;
        let cosine = this.slopes.get(geometry);
        if (cosine === undefined) {
            const normal = geometry.attributes.normal, array = normal.array, scale = normal.normalized ? 32767 : 1;
            cosine = 1;
            for (let i = 1; i < array.length; i += 3) cosine = Math.min(cosine, array[i] / scale);
            this.slopes.set(geometry, cosine);
        }
        return cosine;
    }

    #proxy(model) {
        let proxy = this.proxies.get(model);
        if (proxy) return proxy;
        const material = this.#material(this.program.payload, model.mesh.material.uniforms), geometry = model.mesh.geometry;
        const entry = { surface: null, skirt: null, material, geometry, release: () => this.#remove(model), ranges: null };
        const mesh = part => {
            const object = new THREE.Mesh(geometry, material);
            object.name = model.mesh.name + ':surface-cache-near-' + part;
            object.renderOrder = LANDSCAPE_SURFACE_CACHE_NEAR.renderOrder;
            object.matrixAutoUpdate = false;
            object.matrix.copy(model.mesh.matrixWorld);
            object.matrixWorld.copy(model.mesh.matrixWorld);
            object.visible = false;
            // the shared geometry draws this proxy's range only during its own draw
            let saved = null;
            object.onBeforeRender = () => {
                const range = entry.ranges?.[part];
                saved = { start: geometry.drawRange.start, count: geometry.drawRange.count };
                geometry.setDrawRange(range?.start ?? 0, range?.count ?? 0);
            };
            object.onAfterRender = () => { if (saved) geometry.setDrawRange(saved.start, saved.count); saved = null; };
            this.scene.add(object);
            return object;
        };
        geometry.addEventListener('dispose', entry.release);
        entry.surface = mesh('rows');
        entry.skirt = mesh('skirt');
        this.proxies.set(model, entry);
        return entry;
    }

    #remove(model) {
        const proxy = this.proxies.get(model);
        if (!proxy) return;
        proxy.geometry.removeEventListener('dispose', proxy.release);
        proxy.surface.removeFromParent();
        proxy.skirt.removeFromParent();
        proxy.material.dispose();
        this.proxies.delete(model);
    }

    #clearProxies() { for (const model of [...this.proxies.keys()]) this.#remove(model); }

    /** Stops drawing the pass: no proxy draws and the band is disabled. @param {any} [uniforms] the appearance uniform cells */
    disable(uniforms) {
        for (const proxy of this.proxies.values()) proxy.surface.visible = proxy.skirt.visible = false;
        if (uniforms?.uSurfaceCacheNear) uniforms.uSurfaceCacheNear.value.setX(0).setY(0);
        this.active = false;
        this.selected = 0;
    }

    /**
     * Starts linking the near program before the pass can draw (called while it is not linked yet), so it links beside the cache's generation
     * program instead of after the root page. @param {{stream:any,root:any,camera:any}} options root is the stream's overview tile model
     */
    prewarm({ stream, root, camera }) {
        if (this.disposed || this.mode !== 'on' || !root) return false;
        return this.#ensureProgram(stream, root, camera);
    }

    /**
     * One frame, after the cache published its pages and uniforms: selects the rendered tiles within reach of the camera and draws their proxies with
     * the near program; enabled is false while the cached frame program does not draw (cache not ready, another program variant, inspection modes).
     * @param {{stream:any,tiles:{root:any,leaves:Array<{model:any,descriptor:any}>},camera:any,snapshot:any,anisotropy:number,uniforms:any,enabled:boolean}} frame
     */
    update({ stream, tiles, camera, snapshot, anisotropy, uniforms, enabled }) {
        if (this.disposed) return;
        const leaves = new Set(tiles.leaves.map(tile => tile.model));
        for (const model of [...this.proxies.keys()]) if (!leaves.has(model)) this.#remove(model);
        if (!enabled || this.mode !== 'on' || !tiles.root || !this.#ensureProgram(stream, tiles.root, camera)) { this.disable(uniforms); return; }
        const byId = new Map(tiles.leaves.map(tile => [tile.descriptor.id, tile])), aspect = camera.aspect ?? 1;
        const chosen = selectLandscapeSurfaceCacheNearTiles({ position: snapshot.position,
            reachOf: tile => landscapeSurfaceCacheNearReach({ camera: snapshot, aspect, anisotropy, end: this.band.end, slopeCosine: this.#slopeCosine(byId.get(tile.id).model) }),
            tiles: tiles.leaves.map(({ descriptor }) => ({ id: descriptor.id, bounds: descriptor.bounds, minHeight: descriptor.minHeight, maxHeight: descriptor.maxHeight })) });
        const selected = new Map(chosen.map(({ id, reach }) => [byId.get(id).model, { reach, descriptor: byId.get(id).descriptor }]));
        this.reach = chosen.reduce((max, tile) => Math.max(max, tile.reach), 0);
        let rows = 0;
        for (const model of leaves) {
            const near = selected.get(model);
            if (near) {
                const proxy = this.#proxy(model), d = near.descriptor;
                proxy.ranges = landscapeSurfaceCacheNearRanges({ bounds: d.bounds, rows: d.rows, columns: d.columns, z: snapshot.position.z, reach: near.reach });
                proxy.surface.visible = model.mesh.visible && !!proxy.ranges.rows;
                proxy.skirt.visible = model.mesh.visible;
                rows += proxy.ranges.rows ? proxy.ranges.rows.count / (6 * (d.columns - 1)) : 0;
            } else if (this.proxies.has(model)) { const proxy = this.proxies.get(model); proxy.surface.visible = proxy.skirt.visible = false; }
        }
        uniforms.uSurfaceCacheNear.value.set(this.band.start, this.band.end, anisotropy, this.inspect ? 1 : 0);
        this.active = true;
        this.selected = selected.size;
        this.rows = rows;
    }

    snapshot() {
        return { recipe: LANDSCAPE_SURFACE_CACHE_NEAR.id, mode: this.mode, active: this.active, band: { ...this.band }, reach: Number.isFinite(this.reach) ? this.reach : 'all', tiles: this.selected, rows: this.rows ?? 0,
            proxies: this.proxies.size, program: { ready: this.program.ready, milliseconds: this.program.milliseconds, timedOut: this.program.timedOut, compiles: this.compiles, cached: this.programs.size } };
    }

    dispose(uniforms) {
        if (this.disposed) return;
        this.disable(uniforms);
        this.#clearProxies();
        for (const entry of this.programs.values()) entry.material.dispose();
        this.programs.clear();
        this.program = { key: null, payload: null, material: null, ready: false, started: 0, milliseconds: null, timedOut: false, compiles: this.compiles };
        this.disposed = true;
    }
}
