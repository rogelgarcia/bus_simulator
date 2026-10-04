// Prepares, validates and installs the additive multiscale appearance companion: native 1024 base tiers and micro detail pages.
// @ts-check
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { authoringFile, authoringHash, readAuthoringFile, writeImmutableAuthoringFile } from '../landscape_authoring/AuthoringFiles.mjs';
import { LANDSCAPE_APPEARANCE_MULTISCALE_ALGORITHM, LANDSCAPE_APPEARANCE_MULTISCALE_FORMAT, LANDSCAPE_APPEARANCE_MULTISCALE_LIMIT, LANDSCAPE_APPEARANCE_MULTISCALE_PAGE_LIMIT,
    LANDSCAPE_APPEARANCE_MULTISCALE_TIERS, LANDSCAPE_APPEARANCE_MICRO_ENCODING, landscapeAppearanceBindingKey, validateLandscapeAppearanceMultiscale } from '../../src/app/landscape/index.js';

export const APPEARANCE_MULTISCALE_REQUEST_FORMAT = 'landscape-appearance-multiscale-request';
const MICRO_ALGORITHM = 'micro-periodic-highpass-v1';
const EXTRA_TIERS = Object.freeze([1024]);
const MICRO_MAPS = Object.freeze(['baseColor', 'normal', 'displacement']);
const NEUTRAL_TOLERANCE_BYTES = 4;
const bytesOf = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const sameKeys = (value, keys) => !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === keys;

/** @param {string} file @param {any} landscape */
export async function readAppearanceMultiscaleRequest(file, landscape) {
    const bytes = await readAuthoringFile(file, 16 * 1024), request = JSON.parse(bytes.toString('utf8'));
    if (!sameKeys(request, 'extraTiers,format,landscapeId,micro,schemaVersion') || request.format !== APPEARANCE_MULTISCALE_REQUEST_FORMAT || request.schemaVersion !== 1
        || request.landscapeId !== landscape.id || !Array.isArray(request.extraTiers) || request.extraTiers.join(',') !== EXTRA_TIERS.join(',')
        || !Array.isArray(request.micro) || request.micro.length > 4) {
        throw new Error(`Appearance multiscale request must declare ${APPEARANCE_MULTISCALE_REQUEST_FORMAT} schema 1, landscape ${landscape.id}, extraTiers [${EXTRA_TIERS}] and at most four micro layers`);
    }
    const soils = new Set(landscape.soil.catalog.map(soil => soil.id)), assigned = new Set(), materials = new Set();
    for (const micro of request.micro) {
        if (!sameKeys(micro, 'materialId,soilIds') || typeof micro.materialId !== 'string' || !/^pbr\.[a-zA-Z0-9_-]+$/.test(micro.materialId) || materials.has(micro.materialId)
            || !Array.isArray(micro.soilIds) || !micro.soilIds.length || new Set(micro.soilIds).size !== micro.soilIds.length
            || micro.soilIds.some(id => !soils.has(id) || assigned.has(id))) throw new Error('Appearance multiscale micro layers need a unique pbr material and existing soils, each soil at most once');
        materials.add(micro.materialId); micro.soilIds.forEach(id => assigned.add(id));
    }
    return { request, bytes, sha256: authoringHash(bytes) };
}

/** @param {string} sourceRoot @param {any} request */
export async function inspectAppearanceMultiscaleSources(sourceRoot, request) {
    const micro = [], sources = [], metadata = [];
    for (const entry of request.micro) {
        const slug = entry.materialId.slice(4), configRelative = `${slug}/pbr.material.config.js`, preparationRelative = `${slug}/pbr.landscape.config.json`;
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
        metadata.push(configRelative, preparationRelative); sources.push(...sourceFiles);
        micro.push({ materialId: entry.materialId, soilIds: [...entry.soilIds], tileMeters: config.tileMeters, mapFiles, preparation: preparation.micro, sourceFiles });
    }
    return { micro, sources: [...new Set(sources)], metadata };
}

/** @param {any} inspected */
export function appearanceMultiscaleConverterRequest(inspected) {
    return { extraSizes: [...EXTRA_TIERS], micro: inspected.micro.map(entry => ({ materialId: entry.materialId, mapFiles: entry.mapFiles, preparation: entry.preparation })) };
}

function halfPowerWavelengthMeters(recipe, tileMeters) {
    const sigma = Math.sqrt(recipe.passes * ((2 * recipe.radiusPixels + 1) ** 2 - 1) / 12);
    return Math.round(sigma * 2 * Math.PI / Math.sqrt(2 * Math.LN2) * tileMeters / recipe.sourcePixels * 1e4) / 1e4;
}

