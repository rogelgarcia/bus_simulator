// Selects the canonical static city roots and waits for evaluated runtime content.
// @ts-check

import { failBakeSource } from './BakeSourceErrors.js';
import {
    canonicalJsonStringify,
    cloneCanonicalJson,
    compareCanonicalStrings
} from '../../../app/illumination/bake_source/index.js';

const DEFAULT_READY_TIMEOUT_MS = 180_000;
const STABLE_READY_PASSES = 3;

function idToken(value) {
    const token = String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._:-]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
    return token || 'unnamed';
}

function cloneJsonValue(value, label = 'source value') {
    if (value === undefined) return null;
    try {
        return cloneCanonicalJson(value);
    } catch (error) {
        failBakeSource('non_canonical_source_provenance', `${label} is not strict canonical JSON.`, {
            label,
            reason: error instanceof Error ? error.message : String(error)
        });
    }
}

function appendUnique(entries, seen, entry) {
    if (!entry?.root) return;
    if (seen.has(entry.id)) {
        failBakeSource('duplicate_root_id', `Duplicate bake root ID '${entry.id}'.`, { id: entry.id });
    }
    seen.add(entry.id);
    entries.push(entry);
}

function roadCategory(name) {
    const value = String(name ?? '').toLowerCase();
    if (value.includes('curb')) return 'curbs';
    if (value.includes('sidewalk')) return 'sidewalks';
    if (value.includes('marking') || value.includes('crosswalk') || value.includes('arrow')) return 'road_markings';
    return 'roads';
}

function buildingSourceByName(city) {
    const byName = new Map();
    for (const entry of (Array.isArray(city?.map?.buildings) ? city.map.buildings : [])) {
        const key = String(entry?.id ?? '');
        if (!key) continue;
        if (byName.has(key)) failBakeSource('duplicate_building_source_id', `Duplicate resolved building ID '${key}'.`, { id: key });
        byName.set(key, entry);
    }
    return byName;
}

export function collectResolvedCityBakeRoots(city) {
    if (!city?.cityId || !city?.map || !city?.group) {
        failBakeSource('missing_resolved_city', 'A fully resolved gameplay city is required.');
    }
    const entries = [];
    const seen = new Set();
    const buildingsByName = buildingSourceByName(city);

    appendUnique(entries, seen, {
        id: 'terrain:city_floor',
        category: 'terrain',
        root: city.world?.floor ?? null,
        provenance: { kind: 'generated_city_floor', sourceId: city.cityId }
    });
    appendUnique(entries, seen, {
        id: 'terrain:ground_tiles',
        category: 'terrain',
        root: city.world?.groundTiles ?? null,
        provenance: { kind: 'generated_ground_tiles', sourceId: city.cityId }
    });

    for (const root of (city.roads?.group?.children ?? [])) {
        const name = idToken(root?.name);
        appendUnique(entries, seen, {
            id: `road:${name}`,
            category: roadCategory(name),
            root,
            provenance: { kind: 'resolved_road_layer', sourceId: root?.name ?? name }
        });
    }

    for (const root of (city.buildings?.group?.children ?? [])) {
        if (root?.name === 'BuildingSlabs') {
            appendUnique(entries, seen, {
                id: 'sidewalk:building_slabs',
                category: 'sidewalks',
                root,
                provenance: { kind: 'resolved_building_slabs', sourceId: city.cityId }
            });
            continue;
        }
        const metadata = root?.userData?.staticVisibility ?? null;
        const sourceId = String(root?.name ?? '');
        const stableId = metadata?.id ? String(metadata.id) : `building:${idToken(sourceId)}`;
        appendUnique(entries, seen, {
            id: stableId,
            category: 'buildings',
            root,
            ignoreRootVisibility: true,
            provenance: {
                kind: 'resolved_building',
                sourceId,
                source: cloneJsonValue(buildingsByName.get(sourceId) ?? null)
            }
        });
    }

    const trafficPlacements = city.trafficControls?.placements ?? [];
    for (let index = 0; index < (city.trafficControls?.group?.children?.length ?? 0); index += 1) {
        const root = city.trafficControls.group.children[index];
        const metadata = root?.userData?.staticVisibility ?? null;
        const stableId = metadata?.id ? String(metadata.id) : `traffic_control:${String(index).padStart(4, '0')}`;
        appendUnique(entries, seen, {
            id: stableId,
            category: 'traffic_controls',
            root,
            ignoreRootVisibility: true,
            provenance: {
                kind: 'resolved_traffic_control',
                sourceId: stableId,
                placement: cloneJsonValue(trafficPlacements[index] ?? null)
            }
        });
    }

    const treePlacements = city.world?.trees?.placements ?? [];
    for (let index = 0; index < (city.world?.trees?.group?.children?.length ?? 0); index += 1) {
        const root = city.world.trees.group.children[index];
        const metadata = root?.userData?.staticVisibility ?? null;
        const stableId = metadata?.id ? String(metadata.id) : `tree:${String(index).padStart(4, '0')}`;
        appendUnique(entries, seen, {
            id: stableId,
            category: 'trees_foliage',
            root,
            ignoreRootVisibility: true,
            provenance: {
                kind: 'resolved_tree',
                sourceId: stableId,
                quality: city.world?.trees?.quality ?? null,
                placement: cloneJsonValue(treePlacements[index] ?? null)
            }
        });
    }

    entries.sort((a, b) => compareCanonicalStrings(a.id, b.id));
    return entries;
}

