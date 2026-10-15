// Verifies the committed ecosystem blue-noise table (AI 599 D2): permutation, toroidal reads, bit-identical regeneration, the text codec and the spectral quality against white noise on the jittered lattice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ECOSYSTEM_ANISOTROPY, ECOSYSTEM_BLUE_NOISE, ECOSYSTEM_BLUE_NOISE_PARAMETERS, createEcosystemTileData, decodeEcosystemBlueNoiseRanks, ecosystemBlueNoiseRank, ecosystemSitePosition, ecosystemSpatialStatistics,
    encodeEcosystemBlueNoiseRanks, generateEcosystemBlueNoiseRanks, requireEcosystemBlueNoisePermutation, writeEcosystemRecord } from '../../../src/app/landscape/index.js';
import { BLUE_NOISE_THRESHOLDS, blueNoiseBeatsWhite, blueNoiseSelectionStatistics } from '../../../tools/bake_landscape/ecosystem/blue_noise/BlueNoiseJob.mjs';

const COMMITTED_SHA256 = 'c8657cfc838321b2510a7f9cc1744ce5b3ccb83cf88cd268de1efb0ef38dcfc9';
const sha256 = ranks => createHash('sha256').update(Buffer.from(ranks.buffer, ranks.byteOffset, ranks.byteLength)).digest('hex');

test('Ecosystem blue noise: the committed table is a 64 x 64 permutation read toroidally as (rank + 0.5) / 4096', () => {
    const { ranks, size } = ECOSYSTEM_BLUE_NOISE;
    assert.equal(size, 64); assert.equal(ranks.length, 4096);
    requireEcosystemBlueNoisePermutation(ranks, size);
    assert.equal(sha256(ranks), COMMITTED_SHA256, 'the committed table is the contract every tile was generated with');
    for (const [siteX, siteZ] of [[0, 0], [7, 3], [-1, -1], [1000, -77]]) {
        const rank = ecosystemBlueNoiseRank(siteX, siteZ), expected = (ranks[((siteZ % 64) + 64) % 64 * 64 + ((siteX % 64) + 64) % 64] + .5) / 4096;
        assert.equal(rank, expected); assert.ok(rank > 0 && rank < 1);
        assert.equal(ecosystemBlueNoiseRank(siteX + 64, siteZ - 128), rank, 'toroidal');
    }
    const seen = new Set();
    for (let siteZ = 0; siteZ < 64; siteZ++) for (let siteX = 0; siteX < 64; siteX++) seen.add(ecosystemBlueNoiseRank(siteX, siteZ));
    assert.equal(seen.size, 4096, 'every site of a period has a distinct rank');
    assert.throws(() => requireEcosystemBlueNoisePermutation(Uint16Array.from(ranks).fill(0, 0, 2), 64), /repeats or exceeds/);
    assert.throws(() => requireEcosystemBlueNoisePermutation(new Uint16Array(10), 64), /must hold 4096 ranks/);
});

test('Ecosystem blue noise: the void-and-cluster generator reproduces the committed table bit for bit and the text codec round-trips', () => {
    const started = performance.now(), generated = generateEcosystemBlueNoiseRanks();
    assert.ok(performance.now() - started < 5000, 'regeneration is quick');
    assert.equal(sha256(generated), COMMITTED_SHA256);
    assert.deepEqual([...generated], [...ECOSYSTEM_BLUE_NOISE.ranks]);
    assert.equal(ECOSYSTEM_BLUE_NOISE.parameters, ECOSYSTEM_BLUE_NOISE_PARAMETERS);
    assert.deepEqual([ECOSYSTEM_BLUE_NOISE_PARAMETERS.method, ECOSYSTEM_BLUE_NOISE_PARAMETERS.sigmaTexels, ECOSYSTEM_BLUE_NOISE_PARAMETERS.size], ['void-and-cluster', 1.5, 64]);
    const text = encodeEcosystemBlueNoiseRanks(generated);
    assert.equal(text, ECOSYSTEM_BLUE_NOISE.text);
    assert.deepEqual([...decodeEcosystemBlueNoiseRanks(text)], [...generated]);
    const other = generateEcosystemBlueNoiseRanks({ ...ECOSYSTEM_BLUE_NOISE_PARAMETERS, seed: 600 });
    requireEcosystemBlueNoisePermutation(other, 64);
    assert.notEqual(sha256(other), COMMITTED_SHA256, 'another seed is another table');
    assert.throws(() => generateEcosystemBlueNoiseRanks({ ...ECOSYSTEM_BLUE_NOISE_PARAMETERS, method: 'random' }), /void-and-cluster/);
});

test('Ecosystem blue noise: at 2 %, 10 % and 30 % the selection beats white noise on the jittered lattice and its nearest-neighbour directions are isotropic', () => {
    assert.deepEqual([...BLUE_NOISE_THRESHOLDS], [.02, .1, .3]);
    for (const threshold of BLUE_NOISE_THRESHOLDS) {
        const result = blueNoiseSelectionStatistics(ECOSYSTEM_BLUE_NOISE.ranks, threshold);
        assert.ok(blueNoiseBeatsWhite(result), `${threshold}: ${JSON.stringify(result)}`);
        assert.ok(result.blue.nearestMean > result.white.nearestMean * 1.1 && result.blue.nearestCoefficientOfVariation < result.white.nearestCoefficientOfVariation * .9, `${threshold}: wider and more even spacing`);
        assert.ok(result.blue.closePairsPerSite < result.white.closePairsPerSite * .6, `${threshold}: fewer pairs closer than one spacing`);
        assert.ok(result.blue.anisotropyPasses && result.blue.anisotropyChiSquare <= ECOSYSTEM_ANISOTROPY.chiSquare99, `${threshold}: isotropic`);
        if (threshold <= .1) { assert.equal(result.blue.closePairsPerSite, 0); assert.ok(result.blue.nearestMinimum > result.white.nearestMinimum * 2, `${threshold}: the minimum exceeds white noise by a clear margin`); }
    }
});

test('Ecosystem blue noise: a full lattice with zero jitter fails the anisotropy test that the blue-noise selection passes', () => {
    const layer = { cell: { meters: 64, sitesPerAxis: 64 }, jitter: 0 }, lattice = createEcosystemTileData(4096);
    for (let siteZ = 0; siteZ < 64; siteZ++) for (let siteX = 0; siteX < 64; siteX++) {
        const { x, z } = ecosystemSitePosition(layer, 1, siteX, siteZ);
        writeEcosystemRecord(lattice, lattice.count++, { x, y: 0, z, scale: 1, normalX: 0, normalZ: 0, yaw: 0, variant: 0, rank: 0, tint: [1, 1, 1], siteX, siteZ, child: -1 });
    }
    const full = ecosystemSpatialStatistics(lattice.records, lattice.count, { spacing: 1, minimumSpacing: 1 });
    assert.equal(full.nearest.minimum, 1); assert.equal(full.nearest.coefficientOfVariation, 0); assert.equal(full.closePairs, 0);
    assert.equal(full.anisotropy.passes, false); assert.ok(full.anisotropy.chiSquare > 1000, `lattice directions concentrate in the axis sectors: ${full.anisotropy.chiSquare}`);
    assert.equal(blueNoiseSelectionStatistics(ECOSYSTEM_BLUE_NOISE.ranks, .1, .35).blue.anisotropyPasses, true);
});
