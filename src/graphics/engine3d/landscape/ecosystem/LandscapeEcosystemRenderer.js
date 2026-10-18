// Draws the ecosystem instances of a loaded landscape (AI 599 D4): one instanced draw per resident tile and LOD band over the rank-sorted records, with dithered cross-fades, impostors, picking and diagnostics.
// @ts-check
// Design: a tile's records are one InstancedInterleavedBuffer bound as is (ecosystem-instance-v1, twelve floats per instance); every LOD band of
// the tile's layer draws it through an InstancedBufferGeometry that shares the asset's merged variant geometry, with instanceCount the admitted
// rank prefix (setDrawFraction). three.js frustum-culls each draw by a bounding sphere of the cell box over the tile's height range grown by the
// asset's reach; the renderer hides a (tile, band) draw whose distance range cannot meet the band (with hysteresis), and the vertex program fades
// each instance by its own camera distance. Materials are a set per lighting tier and diagnostics state, compiled in parallel before they draw
// (a rebuild keeps the previous set until the new one is linked). Picking is a CPU test of the drawn instances' bounding spheres. Nothing here
// reserves residency: the owner reserves tiles and the asset sets reserve their bytes in the ecosystem share.
import * as THREE from 'three';
import { ECOSYSTEM_RECORD, ecosystemInstanceId, ecosystemRecordNormal, readEcosystemRecord } from '../../../../app/landscape/index.js';
import { LANDSCAPE_ECOSYSTEM, ecosystemBandVisible, ecosystemBoxDistanceRange, ecosystemLodBands, ecosystemTileSphere, landscapeEcosystemDiagnostic } from './LandscapeEcosystemModel.js';
import { createEcosystemMaterialSet, ecosystemMaterialKey } from './LandscapeEcosystemMaterials.js';

const FLOATS = ECOSYSTEM_RECORD.floats;
const INSTANCE_ATTRIBUTES = Object.freeze([['instanceAnchor', 3, 0], ['instanceScale', 1, 3], ['instanceNormal', 2, 4], ['instanceYaw', 1, 6], ['instanceVariant', 1, 7], ['instanceRank', 1, 8], ['instanceTint', 3, 9]]);

/** The draw geometry of one asset LOD over an instance buffer: the shared asset attributes and index plus the record attributes. */
function createDrawGeometry(lod, buffer, instanceCount) {
    const geometry = new THREE.InstancedBufferGeometry();
    for (const [name, attribute] of Object.entries(lod.geometry.attributes)) geometry.setAttribute(name, attribute);
    geometry.setIndex(lod.geometry.index);
    for (const [name, size, offset] of INSTANCE_ATTRIBUTES) geometry.setAttribute(name, new THREE.InterleavedBufferAttribute(buffer, size, offset));
    geometry.instanceCount = instanceCount;
    return geometry;
}

/** Releases a draw geometry: the shared asset attributes are detached first, so their GPU buffers survive the dispose of this geometry alone. */
function disposeDrawGeometry(geometry, lod) {
    for (const name of Object.keys(lod.geometry.attributes)) geometry.deleteAttribute(name);
    geometry.setIndex(null);
    geometry.dispose();
}

function validateTile(tile, recipe) {
    if (!tile || typeof tile.id !== 'string' || !tile.id.length) throw new Error('[LandscapeEcosystem] A tile needs a string id');
    const layer = recipe.layers[tile.layerId];
    if (!layer) throw new Error(`[LandscapeEcosystem] tile ${tile.id} names an unknown layer ${String(tile.layerId)}`);
    if (!Number.isInteger(tile.cellX) || !Number.isInteger(tile.cellZ)) throw new Error(`[LandscapeEcosystem] tile ${tile.id} needs integer cell coordinates`);
    if (!Number.isInteger(tile.count) || tile.count < 0 || tile.count > ECOSYSTEM_RECORD.maxInstances) throw new Error(`[LandscapeEcosystem] tile ${tile.id} count must be an integer in 0..${ECOSYSTEM_RECORD.maxInstances}`);
    if (!(tile.records instanceof Float32Array) || tile.records.length !== tile.count * FLOATS) throw new Error(`[LandscapeEcosystem] tile ${tile.id} records must be a Float32Array of ${tile.count * FLOATS} floats`);
    if (!(tile.ids instanceof Int32Array) || tile.ids.length !== tile.count * ECOSYSTEM_RECORD.idInts) throw new Error(`[LandscapeEcosystem] tile ${tile.id} ids must be an Int32Array of ${tile.count * ECOSYSTEM_RECORD.idInts} integers`);
    const bounds = tile.bounds;
    if (!bounds || !['minX', 'maxX', 'minZ', 'maxZ'].every(key => Number.isFinite(bounds[key])) || !(bounds.maxX > bounds.minX && bounds.maxZ > bounds.minZ)) throw new Error(`[LandscapeEcosystem] tile ${tile.id} needs finite bounds with positive area`);
    if (!Array.isArray(tile.heightRange) || tile.heightRange.length !== 2 || !tile.heightRange.every(Number.isFinite) || tile.heightRange[0] > tile.heightRange[1]) throw new Error(`[LandscapeEcosystem] tile ${tile.id} needs a [min, max] height range`);
    return layer;
}

