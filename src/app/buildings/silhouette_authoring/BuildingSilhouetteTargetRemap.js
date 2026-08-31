// Deterministic materialization of silhouette target-review decisions into Building v2 config consumers.
// @ts-check

import { SILHOUETTE_REMAP_DECISION } from './BuildingLayerSilhouetteModel.js';
import {
    balconyContinuityEndpointKey,
    validateBalconyContinuityConfig
} from '../BalconyContinuityModel.js';
import { normalizeBalconyConfig } from '../BayBalconyModel.js';

function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function deepClone(value) {
    if (Array.isArray(value)) return value.map((entry) => deepClone(entry));
    if (isObject(value)) {
        const out = {};
        for (const [key, entry] of Object.entries(value)) out[key] = deepClone(entry);
        return out;
    }
    return value;
}

function isRunId(value) {
    return typeof value === 'string' && value.length === 1 && value >= 'A' && value <= 'Z';
}

function pathText(path) {
    return (Array.isArray(path) ? path : []).map((entry) => String(entry)).join('.');
}

function getAtPath(root, path) {
    let value = root;
    for (const part of Array.isArray(path) ? path : []) {
        if (!value || typeof value !== 'object' || !Object.hasOwn(value, part)) return undefined;
        value = value[part];
    }
    return value;
}

function setAtPath(root, path, value) {
    const parts = Array.isArray(path) ? path : [];
    if (!parts.length) return false;
    const parent = getAtPath(root, parts.slice(0, -1));
    if (!parent || typeof parent !== 'object') return false;
    parent[parts[parts.length - 1]] = value;
    return true;
}

function deleteAtPath(root, path) {
    const parts = Array.isArray(path) ? path : [];
    if (!parts.length) return false;
    const parent = getAtPath(root, parts.slice(0, -1));
    if (!parent || typeof parent !== 'object') return false;
    const last = parts[parts.length - 1];
    if (Array.isArray(parent) && Number.isInteger(Number(last))) {
        const index = Number(last);
        if (index < 0 || index >= parent.length) return false;
        parent.splice(index, 1);
        return true;
    }
    if (!Object.hasOwn(parent, last)) return false;
    delete parent[last];
    return true;
}

function floorLayer(config, layerId) {
    return (Array.isArray(config?.layers) ? config.layers : [])
        .find((entry) => entry?.type === 'floor' && entry?.id === layerId) ?? null;
}

function facadeScope(config, layerId) {
    const root = isObject(config?.facades) ? config.facades : null;
    if (!root) return { scope: 'layer', container: null };
    if (Object.keys(root).some(isRunId)) return { scope: 'global', container: root };
    return {
        scope: 'layer',
        container: isObject(root[layerId]) ? root[layerId] : null
    };
}

function uniqueRunIds(values) {
    return [...new Set((Array.isArray(values) ? values : []).filter(isRunId))].sort();
}

function referencedRunIds(value, { ignoreDerived = true } = {}) {
    const ids = [];
    const seen = new Set();
    const visit = (entry, key = '', parentKey = '', depth = 0) => {
        if (depth > 16 || entry == null) return;
        if (typeof entry === 'string') {
            if (/(^|_)(run|face)id$/i.test(key) || /^(master|target|source|from|to)(Run|Face)Id$/.test(key)) {
                if (isRunId(entry)) ids.push(entry);
            } else if (/(bayref|bandid)$/i.test(key)) {
                const runId = entry.split(':')[0];
                if (isRunId(runId)) ids.push(runId);
            }
            return;
        }
        if (typeof entry !== 'object' || seen.has(entry)) return;
        seen.add(entry);
        if (Array.isArray(entry)) {
            for (const item of entry) {
                if (typeof item === 'string' && /(runids|faceids)$/i.test(key)) {
                    if (isRunId(item)) ids.push(item);
                } else if (typeof item === 'string' && /(bayrefs|bandids)$/i.test(key)) {
                    const runId = item.split(':')[0];
                    if (isRunId(runId)) ids.push(runId);
                } else {
                    visit(item, key, parentKey, depth + 1);
                }
            }
            return;
        }
        for (const [childKey, child] of Object.entries(entry)) {
            if (ignoreDerived && childKey === 'autoCorner') continue;
            if (/by(bayref|bandid)/i.test(key)) {
                const runId = childKey.split(':')[0];
                if (isRunId(runId)) ids.push(runId);
            }
            visit(child, childKey, key, depth + 1);
        }
    };
    visit(value);
    return uniqueRunIds(ids);
}

function explicitLayerIds(value) {
    const ids = [];
    const seen = new Set();
    const visit = (entry, key = '', depth = 0) => {
        if (depth > 12 || entry == null) return;
        if (typeof entry === 'string') {
            if (key === 'layerId' && entry) ids.push(entry);
            return;
        }
        if (typeof entry !== 'object' || seen.has(entry)) return;
        seen.add(entry);
        if (Array.isArray(entry)) {
            if (key === 'layerIds') {
                for (const item of entry) if (typeof item === 'string' && item) ids.push(item);
            } else {
                for (const item of entry) visit(item, key, depth + 1);
            }
            return;
        }
        for (const [childKey, child] of Object.entries(entry)) visit(child, childKey, depth + 1);
    };
    visit(value);
    return [...new Set(ids)];
}

function entityAppliesToLayer(value, layerId) {
    const layerIds = explicitLayerIds(value);
    return !layerIds.length || layerIds.includes(layerId);
}

function collectEntityTargets(root, rootPath, kind, layerId, add) {
    const visit = (value, path, arrayMember = false) => {
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value)) {
            value.forEach((entry, index) => visit(entry, [...path, index], true));
            return;
        }
        const runIds = referencedRunIds(value);
        const hasIdentity = typeof value.id === 'string' && !!value.id;
        const directRunIds = referencedRunIds(Object.fromEntries(
            Object.entries(value).filter(([, entry]) => typeof entry !== 'object' || entry === null)
        ));
        if (runIds.length && entityAppliesToLayer(value, layerId) && (arrayMember || hasIdentity || directRunIds.length)) {
            const ownerId = hasIdentity ? value.id : pathText(path);
            add({
                kind,
                targetId: `${kind}:${layerId}:${path.slice(1).map(String).join(':')}:${ownerId}`,
                layerId,
                faceIds: runIds,
                locator: {
                    type: 'entity',
                    path: [...path],
                    ownerId
                }
            });
            return;
        }
        for (const [key, entry] of Object.entries(value)) visit(entry, [...path, key], false);
    };
    visit(root, rootPath, false);
}

