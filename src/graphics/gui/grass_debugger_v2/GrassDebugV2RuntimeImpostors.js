// Cache view-dependent metre patches on the GPU, publishing only complete captures.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2ImpostorSource } from './GrassDebugV2ImpostorSource.js';
import { createGrassDebugV2ImpostorCapture } from './GrassDebugV2ImpostorCapture.js';
import { createGrassDebugV2ImpostorMaterial } from './GrassDebugV2ImpostorMaterial.js';
import { createGrassDebugV2Material } from './GrassDebugV2Material.js';
import { attachGrassImpostorTransition } from './GrassDebugV2ImpostorTransitionMaterial.js';
import { createGrassImpostorTransition, advanceGrassImpostorTransition } from './GrassDebugV2ImpostorTransition.js';

export const GRASS_RUNTIME_IMPOSTORS = Object.freeze({ resolution: 512, tileMeters: 1, angleStepDegrees: 2,
    cacheCapacity: 64, nearDistance: 8, nearExitDistance: 9, maximumViewErrorDegrees: 2, capturesPerFrame: 1, transitionMilliseconds: 300 });

function createCardGeometry(capacity, bounds) {
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-.5, -.5, 0, .5, -.5, 0, -.5, .5, 0, .5, .5, 0], 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0,0,1, 0,0,1, 0,0,1, 0,0,1], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0,0, 1,0, 0,1, 1,1], 2));
    geometry.setAttribute('grassImpostorCenter', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('grassImpostorBlend', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2).setUsage(THREE.DynamicDrawUsage));
    geometry.setIndex([0,1,2, 2,1,3]); geometry.instanceCount = 0;
    geometry.boundingBox = bounds.clone(); geometry.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
    return geometry;
}

function viewRequest(direction) {
    const step = THREE.MathUtils.degToRad(GRASS_RUNTIME_IMPOSTORS.angleStepDegrees);
    const elevationSteps = Math.round(Math.PI / 2 / step), azimuthSteps = elevationSteps * 4;
    const elevation = Math.min(elevationSteps, Math.max(0, Math.round(Math.asin(direction.y) / step)));
    const azimuth = elevation === elevationSteps ? 0 : (Math.round(Math.atan2(direction.x, direction.z) / step) + azimuthSteps) % azimuthSteps;
    const el = elevation * step, az = azimuth * step;
    return { key: azimuth + ':' + elevation, direction: new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)) };
}