/**
 * @param {{recipe:any,assetSets:any,scene:any,renderer:any,lighting:any,lightingTier:string,ledger:any,camera:any,framePasses?:number}} options recipe is validated; assetSets
 *   createEcosystemAssetSets' result; ledger the ecosystem share (reported in the snapshot); framePasses the render calls per frame (the frame pipeline's two)
 */
export function createLandscapeEcosystemRenderer({ recipe, assetSets, scene, renderer, lighting, lightingTier, ledger, camera, framePasses = 1 }) {
    if (!recipe?.layers || !assetSets?.get || !scene || !renderer?.isWebGLRenderer || !lighting?.uniforms || !ledger?.shareSnapshot || !camera) throw new Error('[LandscapeEcosystem] The renderer needs the recipe, asset sets, scene, renderer, lighting, ecosystem share and camera');
    const layers = Object.values(recipe.layers), bandsByLayer = new Map(layers.map(layer => [layer.id, ecosystemLodBands(layer)]));
    const wind = { ...LANDSCAPE_ECOSYSTEM.wind }, contact = { ...LANDSCAPE_ECOSYSTEM.contact };
    const shared = { uEcosystemWind: { value: new THREE.Vector4(wind.directionX, wind.directionZ, wind.strength, 0) }, uEcosystemContact: { value: new THREE.Vector2(contact.strength, contact.heightMeters) }, uEcosystemDiagnostic: { value: 0 } };
    const tiles = new Map();
    let tier = lightingTier, diagnostic = 'none', visible = true, shadows = false, disposed = false, frameCostMs = 0, renderInfo = null, drawnFrame = -1, rebuildSequence = 0;
    let programCompile = { parallel: renderer.extensions.has('KHR_parallel_shader_compile'), pending: true, milliseconds: null, programs: 0, rebuilds: 0, timedOut: false, infoLogs: [] };
    // the linked programs' info logs (compiler warnings such as Direct3D X4008 land there without failing the link), for the snapshot
    const infoLogs = set => {
        const gl = renderer.getContext(), logs = [];
        for (const entry of set.entries.values()) {
            const program = renderer.properties.get(entry.material).currentProgram, log = program?.program ? (gl.getProgramInfoLog(program.program) || '').trim() : '';
            if (log) logs.push({ key: entry.key, log });
        }
        return logs;
    };
    const onBeforeRender = currentRenderer => { renderInfo = currentRenderer.info.render; drawnFrame = renderInfo.frame; };
    let materials = createEcosystemMaterialSet({ recipe, assetSets, lighting, lightingTier: tier, diagnostics: false, shared });
    // one proxy mesh per material (a single zero record, never drawn) links the programs before any tile arrives, and keeps the same attribute set as the tiles' draws
    const proxies = set => [...set.entries.values()].map(entry => {
        const buffer = new THREE.InstancedInterleavedBuffer(new Float32Array(FLOATS), FLOATS, 1), geometry = createDrawGeometry(entry.lod, buffer, 0), mesh = new THREE.Mesh(geometry, entry.material);
        mesh.frustumCulled = false; mesh.visible = false;
        return { entry, geometry, mesh };
    });
    const compile = async set => {
        const started = performance.now(), group = new THREE.Group(), list = proxies(set);
        for (const proxy of list) group.add(proxy.mesh);
        try {
            await Promise.race([renderer.compileAsync(group, camera, scene), new Promise((_, reject) => setTimeout(() => reject(new Error(`[LandscapeEcosystem] the ecosystem programs did not link within ${LANDSCAPE_ECOSYSTEM.compileWaitMs} ms`)), LANDSCAPE_ECOSYSTEM.compileWaitMs))]);
        } finally { for (const proxy of list) disposeDrawGeometry(proxy.geometry, proxy.entry.lod); }
        return performance.now() - started;
    };
    const link = async set => {
        programCompile = { ...programCompile, pending: true };
        try {
            const milliseconds = await compile(set);
            programCompile = { ...programCompile, pending: false, milliseconds, programs: set.entries.size, timedOut: false, infoLogs: infoLogs(set) };
        } catch (error) { programCompile = { ...programCompile, pending: false, timedOut: true }; throw error; }
    };
    const ready = link(materials);
    // the owner awaits ready; the state of a failed link is in the snapshot, so a rejection nobody awaited must not surface as unhandled
    ready.catch(() => {});
    const assign = set => { for (const tile of tiles.values()) for (const unit of tile.units) unit.mesh.material = set.entries.get(unit.key).material; };
    // a tier or diagnostics change: the new set links in parallel while the current one keeps drawing, then every draw switches at once
    const rebuild = async changes => {
        const next = createEcosystemMaterialSet({ recipe, assetSets, lighting, lightingTier: changes.tier ?? materials.tier, diagnostics: changes.diagnostics ?? materials.diagnostics, shared }), sequence = ++rebuildSequence;
        try { await link(next); } catch (error) { next.dispose(); throw error; }
        if (disposed || sequence !== rebuildSequence) { next.dispose(); return; }
        const previous = materials;
        materials = next;
        assign(next);
        previous.dispose();
        programCompile = { ...programCompile, rebuilds: programCompile.rebuilds + 1 };
    };
    const castsShadow = (layer, level) => shadows && layer.shadow.castLevels.includes(level);
    const removeTile = tile => {
        for (const unit of tile.units) { unit.mesh.removeFromParent(); disposeDrawGeometry(unit.geometry, unit.lod); }
        tiles.delete(tile.id);
    };
    return Object.freeze({
        /** Resolves once the initial programs are linked (rejects on a link timeout). */
        ready,
        /**
         * Attaches a resident tile: its records bind as one instance buffer drawn by every LOD band of its layer.
         * @param {{id:string,layerId:string,cellX:number,cellZ:number,bounds:any,heightRange:number[],records:Float32Array,ids:Int32Array,count:number}} tile rank-sorted records (ecosystem-instance-v1)
         */
        attachTile(tile) {
            if (disposed) throw new Error('[LandscapeEcosystem] The renderer is disposed');
            const layer = validateTile(tile, recipe);
            if (tiles.has(tile.id)) throw new Error(`[LandscapeEcosystem] tile ${tile.id} is already attached`);
            const asset = assetSets.get(layer.assetSet), bands = bandsByLayer.get(layer.id), sphere = ecosystemTileSphere(tile.bounds, tile.heightRange, asset.heightMeters, asset.footprintRadiusMeters, layer.variation.scale.max);
            const buffer = tile.count ? new THREE.InstancedInterleavedBuffer(tile.records, FLOATS, 1) : null;
            const units = tile.count ? bands.map(band => {
                const key = ecosystemMaterialKey(layer.id, band.level), entry = materials.entries.get(key), geometry = createDrawGeometry(entry.lod, buffer, tile.count);
                geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(sphere.x, sphere.y, sphere.z), sphere.radius);
                const mesh = new THREE.Mesh(geometry, entry.material);
                mesh.name = `Landscape ecosystem ${tile.id} LOD ${band.level}`;
                mesh.matrixAutoUpdate = false; mesh.visible = false; mesh.castShadow = castsShadow(layer, band.level); mesh.receiveShadow = false; mesh.onBeforeRender = onBeforeRender;
                scene.add(mesh);
                return { key, band, lod: entry.lod, geometry, mesh, visible: false, drawn: false };
            }) : [];
            const record = { id: tile.id, layer, asset, bounds: { ...tile.bounds }, heightRange: [tile.heightRange[0], tile.heightRange[1]], cellX: tile.cellX, cellZ: tile.cellZ, records: tile.records, ids: tile.ids, count: tile.count, admitted: tile.count, fraction: 1,
                reach: sphere.radius - Math.hypot(tile.bounds.maxX - sphere.x, tile.heightRange[1] - sphere.y, tile.bounds.maxZ - sphere.z), sphere, units };
            tiles.set(tile.id, record);
            return Object.freeze({ id: tile.id, draws: units.length, instances: tile.count });
        },
        /** @param {string} tileId */
        detachTile(tileId) {
            const tile = tiles.get(tileId);
            if (!tile) throw new Error(`[LandscapeEcosystem] tile ${String(tileId)} is not attached`);
            removeTile(tile);
        },
        /** Admits a rank prefix of a tile's records (budget pressure): the drawn instance count becomes round(fraction x count). @param {string} tileId @param {number} fraction */
        setDrawFraction(tileId, fraction) {
            const tile = tiles.get(tileId);
            if (!tile) throw new Error(`[LandscapeEcosystem] tile ${String(tileId)} is not attached`);
            if (!(typeof fraction === 'number' && fraction >= 0 && fraction <= 1)) throw new Error(`[LandscapeEcosystem] The draw fraction must lie in 0..1; received ${String(fraction)}`);
            tile.fraction = fraction; tile.admitted = Math.round(fraction * tile.count);
            for (const unit of tile.units) unit.geometry.instanceCount = tile.admitted;
            return tile.admitted;
        },
        /** One frame: the wind clock and the per-tile LOD band visibility from the camera's distance range to each tile. @param {{camera:any,dt:number}} frame */
        update({ camera: current, dt }) {
            if (disposed) return;
            const started = performance.now();
            if (wind.strength > 0 && Number.isFinite(dt)) shared.uEcosystemWind.value.w += Math.max(0, dt);
            for (const tile of tiles.values()) {
                const range = ecosystemBoxDistanceRange(current.position, tile.bounds, tile.heightRange, tile.reach);
                for (const unit of tile.units) {
                    unit.visible = ecosystemBandVisible(range, unit.band, unit.visible);
                    unit.drawn = unit.visible && visible && tile.admitted > 0;
                    unit.mesh.visible = unit.drawn;
                }
            }
            frameCostMs = performance.now() - started;
        },
        /** @param {string} value rebuilds and relinks the materials for a lighting tier; resolves once they draw */
        setLightingTier(value) { tier = value; return rebuild({ tier: value }); },
        /** @param {string} name one of LANDSCAPE_ECOSYSTEM.diagnostics; the diagnostic views are compiled in on first use and out again on 'none' */
        setDiagnostic(name) {
            shared.uEcosystemDiagnostic.value = landscapeEcosystemDiagnostic(name);
            diagnostic = name;
            const wanted = name !== 'none';
            return wanted === materials.diagnostics ? Promise.resolve() : rebuild({ diagnostics: wanted });
        },
        /** @param {{directionX?:number,directionZ?:number,strength?:number,time?:number}} options the sway hook: direction (normalized), strength in metres at the asset top, an optional clock time */
        setWind({ directionX = wind.directionX, directionZ = wind.directionZ, strength = wind.strength, time } = {}) {
            for (const [label, value] of [['directionX', directionX], ['directionZ', directionZ], ['strength', strength]]) if (!Number.isFinite(value)) throw new Error(`[LandscapeEcosystem] wind ${label} must be finite`);
            if (strength < 0) throw new Error('[LandscapeEcosystem] wind strength must not be negative');
            const length = Math.hypot(directionX, directionZ) || 1;
            Object.assign(wind, { directionX: directionX / length, directionZ: directionZ / length, strength });
            shared.uEcosystemWind.value.set(wind.directionX, wind.directionZ, strength, time === undefined ? shared.uEcosystemWind.value.w : time);
            return { ...wind, time: shared.uEcosystemWind.value.w };
        },
        /** @param {{strength?:number,heightMeters?:number}} options ground-contact darkening of the lowest metres (strength 0 disables it) */
        setContact({ strength = contact.strength, heightMeters = contact.heightMeters } = {}) {
            if (!(strength >= 0 && strength <= 1) || !(heightMeters >= 0)) throw new Error('[LandscapeEcosystem] contact strength must lie in 0..1 and its height must not be negative');
            Object.assign(contact, { strength, heightMeters });
            shared.uEcosystemContact.value.set(strength, heightMeters);
            return { ...contact };
        },
        /** @param {{enabled:boolean}} options the AI 600 hook: the LOD meshes of each layer's castLevels cast shadows once shadow maps exist */
        setShadows({ enabled }) {
            if (typeof enabled !== 'boolean') throw new Error('[LandscapeEcosystem] shadows.enabled must be boolean');
            shadows = enabled;
            for (const tile of tiles.values()) for (const unit of tile.units) unit.mesh.castShadow = castsShadow(tile.layer, unit.band.level);
            return { enabled };
        },
        setVisible(value) {
            if (typeof value !== 'boolean') throw new Error('[LandscapeEcosystem] visibility must be boolean');
            visible = value;
            for (const tile of tiles.values()) for (const unit of tile.units) { unit.drawn = unit.visible && visible && tile.admitted > 0; unit.mesh.visible = unit.drawn; }
        },
        /**
         * The nearest drawn instance whose bounding sphere (anchor + up x height x scale / 2, radius max(footprint, height / 2) x scale) a world ray meets.
         * @param {any} ray a THREE.Ray @returns {{layerId:string,tileId:string,index:number,id:string,record:any,distance:number}|null}
         */
        pick(ray) {
            if (!ray?.origin?.isVector3 || !ray?.direction?.isVector3) throw new Error('[LandscapeEcosystem] pick needs a THREE.Ray');
            const box = new THREE.Box3(), sphere = new THREE.Sphere(), hit = new THREE.Vector3(), up = new THREE.Vector3();
            let best = null;
            for (const tile of tiles.values()) {
                box.min.set(tile.bounds.minX - tile.reach, tile.heightRange[0] - tile.reach, tile.bounds.minZ - tile.reach); box.max.set(tile.bounds.maxX + tile.reach, tile.heightRange[1] + tile.reach, tile.bounds.maxZ + tile.reach);
                if (!ray.intersectsBox(box)) continue;
                const { records } = tile, height = tile.asset.heightMeters, footprint = tile.asset.footprintRadiusMeters, slopeWeight = tile.layer.alignment.slopeWeight;
                for (let index = 0; index < tile.admitted; index++) {
                    const o = index * FLOATS, scale = records[o + 3], normal = ecosystemRecordNormal(records, index);
                    up.set(normal.x * slopeWeight, 1 + (normal.y - 1) * slopeWeight, normal.z * slopeWeight).normalize();
                    sphere.center.set(records[o], records[o + 1], records[o + 2]).addScaledVector(up, height * scale / 2);
                    sphere.radius = Math.max(footprint, height / 2) * scale;
                    if (!ray.intersectSphere(sphere, hit)) continue;
                    const distance = hit.distanceTo(ray.origin);
                    if (!best || distance < best.distance) best = { layerId: tile.layer.id, tileId: tile.id, index, distance };
                }
            }
            if (!best) return null;
            const tile = tiles.get(best.tileId), i = best.index * ECOSYSTEM_RECORD.idInts;
            return { ...best, id: ecosystemInstanceId(tile.layer.id, tile.ids[i], tile.ids[i + 1], tile.ids[i + 2]), record: readEcosystemRecord(tile, best.index) };
        },
        snapshot() {
            const byLayer = Object.fromEntries(layers.map(layer => [layer.id, { tiles: 0, instances: 0, drawn: 0, meshes: 0, draws: 0 }])), byLevel = {};
            let instances = 0, drawn = 0, draws = 0, triangles = 0, trianglesVisible = 0;
            for (const tile of tiles.values()) {
                const entry = byLayer[tile.layer.id];
                entry.tiles++; entry.instances += tile.count; entry.drawn += tile.admitted; entry.meshes += tile.units.length; instances += tile.count; drawn += tile.admitted;
                for (const unit of tile.units) {
                    const level = byLevel[unit.band.level] ??= { meshes: 0, draws: 0, instances: 0 };
                    level.meshes++;
                    if (!unit.drawn) continue;
                    level.draws++; level.instances += tile.admitted; entry.draws++; draws++; triangles += tile.admitted * unit.lod.drawTriangles; trianglesVisible += tile.admitted * unit.lod.triangles;
                }
            }
            return { recipe: LANDSCAPE_ECOSYSTEM.id, status: disposed ? 'off' : 'active', tiles: tiles.size, instances, drawn, draws, triangles, trianglesVisible, byLayer, byLevel, diagnostic, wind: { ...wind, time: shared.uEcosystemWind.value.w }, contact: { ...contact },
                shadows: { enabled: shadows, casters: [...tiles.values()].reduce((sum, tile) => sum + tile.units.filter(unit => unit.mesh.castShadow).length, 0) }, visible, lightingTier: tier, materials: materials.entries.size, diagnosticsCompiled: materials.diagnostics,
                share: ledger.shareSnapshot(), programCompile: { ...programCompile }, frameCostMs, drawnLastFrame: renderInfo !== null && renderInfo.frame - drawnFrame < framePasses,
                tileIds: [...tiles.keys()], tileRecords: [...tiles.values()].map(tile => ({ id: tile.id, layerId: tile.layer.id, count: tile.count, admitted: tile.admitted, fraction: tile.fraction, units: tile.units.map(unit => ({ level: unit.band.level, visible: unit.visible, drawn: unit.drawn })) })) };
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            rebuildSequence++;
            for (const tile of [...tiles.values()]) removeTile(tile);
            materials.dispose();
        }
    });
}