/**
 * Collects every persisted Building v2 consumer affected by one floor layer's
 * stable face identities. Locators are opaque review metadata and contain no
 * mutable payload snapshots.
 */
export function collectBuildingSilhouetteRemapTargets(config, layerId) {
    const layer = floorLayer(config, layerId);
    if (!layer) return [];
    const targets = [];
    const seen = new Set();
    const add = (target) => {
        const targetId = typeof target?.targetId === 'string' ? target.targetId : '';
        if (!targetId || seen.has(targetId)) return;
        seen.add(targetId);
        targets.push(target);
    };

    const facadeInfo = facadeScope(config, layerId);
    for (const faceId of Object.keys(facadeInfo.container ?? {}).filter(isRunId).sort()) {
        add({
            kind: 'facade_layout',
            targetId: `facade:${layerId}:${faceId}`,
            layerId,
            faceId,
            locator: { type: 'facade', scope: facadeInfo.scope, sourceKey: faceId }
        });
    }
    for (const faceId of Object.keys(isObject(layer.faceMaterials) ? layer.faceMaterials : {}).filter(isRunId).sort()) {
        add({
            kind: 'face_material',
            targetId: `face_material:${layerId}:${faceId}`,
            layerId,
            faceId,
            locator: { type: 'face_material', sourceKey: faceId }
        });
    }
    for (const slaveFaceId of Object.keys(isObject(layer?.faceLinking?.links) ? layer.faceLinking.links : {}).filter(isRunId).sort()) {
        const masterFaceId = layer.faceLinking.links[slaveFaceId];
        if (!isRunId(masterFaceId)) continue;
        add({
            kind: 'face_link',
            targetId: `face_link:${layerId}:${slaveFaceId}`,
            layerId,
            sourceFaceId: slaveFaceId,
            targetFaceId: masterFaceId,
            locator: { type: 'face_link', sourceKey: slaveFaceId }
        });
    }
    const continuityLinks = Array.isArray(layer?.balconyContinuity?.links)
        ? layer.balconyContinuity.links
        : [];
    for (const link of continuityLinks) {
        const linkId = typeof link?.id === 'string' ? link.id.trim() : '';
        if (!linkId) continue;
        const faceIds = uniqueRunIds((Array.isArray(link?.endpoints) ? link.endpoints : [])
            .map((endpoint) => endpoint?.faceId));
        if (!faceIds.length) continue;
        add({
            kind: 'balcony_continuity_link',
            targetId: `balcony_continuity:${layerId}:${linkId}`,
            layerId,
            faceIds,
            locator: {
                type: 'balcony_continuity_link',
                sourceId: linkId
            }
        });
    }

    collectEntityTargets(config?.wallDecorations, ['wallDecorations'], 'decoration', layerId, add);
    collectEntityTargets(config?.attachments, ['attachments'], 'attachment', layerId, add);

    const stretch = isObject(config?.footprintStretch) ? config.footprintStretch : null;
    const faces = isObject(stretch?.faces) ? stretch.faces : null;
    for (const runId of Object.keys(faces ?? {}).filter(isRunId).sort()) {
        add({
            kind: 'stretch_preference',
            targetId: `stretch_face:${layerId}:${runId}`,
            layerId,
            runId,
            locator: { type: 'stretch_face', sourceKey: runId }
        });
    }
    const bands = isObject(stretch?.bands) ? stretch.bands : null;
    for (const bandId of Object.keys(bands ?? {}).sort()) {
        const runId = bandId.split(':')[0];
        if (!isRunId(runId)) continue;
        add({
            kind: 'stretch_band',
            targetId: `stretch_band:${layerId}:${bandId}`,
            layerId,
            runId,
            bandId,
            locator: { type: 'stretch_band', sourceKey: bandId }
        });
    }
    if (stretch && !faces && !bands) {
        for (const bandId of Object.keys(stretch).sort()) {
            const runId = bandId.split(':')[0];
            if (!isRunId(runId)) continue;
            add({
                kind: 'stretch_band',
                targetId: `stretch_legacy:${layerId}:${bandId}`,
                layerId,
                runId,
                bandId,
                locator: { type: 'stretch_legacy', sourceKey: bandId }
            });
        }
    }
    return targets;
}

function mappingsOf(entry) {
    const mappings = Array.isArray(entry?.orientationMappings) ? entry.orientationMappings : [];
    return mappings.filter((mapping) => isRunId(mapping?.sourceRunId) && isRunId(mapping?.targetRunId));
}

function replacementMap(entry) {
    return new Map(mappingsOf(entry).map((mapping) => [mapping.sourceRunId, mapping.targetRunId]));
}

function mappedRunId(entry, sourceRunId) {
    return replacementMap(entry).get(sourceRunId) ?? sourceRunId;
}

function mappingReverses(entry, sourceRunId) {
    const mapping = mappingsOf(entry).find((candidate) => candidate.sourceRunId === sourceRunId);
    return !!mapping?.affected && !!mapping?.reverseLocalU;
}

