// Prepares, validates and installs the additive layers appearance companion: the surface model's class materials at every tier.
// @ts-check
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { authoringFile, authoringHash, readAuthoringFile, writeImmutableAuthoringFile } from '../landscape_authoring/AuthoringFiles.mjs';
import { LANDSCAPE_APPEARANCE_LAYERS_ALGORITHM, LANDSCAPE_APPEARANCE_LAYERS_FORMAT, LANDSCAPE_APPEARANCE_LAYERS_LIMIT, LANDSCAPE_APPEARANCE_LAYERS_PAGE_LIMIT, LANDSCAPE_APPEARANCE_LAYERS_TIERS,
    LANDSCAPE_APPEARANCE_LAYER_CLASSES, LANDSCAPE_APPEARANCE_MICRO_ENCODING, landscapeAppearanceBindingKey, landscapeAppearanceLayerClass, landscapeSurfaceMaterialsKey,
    validateLandscapeAppearanceLayers, validateLandscapeSurfaceRecipe } from '../../src/app/landscape/index.js';

export const APPEARANCE_LAYERS_REQUEST_FORMAT = 'landscape-appearance-layers-request';
const MICRO_ALGORITHM = 'micro-periodic-highpass-v1';
const EXTRA_TIERS = Object.freeze([1024]);
const MICRO_MAPS = Object.freeze(['baseColor', 'normal', 'displacement']);
const MAP_CHANNELS = Object.freeze(['baseColor', 'normal', 'orm', 'ao', 'roughness', 'metalness', 'displacement']);
const NEUTRAL_TOLERANCE_BYTES = 4;
const bytesOf = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const sameKeys = (value, keys) => !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === keys;
const slugOf = materialId => materialId.replace(/^pbr\./, '');

/** @param {string} file @param {any} landscape @param {any} recipeInput the surface recipe whose material table the request serves */
export async function readAppearanceLayersRequest(file, landscape, recipeInput) {
    const recipe = validateLandscapeSurfaceRecipe(recipeInput);
    const bytes = await readAuthoringFile(file, 16 * 1024), request = JSON.parse(bytes.toString('utf8'));
    if (!sameKeys(request, 'extraTiers,format,landscapeId,materials,micro,schemaVersion') || request.format !== APPEARANCE_LAYERS_REQUEST_FORMAT || request.schemaVersion !== 1
        || request.landscapeId !== landscape.id || !Array.isArray(request.extraTiers) || request.extraTiers.join(',') !== EXTRA_TIERS.join(',')
        || !Array.isArray(request.materials) || !request.materials.length || request.materials.length > LANDSCAPE_APPEARANCE_LAYER_CLASSES.length || !Array.isArray(request.micro) || request.micro.length > 4) {
        throw new Error(`Appearance layers request must declare ${APPEARANCE_LAYERS_REQUEST_FORMAT} schema 1, landscape ${landscape.id}, extraTiers [${EXTRA_TIERS}], 1..${LANDSCAPE_APPEARANCE_LAYER_CLASSES.length} materials and at most four micro layers`);
    }
    const classes = new Set();
    for (const material of request.materials) {
        const definition = sameKeys(material, 'classId,kind,materialId') ? landscapeAppearanceLayerClass(material.classId) : null;
        if (!definition || material.kind !== definition.kind || classes.has(material.classId) || typeof material.materialId !== 'string' || !/^pbr\.[a-zA-Z0-9_-]+$/.test(material.materialId)) {
            throw new Error(`Appearance layers request material ${material?.classId} needs a known class with its kind, listed once, and a pbr material id`);
        }
        if (recipe.materials[material.classId].materialId !== material.materialId) throw new Error(`Appearance layers request binds ${material.materialId} to ${material.classId}; recipe ${recipe.id} binds ${recipe.materials[material.classId].materialId}`);
        classes.add(material.classId);
    }
    const assigned = new Set(), microMaterials = new Set();
    for (const micro of request.micro) {
        if (!sameKeys(micro, 'classIds,materialId') || typeof micro.materialId !== 'string' || !/^pbr\.[a-zA-Z0-9_-]+$/.test(micro.materialId) || microMaterials.has(micro.materialId)
            || !Array.isArray(micro.classIds) || !micro.classIds.length || new Set(micro.classIds).size !== micro.classIds.length
            || micro.classIds.some(id => !classes.has(id) || assigned.has(id))) throw new Error('Appearance layers micro entries need a unique pbr material and requested classes, each class at most once');
        microMaterials.add(micro.materialId); micro.classIds.forEach(id => assigned.add(id));
    }
    return { request, bytes, sha256: authoringHash(bytes), recipe };
}

