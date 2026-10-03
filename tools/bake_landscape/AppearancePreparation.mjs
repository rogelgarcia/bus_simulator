// Stages independent soil material pages and exact global catalog metadata from existing public PBR sources.
// @ts-check
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile, mkdir } from 'node:fs/promises';
import { readLandscapeFileManifest } from '../landscape_authoring/LandscapeFileIO.mjs';
import { authoringFile, authoringHash, readAuthoringFile, writeImmutableAuthoringFile, atomicAuthoringWrite } from '../landscape_authoring/AuthoringFiles.mjs';
import { validateLandscapeAppearanceManifest, LANDSCAPE_APPEARANCE_MANIFEST_LIMIT } from '../../src/app/landscape/index.js';
import { runBakeProcess } from '../baking/Process.mjs';
import { readAppearanceCompatibilitySnapshot, publishAppearanceBindingAlias } from './AppearanceCompatibility.mjs';
import { prepareAppearanceMaterialBindings, assertAppearanceMaterialOnlyChange } from './AppearanceMaterialBindings.mjs';

const bytesOf = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
function pbrFile(directory, relative) {
    if (relative !== '_catalog_index.js') return authoringFile(directory, relative);
    return path.join(directory, relative);
}

/** @param {string} sourceRoot @param {any} landscape */
export async function inspectAppearanceSources(sourceRoot, landscape) {
    const metadata = ['_catalog_index.js'];
    const index = (await readAuthoringFile(path.join(sourceRoot, '_catalog_index.js'), 256 * 1024)).toString('utf8');
    for (const match of index.matchAll(/from\s+['"]\.\/([a-zA-Z0-9_-]+\/pbr\.material\.config\.js)['"]/g)) metadata.push(match[1]);
    if (metadata.length < 2) throw new Error('PBR catalog has no metadata import closure');
    const materials = [], sources = new Set(metadata);
    for (const soil of landscape.soil.catalog) {
        const slug = soil.materialId.replace(/^pbr\./, '');
        if (!/^[a-zA-Z0-9_-]+$/.test(slug) || !metadata.includes(`${slug}/pbr.material.config.js`)) throw new Error(`Soil ${soil.id} has no global PBR catalog entry`);
        const config = (await import(pathToFileURL(path.join(sourceRoot, slug, 'pbr.material.config.js')).href)).default;
        const correctionRelative = `${slug}/pbr.material.correction.config.js`, correctionBytes = await readAuthoringFile(path.join(sourceRoot, correctionRelative), 128 * 1024);
        const correction = (await import(pathToFileURL(path.join(sourceRoot, correctionRelative)).href)).default;
        if (config.materialId !== soil.materialId || correction.materialId !== soil.materialId || !correction.presets?.aces?.adjustments) throw new Error(`PBR metadata identity/calibration mismatch for ${soil.materialId}`);
        metadata.push(correctionRelative); sources.add(correctionRelative);
        const mapFiles = {};
        let preparation;
        const preparationRelative = `${slug}/pbr.landscape.config.json`;
        try {
            preparation = JSON.parse((await readAuthoringFile(path.join(sourceRoot, preparationRelative), 128 * 1024)).toString('utf8'));
            if (preparation.format !== 'landscape-material-preparation' || preparation.schemaVersion !== 1 || preparation.materialId !== soil.materialId
                || (preparation.baseColor && (preparation.baseColor.algorithm !== 'periodic-log-microdetail-v1' || !Number.isInteger(preparation.baseColor.radiusPixels)
                    || preparation.baseColor.radiusPixels < 8 || preparation.baseColor.radiusPixels > 128))) throw new Error(`Invalid landscape preparation for ${soil.materialId}`);
            metadata.push(preparationRelative); sources.add(preparationRelative);
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
        for (const channel of ['baseColor', 'normal', 'orm', 'ao', 'roughness', 'metalness', 'displacement']) if (config.mapFiles[channel] || (channel === 'displacement' && preparation?.displacement?.file)) {
            const relative = `${slug}/${config.mapFiles[channel] ?? preparation.displacement.file}`;
            mapFiles[channel] = authoringFile(sourceRoot, relative); sources.add(relative);
        }
        if (!mapFiles.baseColor || !mapFiles.normal || (!mapFiles.orm && !mapFiles.roughness)) throw new Error(`Incomplete PBR source maps for ${soil.materialId}`);
        const percentiles = correction.presets.aces.adjustments.roughness?.normalizeInputPercentiles ?? [0, 100];
        materials.push({ soilId: soil.id, materialId: soil.materialId, tileMeters: config.tileMeters, mapFiles, percentiles, preparation,
            calibration: { presetId: 'aces', configSha256: authoringHash(correctionBytes), adjustments: correction.presets.aces.adjustments } });
    }
    return { materials, metadata: [...new Set(metadata)], sources: [...sources] };
}

/** @param {any} ctx @param {{directory:string,sourceRoot:string,materialBindings?:string,source?:any}} options */
export async function prepareLandscapeAppearance(ctx, { directory, sourceRoot, materialBindings, source: plannedSource }) {
    const source = plannedSource ?? await readLandscapeFileManifest(directory);
    const landscape = { manifest: await prepareAppearanceMaterialBindings(source.manifest, materialBindings), bytes: source.bytes };
    if (landscape.manifest !== source.manifest) landscape.bytes = bytesOf(landscape.manifest);
    const input = await inspectAppearanceSources(sourceRoot, landscape.manifest);
    const outputDirectory = path.join(ctx.stage, 'appearance'), metadataDirectory = path.join(ctx.stage, 'pbr');
    await mkdir(outputDirectory, { recursive: true });
    const sources = [];
    for (const relative of input.sources) {
        const bytes = await readAuthoringFile(pbrFile(sourceRoot, relative), 32 * 1024 * 1024);
        sources.push({ path: `pbr/${relative}`, sha256: authoringHash(bytes), byteLength: bytes.length });
        if (input.metadata.includes(relative)) await writeImmutableAuthoringFile(pbrFile(metadataDirectory, relative), bytes);
    }
    const requestFile = path.join(ctx.stage, 'appearance-request.json');
    await writeImmutableAuthoringFile(requestFile, bytesOf({ materials: input.materials.map(material => ({ ...material, calibration: undefined })), outputDirectory }));
    await runBakeProcess(ctx.config.pythonExecutable, [path.join(ctx.root, 'tools/bake_landscape/appearance_pages.py'), requestFile], ctx);
    const reportFile = path.join(outputDirectory, 'conversion.json'), conversion = JSON.parse(await readFile(reportFile, 'utf8'));
    const candidate = { format: 'landscape-appearance', schemaVersion: 1, landscapeId: landscape.manifest.id, revision: 'pending',
        preparedFromRevision: landscape.manifest.revision, bounds: landscape.manifest.bounds, grid: landscape.manifest.grid,
        orientation: { uAxis: 'east', vAxis: 'north', row0: 'south', normalConvention: 'opengl' },
        materials: input.materials.map((material, i) => ({ soilId: material.soilId, materialId: material.materialId, tileMeters: material.tileMeters,
            calibration: material.calibration, roughnessInputRange: conversion.materials[i].roughnessInputRange,
            ...(conversion.materials[i].height ? { height: conversion.materials[i].height } : {}), tiers: conversion.materials[i].tiers })),
        provenance: { algorithm: 'landscape-appearance-v1', sourceKind: 'existing-public-game-pbr-assets', rights: 'Reused from the existing public PBR catalog; original rights and attribution remain applicable. No new license is asserted.',
            sourceTerrainUntouched: true, sources, calibrationBakedIntoPages: false, sourceDimensions: conversion.sourceDimensions,
            converter: conversion.converter, materialPreparation: conversion.materialPreparation, maximumSourcePixels: conversion.maximumSourcePixels, workingByteLimit: conversion.workingByteLimit } };
    candidate.revision = `appearance-${authoringHash(bytesOf({ ...candidate, revision: null })).slice(0, 24)}`;
    const manifest = validateLandscapeAppearanceManifest(candidate, landscape.manifest), bytes = bytesOf(manifest);
    if (bytes.length > LANDSCAPE_APPEARANCE_MANIFEST_LIMIT) throw new Error('Appearance manifest exceeds its bounded file limit');
    const manifestFile = path.join(outputDirectory, 'manifest.json'); await writeImmutableAuthoringFile(manifestFile, bytes);
    return { directory, outputDirectory, metadataDirectory, metadata: input.metadata, inputManifestBytes: landscape.bytes, sourceManifestBytes: source.bytes, manifestFile,
        report: { passed: true, revision: manifest.revision, manifestSha256: authoringHash(bytes), materials: manifest.materials.length,
            pages: manifest.materials.length * 9, tiers: [32, 128, 512], decodedBytesPerTier: [32, 128, 512].map(size => ({ resolution: size, bytes: manifest.materials.length * size * size * 4 * 3 })),
            workingByteLimit: conversion.workingByteLimit, maximumSourcePixels: conversion.maximumSourcePixels, sourceImagesProcessedSequentially: true } };
}

/** @param {any} prepared */
export async function validateAppearanceCandidate(prepared) {
    const bytes = await readAuthoringFile(prepared.manifestFile, LANDSCAPE_APPEARANCE_MANIFEST_LIMIT);
    if (authoringHash(bytes) !== prepared.report.manifestSha256) throw new Error('Appearance manifest receipt mismatch');
    const manifest = validateLandscapeAppearanceManifest(JSON.parse(bytes.toString('utf8')), JSON.parse(prepared.inputManifestBytes.toString('utf8')));
    if (prepared.sourceManifestBytes) assertAppearanceMaterialOnlyChange(JSON.parse(prepared.sourceManifestBytes.toString('utf8')), JSON.parse(prepared.inputManifestBytes.toString('utf8')));
    const files = new Map();
    for (const material of manifest.materials) for (const tier of material.tiers) for (const [name, page] of Object.entries(tier.channels)) {
        const payload = await readAuthoringFile(authoringFile(prepared.outputDirectory, page.url), page.byteLength);
        if (payload.length !== page.byteLength || authoringHash(payload) !== page.sha256) throw new Error(`Appearance page integrity mismatch ${material.soilId}/${tier.id}/${name}`);
        if (name !== 'orm' || !material.height) for (let i = 3; i < payload.length; i += 4) if (payload[i] !== 255) throw new Error('Opaque PBR page has invalid alpha');
        if (name === 'normal') for (let i = 0; i < payload.length; i += 4) {
            const length = Math.hypot(payload[i] / 127.5 - 1, payload[i + 1] / 127.5 - 1, payload[i + 2] / 127.5 - 1);
            if (Math.abs(length - 1) > .015) throw new Error('Appearance normal page is not normalized');
        }
        files.set(page.url, page);
    }
    for (const relative of prepared.metadata) {
        const expected = manifest.provenance.sources.find(source => source.path === `pbr/${relative}`);
        const bytes = await readAuthoringFile(pbrFile(prepared.metadataDirectory, relative), 256 * 1024);
        if (!expected || authoringHash(bytes) !== expected.sha256) throw new Error(`PBR catalog metadata integrity mismatch ${relative}`);
    }
    return { manifest, bytes, files };
}

/** @param {any} prepared @param {string} metadataDestination @param {{compatibilitySnapshot?:string}} [options] */
export async function publishLandscapeAppearance(prepared, metadataDestination, { compatibilitySnapshot } = {}) {
    const { manifest, bytes, files } = await validateAppearanceCandidate(prepared), installed = [];
    const sourceManifestBytes = prepared.sourceManifestBytes ?? prepared.inputManifestBytes;
    if (!(await readAuthoringFile(path.join(prepared.directory, 'manifest.json'), 1024 * 1024)).equals(sourceManifestBytes)) throw new Error('Landscape changed during appearance preparation; retry against current terrain');
    const destination = path.join(prepared.directory, 'appearance');
    const compatibility = compatibilitySnapshot ? await readAppearanceCompatibilitySnapshot(prepared.directory, compatibilitySnapshot) : null;
    if (compatibility && compatibility.manifest.landscapeId !== manifest.landscapeId) throw new Error('Appearance compatibility snapshot belongs to a different landscape');
    let previous;
    try {
        previous = await readAuthoringFile(path.join(destination, 'manifest.json'), LANDSCAPE_APPEARANCE_MANIFEST_LIMIT);
        validateLandscapeAppearanceManifest(JSON.parse(previous.toString('utf8')));
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    for (const relative of prepared.metadata) {
        const payload = await readAuthoringFile(pbrFile(prepared.metadataDirectory, relative), 256 * 1024);
        const expected = manifest.provenance.sources.find(source => source.path === `pbr/${relative}`);
        if (authoringHash(payload) !== expected.sha256) throw new Error('PBR metadata changed during publication');
        const file = pbrFile(metadataDestination, relative); await writeImmutableAuthoringFile(file, payload); installed.push(file);
    }
    for (const [relative, page] of files) {
        const payload = await readAuthoringFile(authoringFile(prepared.outputDirectory, relative), page.byteLength);
        if (authoringHash(payload) !== page.sha256) throw new Error('Appearance page changed during publication');
        const file = authoringFile(destination, relative); await writeImmutableAuthoringFile(file, payload); installed.push(file);
    }
    if (!sourceManifestBytes.equals(prepared.inputManifestBytes)) for (const snapshotBytes of [sourceManifestBytes, prepared.inputManifestBytes]) {
        const file = path.join(prepared.directory, `manifest.${authoringHash(snapshotBytes)}.json`);
        await writeImmutableAuthoringFile(file, snapshotBytes); installed.push(file);
    }
    if (previous) installed.push(...await publishAppearanceBindingAlias(destination, previous));
    if (compatibility) installed.push(...await publishAppearanceBindingAlias(destination, compatibility.bytes));
    installed.push(...await publishAppearanceBindingAlias(destination, bytes));
    if (!(await readAuthoringFile(path.join(prepared.directory, 'manifest.json'), 1024 * 1024)).equals(sourceManifestBytes)) throw new Error('Landscape changed during appearance installation; retry against current terrain');
    await atomicAuthoringWrite(path.join(destination, 'manifest.json'), bytes); installed.push(path.join(destination, 'manifest.json'));
    if (!sourceManifestBytes.equals(prepared.inputManifestBytes)) {
        await atomicAuthoringWrite(path.join(prepared.directory, 'manifest.json'), prepared.inputManifestBytes);
        installed.push(path.join(prepared.directory, 'manifest.json'));
    }
    return [...new Set(installed)];
}
