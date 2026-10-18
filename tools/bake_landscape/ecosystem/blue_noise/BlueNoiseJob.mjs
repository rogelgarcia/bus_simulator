// Registers the blue-noise table leaf: regenerates the committed 64 x 64 void-and-cluster ranks, compares them byte for byte and measures their spectral quality.
// @ts-check
// The table is a committed source constant, so this leaf declares no framework inputs (the module it checks is the thing under test) and always runs;
// a difference fails the leaf, and --publish rewrites the marked block of the module instead, then fails the run on purpose so a stale import of the
// old table can never feed the tiles leaf in the same process.
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { writeJson } from '../../../baking/Files.mjs';
import { publishBakeFile } from '../../../baking/Publication.mjs';
import { ECOSYSTEM_BLUE_NOISE, ECOSYSTEM_BLUE_NOISE_PARAMETERS, encodeEcosystemBlueNoiseRanks, generateEcosystemBlueNoiseRanks } from '../../../../src/app/landscape/ecosystem/EcosystemBlueNoise.js';
import { ecosystemHashUnit, ecosystemSiteHash, ecosystemSitePosition } from '../../../../src/app/landscape/ecosystem/EcosystemLattice.js';
import { createEcosystemTileData, writeEcosystemRecord } from '../../../../src/app/landscape/ecosystem/EcosystemTiles.js';
import { ecosystemSpatialStatistics } from '../../../../src/app/landscape/ecosystem/EcosystemStatistics.js';

export const BLUE_NOISE_RECEIPT = 'tests/artifacts/screens/landscape/ai599/d2/blue-noise.json';
export const BLUE_NOISE_MODULE = 'src/app/landscape/ecosystem/EcosystemBlueNoise.js';
export const BLUE_NOISE_THRESHOLDS = Object.freeze([.02, .1, .3]);
const BEGIN = 'const RANKS_BASE64 = [', END = '].join(\'\');';

/** Rewrites the marked table block of the module with a new rank table (the rest of the file is untouched). @param {string} file @param {Uint16Array} ranks */
export async function writeEcosystemBlueNoiseModule(file, ranks) {
    const text = await readFile(file, 'utf8'), begin = text.indexOf(BEGIN), end = text.indexOf(END);
    if (begin < 0 || end < begin) throw new Error(`[Ecosystem] ${file} has no committed table block`);
    const lines = (encodeEcosystemBlueNoiseRanks(ranks).match(/.{1,96}/g) ?? []).map(line => `    '${line}'`).join(',\n');
    await writeFile(file, `${text.slice(0, begin + BEGIN.length)}\n${lines}\n${text.slice(end)}`);
}

/**
 * Nearest-neighbour statistics of the sites a threshold keeps on one 64 x 64 period of the unit lattice jittered like the recipes (jitter 0.35), for the
 * committed ranks and for a white-noise selection of the same density (sites with a hashed unit value below the threshold), in site units.
 * @param {Uint16Array} ranks @param {number} threshold @param {number} [jitter]
 */
export function blueNoiseSelectionStatistics(ranks, threshold, jitter = .35) {
    const size = ECOSYSTEM_BLUE_NOISE_PARAMETERS.size, count = size * size, salt = 0x5eed, layer = { cell: { meters: size, sitesPerAxis: size }, jitter };
    const select = keep => {
        const tile = createEcosystemTileData(count);
        for (let siteZ = 0; siteZ < size; siteZ++) for (let siteX = 0; siteX < size; siteX++) {
            if (!keep(siteX, siteZ)) continue;
            const { x, z } = ecosystemSitePosition(layer, salt, siteX, siteZ);
            writeEcosystemRecord(tile, tile.count++, { x, y: 0, z, scale: 1, normalX: 0, normalZ: 0, yaw: 0, variant: 0, rank: 0, tint: [1, 1, 1], siteX, siteZ, child: -1 });
        }
        return ecosystemSpatialStatistics(tile.records, tile.count, { spacing: 1, minimumSpacing: 1, area: count });
    };
    const blue = select((siteX, siteZ) => (ranks[siteZ * size + siteX] + .5) / count < threshold), white = select((siteX, siteZ) => ecosystemHashUnit(ecosystemSiteHash(salt, siteX, siteZ, 0)) < threshold);
    const summary = statistics => ({ count: statistics.count, nearestMean: statistics.nearest?.mean ?? null, nearestMinimum: statistics.nearest?.minimum ?? null, nearestCoefficientOfVariation: statistics.nearest?.coefficientOfVariation ?? null,
        closePairsPerSite: statistics.closePairFraction, anisotropyChiSquare: statistics.anisotropy.chiSquare, anisotropyPasses: statistics.anisotropy.passes });
    return { threshold, jitter, blue: summary(blue), white: summary(white) };
}