/** @param {{renderer:THREE.WebGLRenderer,source:THREE.Mesh,material:THREE.MeshStandardMaterial,width:number,depth:number,shadowDirection:THREE.Vector3}} options */
export async function createGrassDebugV2RuntimeImpostors({ renderer, source, material, width, depth, shadowDirection }) {
    const config = GRASS_RUNTIME_IMPOSTORS;
    const sourceData = createGrassDebugV2ImpostorSource(source, width, depth);
    const capture = await createGrassDebugV2ImpostorCapture({ renderer, source: sourceData.mesh, material, resolution: config.resolution, shadowDirection });
    const group = new THREE.Group(); group.name = 'GrassField-LOD3'; group.userData.grassRuntimeGroup = true;
    const cache = new Map(), records = [], requests = new Map();
    const bounds = new THREE.Box3(new THREE.Vector3(-width/2-.1,0,-depth/2-.1), new THREE.Vector3(width/2+.1,source.geometry.boundingBox.max.y+.05,depth/2+.1));
    const sourceIndex = source.geometry.index.array, halfHeight = source.geometry.boundingBox.max.y / 2;
    const cellIds = new THREE.BufferAttribute(new Float32Array(source.geometry.attributes.position.count), 1);
    for (const cell of sourceData.cells) for (const id of cell.leafIds) {
        const range = sourceData.ranges[id];
        for (let i = range.start; i < range.start + range.count; i++) cellIds.setX(sourceIndex[i], cell.id);
    }
    const eye = new THREE.Vector3(), direction = new THREE.Vector3(), inverse = new THREE.Matrix4();
    const minimumDot = Math.cos(THREE.MathUtils.degToRad(config.maximumViewErrorDegrees));
    let fields, parent, camera, externalShadows, frame = 0, captureCount = 0, pending = [], back = null, building = false;
    let lastCaptureMilliseconds = 0, updateMilliseconds = 0, maximumSelectedViewErrorDegrees = 0;
    const makeRecord = (fieldGroup, index) => {
        const geometry = new THREE.BufferGeometry();
        for (const [name, attribute] of Object.entries(source.geometry.attributes)) geometry.setAttribute(name, attribute);
        geometry.setAttribute('grassImpostorCell', cellIds);
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(sourceIndex.length), 1).setUsage(THREE.DynamicDrawUsage));
        geometry.setDrawRange(0, 0); geometry.boundingBox = bounds; geometry.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
        const blendMap = new THREE.DataTexture(new Float32Array(sourceData.cells.length * 4), sourceData.cells.length, 1, THREE.RGBAFormat, THREE.FloatType);
        blendMap.needsUpdate = true;
        const fallbackMaterial = createGrassDebugV2Material({ color: material.color, vertexColors: material.vertexColors,
            map: material.map, normalMap: material.normalMap, normalScale: material.normalScale, roughness: material.roughness,
            roughnessMap: material.roughnessMap, metalness: material.metalness, side: material.side,
            envMap: material.envMap, envMapIntensity: material.envMapIntensity, defines: { ...material.defines } });
        attachGrassImpostorTransition(fallbackMaterial, { cards: false, map: blendMap, count: sourceData.cells.length });
        const fallback = new THREE.Mesh(geometry, fallbackMaterial); fallback.name = 'GrassLOD3OriginalLeaves';
        fallback.receiveShadow = true; fallback.castShadow = false; fallback.userData.grassRuntimeFallback = true;
        fieldGroup.add(fallback);
        return { index, group: fieldGroup, fallback, blendMap, states: sourceData.cells.map(createGrassImpostorTransition),
            batches: new Map(), assignments: [], signature: '', cards: 0, fallbackLeaves: 0, triangles: 0, active: false, transitions: 0 };
    };
    const findEntry = request => {
        const exact = cache.get(request.key);
        if (exact && !exact.retiring && exact.target.direction.dot(request.actualDirection) >= minimumDot) return exact;
        let best = null, dot = minimumDot;
        for (const entry of cache.values()) {
            if (entry.retiring) continue;
            const candidate = entry.target.direction.dot(request.actualDirection);
            if (candidate > dot) { best = entry; dot = candidate; }
        }
        return best;
    };
    const applyRecord = record => {
        const selected = new Map(), fallbackIds = [], fallbackCells = [], now = performance.now();
        let logicalFallbackLeaves = 0;
        record.transitions = 0;
        record.blendMap.image.data.fill(0);
        for (const assignment of record.assignments) {
            const { cell, request } = assignment, state = record.states[cell.id];
            const preferredKey = state.next === undefined ? state.current : state.next;
            const current = preferredKey && cache.get(preferredKey);
            // Prefer the displayed view until its angular tolerance expires; closer is not automatically better.
            const entry = request ? current && !current.retiring && current.target.direction.dot(request.actualDirection) >= minimumDot
                ? current : findEntry(request) : null;
            const parts = advanceGrassImpostorTransition(state, entry?.key ?? null, now, config.transitionMilliseconds);
            if (state.next !== undefined) record.transitions++;
            for (const part of parts) {
                if (part.high <= part.low) continue;
                if (part.key === null) {
                    fallbackIds.push(...cell.leafIds); fallbackCells.push(cell.id);
                    record.blendMap.image.data.set([part.low, part.high], cell.id * 4);
                    if (part.ownsLeaves) logicalFallbackLeaves += cell.leafIds.length;
                    continue;
                }
                const visible = cache.get(part.key);
                if (!visible) throw new Error('A visible grass capture was evicted during its transition.');
                if (!selected.has(visible.key)) selected.set(visible.key, { entry: visible, cells: [] });
                selected.get(visible.key).cells.push({ cell, ...part }); visible.lastUsed = frame;
                if (request) maximumSelectedViewErrorDegrees = Math.max(maximumSelectedViewErrorDegrees,
                    THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(visible.target.direction.dot(request.actualDirection), -1, 1))));
            }
        }
        record.blendMap.needsUpdate = true;
        for (const batch of record.batches.values()) { batch.mesh.visible = false; batch.geometry.instanceCount = 0; }
        let cardLeaves = 0; record.cards = 0;
        for (const [key, { entry, cells }] of selected) {
            let batch = record.batches.get(key);
            if (!batch) {
                const geometry = createCardGeometry(sourceData.cells.length, bounds), mesh = new THREE.Mesh(geometry, entry.display.material);
                mesh.name = 'GrassLOD3RuntimePatch'; mesh.receiveShadow = false; mesh.castShadow = false;
                mesh.userData.grassRuntimeImpostor = true;
                batch = { geometry, mesh }; record.batches.set(key, batch); record.group.add(mesh);
            }
            batch.mesh.material = entry.display.material; batch.mesh.visible = true;
            const centers = batch.geometry.attributes.grassImpostorCenter, blend = batch.geometry.attributes.grassImpostorBlend;
            cells.forEach(({ cell, low, high }, i) => { centers.setXYZ(i, cell.x, 0, cell.z); blend.setXY(i, low, high); });
            centers.clearUpdateRanges(); centers.addUpdateRange(0, cells.length * 3); centers.needsUpdate = true;
            blend.clearUpdateRanges(); blend.addUpdateRange(0, cells.length * 2); blend.needsUpdate = true;
            batch.geometry.instanceCount = cells.length;
            batch.geometry.userData.grassLeafCount = cells.reduce((sum, part) => sum + (part.ownsLeaves ? part.cell.leafIds.length : 0), 0);
            cardLeaves += batch.geometry.userData.grassLeafCount; record.cards += cells.length;
        }
        for (const [key, batch] of record.batches) if (!cache.has(key) && !batch.mesh.visible) {
            batch.mesh.removeFromParent(); batch.geometry.dispose(); record.batches.delete(key);
        }
        const signature = fallbackCells.join(',');
        if (signature !== record.signature) {
            let offset = 0;
            for (const id of fallbackIds) {
                const range = sourceData.ranges[id];
                record.fallback.geometry.index.array.set(sourceIndex.subarray(range.start, range.start + range.count), offset); offset += range.count;
            }
            const index = record.fallback.geometry.index;
            index.clearUpdateRanges(); index.addUpdateRange(0, Math.max(1, offset)); index.needsUpdate = true;
            record.fallback.geometry.setDrawRange(0, offset); record.signature = signature;
        }
        record.fallback.visible = fallbackIds.length > 0;
        record.fallback.geometry.userData.grassLeafCount = logicalFallbackLeaves;
        record.fallbackLeaves = fallbackIds.length;
        record.triangles = record.cards * 2 + record.fallback.geometry.drawRange.count / 3;
        if (cardLeaves + logicalFallbackLeaves !== sourceData.ranges.length) throw new Error('Runtime impostor assignments lost source leaves.');
    };
    const updateCamera = value => {
        if (!fields) return false;
        const started = performance.now(); camera = value; frame++; requests.clear();
        parent.updateWorldMatrix(true, true); camera.updateMatrixWorld();
        const state = fields.getSnapshot(); maximumSelectedViewErrorDegrees = 0;
        for (const record of records) {
            record.active = state.tiles[record.index].active && state.grassVisible && state.tiles[record.index].lod === 'LOD3';
            if (!record.active) { record.states = sourceData.cells.map(createGrassImpostorTransition); record.transitions = 0; continue; }
            inverse.copy(record.group.matrixWorld).invert(); eye.copy(camera.position).applyMatrix4(inverse);
            record.assignments = sourceData.cells.map(cell => {
                direction.set(eye.x - cell.x, eye.y - halfHeight, eye.z - cell.z);
                const distance = direction.length();
                const state = record.states[cell.id], hasCard = (state.next === undefined ? state.current : state.next) !== null;
                if (cell.edge || distance < (hasCard ? config.nearDistance : config.nearExitDistance) || direction.y < .01) return { cell, request: null };
                direction.divideScalar(distance);
                const request = { ...viewRequest(direction), actualDirection: direction.clone(), distance };
                const previous = requests.get(request.key);
                if (!previous || distance < previous.distance) requests.set(request.key, request);
                return { cell, request };
            });
            applyRecord(record);
        }
        const desired = [...requests.values()].sort((a,b) => a.distance - b.distance).slice(0, config.cacheCapacity);
        pending = desired.filter(request => !cache.has(request.key));
        requests.clear(); desired.forEach(request => requests.set(request.key, request));
        updateMilliseconds = performance.now() - started;
        return false;
    };
    const renderPending = () => {
        if (!pending.length || building) return false;
        const pinned = new Set();
        for (const record of records) if (record.active) for (const state of record.states) {
            if (state.current !== null) pinned.add(state.current);
            if (typeof state.next === 'string') pinned.add(state.next);
        }
        let retired = null;
        if (cache.size >= config.cacheCapacity) {
            const candidates = [...cache.values()].filter(entry => !requests.has(entry.key)).sort((a,b) => a.lastUsed - b.lastUsed);
            retired = candidates.find(entry => !pinned.has(entry.key)) ?? null;
            if (!retired) {
                // Fade an unwanted view out before recycling its target, even if capture work must wait.
                const victim = candidates.find(entry => !entry.retiring);
                if (victim) { victim.retiring = true; updateCamera(camera); }
                return false;
            }
        }
        const request = pending.shift(), started = performance.now(); building = true;
        try {
            back ??= capture.createTarget();
            capture.render(back, request.direction);
            if (retired) cache.delete(retired.key);
            const target = back, display = createGrassDebugV2ImpostorMaterial({ sourceMaterial: material, capture: target, shadowUniforms: externalShadows });
            cache.set(request.key, { key: request.key, target, display, generation: ++captureCount, lastUsed: frame, retiring: false });
            back = retired?.target ?? null;
            if (retired) retired.display.dispose();
            lastCaptureMilliseconds = performance.now() - started;
            updateCamera(camera);
            return true;
        } finally { building = false; }
    };
    return Object.freeze({ group, updateCamera, renderPending,
        setExternalShadows(uniforms) {
            if (cache.size) throw new Error('Bind external shadows before generating runtime views.');
            externalShadows = uniforms;
        },
        bindFields(options) {
            if (fields) throw new Error('Runtime impostor fields already bound.');
            fields = options.fields; parent = options.parent;
            fields.getSnapshot().tiles.forEach(tile => {
                const root = parent.getObjectByName('GrassFieldTile_' + (tile.index + 1));
                const fieldGroup = root.getObjectByName('GrassField-LOD3');
                if (!fieldGroup) throw new Error('Missing cloned runtime impostor group.');
                records.push(makeRecord(fieldGroup, tile.index));
            });
        },
        getSnapshot: () => ({ ...config, layout: 'runtime-patch-impostors', lod: 'LOD3', source: 'LOD2',
            leaves: sourceData.ranges.length, sourceLeaves: sourceData.sourceLeaves, periodic: sourceData.periodic,
            lightingBaked: false, worldOrientedNormals: true, shadowSource: 'LOD2', captureChannels: ['albedo','normal','surface','depth'],
            capture: capture.getSnapshot(), externalShadows: 'cached-scene-only',
            cacheEntries: cache.size, captureCount, swapCount: captureCount, pendingViews: pending.length, building,
            lastCaptureMilliseconds, captureTiming: 'CPU submission; main GPU timer includes captures', updateMilliseconds,
            maximumSelectedViewErrorDegrees, estimatedTextureBytes: (cache.size + (back ? 1 : 0)) * config.resolution ** 2 * (12 * 4 / 3 + 4),
            transitions: records.filter(record => record.active).reduce((sum, record) => sum + record.transitions, 0),
            cards: records[0]?.cards ?? 0, fallbackLeaves: records[0]?.fallbackLeaves ?? sourceData.ranges.length,
            triangles: records[0]?.triangles || source.geometry.index.count / 3,
            totalTriangles: records.filter(record => record.active).reduce((sum, record) => sum + record.triangles, 0),
            fields: records.map(record => ({ index: record.index, active: record.active, cards: record.cards, fallbackLeaves: record.fallbackLeaves, triangles: record.triangles, transitions: record.transitions })),
            views: [...cache.values()].map(entry => ({ key: entry.key, generation: entry.generation, direction: entry.target.direction.toArray() })) }),
        dispose() {
            for (const record of records) {
                // Only the fallback index is owned here; the source retains its vertex buffers.
                for (const name of Object.keys(record.fallback.geometry.attributes)) if (name !== 'grassImpostorCell') record.fallback.geometry.deleteAttribute(name);
                record.fallback.geometry.dispose(); record.fallback.removeFromParent();
                record.fallback.material.dispose(); record.blendMap.dispose();
                for (const batch of record.batches.values()) { batch.geometry.dispose(); batch.mesh.removeFromParent(); }
            }
            for (const entry of cache.values()) { entry.display.dispose(); entry.target.dispose(); }
            back?.dispose(); capture.dispose(); sourceData.dispose(); group.removeFromParent();
        }
    });
}