/**
 * Builds and writes the staged companion for an already validated schema-1 appearance.
 * @param {{appearance:any,conversion:any,inspected:any,request:any,baseSources:string[],sourceRecords:Map<string,{sha256:string,byteLength:number}>,outputDirectory:string}} input
 */
export async function buildAppearanceMultiscale({ appearance, conversion, inspected, request, baseSources, sourceRecords, outputDirectory }) {
    const multiscale = conversion.multiscale;
    if (!multiscale || multiscale.materials.length !== appearance.materials.length || multiscale.micro.length !== inspected.micro.length) throw new Error('Appearance converter did not return the requested multiscale pages');
    const prepared = new Map(inspected.micro.map((entry, i) => {
        if (multiscale.micro[i].materialId !== entry.materialId) throw new Error('Appearance converter returned micro layers out of order');
        return [entry.materialId, { entry, result: multiscale.micro[i] }];
    }));
    const microOfSoil = new Map(inspected.micro.flatMap(entry => entry.soilIds.map(soilId => [soilId, prepared.get(entry.materialId)])));
    const paths = [...new Set([...baseSources, ...inspected.sources])].sort();
    const sources = paths.map(relative => {
        const record = sourceRecords.get(relative);
        if (!record) throw new Error(`Multiscale source ${relative} was not authenticated`);
        return { path: `pbr/${relative}`, sha256: record.sha256, byteLength: record.byteLength };
    });
    const candidate = {
        format: LANDSCAPE_APPEARANCE_MULTISCALE_FORMAT, schemaVersion: 1, landscapeId: appearance.landscapeId, revision: 'pending',
        appearanceRevision: appearance.revision, bindingKey: await landscapeAppearanceBindingKey(appearance),
        capabilities: { encoding: 'rgba8', gpuCompression: 'none', maxPageBytes: LANDSCAPE_APPEARANCE_MULTISCALE_PAGE_LIMIT, tiers: [...LANDSCAPE_APPEARANCE_MULTISCALE_TIERS] },
        materials: appearance.materials.map((material, i) => {
            if (multiscale.materials[i].soilId !== material.soilId) throw new Error('Appearance converter returned multiscale materials out of order');
            const micro = microOfSoil.get(material.soilId);
            return { soilId: material.soilId, materialId: material.materialId, tiers: multiscale.materials[i].tiers,
                ...(micro ? { micro: { materialId: micro.entry.materialId, tileMeters: micro.entry.tileMeters, encoding: LANDSCAPE_APPEARANCE_MICRO_ENCODING,
                    luminanceRange: micro.result.luminanceRange, provenanceSourceIds: micro.entry.sourceFiles.map(file => `pbr/${file}`), tiers: micro.result.tiers } } : {}) };
        }),
        provenance: { algorithm: LANDSCAPE_APPEARANCE_MULTISCALE_ALGORITHM, sources, recipes: {
            request: { sha256: request.sha256, extraTiers: request.request.extraTiers, micro: request.request.micro },
            baseTiers: { source: 'native-resolution catalog source maps of the extended schema-1 appearance; no upsampling', filter: multiscale.converter.filter,
                calibrationBakedIntoPages: false, ormAlpha: 'relative relief with the schema-1 normalization wherever the appearance material declares height' },
            micro: [...prepared.values()].map(({ entry, result }) => ({ materialId: entry.materialId, soilIds: entry.soilIds, tileMeters: entry.tileMeters, ...result.recipe,
                halfPowerWavelengthMeters: halfPowerWavelengthMeters(result.recipe, entry.tileMeters),
                channels: { r: 'detail normal X (OpenGL tangent, 0.5 neutral)', g: 'detail normal Y (OpenGL tangent, 0.5 neutral)',
                    b: 'relative detail height (median-centered, p01/p99 normalized, 0.5 neutral)', a: '0.5 + 0.5 * (L / mean - 1) / luminanceRange, clamped; 0.5 = unchanged albedo' } })),
            converter: multiscale.converter, sourceDimensions: multiscale.sourceDimensions,
            rights: 'Base tiers reuse the appearance sources and their recorded rights; micro sources are CC0 as recorded in their material metadata. No other license is asserted.' } }
    };
    candidate.revision = `multiscale-${authoringHash(bytesOf({ ...candidate, revision: null })).slice(0, 24)}`;
    const manifest = await validateLandscapeAppearanceMultiscale(candidate, appearance), bytes = bytesOf(manifest);
    if (bytes.length > LANDSCAPE_APPEARANCE_MULTISCALE_LIMIT) throw new Error('Appearance multiscale sidecar exceeds its bounded file limit');
    const file = path.join(outputDirectory, 'multiscale.json');
    await writeImmutableAuthoringFile(file, bytes);
    return { manifest, bytes, file, sha256: authoringHash(bytes) };
}