async function readPreparation(sourceRoot, relative, materialId) {
    try {
        const preparation = JSON.parse((await readAuthoringFile(authoringFile(sourceRoot, relative), 128 * 1024)).toString('utf8'));
        if (preparation.format !== 'landscape-material-preparation' || preparation.schemaVersion !== 1 || preparation.materialId !== materialId
            || (preparation.baseColor && (preparation.baseColor.algorithm !== 'periodic-log-microdetail-v1' || !Number.isInteger(preparation.baseColor.radiusPixels)
                || preparation.baseColor.radiusPixels < 8 || preparation.baseColor.radiusPixels > 128))) throw new Error(`Invalid landscape preparation for ${materialId}`);
        return preparation;
    } catch (error) { if (error.code !== 'ENOENT') throw error; return undefined; }
}

/** Inspects every requested class material and micro layer under the source root: catalog registration, CC0 provenance, calibration and maps. @param {string} sourceRoot @param {any} request */
export async function inspectAppearanceLayersSources(sourceRoot, request) {
    const index = (await readAuthoringFile(path.join(sourceRoot, '_catalog_index.js'), 256 * 1024)).toString('utf8');
    const registered = new Set([...index.matchAll(/from\s+['"]\.\/([a-zA-Z0-9_-]+\/pbr\.material\.config\.js)['"]/g)].map(match => match[1]));
    const materials = [], micro = [], metadata = [], sources = new Set();
    for (const entry of request.materials) {
        const slug = slugOf(entry.materialId), configRelative = `${slug}/pbr.material.config.js`, correctionRelative = `${slug}/pbr.material.correction.config.js`, preparationRelative = `${slug}/pbr.landscape.config.json`;
        if (!/^[a-zA-Z0-9_-]+$/.test(slug) || !registered.has(configRelative)) throw new Error(`Layer material ${entry.materialId} has no global PBR catalog entry`);
        const config = (await import(pathToFileURL(authoringFile(sourceRoot, configRelative)).href)).default;
        const correction = (await import(pathToFileURL(authoringFile(sourceRoot, correctionRelative)).href)).default;
        const correctionBytes = await readAuthoringFile(authoringFile(sourceRoot, correctionRelative), 128 * 1024);
        if (config?.materialId !== entry.materialId || correction?.materialId !== entry.materialId || !correction.presets?.aces?.adjustments) throw new Error(`PBR metadata identity/calibration mismatch for ${entry.materialId}`);
        if (config.source?.license !== 'CC0-1.0' || !Array.isArray(config.source.files) || !config.source.files.length) throw new Error(`Layer material ${entry.materialId} must retain CC0 source provenance`);
        if (!(Number.isFinite(config.tileMeters) && config.tileMeters > 0 && config.tileMeters <= 64)) throw new Error(`Layer material ${entry.materialId} needs its physical tileMeters`);
        const preparation = await readPreparation(sourceRoot, preparationRelative, entry.materialId);
        metadata.push(configRelative, correctionRelative); if (preparation) metadata.push(preparationRelative);
        const mapFiles = {};
        for (const channel of MAP_CHANNELS) if (config.mapFiles?.[channel] || (channel === 'displacement' && preparation?.displacement?.file)) {
            const relative = `${slug}/${config.mapFiles[channel] ?? preparation.displacement.file}`;
            mapFiles[channel] = authoringFile(sourceRoot, relative); sources.add(relative);
        }
        if (!mapFiles.baseColor || !mapFiles.normal || (!mapFiles.orm && !mapFiles.roughness)) throw new Error(`Incomplete PBR source maps for ${entry.materialId}`);
        const percentiles = correction.presets.aces.adjustments.roughness?.normalizeInputPercentiles ?? [0, 100];
        materials.push({ key: entry.classId, classId: entry.classId, kind: entry.kind, materialId: entry.materialId, tileMeters: config.tileMeters, mapFiles, percentiles, preparation,
            calibration: { presetId: 'aces', configSha256: authoringHash(correctionBytes), adjustments: correction.presets.aces.adjustments } });
    }
    for (const entry of request.micro) {
        const slug = slugOf(entry.materialId), configRelative = `${slug}/pbr.material.config.js`, preparationRelative = `${slug}/pbr.landscape.config.json`;
        const config = (await import(pathToFileURL(authoringFile(sourceRoot, configRelative)).href)).default;
        const preparation = JSON.parse((await readAuthoringFile(authoringFile(sourceRoot, preparationRelative), 64 * 1024)).toString('utf8'));
        if (config?.materialId !== entry.materialId || preparation.format !== 'landscape-material-preparation' || preparation.schemaVersion !== 1 || preparation.materialId !== entry.materialId
            || preparation.micro?.algorithm !== MICRO_ALGORITHM || preparation.micro.encoding !== LANDSCAPE_APPEARANCE_MICRO_ENCODING) throw new Error(`Invalid micro detail preparation for ${entry.materialId}`);
        if (!(Number.isFinite(config.tileMeters) && config.tileMeters > 0 && config.tileMeters <= 64)) throw new Error(`Micro detail ${entry.materialId} needs its physical tileMeters`);
        if (config.source?.license !== 'CC0-1.0' || !Array.isArray(config.source.files)) throw new Error(`Micro detail ${entry.materialId} must retain CC0 source provenance`);
        const mapFiles = {}, sourceFiles = [configRelative, preparationRelative];
        for (const channel of MICRO_MAPS) {
            if (typeof config.mapFiles?.[channel] !== 'string') throw new Error(`Micro detail ${entry.materialId} lacks its ${channel} source map`);
            const relative = `${slug}/${config.mapFiles[channel]}`;
            mapFiles[channel] = authoringFile(sourceRoot, relative); sourceFiles.push(relative);
        }
        metadata.push(configRelative, preparationRelative); sourceFiles.forEach(file => sources.add(file));
        micro.push({ materialId: entry.materialId, classIds: [...entry.classIds], tileMeters: config.tileMeters, mapFiles, preparation: preparation.micro, sourceFiles });
    }
    metadata.forEach(file => sources.add(file));
    return { materials, micro, metadata: [...new Set(metadata)], sources: [...sources] };
}

/** @param {any} inspected */
export function appearanceLayersConverterRequest(inspected) {
    return { extraSizes: [...EXTRA_TIERS], materials: inspected.materials.map(material => ({ key: material.key, materialId: material.materialId, tileMeters: material.tileMeters, mapFiles: material.mapFiles,
        percentiles: material.percentiles, preparation: material.preparation })),
        micro: inspected.micro.map(entry => ({ materialId: entry.materialId, mapFiles: entry.mapFiles, preparation: entry.preparation })) };
}

function halfPowerWavelengthMeters(recipe, tileMeters) {
    const sigma = Math.sqrt(recipe.passes * ((2 * recipe.radiusPixels + 1) ** 2 - 1) / 12);
    return Math.round(sigma * 2 * Math.PI / Math.sqrt(2 * Math.LN2) * tileMeters / recipe.sourcePixels * 1e4) / 1e4;
}

/**
 * Builds and writes the staged companion for an already validated schema-1 appearance and the surface recipe.
 * @param {{appearance:any,recipe:any,conversion:any,inspected:any,request:any,sourceRecords:Map<string,{sha256:string,byteLength:number}>,outputDirectory:string}} input
 */
export async function buildAppearanceLayers({ appearance, recipe, conversion, inspected, request, sourceRecords, outputDirectory }) {
    const layers = conversion.layers;
    if (!layers || layers.materials.length !== inspected.materials.length || layers.micro.length !== inspected.micro.length) throw new Error('Appearance converter did not return the requested layer pages');
    const prepared = new Map(inspected.micro.map((entry, i) => {
        if (layers.micro[i].materialId !== entry.materialId) throw new Error('Appearance converter returned layer micro materials out of order');
        return [entry.materialId, { entry, result: layers.micro[i] }];
    }));
    const microOfClass = new Map(inspected.micro.flatMap(entry => entry.classIds.map(classId => [classId, prepared.get(entry.materialId)])));
    const paths = [...new Set(['_catalog_index.js', ...inspected.sources])].sort();
    const sources = paths.map(relative => {
        const record = sourceRecords.get(relative);
        if (!record) throw new Error(`Layers source ${relative} was not authenticated`);
        return { path: `pbr/${relative}`, sha256: record.sha256, byteLength: record.byteLength };
    });
    const validRecipe = validateLandscapeSurfaceRecipe(recipe);
    const candidate = {
        format: LANDSCAPE_APPEARANCE_LAYERS_FORMAT, schemaVersion: 1, landscapeId: appearance.landscapeId, revision: 'pending',
        appearanceRevision: appearance.revision, bindingKey: await landscapeAppearanceBindingKey(appearance),
        recipe: { id: validRecipe.id, materialsKey: await landscapeSurfaceMaterialsKey(validRecipe) },
        capabilities: { encoding: 'rgba8', gpuCompression: 'none', maxPageBytes: LANDSCAPE_APPEARANCE_LAYERS_PAGE_LIMIT, tiers: [...LANDSCAPE_APPEARANCE_LAYERS_TIERS] },
        materials: inspected.materials.map((material, i) => {
            const result = layers.materials[i];
            if (result.key !== material.key || result.materialId !== material.materialId) throw new Error('Appearance converter returned layer materials out of order');
            const micro = microOfClass.get(material.classId);
            return { classId: material.classId, kind: material.kind, materialId: material.materialId, tileMeters: material.tileMeters, calibration: material.calibration,
                roughnessInputRange: result.roughnessInputRange, ...(result.height ? { height: result.height } : {}), tiers: result.tiers,
                ...(micro ? { micro: { materialId: micro.entry.materialId, tileMeters: micro.entry.tileMeters, encoding: LANDSCAPE_APPEARANCE_MICRO_ENCODING, luminanceRange: micro.result.luminanceRange,
                    provenanceSourceIds: micro.entry.sourceFiles.map(file => `pbr/${file}`), tiers: micro.result.tiers } } : {}) };
        }),
        provenance: { algorithm: LANDSCAPE_APPEARANCE_LAYERS_ALGORITHM, sources, recipes: {
            request: { sha256: request.sha256, materials: request.request.materials, extraTiers: request.request.extraTiers, micro: request.request.micro },
            baseTiers: { source: 'native-resolution catalog source maps of the class materials; the schema-1 filters at every tier, no upsampling', filter: layers.converter.filter,
                calibrationBakedIntoPages: false, ormAlpha: 'relative relief with the schema-1 normalization wherever the material declares height' },
            materialPreparation: layers.materialPreparation,
            micro: [...prepared.values()].map(({ entry, result }) => ({ materialId: entry.materialId, classIds: entry.classIds, tileMeters: entry.tileMeters, ...result.recipe,
                halfPowerWavelengthMeters: halfPowerWavelengthMeters(result.recipe, entry.tileMeters) })),
            converter: layers.converter, sourceDimensions: layers.sourceDimensions, microSourceDimensions: layers.microSourceDimensions,
            rights: 'Every class material is a CC0 source recorded in its catalog metadata (provider, author, license, hashes); no other license is asserted and no machine path is published.' } }
    };
    candidate.revision = `layers-${authoringHash(bytesOf({ ...candidate, revision: null })).slice(0, 24)}`;
    const manifest = await validateLandscapeAppearanceLayers(candidate, appearance, validRecipe), bytes = bytesOf(manifest);
    if (bytes.length > LANDSCAPE_APPEARANCE_LAYERS_LIMIT) throw new Error('Appearance layers sidecar exceeds its bounded file limit');
    const file = path.join(outputDirectory, 'layers.json');
    await writeImmutableAuthoringFile(file, bytes);
    return { manifest, bytes, file, sha256: authoringHash(bytes) };
}

function checkBasePage(payload, name, height) {
    if (name !== 'orm' || !height) for (let i = 3; i < payload.length; i += 4) if (payload[i] !== 255) throw new Error('Opaque layers PBR page has invalid alpha');
    if (name === 'normal') for (let i = 0; i < payload.length; i += 4) {
        const length = Math.hypot(payload[i] / 127.5 - 1, payload[i + 1] / 127.5 - 1, payload[i + 2] / 127.5 - 1);
        if (Math.abs(length - 1) > .015) throw new Error('Layers normal page is not normalized');
    }
}

function checkMicroPage(payload) {
    const sums = [0, 0, 0, 0], texels = payload.length / 4;
    for (let i = 0; i < payload.length; i += 4) {
        if (Math.hypot(payload[i] / 127.5 - 1, payload[i + 1] / 127.5 - 1) > 1 + 1.5 / 127.5) throw new Error('Layers micro detail normal XY leaves the unit disc');
        for (let c = 0; c < 4; c++) sums[c] += payload[i + c];
    }
    const means = sums.map(sum => sum / texels);
    for (const c of [0, 1, 3]) if (Math.abs(means[c] - 127.5) > NEUTRAL_TOLERANCE_BYTES) throw new Error(`Layers micro detail channel ${'rgba'[c]} is not mean-neutral (${means[c].toFixed(2)})`);
    return means;
}

/** @param {{file:string,sha256:string,outputDirectory:string}} prepared @param {any} appearance @param {any} recipe */
export async function validateAppearanceLayersCandidate(prepared, appearance, recipe) {
    const bytes = await readAuthoringFile(prepared.file, LANDSCAPE_APPEARANCE_LAYERS_LIMIT);
    if (authoringHash(bytes) !== prepared.sha256) throw new Error('Appearance layers receipt mismatch');
    const manifest = await validateLandscapeAppearanceLayers(JSON.parse(bytes.toString('utf8')), appearance, recipe);
    const files = new Map(), microMeans = {};
    const read = async (page, label) => {
        const payload = await readAuthoringFile(authoringFile(prepared.outputDirectory, page.url), page.byteLength);
        if (payload.length !== page.byteLength || authoringHash(payload) !== page.sha256) throw new Error(`Appearance layers page integrity mismatch ${label}`);
        files.set(page.url, page);
        return payload;
    };
    for (const material of manifest.materials) {
        for (const tier of material.tiers) for (const [name, page] of Object.entries(tier.channels)) {
            if (!files.has(page.url)) checkBasePage(await read(page, `${material.classId}/${tier.id}/${name}`), name, !!material.height);
        }
        if (material.micro) for (const tier of material.micro.tiers) {
            const page = tier.channels.micro;
            if (!files.has(page.url)) microMeans[`${material.micro.materialId}/${tier.id}`] = checkMicroPage(await read(page, `${material.classId}/micro/${tier.id}`));
        }
    }
    return { manifest, bytes, files, microMeans };
}

/** @param {string} destination */
export async function readCurrentAppearanceLayers(destination) {
    try { return JSON.parse((await readAuthoringFile(path.join(destination, 'layers.json'), LANDSCAPE_APPEARANCE_LAYERS_LIMIT)).toString('utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

/** Installs immutable companion pages and its content-addressed snapshot; the caller switches layers.json last.
 * @param {{outputDirectory:string}} prepared @param {{bytes:Buffer,files:Map<string,any>}} candidate @param {string} destination */
export async function installAppearanceLayers(prepared, candidate, destination) {
    const installed = [];
    for (const [relative, page] of candidate.files) {
        const payload = await readAuthoringFile(authoringFile(prepared.outputDirectory, relative), page.byteLength);
        if (authoringHash(payload) !== page.sha256) throw new Error('Appearance layers page changed during publication');
        const file = authoringFile(destination, relative); await writeImmutableAuthoringFile(file, payload); installed.push(file);
    }
    const snapshot = path.join(destination, `layers.${authoringHash(candidate.bytes)}.json`);
    await writeImmutableAuthoringFile(snapshot, candidate.bytes); installed.push(snapshot);
    return installed;
}

/** Summary of a built companion for the bake receipt. @param {{manifest:any,sha256:string,bytes:Buffer}} layers @param {any} conversion */
export function appearanceLayersReport(layers, conversion) {
    const unique = new Map(), perTier = new Map();
    for (const material of layers.manifest.materials) {
        for (const tier of material.tiers) for (const page of Object.values(tier.channels)) {
            unique.set(page.url, page.byteLength);
            const group = perTier.get(tier.id) ?? { logicalPages: 0, logicalDecodedBytes: 0 };
            group.logicalPages++; group.logicalDecodedBytes += page.byteLength; perTier.set(tier.id, group);
        }
        if (material.micro) for (const tier of material.micro.tiers) unique.set(tier.channels.micro.url, tier.channels.micro.byteLength);
    }
    return { revision: layers.manifest.revision, appearanceRevision: layers.manifest.appearanceRevision, recipe: layers.manifest.recipe, sidecarSha256: layers.sha256, sidecarBytes: layers.bytes.length,
        materials: layers.manifest.materials.map(material => ({ classId: material.classId, kind: material.kind, materialId: material.materialId, tileMeters: material.tileMeters, height: !!material.height, micro: !!material.micro })),
        tiers: Object.fromEntries(perTier), uniquePages: unique.size, uniqueBytes: [...unique.values()].reduce((sum, bytes) => sum + bytes, 0),
        materialPreparation: conversion.layers.materialPreparation, sourceDimensions: conversion.layers.sourceDimensions };
}