function remapBalconyContinuityLinkPayload(entry, value) {
    const link = isObject(value) ? value : null;
    if (!link || typeof link.id !== 'string' || !link.id || !Array.isArray(link.endpoints) || link.endpoints.length !== 2) {
        return { valid: false, reason: 'balcony_continuity_link_invalid' };
    }
    const affectedRunIds = new Set([
        ...(Array.isArray(entry?.missingRunIds) ? entry.missingRunIds : []),
        ...(Array.isArray(entry?.incompatibleRunIds) ? entry.incompatibleRunIds : [])
    ]);
    const mappings = mappingsOf(entry);
    const endpoints = [];
    for (const endpoint of link.endpoints) {
        const faceId = endpoint?.faceId;
        const bayId = typeof endpoint?.bayId === 'string' ? endpoint.bayId : '';
        const edge = endpoint?.edge;
        if (!isRunId(faceId) || !bayId || (edge !== 'start' && edge !== 'end')) {
            return { valid: false, reason: 'balcony_continuity_endpoint_invalid' };
        }
        const mapping = mappings.find((candidate) => candidate.sourceRunId === faceId);
        if (affectedRunIds.has(faceId) && !mapping?.affected) {
            return { valid: false, reason: 'balcony_continuity_endpoint_mapping_missing' };
        }
        const targetFaceId = mapping?.affected ? mapping.targetRunId : faceId;
        if (!isRunId(targetFaceId)) {
            return { valid: false, reason: 'balcony_continuity_endpoint_mapping_invalid' };
        }
        endpoints.push({
            faceId: targetFaceId,
            bayId,
            edge: mapping?.affected && mapping.reverseLocalU
                ? (edge === 'start' ? 'end' : 'start')
                : edge
        });
    }
    const endpointKeys = endpoints.map((endpoint) => balconyContinuityEndpointKey(endpoint));
    if (endpointKeys.some((key) => !key) || new Set(endpointKeys).size !== endpointKeys.length) {
        return { valid: false, reason: 'balcony_continuity_endpoint_collision_after_remap' };
    }
    return { valid: true, payload: { id: link.id, endpoints } };
}

function resolveBalconyContinuityFacade(config, layerId, faceId) {
    const layer = floorLayer(config, layerId);
    const links = isObject(layer?.faceLinking?.links) ? layer.faceLinking.links : null;
    const seen = new Set();
    let current = faceId;
    for (let index = 0; index < 32; index += 1) {
        if (!isRunId(current) || seen.has(current)) return null;
        seen.add(current);
        const next = links?.[current];
        if (!isRunId(next) || next === current) break;
        current = next;
    }
    const facades = facadeScope(config, layerId).container;
    return isObject(facades?.[current]) ? facades[current] : null;
}

function resolveAuthoredBalconyBay(facade, bayId) {
    const bays = Array.isArray(facade?.layout?.bays?.items) ? facade.layout.bays.items : [];
    const matches = bays.filter((bay) => bay?.id === bayId);
    if (matches.length !== 1) return { count: matches.length, bay: null };
    const byId = new Map(bays
        .filter((bay) => typeof bay?.id === 'string' && bay.id)
        .map((bay) => [bay.id, bay]));
    const original = matches[0];
    const seen = new Set();
    let current = original;
    for (let index = 0; index < 32; index += 1) {
        const currentId = typeof current?.id === 'string' ? current.id : '';
        if (!currentId || seen.has(currentId)) return { count: 1, bay: original };
        seen.add(currentId);
        const nextId = typeof current?.linkFromBayId === 'string' && current.linkFromBayId
            ? current.linkFromBayId
            : (typeof current?.materialLinkFromBayId === 'string' ? current.materialLinkFromBayId : '');
        if (!nextId || nextId === currentId) return { count: 1, bay: current };
        const next = byId.get(nextId);
        if (!next) return { count: 1, bay: current };
        current = next;
    }
    return { count: 1, bay: original };
}

function balconyContinuityMaterializationDiagnostic(code, message, {
    linkId,
    linkIndex,
    endpointIndex = null
}) {
    return {
        severity: 'error',
        code,
        message,
        linkId,
        linkIndex,
        ...(Number.isInteger(endpointIndex) ? { endpointIndex } : {})
    };
}

function validateMaterializedBalconyContinuity(config, layerId) {
    const layer = floorLayer(config, layerId);
    const structural = validateBalconyContinuityConfig(layer?.balconyContinuity);
    const diagnostics = [...structural.diagnostics];
    if (!structural.config) return { valid: structural.valid, diagnostics };

    structural.config.links.forEach((link, linkIndex) => {
        if (diagnostics.some((entry) => entry.linkIndex === linkIndex)) return;
        link.endpoints.forEach((endpoint, endpointIndex) => {
            const facade = resolveBalconyContinuityFacade(config, layerId, endpoint.faceId);
            if (!facade) {
                diagnostics.push(balconyContinuityMaterializationDiagnostic(
                    'balcony_continuity_destination_facade_missing',
                    `Link "${link.id}" cannot resolve physical face ${endpoint.faceId} to an authored facade after remap.`,
                    { linkId: link.id, linkIndex, endpointIndex }
                ));
                return;
            }
            const resolved = resolveAuthoredBalconyBay(facade, endpoint.bayId);
            if (resolved.count !== 1) {
                const code = resolved.count > 1
                    ? 'balcony_continuity_destination_bay_ambiguous'
                    : 'balcony_continuity_destination_bay_missing';
                diagnostics.push(balconyContinuityMaterializationDiagnostic(
                    code,
                    `Link "${link.id}" ${resolved.count > 1 ? 'matches multiple authored bays for' : 'cannot find authored bay'} ${endpoint.faceId}:${endpoint.bayId} after remap.`,
                    { linkId: link.id, linkIndex, endpointIndex }
                ));
                return;
            }
            if (!normalizeBalconyConfig(resolved.bay?.balcony)) {
                diagnostics.push(balconyContinuityMaterializationDiagnostic(
                    'balcony_continuity_destination_has_no_balcony',
                    `Link "${link.id}" targets ${endpoint.faceId}:${endpoint.bayId}, whose effective authored bay has no enabled balcony after remap.`,
                    { linkId: link.id, linkIndex, endpointIndex }
                ));
            }
        });
    });
    return { valid: diagnostics.length === 0, diagnostics };
}