function checkBasePage(payload, name, height) {
    if (name !== 'orm' || !height) for (let i = 3; i < payload.length; i += 4) if (payload[i] !== 255) throw new Error('Opaque multiscale PBR page has invalid alpha');
    if (name === 'normal') for (let i = 0; i < payload.length; i += 4) {
        const length = Math.hypot(payload[i] / 127.5 - 1, payload[i + 1] / 127.5 - 1, payload[i + 2] / 127.5 - 1);
        if (Math.abs(length - 1) > .015) throw new Error('Multiscale normal page is not normalized');
    }
}

function checkMicroPage(payload) {
    const sums = [0, 0, 0, 0], texels = payload.length / 4;
    for (let i = 0; i < payload.length; i += 4) {
        if (Math.hypot(payload[i] / 127.5 - 1, payload[i + 1] / 127.5 - 1) > 1 + 1.5 / 127.5) throw new Error('Micro detail normal XY leaves the unit disc');
        for (let c = 0; c < 4; c++) sums[c] += payload[i + c];
    }
    const means = sums.map(sum => sum / texels);
    for (const c of [0, 1, 3]) if (Math.abs(means[c] - 127.5) > NEUTRAL_TOLERANCE_BYTES) throw new Error(`Micro detail channel ${'rgba'[c]} is not mean-neutral (${means[c].toFixed(2)})`);
    return means;
}

/** @param {{file:string,sha256:string,outputDirectory:string}} prepared @param {any} appearance */
export async function validateAppearanceMultiscaleCandidate(prepared, appearance) {
    const bytes = await readAuthoringFile(prepared.file, LANDSCAPE_APPEARANCE_MULTISCALE_LIMIT);
    if (authoringHash(bytes) !== prepared.sha256) throw new Error('Appearance multiscale receipt mismatch');
    const manifest = await validateLandscapeAppearanceMultiscale(JSON.parse(bytes.toString('utf8')), appearance);
    const files = new Map(), microMeans = {};
    const read = async (page, label) => {
        const payload = await readAuthoringFile(authoringFile(prepared.outputDirectory, page.url), page.byteLength);
        if (payload.length !== page.byteLength || authoringHash(payload) !== page.sha256) throw new Error(`Appearance multiscale page integrity mismatch ${label}`);
        files.set(page.url, page);
        return payload;
    };
    for (const material of manifest.materials) {
        const height = !!appearance.materials.find(entry => entry.soilId === material.soilId).height;
        for (const tier of material.tiers) for (const [name, page] of Object.entries(tier.channels)) {
            if (!files.has(page.url)) checkBasePage(await read(page, `${material.soilId}/${tier.id}/${name}`), name, height);
        }
        if (material.micro) for (const tier of material.micro.tiers) {
            const page = tier.channels.micro;
            if (!files.has(page.url)) microMeans[`${material.micro.materialId}/${tier.id}`] = checkMicroPage(await read(page, `${material.soilId}/micro/${tier.id}`));
        }
    }
    return { manifest, bytes, files, microMeans };
}

/** @param {string} destination */
export async function readCurrentAppearanceMultiscale(destination) {
    try { return JSON.parse((await readAuthoringFile(path.join(destination, 'multiscale.json'), LANDSCAPE_APPEARANCE_MULTISCALE_LIMIT)).toString('utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

/** Installs immutable companion pages and its content-addressed snapshot; the caller switches multiscale.json last.
 * @param {{outputDirectory:string}} prepared @param {{bytes:Buffer,files:Map<string,any>}} candidate @param {string} destination */
export async function installAppearanceMultiscale(prepared, candidate, destination) {
    const installed = [];
    for (const [relative, page] of candidate.files) {
        const payload = await readAuthoringFile(authoringFile(prepared.outputDirectory, relative), page.byteLength);
        if (authoringHash(payload) !== page.sha256) throw new Error('Appearance multiscale page changed during publication');
        const file = authoringFile(destination, relative); await writeImmutableAuthoringFile(file, payload); installed.push(file);
    }
    const snapshot = path.join(destination, `multiscale.${authoringHash(candidate.bytes)}.json`);
    await writeImmutableAuthoringFile(snapshot, candidate.bytes); installed.push(snapshot);
    return installed;
}