// Root visibility is camera/PVS state and is intentionally non-authoritative
// for baking. Authored visibility on the mesh or an intermediate descendant is
// part of the resolved source and must still exclude that subtree.
export function isBakeVisibleWithinRoot(root, object, { ignoreRootVisibility = false } = {}) {
    let cursor = object;
    while (cursor && cursor !== root) {
        if (cursor.visible === false) return false;
        cursor = cursor.parent;
    }
    return cursor === root && (ignoreRootVisibility || root?.visible !== false);
}

export function activeMaterialSlotEntries(object) {
    const materials = Array.isArray(object?.material) ? object.material : [object?.material];
    const geometry = object?.geometry;
    const referenceCount = geometry?.index?.count ?? geometry?.attributes?.position?.count ?? 0;
    const drawStart = Math.max(0, Math.floor(Number(geometry?.drawRange?.start) || 0));
    const rawDrawCount = geometry?.drawRange?.count;
    const drawCount = Number.isFinite(rawDrawCount)
        ? Math.max(0, Math.floor(rawDrawCount))
        : Math.max(0, referenceCount - drawStart);
    const drawEnd = Math.min(referenceCount, drawStart + drawCount);
    if (drawEnd <= drawStart) return [];
    if (!Array.isArray(object?.material)) {
        return materials[0] ? [{ index: 0, material: materials[0] }] : [];
    }
    const activeIndices = new Set();
    for (const group of (geometry?.groups ?? [])) {
        const rawGroupStart = Math.floor(Number(group?.start) || 0);
        const groupStart = Math.max(drawStart, rawGroupStart);
        const groupEnd = Math.min(drawEnd, rawGroupStart + Math.max(0, Math.floor(Number(group?.count) || 0)));
        if (groupEnd > groupStart) activeIndices.add(Math.floor(Number(group?.materialIndex) || 0));
    }
    return Array.from(activeIndices)
        .sort((left, right) => left - right)
        .map((index) => ({ index, material: materials[index] }))
        .filter((entry) => entry.material);
}