function mapReferenceString(value, key, replacements) {
    if (typeof value !== 'string') return value;
    if (/(^|_)(run|face)id$/i.test(key) || /^(master|target|source|from|to)(Run|Face)Id$/.test(key)) {
        return replacements.get(value) ?? value;
    }
    if (/(bayref|bandid)$/i.test(key)) {
        const separator = value.indexOf(':');
        const runId = separator >= 0 ? value.slice(0, separator) : value;
        const mapped = replacements.get(runId) ?? runId;
        return separator >= 0 ? `${mapped}${value.slice(separator)}` : mapped;
    }
    return value;
}

function rewriteReferences(value, replacements, key = '') {
    if (typeof value === 'string') return mapReferenceString(value, key, replacements);
    if (Array.isArray(value)) {
        return value.map((entry) => {
            if (typeof entry !== 'string') return rewriteReferences(entry, replacements, key);
            if (/(runids|faceids)$/i.test(key)) return replacements.get(entry) ?? entry;
            if (/(bayrefs|bandids)$/i.test(key)) return mapReferenceString(entry, key.slice(0, -1), replacements);
            return entry;
        });
    }
    if (!isObject(value)) return value;
    const out = {};
    for (const [childKey, child] of Object.entries(value)) {
        if (childKey === 'autoCorner') continue;
        if (/by(bayref|bandid)/i.test(key) && typeof childKey === 'string') {
            const mappedKey = mapReferenceString(childKey, key.slice(2), replacements);
            out[mappedKey] = rewriteReferences(child, replacements, childKey);
        } else {
            out[childKey] = rewriteReferences(child, replacements, childKey);
        }
    }
    return out;
}

function mirrorUnitSpans(value) {
    if (Array.isArray(value)) return value.map((entry) => mirrorUnitSpans(entry));
    if (!isObject(value)) return value;
    const out = {};
    for (const [key, entry] of Object.entries(value)) out[key] = mirrorUnitSpans(entry);
    if (isObject(value.span)) {
        const start = Number(value.span.start);
        const end = Number(value.span.end);
        if (Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end <= 1) {
            out.span = { ...out.span, start: 1 - end, end: 1 - start };
        }
    }
    if (Number.isFinite(Number(value.sideOffsetMeters))) out.sideOffsetMeters = -Number(value.sideOffsetMeters);
    return out;
}

function swapPair(objectValue, leftKey, rightKey) {
    if (!isObject(objectValue)) return;
    const hasLeft = Object.hasOwn(objectValue, leftKey);
    const hasRight = Object.hasOwn(objectValue, rightKey);
    if (!hasLeft && !hasRight) return;
    const left = objectValue[leftKey];
    const right = objectValue[rightKey];
    if (hasRight) objectValue[leftKey] = right;
    else delete objectValue[leftKey];
    if (hasLeft) objectValue[rightKey] = left;
    else delete objectValue[rightKey];
}

function mirrorDirectionalFields(value) {
    if (Array.isArray(value)) return value.map((entry) => mirrorDirectionalFields(entry));
    if (!isObject(value)) return value;
    const out = {};
    for (const [key, entry] of Object.entries(value)) out[key] = mirrorDirectionalFields(entry);
    swapPair(out, 'left', 'right');
    swapPair(out, 'leftMeters', 'rightMeters');
    swapPair(out, 'marginLeft', 'marginRight');
    swapPair(out, 'paddingLeftMeters', 'paddingRightMeters');
    swapPair(out, 'depthStartMeters', 'depthEndMeters');
    return out;
}

function reversePatternItems(items) {
    return (Array.isArray(items) ? items : []).slice().reverse().map((item) => {
        const next = mirrorDirectionalFields(item);
        if (next?.type === 'group' && Array.isArray(next.items)) next.items = reversePatternItems(next.items);
        return next;
    });
}

function reverseFacadeLocalU(value) {
    const out = mirrorDirectionalFields(deepClone(value));
    if (Array.isArray(out?.layout?.bays?.items)) out.layout.bays.items.reverse();
    if (Array.isArray(out?.layout?.pattern?.items)) out.layout.pattern.items = reversePatternItems(out.layout.pattern.items);
    if (Array.isArray(out?.layout?.items)) out.layout.items.reverse();
    return out;
}

function promoteGlobalFacades(config) {
    const info = facadeScope(config, '');
    if (info.scope !== 'global' || !info.container) return false;
    const global = deepClone(info.container);
    const byLayerId = {};
    for (const layer of Array.isArray(config?.layers) ? config.layers : []) {
        if (layer?.type !== 'floor' || typeof layer?.id !== 'string' || !layer.id) continue;
        byLayerId[layer.id] = deepClone(global);
    }
    config.facades = byLayerId;
    return true;
}

function ensureLayerFacadeContainer(config, layerId) {
    if (facadeScope(config, layerId).scope === 'global') promoteGlobalFacades(config);
    if (!isObject(config.facades)) config.facades = {};
    if (!isObject(config.facades[layerId])) config.facades[layerId] = {};
    return config.facades[layerId];
}

