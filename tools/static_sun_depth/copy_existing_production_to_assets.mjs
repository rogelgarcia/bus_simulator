#!/usr/bin/env node
// Copies authenticated legacy AI 531 publications into the runtime shadow-asset authority.
// @ts-check

import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { canonicalJsonBytes } from '../../src/app/illumination/bake_source/CanonicalJson.js';
import { AI531_PRODUCTION_RELEASE_PROFILE_IDS } from './src/ProductionReleaseCertification.mjs';

const toolRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(toolRoot, '../..');
const LEGACY_PREFIX = 'tests/artifacts/illumination_531/production/';
const ASSET_PREFIX = 'assets/baked_lighting/shadows/production/';

export const COPY_PRODUCTION_ASSET_DEFAULTS = Object.freeze({
    destinationRoot: path.join(repoRoot, 'assets/baked_lighting/shadows'),
    sourceRoot: path.join(repoRoot, 'tests/artifacts/illumination_531')
});

export async function copyExistingProductionToAssets(
    options = COPY_PRODUCTION_ASSET_DEFAULTS
) {
    const sourceRoot = path.resolve(options.sourceRoot);
    const destinationRoot = path.resolve(options.destinationRoot);
    requireInside(
        path.join(repoRoot, 'tests/artifacts/illumination_531'),
        sourceRoot,
        true,
        'sourceRoot'
    );
    requireInside(
        path.join(repoRoot, 'assets/baked_lighting/shadows'),
        destinationRoot,
        true,
        'destinationRoot'
    );
    await requireAbsent(destinationRoot);
    const stagingRoot = `${destinationRoot}.partial-${process.pid}-${Date.now()}`;
    await requireAbsent(stagingRoot);
    await mkdir(stagingRoot, { recursive: true });
    try {
        await cp(
            path.join(sourceRoot, 'production'),
            path.join(stagingRoot, 'production'),
            { errorOnExist: true, force: false, recursive: true }
        );
        const sourceIndex = parseJson(
            await readFile(path.join(sourceRoot, 'package_index.json')),
            'legacy package index'
        );
        const ids = Object.keys(sourceIndex.profiles ?? {}).sort();
        if (JSON.stringify(ids) !== JSON.stringify(AI531_PRODUCTION_RELEASE_PROFILE_IDS)) {
            throw new Error('Legacy package index does not contain the exact eight release profiles');
        }
        const assetIndex = structuredClone(sourceIndex);
        for (const lightingProfileId of AI531_PRODUCTION_RELEASE_PROFILE_IDS) {
            const sourcePackagePath =
                `${LEGACY_PREFIX}${lightingProfileId}/static_sun_depth.ilpkg`;
            const assetPackagePath =
                `${ASSET_PREFIX}${lightingProfileId}/static_sun_depth.ilpkg`;
            const indexed = assetIndex.profiles[lightingProfileId];
            if (indexed?.packagePath !== sourcePackagePath) {
                throw new Error(`Legacy package path for '${lightingProfileId}' is unexpected`);
            }
            indexed.packagePath = assetPackagePath;
            const profileRoot = path.join(
                stagingRoot,
                'production',
                lightingProfileId
            );
            const releasePath = path.join(profileRoot, 'release_certification.json');
            const release = parseJson(
                await readFile(releasePath),
                `release certification '${lightingProfileId}'`
            );
            if (release.packagePath !== sourcePackagePath) {
                throw new Error(
                    `Legacy release certification '${lightingProfileId}' has an unexpected package path`
                );
            }
            release.packagePath = assetPackagePath;
            const releaseBytes = canonicalJsonBytes(release);
            await writeFile(releasePath, releaseBytes);
            const publicationPath = path.join(profileRoot, 'publication.json');
            const publication = parseJson(
                await readFile(publicationPath),
                `publication '${lightingProfileId}'`
            );
            if (publication.packageIndexEntry?.packagePath !== sourcePackagePath) {
                throw new Error(
                    `Legacy publication '${lightingProfileId}' has an unexpected package path`
                );
            }
            publication.packageIndexEntry.packagePath = assetPackagePath;
            const releaseEntry = publication.files?.find(
                (entry) => entry.path === 'release_certification.json'
            );
            if (!releaseEntry) {
                throw new Error(`Publication '${lightingProfileId}' has no release certification`);
            }
            releaseEntry.byteLength = releaseBytes.byteLength;
            releaseEntry.sha256 = rawSha256(releaseBytes);
            await writeFile(publicationPath, canonicalJsonBytes(publication));
        }
        await writeFile(
            path.join(stagingRoot, 'package_index.json'),
            canonicalJsonBytes(assetIndex)
        );
        await rename(stagingRoot, destinationRoot);
        return Object.freeze({
            destinationRoot,
            packageIndexPath: path.join(destinationRoot, 'package_index.json'),
            profileCount: AI531_PRODUCTION_RELEASE_PROFILE_IDS.length
        });
    } catch (error) {
        await rm(stagingRoot, { force: true, recursive: true });
        throw error;
    }
}

function parseJson(bytes, label) {
    try {
        return JSON.parse(bytes.toString('utf8'));
    } catch (error) {
        throw new Error(`${label} is not valid JSON`, { cause: error });
    }
}

function rawSha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function requireInside(root, candidate, allowEqual, label) {
    const relative = path.relative(path.resolve(root), path.resolve(candidate));
    if (!((allowEqual && relative === '')
        || (relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)))) {
        throw new Error(`${label} is outside its canonical authority`);
    }
}

async function requireAbsent(targetPath) {
    try {
        await lstat(targetPath);
    } catch (error) {
        if (error && typeof error === 'object' && error.code === 'ENOENT') return;
        throw error;
    }
    throw new Error(`Destination already exists: ${targetPath}`);
}

if (process.argv[1]
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    copyExistingProductionToAssets().then((result) => {
        process.stdout.write(JSON.stringify({
            packageIndexPath: path.relative(repoRoot, result.packageIndexPath)
                .replaceAll('\\', '/'),
            profileCount: result.profileCount,
            status: 'copied'
        }) + '\n');
    }).catch((error) => {
        process.stderr.write(`[StaticSunDepthAssets] ${error?.stack ?? error}\n`);
        process.exitCode = 1;
    });
}