export function collectResolvedRootMeshes(rootEntry) {
    const meshes = [];
    rootEntry?.root?.traverse?.((object) => {
        if (!object?.isMesh || !object.geometry?.attributes?.position) return;
        if (!isBakeVisibleWithinRoot(rootEntry.root, object, {
            ignoreRootVisibility: rootEntry.ignoreRootVisibility === true
        })) return;
        if (activeMaterialSlotEntries(object).length === 0) return;
        if (object.userData?.isShadowCasterMerge === true || object.material?.userData?.isShadowCasterMerge === true) return;
        const segments = [];
        let cursor = object;
        while (cursor && cursor !== rootEntry.root) {
            segments.push(idToken(cursor.name || cursor.type));
            cursor = cursor.parent;
        }
        if (cursor !== rootEntry.root) {
            failBakeSource('mesh_outside_root', `Mesh '${object.name || object.type}' is outside its declared root.`, {
                rootId: rootEntry.id
            });
        }
        if (object !== rootEntry.root) segments.push(idToken(rootEntry.root.name || rootEntry.root.type));
        segments.reverse();
        meshes.push({ object, semanticPath: segments.join('/') || 'root' });
    });
    return meshes;
}

export function createOriginalCasterResolver(city) {
    const values = new WeakMap();
    for (const entry of (city?._shadowMerge ?? [])) {
        if (entry?.merged) values.set(entry.merged, false);
        for (const source of (entry?.sources ?? [])) values.set(source, true);
    }
    for (const entry of (city?._instancedCasters ?? [])) {
        if (entry?.mesh) values.set(entry.mesh, entry.originalCast === true);
    }
    for (const entry of (city?._shadowCuller?._entries ?? [])) {
        if (entry?.mesh && !values.has(entry.mesh)) values.set(entry.mesh, true);
    }
    return (mesh) => values.has(mesh) ? values.get(mesh) === true : mesh?.castShadow === true;
}

function textureReadiness(texture) {
    if (!texture?.isTexture) return null;
    if (texture.userData?.windowInteriorAtlasPending === true) return 'window_interior_atlas_pending';
    if (texture.userData?.windowInteriorAtlasFailed === true) return 'window_interior_atlas_failed';
    const data = texture.source?.data ?? texture.image ?? null;
    if (!data) return 'missing_texture_source';
    if (typeof HTMLImageElement !== 'undefined' && data instanceof HTMLImageElement) {
        if (!data.complete) return 'image_pending';
        if (!(data.naturalWidth > 0 && data.naturalHeight > 0)) return 'image_failed';
    }
    if ('width' in data && 'height' in data && (!(Number(data.width) > 0) || !(Number(data.height) > 0))) {
        return 'invalid_texture_dimensions';
    }
    return null;
}

function pendingTextureInputs(city) {
    const pending = [];
    const seen = new Set();
    city?.group?.traverse?.((object) => {
        if (!object?.isMesh || object.userData?.isShadowCasterMerge === true) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
            if (!material) continue;
            for (const value of Object.values(material)) {
                if (!value?.isTexture || seen.has(value)) continue;
                seen.add(value);
                const reason = textureReadiness(value);
                if (reason) pending.push({ material: material.name || material.type, texture: value.name || null, reason });
            }
        }
    });
    return pending;
}

function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
}

export async function waitForResolvedCityBakeReadiness(city, { timeoutMs = DEFAULT_READY_TIMEOUT_MS } = {}) {
    const timeout = Math.max(1, Number(timeoutMs) || DEFAULT_READY_TIMEOUT_MS);
    const started = performance.now();
    await Promise.all([
        city?.world?.readyPromise ?? city?.world?.trees?.readyPromise ?? Promise.resolve(null),
        city?.buildings?.textures?.waitForReady?.() ?? Promise.resolve(null)
    ]);
    const expectedTrees = city?.world?.trees?.placements?.length ?? 0;
    const actualTrees = city?.world?.trees?.group?.children?.length ?? 0;
    if (expectedTrees !== actualTrees) {
        failBakeSource('async_tree_inventory_mismatch', 'Resolved tree inventory does not match its deterministic placements.', {
            expectedTrees,
            actualTrees
        });
    }

    let stablePasses = 0;
    let lastPending = [];
    while (performance.now() - started <= timeout) {
        await nextFrame();
        lastPending = pendingTextureInputs(city);
        if (lastPending.length === 0) {
            stablePasses += 1;
            if (stablePasses >= STABLE_READY_PASSES) {
                city.group.updateWorldMatrix(true, true);
                return {
                    readyMs: performance.now() - started,
                    expectedTrees,
                    textureStablePasses: stablePasses
                };
            }
        } else {
            stablePasses = 0;
        }
    }
    failBakeSource('async_source_timeout', 'Timed out waiting for resolved city textures and asynchronous content.', {
        timeoutMs: timeout,
        pending: lastPending.slice(0, 25)
    });
}