function sourcePayload(config, layerId, target) {
    const locator = isObject(target?.locator) ? target.locator : null;
    const layer = floorLayer(config, layerId);
    if (!locator) return { exists: false, payload: undefined, path: [] };
    if (locator.type === 'facade') {
        const info = facadeScope(config, layerId);
        const exists = !!info.container && Object.hasOwn(info.container, locator.sourceKey);
        return {
            exists,
            payload: exists ? deepClone(info.container[locator.sourceKey]) : undefined,
            path: info.scope === 'global'
                ? ['facades', locator.sourceKey]
                : ['facades', layerId, locator.sourceKey]
        };
    }
    if (locator.type === 'face_material') {
        const container = isObject(layer?.faceMaterials) ? layer.faceMaterials : null;
        const exists = !!container && Object.hasOwn(container, locator.sourceKey);
        return { exists, payload: exists ? deepClone(container[locator.sourceKey]) : undefined, path: ['layers', layerId, 'faceMaterials', locator.sourceKey] };
    }
    if (locator.type === 'face_link') {
        const links = isObject(layer?.faceLinking?.links) ? layer.faceLinking.links : null;
        const exists = !!links && Object.hasOwn(links, locator.sourceKey);
        const reverse = !!layer?.faceLinking?.reverseByFace?.[locator.sourceKey];
        return {
            exists,
            payload: exists ? { slaveFaceId: locator.sourceKey, masterFaceId: links[locator.sourceKey], reverseLocalU: reverse } : undefined,
            path: ['layers', layerId, 'faceLinking', 'links', locator.sourceKey]
        };
    }
    if (locator.type === 'balcony_continuity_link') {
        const links = Array.isArray(layer?.balconyContinuity?.links) ? layer.balconyContinuity.links : [];
        const matches = links
            .map((link, index) => ({ link, index }))
            .filter((entry) => entry.link?.id === locator.sourceId);
        const layerIndex = (Array.isArray(config?.layers) ? config.layers : [])
            .findIndex((entry) => entry?.type === 'floor' && entry?.id === layerId);
        const exists = matches.length === 1 && layerIndex >= 0;
        return {
            exists,
            payload: exists ? deepClone(matches[0].link) : undefined,
            path: exists
                ? ['layers', layerIndex, 'balconyContinuity', 'links', matches[0].index]
                : []
        };
    }
    if (locator.type === 'entity') {
        const payload = getAtPath(config, locator.path);
        return { exists: payload !== undefined, payload: deepClone(payload), path: [...locator.path] };
    }
    const container = locator.type === 'stretch_face'
        ? config?.footprintStretch?.faces
        : (locator.type === 'stretch_band'
            ? config?.footprintStretch?.bands
            : config?.footprintStretch);
    const exists = isObject(container) && Object.hasOwn(container, locator.sourceKey);
    const basePath = locator.type === 'stretch_face'
        ? ['footprintStretch', 'faces']
        : (locator.type === 'stretch_band' ? ['footprintStretch', 'bands'] : ['footprintStretch']);
    return {
        exists,
        payload: exists ? deepClone(container[locator.sourceKey]) : undefined,
        path: [...basePath, locator.sourceKey]
    };
}

function archiveEntry(entry, source, { reason, disposition = 'orphaned', displacedPath = null } = {}) {
    return {
        targetId: entry?.targetId ?? '',
        kind: entry?.kind ?? 'target',
        decision: entry?.decision ?? SILHOUETTE_REMAP_DECISION.ORPHAN,
        disposition,
        reason: reason ?? 'explicit_orphan',
        sourcePath: pathText(source?.path),
        ...(displacedPath ? { displacedPath: pathText(displacedPath) } : {}),
        payload: deepClone(source?.payload)
    };
}

function resolvedTarget(entry) {
    return isObject(entry?.target) ? entry.target : entry;
}

function dispositionForDecision(decision) {
    return decision === SILHOUETTE_REMAP_DECISION.REMOVE || decision === 'discard'
        ? 'removed'
        : 'orphaned';
}

function destinationKeyFor(entry, sourceKey) {
    return mappedRunId(entry, sourceKey);
}

function compareRemovalPaths(a, b) {
    if (a.path.length !== b.path.length) return b.path.length - a.path.length;
    const aLast = a.path[a.path.length - 1];
    const bLast = b.path[b.path.length - 1];
    if (Number.isInteger(Number(aLast)) && Number.isInteger(Number(bLast))) return Number(bLast) - Number(aLast);
    return pathText(b.path).localeCompare(pathText(a.path));
}

function uniqueRecords(records) {
    const out = [];
    const seen = new Set();
    for (const record of records) {
        const key = JSON.stringify(record);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(record);
    }
    return out;
}

function createTargetRemap(resolution, applied, orphaned, unresolved, existingTargetRemap = null) {
    const base = isObject(resolution?.targetRemap)
        ? deepClone(resolution.targetRemap)
        : {
            version: 1,
            decisions: {},
            resolved: deepClone(resolution?.resolved ?? []),
            unresolved: deepClone(resolution?.unresolved ?? [])
        };
    const existing = isObject(existingTargetRemap) ? deepClone(existingTargetRemap) : {};
    const currentResolvedIds = new Set((Array.isArray(base.resolved) ? base.resolved : [])
        .map((entry) => entry?.targetId)
        .filter(Boolean));
    const combinedResolved = [
        ...(Array.isArray(existing.resolved) ? existing.resolved : [])
            .filter((entry) => !currentResolvedIds.has(entry?.targetId)),
        ...(Array.isArray(base.resolved) ? base.resolved : [])
    ];
    const combinedUnresolved = uniqueRecords([
        ...(Array.isArray(existing.unresolved) ? existing.unresolved : [])
            .filter((entry) => !currentResolvedIds.has(entry?.targetId)),
        ...(Array.isArray(base.unresolved) ? base.unresolved : []),
        ...unresolved
    ]);
    const combinedOrphaned = uniqueRecords([
        ...(Array.isArray(existing.orphaned) ? existing.orphaned : []),
        ...orphaned
    ]);
    const combinedApplied = uniqueRecords([
        ...(Array.isArray(existing?.materialization?.applied) ? existing.materialization.applied : []),
        ...applied
    ]);
    return {
        ...existing,
        ...base,
        version: 1,
        decisions: {
            ...(isObject(existing.decisions) ? existing.decisions : {}),
            ...(isObject(base.decisions) ? base.decisions : {})
        },
        resolved: combinedResolved,
        unresolved: combinedUnresolved,
        orphaned: combinedOrphaned,
        materialization: {
            version: 1,
            applied: combinedApplied,
            orphaned: deepClone(combinedOrphaned),
            unresolved: deepClone(unresolved)
        }
    };
}

/**
 * Applies a canonical `applySilhouetteRemapDecisions` result to a cloned
 * Building v2 config. Orphan/remove/conflict payloads remain recoverable in
 * the returned target-remap ledger; the input config is never mutated.
 */
