import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const configuredAssetDir = process.env.GRASS_V2_ASSET_DIR;
const ASSET_DIR = configuredAssetDir
    ? path.resolve(REPO_ROOT, configuredAssetDir)
    : path.join(REPO_ROOT, 'assets/public/pbr/grass_low_cut_maintained_v2');

function pngDimensions(bytes) {
    assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG');
    assert.equal(bytes.subarray(12, 16).toString('ascii'), 'IHDR');
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

async function loadContract() {
    const manifest = JSON.parse(await readFile(path.join(ASSET_DIR, 'asset.manifest.json'), 'utf8'));
    return { manifest };
}

test('V2 grass bake records canonical provenance and an unlit appearance contract', async () => {
    const { manifest } = await loadContract();
    assert.equal(manifest.schema, 'bus-simulator.low-cut-grass-asset-family');
    assert.equal(manifest.version, 2);
    assert.equal(manifest.assetId, 'grass.natural.maintained.material.v2');
    assert.equal(manifest.materialId, 'pbr.grass_low_cut_maintained_v2');
    assert.equal(manifest.bakeProfile.profileId, 'grass.natural.maintained.v2');
    assert.equal(manifest.bakeProfile.seed, 'natural-maintained-turf-v2');
    assert.equal(manifest.generation.seed, 'grass-material-bake-v2');
    assert.equal(manifest.source.license, 'CC0 1.0');
    assert.equal(manifest.source.url, 'https://ambientcg.com/view?id=Grass004');
    assert.equal(manifest.source.sourcePhysicalDimensionsMeters, null);
    assert.deepEqual(manifest.source.calibratedFarTileMeters, { x: 1.4, z: 1.4 });
    assert.equal(manifest.appearance.runtimeEmissiveIntensity, 0);
    assert.equal(manifest.appearance.lightingInBaseColor, false);
    assert.equal(manifest.generation.lightingInBaseColor, false);
});

test('V2 grass atlas families preserve physical scale, gutters, and mip alpha', async () => {
    const { manifest } = await loadContract();
    const expected = {
        midCluster: { prefix: 'mid_cluster', width: 1.15, height: 0.055 },
        accentClump: { prefix: 'accent_clump', width: 0.24, height: 0.075 }
    };
    for (const [familyName, dimensions] of Object.entries(expected)) {
        const family = manifest.generation.atlasFamilies[familyName];
        assert.ok(family, `missing ${familyName} contract`);
        assert.deepEqual(family.grid, { columns: 4, rows: 2, variants: 8 });
        assert.deepEqual(family.atlasResolution, [1024, 512]);
        assert.deepEqual(family.cellResolution, [256, 256]);
        assert.equal(family.gutterPixels, 16);
        assert.deepEqual(family.physicalDimensionsMetersPerCell, {
            width: dimensions.width,
            height: dimensions.height
        });
        assert.deepEqual(
            family.runtimeNominalDimensionsMeters,
            family.physicalDimensionsMetersPerCell
        );
        assert.deepEqual(family.runtimeNominalDimensionErrorPercent, { width: 0, height: 0 });
        assert.equal(family.alphaPolicy.cutoff, 0.35);
        assert.equal(family.alphaPolicy.alphaToCoverage, true);
        const sampling = family.alphaPolicy.sampling;
        assert.equal(sampling.metricVersion, 1);
        assert.equal(sampling.policy, 'opaque_channels_plus_separate_coverage');
        assert.equal(sampling.coverageChannel, 'green');
        assert.deepEqual(sampling.nonOpaqueAlphaPixelsByChannel, {
            ao: 0,
            baseColor: 0,
            normal: 0,
            roughness: 0
        });
        assert.equal(sampling.coverageNonOpaqueAlphaPixels, 0);
        assert.ok(sampling.maximumCoverageChannelError <= (1.5 / 255));
        assert.ok(sampling.maximumCoverageRgbError <= (1.5 / 255));
        const rgbConditioning = family.alphaPolicy.rgbConditioning;
        assert.equal(rgbConditioning.metricVersion, 1);
        assert.equal(rgbConditioning.policy, 'cell_complete_nearest_opaque');
        assert.equal(rgbConditioning.sourceAlphaCutoff, family.alphaPolicy.cutoff);
        assert.ok(rgbConditioning.conditionedPixelsBelowCutoff > 0);
        assert.ok(rgbConditioning.transparentPixels > 0);
        assert.equal(rgbConditioning.blackPixelsBelowCutoff, 0);
        assert.equal(rgbConditioning.transparentBlackPixels, 0);
        assert.equal(rgbConditioning.variants.length, 8);
        for (const variant of rgbConditioning.variants) {
            assert.ok(variant.conditionedPixelsBelowCutoff > 0);
            assert.ok(variant.transparentPixels > 0);
            assert.equal(variant.blackPixelsBelowCutoff, 0);
            assert.equal(variant.transparentBlackPixels, 0);
        }
        assert.equal(family.alphaPolicy.alphaConditioningDilationPixels, 1);
        assert.equal(family.alphaPolicy.runtimeMipMaxInclusive, 7);
        const rootLine = family.alphaPolicy.rootLineValidation;
        assert.equal(rootLine.metricVersion, 1);
        assert.equal(rootLine.cutoff, family.alphaPolicy.cutoff);
        assert.equal(rootLine.maxAllowedHorizontalRunPixels, 122);
        assert.equal(rootLine.maxAllowedTopDownProjectedRunPixels, 76);
        assert.equal(rootLine.maxAllowedTopDownProjectedCoverage, 0.7);
        assert.equal(rootLine.continuousRootRibbonDetected, false);
        assert.equal(rootLine.opaqueBlackPixelsAtCutoff, 0);
        assert.equal(rootLine.variants.length, 8);
        assert.ok(
            rootLine.maxObservedHorizontalRunPixels <= rootLine.maxAllowedHorizontalRunPixels
        );
        assert.ok(
            rootLine.maxObservedTopDownProjectedRunPixels
                <= rootLine.maxAllowedTopDownProjectedRunPixels
        );
        assert.ok(
            rootLine.maxObservedTopDownProjectedCoverage
                <= rootLine.maxAllowedTopDownProjectedCoverage
        );
        for (const variant of rootLine.variants) {
            assert.ok(
                variant.maxHorizontalRunPixelsAtCutoff
                    <= rootLine.maxAllowedHorizontalRunPixels
            );
            assert.ok(
                variant.maxTopDownProjectedRunPixelsAtCutoff
                    <= rootLine.maxAllowedTopDownProjectedRunPixels
            );
            assert.ok(
                variant.topDownProjectedCoverageAtCutoff
                    <= rootLine.maxAllowedTopDownProjectedCoverage
            );
            assert.equal(variant.opaqueBlackPixelsAtCutoff, 0);
        }
        assert.deepEqual(
            family.alphaPolicy.coverageByMip.map((entry) => entry.level),
            [0, 1, 2, 3, 4, 5, 6, 7]
        );
        for (const level of family.alphaPolicy.coverageByMip) {
            assert.equal(level.usefulVariants, 8, `${familyName} mip ${level.level}`);
            assert.equal(level.variants.length, 8);
            for (const variant of level.variants) {
                assert.ok(
                    variant.maxAlpha >= family.alphaPolicy.cutoff,
                    `${familyName} variant ${variant.variant} vanished at mip ${level.level}`
                );
            }
        }
    }
});

test('V2 grass manifest hashes and dimensions match every generated output', async () => {
    const { manifest } = await loadContract();
    const atlasPrefixes = ['mid_cluster', 'accent_clump'];
    const atlasSuffixes = ['basecolor', 'coverage', 'normal_gl', 'roughness', 'ao'];
    const expectedAtlasFiles = atlasPrefixes.flatMap(
        (prefix) => atlasSuffixes.map((suffix) => `${prefix}_${suffix}.png`)
    );
    for (const filename of expectedAtlasFiles) {
        const bytes = await readFile(path.join(ASSET_DIR, filename));
        assert.deepEqual(pngDimensions(bytes), [1024, 512], filename);
        assert.equal(
            createHash('sha256').update(bytes).digest('hex'),
            manifest.files[filename].sha256,
            filename
        );
        assert.equal(bytes.length, manifest.files[filename].bytes, filename);
    }

    for (const filename of [
        'far_basecolor.png',
        'far_normal_gl.png',
        'far_roughness.png',
        'far_ao.png',
        'far_height.png',
        'far_coverage.png'
    ]) {
        const bytes = await readFile(path.join(ASSET_DIR, filename));
        assert.deepEqual(pngDimensions(bytes), [1024, 1024], filename);
        assert.equal(
            createHash('sha256').update(bytes).digest('hex'),
            manifest.files[filename].sha256,
            filename
        );
    }

    const blendFilename = 'grass_low_cut_maintained_v2.blend';
    const blendBytes = await readFile(path.join(ASSET_DIR, blendFilename));
    assert.equal(
        createHash('sha256').update(blendBytes).digest('hex'),
        manifest.files[blendFilename].sha256
    );
});