export async function createFreshResolvedGameplayCityForBake({ currentCity, engine, gameplayPose = null } = {}) {
    if (!currentCity || !engine) failBakeSource('missing_gameplay_context', 'Gameplay city prewarm requires the live city and engine.');
    const [ornaments, cityModule] = await Promise.all([
        import('../../assets3d/generators/building_fabrication/PortalOrnamentParts.js'),
        import('../../visuals/city/City.js')
    ]);
    const [, activeReadiness] = await Promise.all([
        ornaments.preloadPortalOrnamentParts(),
        waitForResolvedCityBakeReadiness(currentCity)
    ]);
    const options = {
        cityId: currentCity.cityId,
        size: Number(currentCity.config?.size),
        tileMeters: Number(currentCity.config?.tileMeters),
        mapTileSize: Number(currentCity.map?.tileSize),
        seed: String(currentCity.genConfig?.seed ?? ''),
        mapSpec: currentCity.visibilitySourceSpec,
        generatorConfig: cloneJsonValue(currentCity.generatorConfig, 'active city generatorConfig')
    };
    for (const [key, value] of Object.entries(options)) {
        if (['mapSpec', 'generatorConfig', 'cityId', 'seed'].includes(key)) continue;
        if (!Number.isFinite(value) || value <= 0) {
            failBakeSource('active_city_options_invalid', `Active city option '${key}' is not a positive finite number.`, {
                key,
                value
            });
        }
    }
    const city = new cityModule.City(options);
    const readiness = await waitForResolvedCityBakeReadiness(city);
    const activeSource = createResolvedCitySourceRecord(currentCity);
    const freshSource = createResolvedCitySourceRecord(city);
    if (canonicalJsonStringify(activeSource) !== canonicalJsonStringify(freshSource)) {
        failBakeSource('fresh_city_source_mismatch', 'The prewarmed city does not reproduce the active city source contract.', {
            activeCityId: currentCity.cityId,
            freshCityId: city.cityId,
            gameplayPose: cloneJsonValue(gameplayPose, 'gameplay pose')
        });
    }
    return { city, readiness, activeReadiness, options, sourceEqualityVerified: true };
}

export function createResolvedCitySourceRecord(city) {
    if (!city?.map?.exportSpec) failBakeSource('missing_city_provenance', 'Resolved city map cannot export provenance.');
    return {
        schema: 'bus-sim-resolved-city-source-v1',
        cityId: city.cityId,
        origin: {
            x: Number(city.map.origin?.x),
            y: 0,
            z: Number(city.map.origin?.z)
        },
        map: {
            width: Number(city.map.width),
            height: Number(city.map.height),
            tileSizeMeters: Number(city.map.tileSize),
            authoredSource: cloneJsonValue(city.visibilitySourceSpec),
            resolvedSpec: cloneJsonValue(city.map.exportSpec({ seed: city.genConfig?.seed ?? null, version: 1 }))
        },
        resolvedBuildings: cloneJsonValue(city.map.buildings ?? []),
        resolvedReservations: cloneJsonValue(city.map.reservationSpecs ?? []),
        generatorConfig: cloneJsonValue(city.generatorConfig),
        trafficControlPlacements: cloneJsonValue(city.trafficControls?.placements ?? []),
        trees: {
            quality: city.world?.trees?.quality ?? null,
            placements: cloneJsonValue(city.world?.trees?.placements ?? [])
        }
    };
}