export function materializeBuildingSilhouetteTargetRemap(config, {
    layerId,
    resolution,
    existingTargetRemap = null
} = {}) {
    const sourceConfig = deepClone(config ?? {});
    const nextConfig = deepClone(sourceConfig);
    const resolved = Array.isArray(resolution?.resolved) ? resolution.resolved : [];
    const applied = [];
    const orphaned = [];
    const unresolved = [];
    const removals = [];
    const keyedJobs = [];
    const balconyContinuityRemaps = [];
    let promotedGlobalFacades = resolved.some((entry) => {
        const target = resolvedTarget(entry);
        return entry?.decision !== SILHOUETTE_REMAP_DECISION.KEEP
            && entry?.decision !== SILHOUETTE_REMAP_DECISION.RETAIN
            && target?.locator?.type === 'facade'
            && facadeScope(nextConfig, layerId).scope === 'global';
    }) ? promoteGlobalFacades(nextConfig) : false;

    for (const entry of resolved) {
        const decision = entry?.decision;
        if (decision === SILHOUETTE_REMAP_DECISION.KEEP || decision === SILHOUETTE_REMAP_DECISION.RETAIN) continue;
        const target = resolvedTarget(entry);
        const locator = isObject(target?.locator) ? target.locator : null;
        if (!locator) {
            applied.push({
                targetId: entry?.targetId ?? '',
                kind: entry?.kind ?? 'target',
                decision,
                effect: 'document_or_external_consumer'
            });
            continue;
        }
        const source = sourcePayload(sourceConfig, layerId, target);
        if (!source.exists) {
            unresolved.push({
                targetId: entry?.targetId ?? '',
                kind: entry?.kind ?? 'target',
                reason: 'materialization_source_missing',
                target: deepClone(target)
            });
            continue;
        }
        if (decision === SILHOUETTE_REMAP_DECISION.ORPHAN
            || decision === SILHOUETTE_REMAP_DECISION.REMOVE
            || decision === 'discard') {
            orphaned.push(archiveEntry(entry, source, {
                reason: decision === SILHOUETTE_REMAP_DECISION.ORPHAN ? 'explicit_orphan' : 'deliberate_removal',
                disposition: dispositionForDecision(decision)
            }));
            const path = locator.type === 'facade' && promotedGlobalFacades
                ? ['facades', layerId, locator.sourceKey]
                : source.path;
            removals.push({ entry, target, source, locator, path });
            continue;
        }
        if (decision !== SILHOUETTE_REMAP_DECISION.REMAP) continue;
        if (locator.type === 'balcony_continuity_link') {
            const remapped = remapBalconyContinuityLinkPayload(entry, source.payload);
            if (!remapped.valid || !setAtPath(nextConfig, source.path, remapped.payload)) {
                const reason = remapped.reason ?? 'balcony_continuity_materialization_path_missing';
                orphaned.push(archiveEntry(entry, source, { reason, disposition: 'orphaned' }));
                unresolved.push({
                    targetId: entry?.targetId ?? '',
                    kind: entry?.kind ?? 'target',
                    reason,
                    target: deepClone(target)
                });
                removals.push({ entry, target, source, locator, path: source.path });
                continue;
            }
            balconyContinuityRemaps.push({
                entry,
                target,
                source,
                linkId: remapped.payload.id
            });
            applied.push({
                targetId: entry?.targetId ?? '',
                kind: entry?.kind ?? 'target',
                decision,
                effect: 'remap_balcony_continuity_link',
                sourcePath: pathText(source.path),
                resolvedRunIds: deepClone(entry.resolvedRunIds ?? []),
                reverseLocalU: remapped.payload.endpoints.some((endpoint, index) => (
                    endpoint.edge !== source.payload.endpoints[index].edge
                ))
            });
            continue;
        }
        if (locator.type === 'entity') {
            const replacements = replacementMap(entry);
            const originalRefs = referencedRunIds(source.payload);
            const reverseFlags = originalRefs.map((runId) => mappingReverses(entry, runId));
            let payload = rewriteReferences(source.payload, replacements);
            const hasReverse = reverseFlags.some(Boolean);
            const hasForward = reverseFlags.some((flag) => !flag);
            if (hasReverse && hasForward) {
                const isDecorationSet = source.path[0] === 'wallDecorations'
                    && source.path[1] === 'sets'
                    && Array.isArray(source.payload?.target?.bayRefs);
                if (!isDecorationSet) {
                    unresolved.push({
                        targetId: entry?.targetId ?? '',
                        kind: entry?.kind ?? 'target',
                        reason: 'mixed_local_u_orientation_requires_split',
                        target: deepClone(target)
                    });
                    continue;
                }
                const directRefs = source.payload.target.bayRefs;
                const ordinaryRefs = directRefs.filter((ref) => !mappingReverses(entry, String(ref).split(':')[0]));
                const mirroredRefs = directRefs.filter((ref) => mappingReverses(entry, String(ref).split(':')[0]));
                const ordinary = rewriteReferences(source.payload, replacements);
                ordinary.target.bayRefs = ordinaryRefs.map((ref) => mapReferenceString(ref, 'bayRef', replacements));
                const mirrored = mirrorUnitSpans(rewriteReferences(source.payload, replacements));
                mirrored.target.bayRefs = mirroredRefs.map((ref) => mapReferenceString(ref, 'bayRef', replacements));
                mirrored.id = `${String(source.payload.id ?? 'decoration_set')}__silhouette_${String(entry.targetId ?? 'remap').replace(/[^a-z0-9]+/gi, '_')}`;
                const parent = getAtPath(nextConfig, source.path.slice(0, -1));
                if (!Array.isArray(parent)) {
                    unresolved.push({ targetId: entry?.targetId ?? '', kind: entry?.kind ?? 'target', reason: 'decoration_split_parent_missing' });
                    continue;
                }
                parent[source.path[source.path.length - 1]] = ordinary;
                parent.splice(Number(source.path[source.path.length - 1]) + 1, 0, mirrored);
                applied.push({
                    targetId: entry?.targetId ?? '',
                    kind: entry?.kind ?? 'target',
                    decision,
                    effect: 'split_and_rekey_references',
                    sourcePath: pathText(source.path),
                    resolvedRunIds: deepClone(entry.resolvedRunIds ?? []),
                    reverseLocalU: true
                });
                continue;
            }
            if (hasReverse) payload = mirrorUnitSpans(payload);
            if (!setAtPath(nextConfig, source.path, payload)) {
                unresolved.push({ targetId: entry?.targetId ?? '', kind: entry?.kind ?? 'target', reason: 'materialization_path_missing' });
                continue;
            }
            applied.push({
                targetId: entry?.targetId ?? '',
                kind: entry?.kind ?? 'target',
                decision,
                effect: 'rekey_references',
                sourcePath: pathText(source.path),
                resolvedRunIds: deepClone(entry.resolvedRunIds ?? []),
                reverseLocalU: hasReverse
            });
            continue;
        }
        keyedJobs.push({ entry, target, source, locator });
    }

    for (const job of keyedJobs) {
        const { locator, source } = job;
        if (locator.type === 'facade') {
            if (facadeScope(nextConfig, layerId).scope === 'global') promotedGlobalFacades = promoteGlobalFacades(nextConfig) || promotedGlobalFacades;
            delete ensureLayerFacadeContainer(nextConfig, layerId)[locator.sourceKey];
        } else if (locator.type === 'face_material') {
            const layer = floorLayer(nextConfig, layerId);
            if (isObject(layer?.faceMaterials)) delete layer.faceMaterials[locator.sourceKey];
        } else if (locator.type === 'face_link') {
            const layer = floorLayer(nextConfig, layerId);
            if (isObject(layer?.faceLinking?.links)) delete layer.faceLinking.links[locator.sourceKey];
            if (isObject(layer?.faceLinking?.reverseByFace)) delete layer.faceLinking.reverseByFace[locator.sourceKey];
        } else {
            deleteAtPath(nextConfig, source.path);
        }
    }

    for (const job of keyedJobs) {
        const { entry, locator, source } = job;
        if (locator.type === 'facade') {
            const destinationKey = destinationKeyFor(entry, locator.sourceKey);
            const container = ensureLayerFacadeContainer(nextConfig, layerId);
            if (Object.hasOwn(container, destinationKey)) {
                orphaned.push(archiveEntry(entry, {
                    payload: container[destinationKey],
                    path: ['facades', layerId, destinationKey]
                }, {
                    reason: 'remap_destination_conflict',
                    disposition: 'displaced',
                    displacedPath: ['facades', layerId, destinationKey]
                }));
            }
            container[destinationKey] = mappingReverses(entry, locator.sourceKey)
                ? reverseFacadeLocalU(source.payload)
                : deepClone(source.payload);
            applied.push({
                targetId: entry.targetId,
                kind: entry.kind,
                decision: entry.decision,
                effect: 'move_facade_layout',
                sourcePath: pathText(source.path),
                destinationPath: pathText(['facades', layerId, destinationKey]),
                reverseLocalU: mappingReverses(entry, locator.sourceKey),
                ...(promotedGlobalFacades ? { promotedGlobalFacades: true } : {})
            });
            continue;
        }
        if (locator.type === 'face_material') {
            const destinationKey = destinationKeyFor(entry, locator.sourceKey);
            const layer = floorLayer(nextConfig, layerId);
            if (!isObject(layer.faceMaterials)) layer.faceMaterials = {};
            if (Object.hasOwn(layer.faceMaterials, destinationKey)) {
                orphaned.push(archiveEntry(entry, {
                    payload: layer.faceMaterials[destinationKey],
                    path: ['layers', layerId, 'faceMaterials', destinationKey]
                }, {
                    reason: 'remap_destination_conflict',
                    disposition: 'displaced',
                    displacedPath: ['layers', layerId, 'faceMaterials', destinationKey]
                }));
            }
            layer.faceMaterials[destinationKey] = deepClone(source.payload);
            applied.push({
                targetId: entry.targetId,
                kind: entry.kind,
                decision: entry.decision,
                effect: 'move_face_material',
                sourcePath: pathText(source.path),
                destinationPath: `layers.${layerId}.faceMaterials.${destinationKey}`
            });
            continue;
        }
        if (locator.type === 'face_link') {
            const sourceSlave = source.payload.slaveFaceId;
            const sourceMaster = source.payload.masterFaceId;
            const destinationSlave = mappedRunId(entry, sourceSlave);
            const destinationMaster = mappedRunId(entry, sourceMaster);
            if (destinationSlave === destinationMaster) {
                unresolved.push({
                    targetId: entry.targetId,
                    kind: entry.kind,
                    reason: 'face_link_self_reference_after_remap',
                    target: deepClone(resolvedTarget(entry))
                });
                continue;
            }
            const layer = floorLayer(nextConfig, layerId);
            if (!isObject(layer.faceLinking)) layer.faceLinking = {};
            if (!isObject(layer.faceLinking.links)) layer.faceLinking.links = {};
            if (Object.hasOwn(layer.faceLinking.links, destinationSlave)) {
                orphaned.push(archiveEntry(entry, {
                    payload: {
                        slaveFaceId: destinationSlave,
                        masterFaceId: layer.faceLinking.links[destinationSlave],
                        reverseLocalU: !!layer.faceLinking?.reverseByFace?.[destinationSlave]
                    },
                    path: ['layers', layerId, 'faceLinking', 'links', destinationSlave]
                }, {
                    reason: 'remap_destination_conflict',
                    disposition: 'displaced',
                    displacedPath: ['layers', layerId, 'faceLinking', 'links', destinationSlave]
                }));
            }
            layer.faceLinking.links[destinationSlave] = destinationMaster;
            const reverse = !!source.payload.reverseLocalU
                !== mappingReverses(entry, sourceSlave)
                !== mappingReverses(entry, sourceMaster);
            if (reverse) {
                if (!isObject(layer.faceLinking.reverseByFace)) layer.faceLinking.reverseByFace = {};
                layer.faceLinking.reverseByFace[destinationSlave] = true;
            } else if (isObject(layer.faceLinking.reverseByFace)) {
                delete layer.faceLinking.reverseByFace[destinationSlave];
                if (!Object.keys(layer.faceLinking.reverseByFace).length) delete layer.faceLinking.reverseByFace;
            }
            applied.push({
                targetId: entry.targetId,
                kind: entry.kind,
                decision: entry.decision,
                effect: 'move_face_link',
                sourcePath: pathText(source.path),
                destinationPath: `layers.${layerId}.faceLinking.links.${destinationSlave}`,
                reverseLocalU: reverse
            });
            continue;
        }
        const sourceKey = locator.sourceKey;
        const destinationRunId = destinationKeyFor(entry, String(sourceKey).split(':')[0]);
        let suffix = String(sourceKey).includes(':') ? String(sourceKey).slice(String(sourceKey).indexOf(':')) : '';
        if (mappingReverses(entry, String(sourceKey).split(':')[0])) {
            if (suffix === ':start') suffix = ':end';
            else if (suffix === ':end') suffix = ':start';
        }
        const destinationKey = `${destinationRunId}${suffix}`;
        const container = locator.type === 'stretch_face'
            ? nextConfig?.footprintStretch?.faces
            : (locator.type === 'stretch_band'
                ? nextConfig?.footprintStretch?.bands
                : nextConfig?.footprintStretch);
        if (!isObject(container)) {
            unresolved.push({ targetId: entry.targetId, kind: entry.kind, reason: 'stretch_container_missing' });
            continue;
        }
        if (Object.hasOwn(container, destinationKey)) {
            orphaned.push(archiveEntry(entry, {
                payload: container[destinationKey],
                path: [...source.path.slice(0, -1), destinationKey]
            }, {
                reason: 'remap_destination_conflict',
                disposition: 'displaced',
                displacedPath: [...source.path.slice(0, -1), destinationKey]
            }));
        }
        container[destinationKey] = deepClone(source.payload);
        applied.push({
            targetId: entry.targetId,
            kind: entry.kind,
            decision: entry.decision,
            effect: 'move_stretch_target',
            sourcePath: pathText(source.path),
            destinationPath: pathText([...source.path.slice(0, -1), destinationKey]),
            reverseLocalU: mappingReverses(entry, String(sourceKey).split(':')[0])
        });
    }

    for (const removal of removals.sort(compareRemovalPaths)) {
        const locator = removal.locator;
        let removed = false;
        if (locator.type === 'facade') {
            const container = ensureLayerFacadeContainer(nextConfig, layerId);
            removed = Object.hasOwn(container, locator.sourceKey);
            delete container[locator.sourceKey];
        } else if (locator.type === 'face_material') {
            const layer = floorLayer(nextConfig, layerId);
            removed = isObject(layer?.faceMaterials) && Object.hasOwn(layer.faceMaterials, locator.sourceKey);
            if (removed) delete layer.faceMaterials[locator.sourceKey];
        } else if (locator.type === 'face_link') {
            const layer = floorLayer(nextConfig, layerId);
            removed = isObject(layer?.faceLinking?.links) && Object.hasOwn(layer.faceLinking.links, locator.sourceKey);
            if (removed) delete layer.faceLinking.links[locator.sourceKey];
            if (isObject(layer?.faceLinking?.reverseByFace)) {
                delete layer.faceLinking.reverseByFace[locator.sourceKey];
                if (!Object.keys(layer.faceLinking.reverseByFace).length) delete layer.faceLinking.reverseByFace;
            }
        } else {
            removed = deleteAtPath(nextConfig, removal.path);
            if (removed && locator.type === 'balcony_continuity_link') {
                const layer = floorLayer(nextConfig, layerId);
                if (Array.isArray(layer?.balconyContinuity?.links) && !layer.balconyContinuity.links.length) {
                    delete layer.balconyContinuity;
                }
            }
        }
        if (!removed) {
            unresolved.push({
                targetId: removal.entry?.targetId ?? '',
                kind: removal.entry?.kind ?? 'target',
                reason: 'materialization_remove_path_missing',
                target: deepClone(removal.target)
            });
            continue;
        }
        applied.push({
            targetId: removal.entry?.targetId ?? '',
            kind: removal.entry?.kind ?? 'target',
            decision: removal.entry?.decision,
            effect: dispositionForDecision(removal.entry?.decision),
            sourcePath: pathText(removal.path)
        });
    }

    // Facade and face-link moves materialize after link payload rewrites, so
    // destination identity can only be checked once every keyed job/removal is
    // complete. Any failed remapped link is archived and removed atomically;
    // an existing conflicting link is left untouched.
    if (balconyContinuityRemaps.length) {
        const validation = validateMaterializedBalconyContinuity(nextConfig, layerId);
        for (const job of balconyContinuityRemaps) {
            const relevant = validation.diagnostics.filter((entry) => entry.linkId === job.linkId);
            if (!relevant.length) continue;

            const layer = floorLayer(nextConfig, layerId);
            const links = Array.isArray(layer?.balconyContinuity?.links)
                ? layer.balconyContinuity.links
                : [];
            const matches = links
                .map((link, index) => ({ link, index }))
                .filter((entry) => entry.link?.id === job.linkId);
            if (matches.length === 1) links.splice(matches[0].index, 1);
            if (layer?.balconyContinuity && !links.length) delete layer.balconyContinuity;

            for (let index = applied.length - 1; index >= 0; index -= 1) {
                if (applied[index]?.targetId === job.entry?.targetId
                    && applied[index]?.effect === 'remap_balcony_continuity_link') {
                    applied.splice(index, 1);
                }
            }

            const primary = relevant[0];
            orphaned.push(archiveEntry(job.entry, job.source, {
                reason: primary.code,
                disposition: 'orphaned'
            }));
            unresolved.push({
                targetId: job.entry?.targetId ?? '',
                kind: job.entry?.kind ?? 'target',
                reason: primary.code,
                target: deepClone(job.target),
                diagnostics: deepClone(relevant)
            });
        }
    }

    const targetRemap = createTargetRemap(resolution, applied, orphaned, unresolved, existingTargetRemap);
    return {
        valid: resolution?.valid !== false && targetRemap.unresolved.length === 0,
        config: nextConfig,
        targetRemap,
        applied,
        orphaned,
        unresolved: targetRemap.unresolved
    };
}