/**
 * The spectral gate of one threshold: the blue selection spreads wider (mean nearest neighbour), more evenly (coefficient of variation), with far fewer pairs
 * closer than one site spacing, no worse a minimum, and isotropic nearest-neighbour directions. (At 30 % both selections contain axis-adjacent pairs, so
 * the minimum alone cannot separate them; the mean, variation and close-pair criteria do at every threshold.)
 */
export function blueNoiseBeatsWhite({ blue, white }) {
    return blue.count > 1 && white.count > 1 && blue.nearestMean > white.nearestMean * 1.1 && blue.nearestCoefficientOfVariation < white.nearestCoefficientOfVariation * .9
        && blue.closePairsPerSite < white.closePairsPerSite * .6 && blue.nearestMinimum >= white.nearestMinimum * .95 && blue.anisotropyPasses;
}

export const blueNoiseJob = {
    id: 'landscape/ecosystem/blue-noise', always: true, configurationPaths: [], codePaths: ['tools/bake_landscape'],
    description: 'Regenerate the committed 64 x 64 void-and-cluster rank table of the ecosystem lattice, require identical bytes and measure its spectral quality (--publish rewrites the module)',
    outputs: [BLUE_NOISE_RECEIPT], defaults: {}, options: {},
    async inputs() { return []; },
    async run(ctx) {
        const started = performance.now(), generated = generateEcosystemBlueNoiseRanks(), committed = ECOSYSTEM_BLUE_NOISE.ranks;
        const identical = generated.length === committed.length && generated.every((value, i) => value === committed[i]), seconds = (performance.now() - started) / 1000;
        const thresholds = BLUE_NOISE_THRESHOLDS.map(threshold => blueNoiseSelectionStatistics(generated, threshold));
        const spectral = thresholds.every(blueNoiseBeatsWhite);
        const receipt = { format: 'landscape-ecosystem-blue-noise-receipt', schemaVersion: 1, passed: identical && spectral, parameters: ECOSYSTEM_BLUE_NOISE_PARAMETERS, module: BLUE_NOISE_MODULE, identical, spectral, thresholds, generationSeconds: seconds, textBytes: ECOSYSTEM_BLUE_NOISE.text.length };
        const reportFile = path.join(ctx.stage, 'blue-noise.json');
        await writeJson(reportFile, receipt);
        const evidence = path.join(ctx.root, BLUE_NOISE_RECEIPT);
        await publishBakeFile(reportFile, evidence);
        ctx.log.line(ctx.id, `${receipt.passed ? 'PASS' : 'FAIL'}: regeneration ${identical ? 'identical' : 'DIFFERS'} (${seconds.toFixed(2)} s); ${thresholds.map(entry => `${Math.round(entry.threshold * 100)}%: nearest mean ${entry.blue.nearestMean?.toFixed(2)} vs white ${entry.white.nearestMean?.toFixed(2)}, close pairs/site ${entry.blue.closePairsPerSite.toFixed(3)} vs ${entry.white.closePairsPerSite.toFixed(3)}`).join('; ')}`);
        if (!identical) {
            if (!ctx.publish) throw new Error(`[Ecosystem] the committed blue-noise table differs from its regeneration; run with --publish to rewrite ${BLUE_NOISE_MODULE}`);
            await writeEcosystemBlueNoiseModule(path.join(ctx.root, BLUE_NOISE_MODULE), generated);
            throw new Error(`[Ecosystem] rewrote the blue-noise table in ${BLUE_NOISE_MODULE}; rerun the bake so every job imports the new table`);
        }
        if (!spectral) throw new Error('[Ecosystem] the blue-noise table does not beat a white-noise selection at every threshold');
        return { state: 'validated', reportFile, files: [reportFile, evidence] };
    },
    async validate(result) {
        const receipt = JSON.parse(await readFile(result.reportFile, 'utf8'));
        if (receipt.format !== 'landscape-ecosystem-blue-noise-receipt' || receipt.passed !== true) throw new Error('Blue-noise receipt does not record a passing check');
    }
};
