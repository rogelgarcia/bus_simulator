// Checks generated fine coverage: noise, the GLSL warp mirror, vector boundaries, seams, encoding, uniform markers, narrow features and overrides.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLandscapeModelFixture } from './landscape_model_fixture.js';
import { validateLandscapeManifest, createLandscapeSurfaceDetailIndex, landscapeSurfaceDetailKey, landscapeRegionSignedDistance, landscapeRegionContains, landscapeRegionNearestBoundaryPoint,
    LANDSCAPE_SURFACE_DETAIL_FORMAT, LANDSCAPE_SURFACE_DETAIL_MAX_WARP_METERS, LANDSCAPE_SURFACE_DETAIL_MAX_WARP_SLOPE } from '../../../src/app/landscape/index.js';
import { createLandscapeNaturalPresentation } from '../../../src/graphics/engine3d/landscape/LandscapeNaturalPresentation.js';
import { createLandscapeCoverageMask } from '../../../src/graphics/engine3d/landscape/LandscapeCoverageMask.js';
import { LANDSCAPE_SURFACE_COVERAGE, sampleLandscapeSurfaceCoverage, applyLandscapeContourCoverage, landscapeCoverageMaskLayout } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceCoverage.js';
import { LANDSCAPE_CONTOUR_COVERAGE } from '../../../src/graphics/engine3d/landscape/LandscapeContourCoverage.js';
import { LANDSCAPE_SURFACE_NOISE, landscapeLatticeNoise, landscapeNoiseSalt, createLandscapeNoiseOctaves, createLandscapeSurfaceWarp } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceNoise.js';
import { LANDSCAPE_SURFACE_BOUNDARY, createLandscapeSurfaceBoundaries, landscapeSurfaceBoundaryScratchBytes } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceBoundaries.js';
import { LANDSCAPE_SURFACE_DETAIL_RECIPE, validateLandscapeSurfaceDetailRecipe, landscapeSurfacePairProfile, landscapeSurfaceDetailSearchRadius, landscapeSurfaceDetailSeed,
    landscapeSurfaceWarpUniforms } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceDetailRecipe.js';
import { createLandscapeSurfaceDetailPage, createLandscapeNearFieldEvaluator, sampleLandscapeSurfaceDetail, landscapeSurfaceDetailUniformSoil, landscapeSurfaceDetailScratchBytes } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceDetailField.js';
import { landscapeCacheSkip } from '../../shared/landscapeCacheTest.js';

const recipe = LANDSCAPE_SURFACE_DETAIL_RECIPE;
const still = validateLandscapeSurfaceDetailRecipe({ ...structuredClone(recipe), warp: { ...structuredClone(recipe.warp), amplitudes: [0, 0, 0, 0] }, breakup: { ...structuredClone(recipe.breakup), amplitudes: [0, 0, 0, 0] } });
const UNIFORM = LANDSCAPE_CONTOUR_COVERAGE.uniformSupportCode;
const NATIVE = 1.953125, WARP = recipe.warp.amplitudes.reduce((sum, value) => sum + value, 0);
const PAIRS = []; for (let first = 0; first < 6; first++) for (let second = first + 1; second < 6; second++) PAIRS.push([first, second]);
const cacheSkip = landscapeCacheSkip();
const coastalUrl = new URL('../../../assets/public/landscape/coastal-city/manifest.json', import.meta.url);
const coastal = cacheSkip ? null : validateLandscapeManifest(JSON.parse(await readFile(coastalUrl, 'utf8')));
const coverCache = new Map();
async function coastalCover(id) {
    if (!coverCache.has(id)) coverCache.set(id, new Uint8Array(await readFile(new URL(coastal.chunks.find(chunk => chunk.id === id).channels.landCover.url, coastalUrl))));
    return coverCache.get(id);
}
const coastalOverview = cacheSkip ? null : coastal.chunks.find(chunk => chunk.id === coastal.overviewId);
const coastalPresentation = cacheSkip ? null : createLandscapeNaturalPresentation(coastal, { descriptor: coastalOverview, landCover: await coastalCover(coastalOverview.id) });
const coastalSeed = cacheSkip ? null : landscapeSurfaceDetailSeed(coastal.id, recipe), coastalIndex = cacheSkip ? null : createLandscapeSurfaceDetailIndex(coastal, { levels: 3 });
const coastalPages = new Map();

function random(seed) { let state = seed >>> 0; return () => (state = Math.imul(state, 1664525) + 1013904223 >>> 0) / 4294967296; }

async function coastalPage(id, pageRecipe = recipe) {
    const key = `${id}|${pageRecipe === recipe ? 'recipe' : 'still'}`;
    if (!coastalPages.has(key)) coastalPages.set(key, await createLandscapeSurfaceDetailPage({ manifest: coastal, descriptor: coastalIndex.descriptor(id), recipe: pageRecipe,
        seed: landscapeSurfaceDetailSeed(coastal.id, pageRecipe), presentation: coastalPresentation, loadCover: async owner => ({ landCover: await coastalCover(owner) }) }));
    return coastalPages.get(key);
}

function fixtureContext(options, overrides = []) {
    const fixture = createLandscapeModelFixture(options);
    const manifest = overrides.length ? withOverrides(fixture.manifest, overrides) : fixture.manifest, root = fixture.decoded.get(manifest.overviewId);
    return { manifest, decoded: fixture.decoded, presentation: createLandscapeNaturalPresentation(manifest, root), index: createLandscapeSurfaceDetailIndex(manifest, { levels: 3 }),
        loadCover: async id => ({ landCover: fixture.decoded.get(id).landCover }) };
}

function withOverrides(manifest, entries) {
    const draft = structuredClone(manifest);
    draft.capabilities = [...new Set([...draft.capabilities, 'terrain-editing-v1', 'terrain-editing-v2'])];
    draft.revision = 'fixture-overrides';
    draft.operations = entries.map((entry, sequence) => ({ id: `soil-${sequence}`, type: 'assign-soil', soilId: entry.soilId, region: entry.region, falloff: { type: 'none' }, sequence, batchId: 'batch-1' }));
    draft.soil.overrides = entries.map((entry, sequence) => ({ id: `soil-${sequence}`, sequence, batchId: 'batch-1', soilId: entry.soilId, region: entry.region }));
    draft.editHistory = { batchIds: ['batch-1'], lastBatchId: 'batch-1', previousManifestUrl: `manifest.${'0'.repeat(64)}.json` };
    return validateLandscapeManifest(draft);
}

function texelAt(page, descriptor, column, row) {
    const width = descriptor.columns + 4, localColumn = column - descriptor.fineStartColumn + 2, localRow = row - descriptor.fineStartRow + 2;
    assert.ok(localColumn >= 0 && localColumn < width && localRow >= 0 && localRow < descriptor.rows + 4, `${column},${row} outside ${descriptor.id}`);
    const offset = (localRow * width + localColumn) * 4;
    return page.pixels.subarray(offset, offset + 4);
}

function codeOf(texel) { return texel[2] | texel[3] << 8; }

function pageEvaluator(descriptor, pixels) {
    const width = descriptor.columns + 4, height = descriptor.rows + 4, labels = new Uint8Array(width * height), codes = new Uint16Array(width * height);
    for (let i = 0; i < labels.length; i++) { labels[i] = pixels[i * 4] >> 4; codes[i] = pixels[i * 4 + 2] | pixels[i * 4 + 3] << 8; }
    return createLandscapeNearFieldEvaluator({ originColumn: -2, originRow: -2, width, height, labels, codes, minX: descriptor.bounds.minX, maxZ: descriptor.bounds.maxZ,
        spacingX: (descriptor.bounds.maxX - descriptor.bounds.minX) / (descriptor.columns - 1), spacingZ: (descriptor.bounds.maxZ - descriptor.bounds.minZ) / (descriptor.rows - 1),
        clampMinColumn: 0, clampMaxColumn: descriptor.columns - 1, clampMinRow: 0, clampMaxRow: descriptor.rows - 1, soilCount: 6 });
}

function referenceCoverage(descriptor, pixels, x, z, dx = [0, 0], dy = [0, 0]) {
    const layout = landscapeCoverageMaskLayout(descriptor), { bounds, columns, rows } = descriptor;
    const spacingX = (bounds.maxX - bounds.minX) / (columns - 1), spacingZ = (bounds.maxZ - bounds.minZ) / (rows - 1);
    const base = sampleLandscapeSurfaceCoverage({ bounds, columns, rows, x, z, dx, dy, soilCount: 6, soilAt: (column, row) => pixels[((row + 2) * layout.width + column + 2) * 4] >> 4 });
    return applyLandscapeContourCoverage(base, { pixels, width: layout.width, height: layout.height, columns, rows, spacingX, spacingZ,
        xGrid: (x - bounds.minX) / spacingX, zGrid: (bounds.maxZ - z) / spacingZ, dx, dy });
}

function compareShared(first, firstDescriptor, second, secondDescriptor) {
    const range = (a, b, key, size) => [Math.max(a[key] - 2, b[key] - 2), Math.min(a[key] + a[size] + 1, b[key] + b[size] + 1)];
    const [minColumn, maxColumn] = range(firstDescriptor, secondDescriptor, 'fineStartColumn', 'columns'), [minRow, maxRow] = range(firstDescriptor, secondDescriptor, 'fineStartRow', 'rows');
    let compared = 0, mismatches = 0;
    for (let row = minRow; row <= maxRow; row++) for (let column = minColumn; column <= maxColumn; column++) {
        const a = texelAt(first, firstDescriptor, column, row), b = texelAt(second, secondDescriptor, column, row);
        compared++;
        if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2] || a[3] !== b[3]) mismatches++;
    }
    return { compared, mismatches };
}

// synthetic native label windows on the coastal native spacing; world z decreases with rows from 1000
function boundariesOf(width, height, labelAt, { originColumn = 0, originRow = 0, farDistance = 6 } = {}) {
    const labels = new Uint8Array(width * height);
    for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) labels[r * width + c] = labelAt(originColumn + c, originRow + r);
    const boundaries = createLandscapeSurfaceBoundaries({ labels, width, height, originColumn, originRow, minX: 0, maxZ: 1000, spacingX: NATIVE, spacingZ: NATIVE, soilCount: 6, farDistance, parameters: recipe.boundary });
    assert.ok(boundaries.scratchBytes <= landscapeSurfaceBoundaryScratchBytes(width, height, recipe.boundary), 'boundary scratch exceeds its bound');
    return boundaries;
}
const worldX = column => column * NATIVE, worldZ = row => 1000 - row * NATIVE;

function maxTurning(chain, keep = () => true) {
    let maximum = 0;
    const n = chain.x.length, count = chain.closed ? n : n - 2;
    for (let k = 0; k < count; k++) {
        const a = k, b = (k + 1) % n, c = (k + 2) % n;
        if (!keep(chain.x[b], chain.z[b])) continue;
        const ux = chain.x[b] - chain.x[a], uz = chain.z[b] - chain.z[a], vx = chain.x[c] - chain.x[b], vz = chain.z[c] - chain.z[b];
        maximum = Math.max(maximum, Math.atan2(Math.abs(ux * vz - uz * vx), ux * vx + uz * vz) * 180 / Math.PI);
    }
    return maximum;
}

function distanceToChains(chains, x, z) {
    let best = Infinity;
    for (const chain of chains) {
        const n = chain.x.length, segments = chain.closed ? n : n - 1;
        for (let k = 0; k < segments; k++) {
            const ax = chain.x[k], az = chain.z[k], bx = chain.x[(k + 1) % n], bz = chain.z[(k + 1) % n], ex = bx - ax, ez = bz - az;
            const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)));
            best = Math.min(best, Math.hypot(x - ax - t * ex, z - az - t * ez));
        }
    }
    return best;
}

// float32 mirror of chunks/landscape/surface_warp.glsl built from the constants parsed out of the shader source
function glslWarpMirror(source, uniforms, defines) {
    const f = Math.fround, table = /LANDSCAPE_WARP_GRADIENTS\[16\] = vec2\[16\]\(([\s\S]*?)\);/.exec(source);
    const mix = /uint h = \(value \^ \(value >> 16u\)\) \* (0x[0-9a-f]+)u;\s*h = \(h \^ \(h >> 13u\)\) \* (0x[0-9a-f]+)u;\s*return h \^ \(h >> 16u\);/.exec(source);
    const hash = /landscapeWarpMix\(\(uint\(i\) \* (0x[0-9a-f]+)u\) \^ \(uint\(j\) \* (0x[0-9a-f]+)u\) \^ salt\) >> 28u/.exec(source);
    const normalization = /\* s\.y\) \* ([0-9.]+);/.exec(source);
    assert.ok(table && mix && hash && normalization, 'surface_warp.glsl no longer exposes the mirrored arithmetic');
    assert.ok(source.includes('vec2 s = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);') && source.includes('return n * (15.0 - 10.0 * n * n + 3.0 * n * n * n * n) * 0.125;'));
    const gradients = [...table[1].matchAll(/vec2\(([-0-9.]+), ([-0-9.]+)\)/g)].map(match => [f(Number(match[1])), f(Number(match[2]))]);
    assert.equal(gradients.length, 16);
    const [mixA, mixB, hashI, hashJ] = [mix[1], mix[2], hash[1], hash[2]].map(Number), norm = f(Number(normalization[1]));
    const { uLandscapeWarpWaves: waves, uLandscapeWarpOffsets: offsets, uLandscapeWarpSalts: salts } = uniforms, count = Number(defines.LANDSCAPE_SURFACE_WARP_OCTAVES), quintic = 'LANDSCAPE_SURFACE_WARP_QUINTIC' in defines;
    const hashMix = value => { let h = Math.imul((value ^ value >>> 16) >>> 0, mixA) >>> 0; h = Math.imul((h ^ h >>> 13) >>> 0, mixB) >>> 0; return (h ^ h >>> 16) >>> 0; };
    const corner = (i, j, salt, dx, dz) => { const g = gradients[hashMix((Math.imul(i, hashI) ^ Math.imul(j, hashJ) ^ salt) >>> 0) >>> 28]; return f(f(g[0] * dx) + f(g[1] * dz)); };
    const fade = t => f(f(f(t * t) * t) * f(f(t * f(f(t * 6) - 15)) + 10));
    const lattice = (u, v, salt) => {
        const cu = Math.floor(u), cv = Math.floor(v), fu = f(u - cu), fv = f(v - cv), su = fade(fu), sv = fade(fv);
        const a = corner(cu, cv, salt, fu, fv), b = corner(cu + 1, cv, salt, f(fu - 1), fv), c = corner(cu, cv + 1, salt, fu, f(fv - 1)), d = corner(cu + 1, cv + 1, salt, f(fu - 1), f(fv - 1));
        const top = f(a + f(f(b - a) * su));
        return f(f(top + f(f(f(c + f(f(d - c) * su)) - top) * sv)) * norm);
    };
    const shape = n => quintic ? f(f(n * f(f(15 - f(f(10 * n) * n)) + f(f(f(f(3 * n) * n) * n) * n))) * .125) : n;
    return (x, z) => {
        const X = f(x), Z = f(z);
        let warpX = 0, warpZ = 0;
        for (let k = 0; k < count; k++) {
            const inverse = waves[k * 4], amplitude = waves[k * 4 + 1], cosine = waves[k * 4 + 2], sine = waves[k * 4 + 3];
            const u = f(f(f(cosine * X) - f(sine * Z)) * inverse), v = f(f(f(sine * X) + f(cosine * Z)) * inverse);
            warpX = f(warpX + f(amplitude * shape(lattice(f(u + offsets[k * 4]), f(v + offsets[k * 4 + 1]), salts[k * 2] >>> 0))));
            warpZ = f(warpZ + f(amplitude * shape(lattice(f(u + offsets[k * 4 + 2]), f(v + offsets[k * 4 + 3]), salts[k * 2 + 1] >>> 0))));
        }
        return [warpX, warpZ];
    };
}

test('Surface noise: integer-hashed gradient noise is bit-stable, salted, smooth and strictly bounded, with ridged breakup octaves', { skip: cacheSkip }, () => {
    assert.deepEqual([landscapeNoiseSalt(0, 0, 0), landscapeNoiseSalt(3989206803, 1, 2), landscapeNoiseSalt(4294967295, 2, 0)], [1624822673, 1995532019, 2515639072]);
    assert.deepEqual([[.5, .5, 123], [10.25, -3.75, 987654321], [-7.125, 1e3 + .0625, 42]].map(([u, v, salt]) => landscapeLatticeNoise(u, v, salt)),
        [-0.44922422887176294, 0.06379158603426209, -0.1013011978426502]);
    const plain = createLandscapeNoiseOctaves({ seed: 3989206803, component: 0, wavelengths: [32, 16, 8, 4], amplitudes: [.45, .35, .25, .15] });
    assert.deepEqual([[1071.2890625, 914.0625], [0, 0], [3999.5, .25]].map(([x, z]) => plain.evaluate(x, z)), [0.38259995923210866, -0.1989044961724695, 0.21202761343600057]);
    assert.notEqual(landscapeNoiseSalt(7, 0, 0), landscapeNoiseSalt(7, 1, 0));
    assert.notEqual(landscapeNoiseSalt(7, 0, 0), landscapeNoiseSalt(7, 0, 1));
    const next = random(11);
    let maximum = 0;
    for (let i = 0; i < 200000; i++) maximum = Math.max(maximum, Math.abs(landscapeLatticeNoise(next() * 64 - 32, next() * 64 - 32, (i * 2654435761) >>> 0)));
    assert.ok(maximum < 1 && maximum > .8, `${maximum}`);
    for (const k of [-3, 0, 5]) for (const v of [.1, .5, .77]) {
        const left = landscapeLatticeNoise(k - 1e-9, v, 99), right = landscapeLatticeNoise(k + 1e-9, v, 99);
        const slopeLeft = (landscapeLatticeNoise(k - 1e-6, v, 99) - landscapeLatticeNoise(k - 2e-6, v, 99)) / 1e-6, slopeRight = (landscapeLatticeNoise(k + 2e-6, v, 99) - landscapeLatticeNoise(k + 1e-6, v, 99)) / 1e-6;
        assert.ok(Math.abs(left - right) < 1e-7 && Math.abs(slopeLeft - slopeRight) < 1e-3, `${k},${v}`);
    }
    const ridged = createLandscapeNoiseOctaves({ seed: 5, component: 2, wavelengths: [8, 4], amplitudes: [.5, .35], shaping: 'ridged-mix', ridgedMix: .35 });
    assert.equal(ridged.amplitude, .85 * 1.175);
    for (let i = 0; i < 2000; i++) {
        const x = next() * 500, z = next() * 500;
        const manual = [[8, .5, 0], [4, .35, 1]].reduce((sum, [wavelength, amplitude, octave]) => {
            const salt = landscapeNoiseSalt(5, 2, octave), rotation = [[1, 0], [.8, .6]][octave], inverse = 1 / wavelength;
            const n = landscapeLatticeNoise((rotation[0] * x - rotation[1] * z) * inverse + (salt & 0xffff) / 65536, (rotation[1] * x + rotation[0] * z) * inverse + (salt >>> 16) / 65536, salt);
            return sum + amplitude * (.65 * n + .35 * (.5 - 2 * Math.abs(n)));
        }, 0);
        assert.ok(Math.abs(ridged.evaluate(x, z) - manual) < 1e-12 && Math.abs(manual) < ridged.amplitude);
    }
    const breakup = level => createLandscapeNoiseOctaves({ seed: 1, component: 2, wavelengths: [...recipe.breakup.wavelengths], amplitudes: [...recipe.breakup.amplitudes],
        minimumWavelength: recipe.octaveMinimumSamples * coastalIndex.spacing(level).x, shaping: 'ridged-mix', ridgedMix: recipe.breakup.ridgedMix }).wavelengths;
    assert.deepEqual([breakup(4), breakup(5), breakup(6)], [[8, 4], [8, 4, 2], [8, 4, 2, 1]]);
    assert.equal(recipe.warp.noise, LANDSCAPE_SURFACE_NOISE.id);
    assert.throws(() => landscapeLatticeNoise(NaN, 0, 1), /finite/);
    assert.throws(() => landscapeNoiseSalt(-1, 0, 0), /unsigned/);
    assert.throws(() => createLandscapeNoiseOctaves({ seed: 1, component: 0, wavelengths: [1], amplitudes: [-1] }), /octaves/);
    assert.throws(() => createLandscapeNoiseOctaves({ seed: 1, component: 0, wavelengths: [1], amplitudes: [1], ridgedMix: .2 }), /shaping/);
    assert.throws(() => createLandscapeSurfaceWarp({ seed: 1, wavelengths: [1], amplitudes: [1], shaping: 'cubic' }), /shaping/);
});

test('Surface warp: about one meter of mean displacement per axis, bounded peak, no folding, and an exact float32 GLSL mirror', { skip: cacheSkip }, async t => {
    const warp = createLandscapeSurfaceWarp({ seed: coastalSeed, wavelengths: [...recipe.warp.wavelengths], amplitudes: [...recipe.warp.amplitudes], shaping: recipe.warp.shaping });
    assert.equal(warp.maxDisplacement, WARP);
    assert.ok(WARP <= LANDSCAPE_SURFACE_DETAIL_MAX_WARP_METERS && recipe.warp.amplitudes.reduce((sum, a, k) => sum + 2 * Math.PI * a / recipe.warp.wavelengths[k], 0) <= LANDSCAPE_SURFACE_DETAIL_MAX_WARP_SLOPE);
    const next = random(17), out = new Float64Array(2), ox = new Float64Array(2), oz = new Float64Array(2);
    let sumX = 0, sumZ = 0, peak = 0, jacobian = 0, determinant = Infinity;
    const samples = 60000;
    for (let i = 0; i < samples; i++) {
        const x = next() * 4000, z = next() * 4000, e = 1e-4;
        warp.evaluate(x, z, out);
        sumX += Math.abs(out[0]); sumZ += Math.abs(out[1]); peak = Math.max(peak, Math.abs(out[0]), Math.abs(out[1]));
        if (i % 3) continue;
        warp.evaluate(x + e, z, ox); warp.evaluate(x, z + e, oz);
        const a = (ox[0] - out[0]) / e, b = (oz[0] - out[0]) / e, c = (ox[1] - out[1]) / e, d = (oz[1] - out[1]) / e;
        jacobian = Math.max(jacobian, Math.hypot(a, b, c, d)); determinant = Math.min(determinant, (1 + a) * (1 + d) - b * c);
    }
    const meanX = sumX / samples, meanZ = sumZ / samples;
    assert.ok(meanX > .75 && meanX < 1 && meanZ > .75 && meanZ < 1, `mean |W| ${meanX} ${meanZ}`);
    assert.ok(peak < WARP && peak > 2, `peak ${peak}`);
    assert.ok(jacobian < .6 && determinant > .4, `warp folds: |J| ${jacobian}, det ${determinant}`);
    for (let n = -1; n < 1; n += 1 / 64) {
        const shape = value => value * (15 - 10 * value * value + 3 * value * value * value * value) / 8;
        assert.ok(shape(n + 1 / 64) > shape(n) && Math.abs(shape(n)) <= 1);
    }
    t.diagnostic(`warp mean |Wx| ${meanX.toFixed(3)} m, mean |Wz| ${meanZ.toFixed(3)} m, peak ${peak.toFixed(3)} m, max |J| ${jacobian.toFixed(3)}, min det(I+J) ${determinant.toFixed(3)}`);
    const source = await readFile(new URL('../../../src/graphics/shaders/chunks/landscape/surface_warp.glsl', import.meta.url), 'utf8'), shader = landscapeSurfaceWarpUniforms(recipe, coastalSeed);
    assert.deepEqual({ ...shader.defines }, { LANDSCAPE_SURFACE_WARP_OCTAVES: '4', LANDSCAPE_SURFACE_WARP_QUINTIC: '' });
    assert.ok(shader.uniforms.uLandscapeWarpWaves instanceof Float32Array && shader.uniforms.uLandscapeWarpOffsets instanceof Float32Array && shader.uniforms.uLandscapeWarpSalts instanceof Int32Array);
    assert.deepEqual([shader.uniforms.uLandscapeWarpWaves.length, shader.uniforms.uLandscapeWarpOffsets.length, shader.uniforms.uLandscapeWarpSalts.length, shader.maxDisplacementMeters], [16, 16, 8, WARP]);
    recipe.warp.wavelengths.forEach((wavelength, k) => {
        assert.equal(shader.uniforms.uLandscapeWarpWaves[k * 4], Math.fround(1 / wavelength));
        assert.equal(shader.uniforms.uLandscapeWarpWaves[k * 4 + 1], Math.fround(recipe.warp.amplitudes[k]));
        assert.equal(shader.uniforms.uLandscapeWarpSalts[k * 2], landscapeNoiseSalt(coastalSeed, 0, k) | 0);
    });
    for (const name of ['uniform vec4 uLandscapeWarpWaves[LANDSCAPE_SURFACE_WARP_OCTAVES];', 'uniform vec4 uLandscapeWarpOffsets[LANDSCAPE_SURFACE_WARP_OCTAVES];',
        'uniform ivec2 uLandscapeWarpSalts[LANDSCAPE_SURFACE_WARP_OCTAVES];', 'vec2 landscapeSurfaceWarp(vec2 worldXZ)', '#ifdef LANDSCAPE_SURFACE_WARP_QUINTIC']) assert.ok(source.includes(name), name);
    const mirror = glslWarpMirror(source, shader.uniforms, shader.defines);
    let difference = 0;
    const points = [[0, 0], [4000, 4000], [1071.2890625, 914.0625], [-50, 4050], [2000.0001, 1999.9999]];
    for (let i = 0; i < 40000; i++) points.push([next() * 4100 - 50, next() * 4100 - 50]);
    for (const [x, z] of points) {
        const [gx, gz] = mirror(x, z);
        warp.evaluate(x, z, out);
        difference = Math.max(difference, Math.abs(gx - out[0]), Math.abs(gz - out[1]));
    }
    assert.ok(difference < 1e-3, `GLSL mirror differs by ${difference} m`);
    t.diagnostic(`float32 GLSL mirror vs JavaScript warp: max difference ${difference.toExponential(2)} m over ${points.length} points`);
});

test('Surface detail recipe: data-driven pair profiles, per-level search radii and validated variants', { skip: cacheSkip }, () => {
    assert.ok(Object.isFrozen(recipe) && Object.isFrozen(recipe.pairProfiles.pairs[0].soils) && Object.isFrozen(recipe.warp.amplitudes) && Object.isFrozen(recipe.boundary.loops));
    assert.deepEqual([recipe.id, recipe.family, recipe.levels, recipe.transitionReferenceWidth, recipe.maxTransitionWidth, recipe.measuredDetail], ['landscape-surface-detail-v4', 'landscape-surface-detail', 3, .75, 2.5, false]);
    const { family, ...unversioned } = structuredClone(recipe);
    assert.equal(family, 'landscape-surface-detail');
    assert.throws(() => validateLandscapeSurfaceDetailRecipe(unversioned), /recipe.family/);
    assert.deepEqual({ ...recipe.base }, { labels: 'natural-terrain-inference-v1', boundary: LANDSCAPE_SURFACE_BOUNDARY.id, encoding: LANDSCAPE_CONTOUR_COVERAGE.id });
    assert.deepEqual([recipe.boundary.saddle, recipe.boundary.smoothing, recipe.boundary.kernel], [LANDSCAPE_SURFACE_BOUNDARY.saddle, LANDSCAPE_SURFACE_BOUNDARY.smoothing, LANDSCAPE_SURFACE_BOUNDARY.kernel]);
    assert.equal(recipe.transitionReferenceWidth, LANDSCAPE_SURFACE_COVERAGE.blendWidthMeters);
    assert.deepEqual([[...recipe.warp.wavelengths], [...recipe.warp.amplitudes], recipe.warp.shaping, [...recipe.breakup.wavelengths], [...recipe.breakup.amplitudes], recipe.breakup.shaping, recipe.breakup.ridgedMix],
        [[48, 24, 12, 6], [1.8, .75, .35, .1], 'quintic-odd', [8, 4, 2, 1], [.5, .35, .2, .1], 'ridged-mix', .35]);
    const profile = (a, b) => { const value = landscapeSurfacePairProfile(recipe, a, b); return [value.widthMeters, value.breakup, value.source]; };
    assert.deepEqual(profile('sand', 'loam'), [1.2, 1.6, 'pair:loam|sand']);
    assert.deepEqual(profile('loam', 'sand'), profile('sand', 'loam'));
    assert.deepEqual(profile('seabed', 'sand'), [2, .35, 'pair:sand|seabed']);
    assert.deepEqual(profile('loam', 'forest'), [2, 1.8, 'pair:forest|loam']);
    assert.deepEqual(profile('forest', 'sand'), [1.4, 1.3, 'pair:forest|sand']);
    assert.deepEqual(profile('seabed', 'loam'), [1.4, .8, 'pair:loam|seabed']);
    assert.deepEqual(profile('forest', 'seabed'), [1.4, .8, 'pair:forest|seabed']);
    assert.deepEqual(profile('rock', 'unknown'), [.8, 1.5, 'partner:rock']);
    assert.deepEqual(profile('sand', 'rock'), [.8, 1.5, 'partner:rock']);
    assert.deepEqual(profile('unknown', 'forest'), [1.2, 1.2, 'partner:unknown']);
    assert.deepEqual(profile('clay', 'sand'), [1, 1, 'default']);
    assert.throws(() => landscapeSurfacePairProfile(recipe, 'sand', 'sand'), /two different/);
    assert.deepEqual([4, 5, 6].map(level => landscapeSurfaceDetailSearchRadius(recipe, coastalIndex.spacing(level).x)), [7, 11, 19]);
    const slope = recipe.warp.amplitudes.reduce((sum, a, k) => sum + 2 * Math.PI * a / recipe.warp.wavelengths[k], 0);
    const factor = Math.max(recipe.pairProfiles.default.breakup, ...recipe.pairProfiles.pairs.map(entry => entry.breakup), ...recipe.pairProfiles.partners.map(entry => entry.breakup));
    const reach = recipe.breakup.amplitudes.reduce((sum, value) => sum + value, 0) * (1 + recipe.breakup.ridgedMix / 2) * factor;
    for (const level of [4, 5, 6]) {
        const spacing = coastalIndex.spacing(level).x, radius = landscapeSurfaceDetailSearchRadius(recipe, spacing) * spacing;
        assert.ok(radius - (recipe.maxTransitionWidth / 2 + reach) >= Math.SQRT2 * (1 + slope) * spacing, `L${level}: an unsaturated ramp could reach a cell whose corners are all invalid`);
    }
    const variant = changes => validateLandscapeSurfaceDetailRecipe({ ...structuredClone(recipe), ...changes });
    assert.equal(still.warp.amplitudes.reduce((sum, value) => sum + value, 0), 0);
    for (const [changes, pattern] of [
        [{ warp: { ...structuredClone(recipe.warp), amplitudes: [2.5, .75, .35, .1] } }, /displace at most/],
        [{ warp: { ...structuredClone(recipe.warp), amplitudes: [.5, .5, .5, .5] } }, /cannot fold/],
        [{ warp: { ...structuredClone(recipe.warp), shaping: 'cubic' } }, /shaping/],
        [{ breakup: { ...structuredClone(recipe.breakup), amplitudes: [2, 1, .5, .3] } }, /breakup displacement/],
        [{ breakup: { ...structuredClone(recipe.breakup), wavelengths: [1, 2, 4, 8] } }, /strictly decreasing/],
        [{ breakup: { ...structuredClone(recipe.breakup), ridgedMix: 1.5 } }, /ridgedMix/],
        [{ breakup: { ...structuredClone(recipe.breakup), junctionFadeMeters: 0 } }, /junctionFadeMeters/],
        [{ boundary: { ...structuredClone(recipe.boundary), gapFraction: .6 } }, /boundary/],
        [{ boundary: { ...structuredClone(recipe.boundary), loops: { ...structuredClone(recipe.boundary.loops), mu: -.4 } } }, /Taubin/],
        [{ boundary: { ...structuredClone(recipe.boundary), gapSegments: 0 } }, /gapSegments/],
        [{ base: { labels: 'x', boundary: 'y' } }, /recipe.base/],
        [{ pairProfiles: { ...structuredClone(recipe.pairProfiles), default: { widthMeters: 3, breakup: 1 } } }, /width/],
        [{ search: { minimumSamples: 4, guardSamples: 2 } }, /guardSamples/],
        [{ pairProfiles: { ...structuredClone(recipe.pairProfiles), pairs: [...structuredClone(recipe.pairProfiles.pairs), { soils: ['sand', 'loam'], widthMeters: 1, breakup: 1 }] } }, /duplicate pair/],
        [{ family: 'landscape-surface' }, /version of recipe.family/], [{ family: 'other-detail' }, /version of recipe.family/],
        [{ levels: 0 }, /levels/], [{ levels: 5 }, /levels/], [{ measuredDetail: true }, /never measured/], [{ search: { minimumSamples: 2, guardSamples: 3 } }, /minimumSamples/]
    ]) assert.throws(() => variant(changes), pattern, JSON.stringify(changes));
    assert.deepEqual([LANDSCAPE_SURFACE_DETAIL_FORMAT.storedHaloSamples, LANDSCAPE_SURFACE_DETAIL_FORMAT.uniformMinOffset, LANDSCAPE_SURFACE_DETAIL_FORMAT.uniformMaxOffset, LANDSCAPE_SURFACE_DETAIL_FORMAT.overrideProbeMeters],
        [LANDSCAPE_CONTOUR_COVERAGE.storedHaloSamples, LANDSCAPE_CONTOUR_COVERAGE.uniformSupportMinOffset, LANDSCAPE_CONTOUR_COVERAGE.uniformSupportMaxOffset, .001]);
    assert.equal(LANDSCAPE_SURFACE_COVERAGE.haloSamples, LANDSCAPE_SURFACE_DETAIL_FORMAT.storedHaloSamples);
});

test('Near-field evaluator: the allocation-free D1 reconstruction equals the reference at zero footprint, including edges and exterior clamps', { skip: cacheSkip }, async t => {
    const fixture = fixtureContext({ chunkIntervals: 16, maxLevel: 2, coverAt: (column, row) => (column * 7 + row * 3) % 11 < 4 ? 3 : column > row ? 1 : (column + row) % 9 === 0 ? 5 : 2 });
    const cases = [{ manifest: coastal, presentation: coastalPresentation, id: 'l3/c2/r6', loadCover: async id => ({ landCover: await coastalCover(id) }) },
        { manifest: coastal, presentation: coastalPresentation, id: 'l3/c0/r0', loadCover: async id => ({ landCover: await coastalCover(id) }) },
        { manifest: fixture.manifest, presentation: fixture.presentation, id: 'l2/c1/r2', loadCover: fixture.loadCover },
        { manifest: fixture.manifest, presentation: fixture.presentation, id: 'l2/c3/r3', loadCover: fixture.loadCover }];
    for (const entry of cases) {
        const descriptor = entry.manifest.chunks.find(chunk => chunk.id === entry.id);
        const mask = await createLandscapeCoverageMask({ manifest: entry.manifest, manifestUrl: 'https://fixture.invalid/manifest.json', presentation: entry.presentation, chunkId: entry.id, loadCover: entry.loadCover });
        const evaluator = pageEvaluator(descriptor, mask.pixels), { bounds } = descriptor, spacing = (bounds.maxX - bounds.minX) / (descriptor.columns - 1), next = random(entry.id.length * 977);
        const points = [], layout = landscapeCoverageMaskLayout(descriptor), transitions = [];
        const at = (column, row) => ((row + 2) * layout.width + column + 2) * 4;
        for (let row = 0; row < descriptor.rows - 1; row++) for (let column = 0; column < descriptor.columns - 1; column++) {
            const soil = mask.pixels[at(column, row)] >> 4;
            let mixed = mask.pixels[at(column, row) + 3] >> 4 !== 15;
            for (let dr = -1; dr <= 2 && !mixed; dr++) for (let dc = -1; dc <= 2; dc++) if (mask.pixels[at(column + dc, row + dr)] >> 4 !== soil) { mixed = true; break; }
            if (mixed) transitions.push([column, row]);
        }
        for (let i = 0; i < 1000; i++) points.push([bounds.minX + next() * (bounds.maxX - bounds.minX), bounds.minZ + next() * (bounds.maxZ - bounds.minZ)]);
        for (let i = 0; i < 2000 && transitions.length; i++) {
            const [column, row] = transitions[Math.floor(next() * transitions.length)];
            points.push([bounds.minX + (column + next()) * spacing, bounds.maxZ - (row + next()) * spacing]);
        }
        for (let i = 0; i < 200; i++) {
            const along = bounds.minX + next() * (bounds.maxX - bounds.minX), across = bounds.minZ + next() * (bounds.maxZ - bounds.minZ), e = [0, 1e-9, 1e-6, -1e-6][i % 4];
            points.push([bounds.minX + Math.abs(e), across], [bounds.maxX - Math.abs(e), across], [along, bounds.minZ + Math.abs(e)], [along, bounds.maxZ - Math.abs(e)],
                [bounds.minX + Math.round(next() * (descriptor.columns - 1)) * spacing, across], [bounds.minX - 3 * next(), bounds.maxZ + 3 * next()], [bounds.maxX + 3 * next(), bounds.minZ - 3 * next()]);
        }
        let maximum = 0, boundary = 0;
        const out = new Float64Array(6);
        for (const [x, z] of points) {
            const reference = referenceCoverage(descriptor, mask.pixels, x, z).weights, value = evaluator.evaluate(x, z, out);
            for (let soil = 0; soil < 6; soil++) maximum = Math.max(maximum, Math.abs(value[soil] - reference[soil]));
            if (Math.max(...reference) < 1) boundary++;
            assert.ok(Math.abs(value.reduce((sum, weight) => sum + weight, 0) - 1) < 1e-12);
        }
        assert.ok(maximum <= 1e-9, `${entry.id}: ${maximum}`);
        assert.ok(entry.id === 'l3/c0/r0' ? transitions.length === 0 : boundary > 100, `${entry.id} exercised ${boundary} transition samples`);
        t.diagnostic(`${entry.id}: ${points.length} points, ${boundary} inside transitions, maximum difference ${maximum}`);
    }
    const tiny = { originColumn: 0, originRow: 0, width: 4, height: 4, labels: new Uint8Array(16), codes: new Uint16Array(16).fill(0xf000), minX: 0, maxZ: 10, spacingX: 1, spacingZ: 1,
        clampMinColumn: 0, clampMaxColumn: 20, clampMinRow: 0, clampMaxRow: 20, soilCount: 6 };
    assert.throws(() => createLandscapeNearFieldEvaluator(tiny).evaluate(9, 1, new Float64Array(6)), /outside its canonical support window/);
    assert.throws(() => createLandscapeNearFieldEvaluator({ ...tiny, labels: new Uint8Array(16).fill(6) }), /unknown display soil/);
});

test('Vector boundaries: digitized staircases straighten to within 0.15 m RMS of their best-fit line', async t => {
    const report = [];
    for (const [name, slope] of [['1/3', 1 / 3], ['1/7', 1 / 7], ['1', 1]]) for (const offset of [0, .37, .71]) {
        const boundaries = boundariesOf(64, 64, (c, r) => r + offset < slope * c + 8 ? 2 : 3), chain = boundaries.chainPolylines().reduce((a, b) => b.x.length > a.x.length ? b : a);
        assert.deepEqual([...chain.labels], [2, 3]);
        const points = [];
        for (let i = 0; i + 1 < chain.x.length; i++) for (let k = 0; k < 8; k++) {
            const x = chain.x[i] + (chain.x[i + 1] - chain.x[i]) * k / 8, z = chain.z[i] + (chain.z[i + 1] - chain.z[i]) * k / 8, column = x / NATIVE, row = (1000 - z) / NATIVE;
            if (column > 12 && column < 51 && row > 12 && row < 51) points.push([x, z]);
        }
        assert.ok(points.length > 40, `${name}: ${points.length}`);
        let cx = 0, cz = 0;
        for (const [x, z] of points) { cx += x; cz += z; }
        cx /= points.length; cz /= points.length;
        let a = 0, b = 0, d = 0;
        for (const [x, z] of points) { a += (x - cx) ** 2; b += (x - cx) * (z - cz); d += (z - cz) ** 2; }
        const angle = Math.atan2(2 * b, a - d) / 2, nx = -Math.sin(angle), nz = Math.cos(angle);
        const rms = Math.sqrt(points.reduce((sum, [x, z]) => sum + ((x - cx) * nx + (z - cz) * nz) ** 2, 0) / points.length);
        assert.ok(rms < .15, `slope ${name} offset ${offset}: ${rms} m RMS`);
        report.push(`${name}@${offset} ${rms.toFixed(3)}`);
    }
    t.diagnostic(`staircase RMS from best-fit line (m): ${report.join(', ')}`);
});

test('Vector boundaries: one-cell strips, tapers and single-sample islands survive as smooth connected shapes', () => {
    const out = new Int32Array(2), at = (boundaries, column, row) => { boundaries.query(worldX(column), worldZ(row), 8, out); return out[0]; };
    const interior = margin => (x, z) => x / NATIVE > margin && x / NATIVE < 40 - margin && (1000 - z) / NATIVE > margin && (1000 - z) / NATIVE < 40 - margin;
    const orthogonal = boundariesOf(41, 41, c => c === 20 ? 4 : 3);
    for (let row = 6; row <= 34; row += .25) {
        assert.equal(at(orthogonal, 20, row), 4, `orthogonal strip broken at row ${row}`);
        assert.equal(at(orthogonal, 19.25, row), 3);
        assert.equal(at(orthogonal, 20.75, row), 3);
    }
    for (const chain of orthogonal.chainPolylines()) assert.ok(maxTurning(chain, interior(4)) < 1, 'orthogonal strip edges stay straight');
    const diagonal = boundariesOf(41, 41, (c, r) => c === r ? 4 : 3);
    for (let k = 6; k <= 34; k += .25) {
        assert.equal(at(diagonal, k, k), 4, `diagonal strip broken at ${k}`);
        assert.equal(at(diagonal, k + 1, k), 3);
        assert.equal(at(diagonal, k, k + 1), 3);
    }
    for (const chain of diagonal.chainPolylines()) assert.ok(maxTurning(chain, interior(8)) < 15, `diagonal strip edge turns ${maxTurning(chain, interior(8))}`);
    const half = c => c < 30 ? Math.max(0, 2 - c / 12) : -1, taper = boundariesOf(41, 41, (c, r) => Math.abs(r - 20) <= half(c) ? 4 : 3);
    for (let column = 1; column <= 28.5; column += .25) assert.equal(at(taper, column, 20), 4, `taper broken at column ${column}`);
    assert.equal(at(taper, 31, 20), 3);
    for (let column = 2; column <= 20; column++) for (const side of [-1, 1]) assert.equal(at(taper, column, 20 + side * (Math.floor(half(column)) + 1.5)), 3, `taper widened at ${column}`);
    for (const chain of taper.chainPolylines()) assert.ok(maxTurning(chain, (x, z) => x / NATIVE > 3 && x / NATIVE < 27) < 35, `taper edge turns ${maxTurning(chain)}`);
    const islandField = boundariesOf(41, 41, (c, r) => c === 20 && r === 20 ? 4 : 3), loops = islandField.chainPolylines();
    assert.equal(islandField.loopCount, 1);
    assert.equal(loops.length, 1);
    const loop = loops[0];
    assert.ok(loop.closed && loop.rounded && loop.x.length === 16 && loop.labels[0] === 3 && loop.labels[1] === 4);
    let area = 0, cx = 0, cz = 0;
    for (let i = 0; i < loop.x.length; i++) { const j = (i + 1) % loop.x.length; area += loop.x[i] * loop.z[j] - loop.x[j] * loop.z[i]; cx += loop.x[i]; cz += loop.z[i]; }
    cx /= loop.x.length; cz /= loop.x.length;
    assert.ok(Math.abs(Math.abs(area) / 2 - NATIVE * NATIVE / 2) < 1e-9, `island area ${Math.abs(area) / 2}`);
    assert.ok(Math.hypot(cx - worldX(20), cz - worldZ(20)) < 1e-9);
    const radii = Array.from(loop.x, (x, i) => Math.hypot(x - cx, loop.z[i] - cz)), mean = radii.reduce((sum, value) => sum + value, 0) / radii.length;
    assert.ok(Math.max(...radii) / mean < 1.1 && Math.min(...radii) / mean > .9, 'island is a rounded blob');
    assert.ok(maxTurning(loop) < 32, `island turns ${maxTurning(loop)}`);
    assert.equal(at(islandField, 20, 20), 4);
    assert.equal(at(islandField, 20.75, 20), 3);
});

test('Vector boundaries: designed corners round, triple junctions stay continuous and dense windows are rejected explicitly', () => {
    const out = new Int32Array(2), block = boundariesOf(40, 40, (c, r) => c >= 12 && c <= 27 && r >= 12 && r <= 27 ? 4 : 3), chains = block.chainPolylines();
    assert.equal(chains.length, 1);
    assert.ok(distanceToChains(chains, worldX(11.5), worldZ(11.5)) > .25 * NATIVE, 'corner stays sharp');
    assert.ok(maxTurning(chains[0]) < 50, `corner turns ${maxTurning(chains[0])}`);
    block.query(worldX(19.5), worldZ(19.5), 30, out);
    assert.equal(out[0], 4);
    const junction = boundariesOf(40, 40, (c, r) => c < 20 ? (r < 20 ? 2 : 4) : 3), center = [worldX(19.5), worldZ(19.5)], triple = junction.chainPolylines();
    const endpoints = triple.filter(chain => !chain.closed && [[chain.x[0], chain.z[0]], [chain.x[chain.x.length - 1], chain.z[chain.z.length - 1]]].some(([x, z]) => x === center[0] && z === center[1]));
    assert.equal(endpoints.length, 3, 'three chains share the exact junction vertex');
    const sequence = [];
    for (let k = 0; k < 720; k++) {
        const angle = k * Math.PI / 360;
        junction.query(center[0] + 1.5 * NATIVE * Math.cos(angle), center[1] + 1.5 * NATIVE * Math.sin(angle), 8, out);
        assert.ok([2, 3, 4].includes(out[0]) && [2, 3, 4].includes(out[1]) && out[0] !== out[1]);
        if (!sequence.length || sequence[sequence.length - 1] !== out[0]) sequence.push(out[0]);
    }
    if (sequence[0] === sequence[sequence.length - 1]) sequence.pop();
    assert.deepEqual([...sequence].sort(), [2, 3, 4], `junction sectors ${sequence}`);
    for (let row = 14; row <= 26; row += .5) for (let column = 14; column <= 26; column += .5) {
        const raw = column < 19.5 ? (row < 19.5 ? 2 : 4) : 3, clear = Math.min(Math.abs(column - 19.5), column < 19.5 ? Math.abs(row - 19.5) : Infinity) > 1.5;
        junction.query(worldX(column), worldZ(row), 8, out);
        if (clear) assert.equal(out[0], raw, `${column},${row}`);
    }
    assert.throws(() => boundariesOf(40, 40, (c, r) => (c + r) % 2 ? 2 : 3), /too fragmented/);
    assert.throws(() => createLandscapeSurfaceBoundaries({ labels: new Uint8Array(4).fill(7), width: 2, height: 2, originColumn: 0, originRow: 0, minX: 0, maxZ: 0, spacingX: 1, spacingZ: 1,
        soilCount: 6, farDistance: 1, parameters: recipe.boundary }), /unknown display soil/);
});

test('Vector boundaries: overlapping windows with different extents answer bit-identically inside their shared dependency region', () => {
    const field = (c, r) => {
        const value = Math.sin(c * .23) + Math.cos(r * .19) + Math.sin((c + r) * .11);
        return c === 57 && r === 36 ? 5 : value > .9 ? 4 : value < -.8 ? 2 : (c + 2 * r) % 47 === 0 ? 1 : 3;
    };
    const first = boundariesOf(90, 80, field, { originColumn: 0, originRow: 0 }), second = boundariesOf(95, 85, field, { originColumn: 25, originRow: -12 });
    assert.ok(first.segmentCount > 200 && first.loopCount > 0, `${first.segmentCount} segments, ${first.loopCount} loops`);
    const next = random(23), a = new Int32Array(2), b = new Int32Array(2), pa = new Float64Array(2), pb = new Float64Array(2), sa = new Float64Array(1), sb = new Float64Array(1);
    let compared = 0, boundaryAnswers = 0;
    for (let i = 0; i < 6000; i++) {
        const column = 50 + next() * 14, row = 25 + next() * 22, x = worldX(column), z = worldZ(row);
        const da = first.query(x, z, 4, a, pa, sa, 1), db = second.query(x, z, 4, b, pb, sb, 1);
        assert.ok(Object.is(da, db) && a[0] === b[0] && a[1] === b[1] && Object.is(sa[0], sb[0]), `windows disagree at ${column},${row}`);
        if (Number.isFinite(da)) { assert.ok(pa[0] === pb[0] && pa[1] === pb[1]); boundaryAnswers++; }
        const half = next() * 3;
        assert.equal(first.settledLabel(x - half, x + half, z - half, z + half), second.settledLabel(x - half, x + half, z - half, z + half));
        compared++;
    }
    assert.ok(boundaryAnswers > 1000, `${boundaryAnswers} of ${compared}`);
});

test('Vector boundaries: straight coastal edges stay within half a native cell of the D1 fitted contour', { skip: cacheSkip }, async t => {
    const masks = new Map(), fine = new Map(), weights = new Float64Array(6);
    const nativeAt = async (x, z) => {
        const id = `l3/c${Math.floor(x / 500)}/r${Math.floor((4000 - z) / 500)}`;
        if (!masks.has(id)) masks.set(id, pageEvaluator(coastal.chunks.find(chunk => chunk.id === id), (await createLandscapeCoverageMask({ manifest: coastal, manifestUrl: coastalUrl.href, presentation: coastalPresentation,
            chunkId: id, loadCover: async owner => ({ landCover: await coastalCover(owner) }) })).pixels));
        return masks.get(id);
    };
    const fineAt = async (x, z) => {
        const id = `l6/c${Math.floor(x / 62.5)}/r${Math.floor((4000 - z) / 62.5)}`;
        if (!fine.has(id)) fine.set(id, pageEvaluator(coastalIndex.descriptor(id), (await coastalPage(id, still)).pixels));
        return fine.get(id);
    };
    const crossing = async (lookup, soil, x0, z0, dx, dz) => {
        let previous = null;
        for (let t = -5; t <= 5; t += .005) {
            const x = x0 + dx * t, z = z0 + dz * t, w = (await lookup(x, z)).evaluate(x, z, weights)[soil];
            if (previous !== null && (previous - .5) * (w - .5) <= 0 && previous !== w) return t - .005 + .005 * (.5 - previous) / (w - previous);
            previous = w;
        }
        return NaN;
    };
    const report = [];
    for (const [name, soil, points, dx, dz] of [['straight sand|loam edge', 3, Array.from({ length: 21 }, (_, i) => [1072, 995 + i]), 1, 0],
        ['straight rock|loam edge', 5, Array.from({ length: 13 }, (_, i) => [1103 + i, 1121]), 0, 1]]) {
        let worst = 0;
        for (const [x, z] of points) {
            const d1 = await crossing(nativeAt, soil, x, z, dx, dz), v2 = await crossing(fineAt, soil, x, z, dx, dz);
            assert.ok(Number.isFinite(d1) && Number.isFinite(v2), `${name} ${x},${z}`);
            worst = Math.max(worst, Math.abs(d1 - v2));
        }
        assert.ok(worst < NATIVE / 2, `${name}: ${worst} m from the D1 contour`);
        report.push(`${name} ${worst.toFixed(3)} m`);
    }
    t.diagnostic(`worst distance to the D1 fitted contour without warp or breakup: ${report.join(', ')}`);
});

test('Fine pages: generation is deterministic, reads only authenticated native cover and stays within its scratch estimate', { skip: cacheSkip }, async t => {
    for (const id of ['l4/c4/r12', 'l5/c8/r24', 'l6/c17/r49']) {
        const descriptor = coastalIndex.descriptor(id), loads = [], used = new Set();
        let active = 0, peak = 0;
        const presentation = new Proxy(coastalPresentation, { get: (target, key) => { used.add(key); return target[key]; } });
        const page = await createLandscapeSurfaceDetailPage({ manifest: coastal, descriptor, recipe, seed: coastalSeed, presentation,
            loadCover: async owner => { loads.push(owner); active++; peak = Math.max(peak, active); await Promise.resolve(); active--; return { landCover: await coastalCover(owner) }; } });
        const again = await coastalPage(id), metadata = page.metadata;
        assert.deepEqual(page.pixels, again.pixels, `${id} is not reproducible`);
        assert.deepEqual([...page.soils], [...again.soils]);
        assert.equal(page.pixels.byteLength, landscapeCoverageMaskLayout(descriptor).pageBytes);
        assert.equal(page.pixels.byteLength, 261 * 261 * 4);
        assert.deepEqual(loads, [...metadata.inputs.cover.map(entry => entry.id)]);
        assert.equal(new Set(loads).size, loads.length);
        assert.ok(loads.every(owner => coastal.chunks.find(chunk => chunk.id === owner).level === coastal.grid.maxLevel));
        assert.deepEqual([...page.sourceIds], loads);
        assert.equal(peak, 1);
        assert.ok([...used].every(key => ['sampleBase', 'semanticSoil', 'reference'].includes(String(key))), [...used].join());
        assert.deepEqual([metadata.generated, metadata.measured, metadata.level, metadata.searchRadius], [true, false, descriptor.level, { 4: 7, 5: 11, 6: 19 }[descriptor.level]]);
        assert.equal(metadata.key, landscapeSurfaceDetailKey(coastalIndex.inputs(id, recipe, coastalSeed)));
        assert.ok(metadata.boundary.segments > 0 && metadata.boundary.chains > 0 && metadata.evaluatedSamples > 0 && metadata.settledSamples > 0 && !metadata.uniform && !metadata.shortcut);
        assert.equal(metadata.settledSamples + metadata.evaluatedSamples, 266 * 266);
        const estimate = landscapeSurfaceDetailScratchBytes(coastal, descriptor.level, recipe);
        assert.ok(metadata.scratchBytes + metadata.coverAllowanceBytes <= estimate, `${id}: ${metadata.scratchBytes + metadata.coverAllowanceBytes} > ${estimate}`);
        t.diagnostic(`${id}: ${metadata.timingsMs.total.toFixed(1)} ms (support ${metadata.timingsMs.support.toFixed(1)}, boundaries ${metadata.timingsMs.boundaries.toFixed(1)}, samples ${metadata.timingsMs.samples.toFixed(1)}, encode ${metadata.timingsMs.encode.toFixed(1)}); `
            + `${metadata.boundary.segments} segments, ${metadata.evaluatedSamples} evaluated / ${metadata.settledSamples} settled; scratch ${metadata.scratchBytes} B + cover ${metadata.coverAllowanceBytes} B <= estimate ${estimate} B`);
    }
    for (const id of ['l6/c0/r0', 'l6/c63/r63', 'l4/c15/r0']) {
        const page = await coastalPage(id), estimate = landscapeSurfaceDetailScratchBytes(coastal, coastalIndex.descriptor(id).level, recipe);
        assert.ok(page.metadata.scratchBytes + page.metadata.coverAllowanceBytes <= estimate, id);
    }
    const descriptor = coastalIndex.descriptor('l6/c17/r49'), base = { manifest: coastal, descriptor, recipe, seed: coastalSeed, presentation: coastalPresentation };
    await assert.rejects(createLandscapeSurfaceDetailPage({ ...base, loadCover: async () => { throw new Error('Hash mismatch for support'); } }), /Hash mismatch/);
    await assert.rejects(createLandscapeSurfaceDetailPage({ ...base, loadCover: async () => ({ landCover: new Uint8Array(3) }) }), /invalid canonical cover support/);
    await assert.rejects(createLandscapeSurfaceDetailPage({ ...base, descriptor: 'l3/c2/r6', loadCover: coastalCover }), /unknown surface detail page/);
    await assert.rejects(createLandscapeSurfaceDetailPage({ ...base, seed: 2 ** 32, loadCover: coastalCover }), /seed/);
    await assert.rejects(createLandscapeSurfaceDetailPage({ ...base, presentation: { ...coastalPresentation, reference: { ...coastalPresentation.reference, sourceHash: '0'.repeat(64) } }, loadCover: coastalCover }), /presentation/);
    await assert.rejects(createLandscapeSurfaceDetailPage({ ...base, recipe: { ...structuredClone(recipe), transitionReferenceWidth: .5 }, loadCover: coastalCover }), /transition ramp/);
    await assert.rejects(createLandscapeSurfaceDetailPage({ ...base, recipe: { ...structuredClone(recipe), distance: 'nearest-same-pair-crossing-polyline' }, loadCover: coastalCover }), /unsupported/);
});

test('Fine pages: shared borders and halos are bit-identical across adjacent pages, native page borders and the landscape exterior', { skip: cacheSkip }, async () => {
    for (const [a, b] of [['l6/c17/r49', 'l6/c18/r49'], ['l6/c17/r49', 'l6/c17/r50'], ['l6/c17/r49', 'l6/c18/r50'], ['l6/c18/r49', 'l6/c17/r50'], ['l6/c15/r49', 'l6/c16/r49'],
        ['l6/c15/r47', 'l6/c16/r48'], ['l6/c16/r47', 'l6/c15/r48'], ['l5/c8/r24', 'l5/c7/r24'], ['l5/c8/r23', 'l5/c8/r24'], ['l4/c4/r12', 'l4/c4/r11'], ['l4/c4/r12', 'l4/c3/r12']]) {
        const first = coastalIndex.descriptor(a), second = coastalIndex.descriptor(b), { compared, mismatches } = compareShared(await coastalPage(a), first, await coastalPage(b), second);
        assert.equal(mismatches, 0, `${a} | ${b}`);
        assert.equal(compared, first.column !== second.column && first.row !== second.row ? 25 : 5 * 261);
    }
    assert.notEqual(coastalIndex.descriptor('l6/c15/r49').nativeAncestorId, coastalIndex.descriptor('l6/c16/r49').nativeAncestorId);
    assert.notEqual(coastalIndex.descriptor('l6/c15/r47').nativeAncestorId, coastalIndex.descriptor('l6/c16/r48').nativeAncestorId);
    const fixture = fixtureContext({ chunkIntervals: 16, maxLevel: 1, spacing: 1.953125, coverAt: (column, row) => (column - 3) * (column - 3) + (row - 4) * (row - 4) < 12 ? 1 : column < row ? 3 : 2 });
    const page = async id => createLandscapeSurfaceDetailPage({ manifest: fixture.manifest, descriptor: fixture.index.descriptor(id), recipe, seed: 99, presentation: fixture.presentation, loadCover: fixture.loadCover });
    for (const [a, b] of [['l4/c0/r0', 'l4/c1/r0'], ['l4/c0/r0', 'l4/c0/r1'], ['l4/c0/r0', 'l4/c1/r1']]) {
        const first = fixture.index.descriptor(a), second = fixture.index.descriptor(b);
        assert.equal(compareShared(await page(a), first, await page(b), second).mismatches, 0, `${a} | ${b}`);
    }
    const corner = fixture.index.descriptor('l4/c0/r0'), cornerPage = await page('l4/c0/r0');
    let exterior = 0;
    for (let row = -2; row <= corner.rows + 1; row++) for (let column = -2; column <= corner.columns + 1; column++) {
        if (column >= 0 && row >= 0) continue;
        assert.deepEqual([...texelAt(cornerPage, corner, column, row)], [...texelAt(cornerPage, corner, Math.max(0, column), Math.max(0, row))]);
        exterior++;
    }
    assert.ok(exterior > 0);
});

test('Fine pages: stored labels agree with their pair codes, exact unwarped semantics and nearest native cover', { skip: cacheSkip }, async () => {
    let valid = 0, uniform = 0, invalid = 0;
    for (const id of ['l6/c17/r49', 'l6/c16/r48', 'l5/c8/r24']) {
        const descriptor = coastalIndex.descriptor(id), page = await coastalPage(id), ratio = 2 ** (descriptor.level - coastal.grid.maxLevel), spacing = descriptor.spacing.x;
        const labelAt = (column, row) => texelAt(page, descriptor, column, row)[0] >> 4;
        for (let row = descriptor.fineStartRow - 2; row <= descriptor.fineStartRow + descriptor.rows + 1; row++) {
            for (let column = descriptor.fineStartColumn - 2; column <= descriptor.fineStartColumn + descriptor.columns + 1; column++) {
                const texel = texelAt(page, descriptor, column, row), code = codeOf(texel), label = texel[0] >> 4, pair = code >> 12;
                if (pair !== 15) {
                    valid++;
                    const [low, high] = PAIRS[pair];
                    assert.ok(label === low || label === high, `${id} ${column},${row}`);
                    assert.equal(label === high, (code & 4095) >= 2048, `${id} ${column},${row}`);
                    assert.ok(page.soils.includes(low) && page.soils.includes(high));
                } else if (code === UNIFORM) {
                    uniform++;
                    const inside = (c, r) => c >= descriptor.fineStartColumn - 2 && c <= descriptor.fineStartColumn + descriptor.columns + 1 && r >= descriptor.fineStartRow - 2 && r <= descriptor.fineStartRow + descriptor.rows + 1;
                    for (let dr = -2; dr <= 3; dr++) for (let dc = -2; dc <= 3; dc++) if (inside(column + dc, row + dr)) assert.equal(labelAt(column + dc, row + dr), label);
                    for (const [dc, dr] of [[1, 0], [0, 1], [1, 1]]) if (inside(column + dc, row + dr)) assert.equal(codeOf(texelAt(page, descriptor, column + dc, row + dr)) >> 12, 15);
                } else { invalid++; assert.equal(code, 0xf000); }
                const nativeColumn = Math.floor((column + ratio / 2) / ratio), nativeRow = Math.floor((row + ratio / 2) / ratio);
                const owner = coastal.chunks.find(chunk => chunk.id === `l3/c${Math.min(7, Math.floor(nativeColumn / 256))}/r${Math.min(7, Math.floor(nativeRow / 256))}`);
                const cover = (await coastalCover(owner.id))[(nativeRow - owner.startRow) * owner.columns + nativeColumn - owner.startColumn];
                assert.equal(texel[1], cover);
                assert.equal(texel[0] & 15, coastalPresentation.semanticSoil(column * spacing, 4000 - row * spacing, cover));
                assert.ok(page.soils.includes(label));
            }
        }
    }
    assert.ok(valid > 1000 && uniform > 10000 && invalid > 0, `${valid} valid, ${uniform} uniform, ${invalid} invalid`);
});

test('Fine pages: uniform markers are exactly one-hot for every fragment of their cell and every footprint', { skip: cacheSkip }, async () => {
    let checked = 0;
    for (const id of ['l6/c17/r49', 'l5/c8/r24']) {
        const descriptor = coastalIndex.descriptor(id), page = await coastalPage(id), next = random(31), spacing = descriptor.spacing.x, candidates = [];
        for (let row = 0; row < descriptor.rows - 1; row++) for (let column = 0; column < descriptor.columns - 1; column++) {
            const texel = texelAt(page, descriptor, descriptor.fineStartColumn + column, descriptor.fineStartRow + row);
            if (codeOf(texel) !== UNIFORM) continue;
            let nearValid = false;
            for (let dr = -2; dr <= 3 && !nearValid; dr++) for (let dc = -2; dc <= 3; dc++) {
                const c = column + dc, r = row + dr;
                if (c >= -2 && r >= -2 && c <= descriptor.columns + 1 && r <= descriptor.rows + 1 && codeOf(texelAt(page, descriptor, descriptor.fineStartColumn + c, descriptor.fineStartRow + r)) >> 12 !== 15) { nearValid = true; break; }
            }
            if (nearValid || next() < .02) candidates.push([column, row, texel[0] >> 4]);
        }
        assert.ok(candidates.length > 100, `${id}: ${candidates.length}`);
        for (const [column, row, label] of candidates) {
            const identity = Array.from({ length: 6 }, (_, soil) => soil === label ? 1 : 0);
            for (const [fx, fz] of [[0, 0], [1, 1], [next(), next()], [next(), 0], [1, next()]]) {
                const x = descriptor.bounds.minX + (column + fx) * spacing, z = descriptor.bounds.maxZ - (row + fz) * spacing;
                for (const [dx, dy] of [[[0, 0], [0, 0]], [[.05, .02], [-.01, .06]], [[spacing, 0], [0, spacing]], [[2 * spacing, .3], [.3, 2 * spacing]]]) {
                    const result = referenceCoverage(descriptor, page.pixels, x, z, dx, dy);
                    assert.deepEqual(result.weights, identity, `${id} ${column},${row} at ${fx},${fz}`);
                    assert.equal(result.contour.confidence, 0);
                }
            }
            checked++;
        }
    }
    assert.ok(checked > 400, `${checked}`);
});

test('Fine pages: no unsaturated ramp or label change reaches a uniform-marker cell with the wide transition bands', { skip: cacheSkip }, async t => {
    const factor = Math.max(recipe.pairProfiles.default.breakup, ...recipe.pairProfiles.pairs.map(entry => entry.breakup), ...recipe.pairProfiles.partners.map(entry => entry.breakup));
    const band = recipe.maxTransitionWidth / 2 + recipe.breakup.amplitudes.reduce((sum, value) => sum + value, 0) * (1 + recipe.breakup.ridgedMix / 2) * factor;
    let checked = 0, nearRamp = 0, closest = Infinity;
    for (const id of ['l6/c17/r49', 'l5/c8/r24', 'l4/c4/r12']) {
        const descriptor = coastalIndex.descriptor(id), page = await coastalPage(id), next = random(id.length * 131), spacing = descriptor.spacing.x, rim = [];
        for (let row = 0; row < descriptor.rows - 1; row++) for (let column = 0; column < descriptor.columns - 1; column++) {
            const texel = texelAt(page, descriptor, descriptor.fineStartColumn + column, descriptor.fineStartRow + row);
            if (codeOf(texel) !== UNIFORM) continue;
            let touches = false;
            for (let dr = -1; dr <= 2 && !touches; dr++) for (let dc = -1; dc <= 2; dc++) {
                const c = column + dc, r = row + dr;
                if (c >= 0 && r >= 0 && c < descriptor.columns && r < descriptor.rows && codeOf(texelAt(page, descriptor, descriptor.fineStartColumn + c, descriptor.fineStartRow + r)) >> 12 !== 15) { touches = true; break; }
            }
            if (touches) rim.push([column, row, texel[0] >> 4]);
        }
        assert.ok(rim.length > 20, `${id}: ${rim.length} uniform cells border the valid-code band`);
        for (let k = 0; k < 15; k++) {
            const [column, row, label] = rim[Math.floor(next() * rim.length)];
            const x = descriptor.bounds.minX + (column + next()) * spacing, z = descriptor.bounds.maxZ - (row + next()) * spacing;
            const sample = await sampleLandscapeSurfaceDetail({ manifest: coastal, descriptor, recipe, seed: coastalSeed, presentation: coastalPresentation, loadCover: async owner => ({ landCover: await coastalCover(owner) }), x, z });
            assert.equal(sample.finalLabel, coastal.soil.catalog[label].id, `${id} label changes inside a uniform cell at ${x},${z}`);
            closest = Math.min(closest, sample.base.distanceMeters);
            assert.ok(sample.base.distanceMeters > band, `${id} boundary ${sample.base.distanceMeters} m inside the ramp band at ${x},${z}`);
            const coordinate = sample.nearest?.coordinateMeters ?? null;
            if (coordinate !== null) { nearRamp++; assert.ok(Math.abs(coordinate) >= LANDSCAPE_SURFACE_COVERAGE.blendWidthMeters / 2, `${id} unsaturated ramp ${coordinate} inside a uniform cell at ${x},${z}`); }
            checked++;
        }
    }
    t.diagnostic(`${checked} points in uniform cells bordering the valid-code band: nearest boundary ${closest.toFixed(2)} m > ramp band ${band.toFixed(2)} m, ${nearRamp} within the search radius, all saturated and label-stable`);
});

test('Fine pages: one-native-cell strips and single-sample islands remain present at the finest level', async () => {
    const strip = 40, island = [90, 64], fixture = fixtureContext({ chunkIntervals: 16, maxLevel: 3, spacing: NATIVE, minX: 0, minZ: 0,
        coverAt: (column, row) => column === strip ? 3 : column === island[0] && row === island[1] ? 1 : 2 });
    const soils = fixture.manifest.soil.catalog.map(soil => soil.id), forest = soils.indexOf('forest'), sand = soils.indexOf('sand');
    const level = 6, spacing = fixture.index.spacing(level).x, stripX = strip * NATIVE, islandX = island[0] * NATIVE, islandZ = 250 - island[1] * NATIVE, reach = WARP + 2.5;
    const generate = async id => ({ descriptor: fixture.index.descriptor(id), page: await createLandscapeSurfaceDetailPage({ manifest: fixture.manifest, descriptor: fixture.index.descriptor(id),
        recipe, seed: 1234, presentation: fixture.presentation, loadCover: fixture.loadCover }) });
    const span = 16 * spacing, pages = [];
    for (let row = 20; row <= 22; row++) for (let column = Math.floor((stripX - reach) / span); column <= Math.floor((stripX + reach) / span); column++) pages.push(await generate(`l${level}/c${column}/r${row}`));
    const rows = new Map();
    let stripTexels = 0;
    for (const { descriptor, page } of pages) for (let row = descriptor.fineStartRow; row < descriptor.fineStartRow + descriptor.rows; row++) for (let column = descriptor.fineStartColumn; column < descriptor.fineStartColumn + descriptor.columns; column++) {
        if (texelAt(page, descriptor, column, row)[0] >> 4 !== forest) continue;
        stripTexels++;
        rows.set(row, (rows.get(row) ?? 0) + 1);
        assert.ok(Math.abs(column * spacing - stripX) < reach, `forest far from its strip at ${column}`);
    }
    const firstRow = 20 * 16, lastRow = 23 * 16 - 1;
    for (let row = firstRow; row <= lastRow; row++) assert.ok(rows.get(row) > 0, `strip missing on row ${row}`);
    assert.ok(stripTexels > 300, `${stripTexels}`);
    let islandTexels = 0;
    for (let row = Math.floor((250 - islandZ - reach) / span); row <= Math.floor((250 - islandZ + reach) / span); row++) for (let column = Math.floor((islandX - reach) / span); column <= Math.floor((islandX + reach) / span); column++) {
        const { descriptor, page } = await generate(`l${level}/c${column}/r${row}`);
        for (let r = descriptor.fineStartRow; r < descriptor.fineStartRow + descriptor.rows; r++) for (let c = descriptor.fineStartColumn; c < descriptor.fineStartColumn + descriptor.columns; c++) {
            if (texelAt(page, descriptor, c, r)[0] >> 4 !== sand) continue;
            islandTexels++;
            assert.ok(Math.hypot(c * spacing - islandX, 250 - r * spacing - islandZ) < reach, 'island label leaked away from its sample');
        }
    }
    assert.ok(islandTexels > 8, `${islandTexels}`);
});

test('Fine pages: no isolated speckle survives generation on real coastal pages, including triple junctions', { skip: cacheSkip }, async t => {
    let components = 0, small = 0;
    for (const id of ['l6/c16/r48', 'l6/c17/r48', 'l6/c16/r49', 'l6/c17/r49', 'l6/c17/r47', 'l6/c27/r8', 'l5/c8/r23', 'l5/c8/r24', 'l4/c4/r12']) {
        const page = await coastalPage(id), width = 261, labels = new Uint8Array(width * width), seen = new Uint8Array(width * width), stack = [];
        for (let i = 0; i < labels.length; i++) labels[i] = page.pixels[i * 4] >> 4;
        for (let start = 0; start < labels.length; start++) {
            if (seen[start]) continue;
            let size = 0, border = false;
            stack.push(start); seen[start] = 1;
            while (stack.length) {
                const at = stack.pop(), column = at % width, row = (at - column) / width;
                size++;
                if (column === 0 || row === 0 || column === width - 1 || row === width - 1) border = true;
                for (const next of [column > 0 ? at - 1 : -1, column < width - 1 ? at + 1 : -1, row > 0 ? at - width : -1, row < width - 1 ? at + width : -1]) {
                    if (next >= 0 && !seen[next] && labels[next] === labels[at]) { seen[next] = 1; stack.push(next); }
                }
            }
            components++;
            if (!border && size <= 3) small++;
        }
    }
    assert.equal(small, 0, `${small} isolated components of at most three texels`);
    t.diagnostic(`${components} label components on 9 pages, none of at most three interior texels`);
});

test('Fine pages: authored circle, rectangle and polygon boundaries follow exact geometry without warp or breakup', async () => {
    const overrides = [{ soilId: 'sand', region: { type: 'circle', center: { x: 30.3, z: 31.7 }, radius: 7.3 } },
        { soilId: 'rock', region: { type: 'rectangle', minX: 60.2, maxX: 75.7, minZ: 20.1, maxZ: 33.9 } },
        { soilId: 'forest', region: { type: 'polygon', points: [{ x: 90, z: 80 }, { x: 110.4, z: 85.2 }, { x: 101.1, z: 100.3 }, { x: 85.7, z: 95.6 }] } }];
    const fixture = fixtureContext({ chunkIntervals: 16, maxLevel: 2, spacing: NATIVE, minX: 0, minZ: 0, coverAt: () => 2 }, overrides);
    const soils = fixture.manifest.soil.catalog.map(soil => soil.id), level = 5, spacing = fixture.index.spacing(level).x, span = 16 * spacing;
    let labelled = 0, distances = 0;
    for (const { soilId, region } of overrides) {
        const soil = soils.indexOf(soilId), bounds = region.type === 'circle' ? { minX: region.center.x - region.radius, maxX: region.center.x + region.radius, minZ: region.center.z - region.radius, maxZ: region.center.z + region.radius }
            : region.type === 'rectangle' ? region : { minX: Math.min(...region.points.map(p => p.x)), maxX: Math.max(...region.points.map(p => p.x)), minZ: Math.min(...region.points.map(p => p.z)), maxZ: Math.max(...region.points.map(p => p.z)) };
        const vertices = region.type === 'polygon' ? region.points : region.type === 'rectangle' ? [{ x: region.minX, z: region.minZ }, { x: region.maxX, z: region.minZ }, { x: region.maxX, z: region.maxZ }, { x: region.minX, z: region.maxZ }] : [];
        const width = landscapeSurfacePairProfile(still, 'loam', soilId).widthMeters, high = Math.max(soil, 3) === soil;
        for (let row = Math.floor((125 - bounds.maxZ - 2) / span); row <= Math.floor((125 - bounds.minZ + 2) / span); row++) {
            for (let column = Math.floor((bounds.minX - 2) / span); column <= Math.floor((bounds.maxX + 2) / span); column++) {
                const descriptor = fixture.index.descriptor(`l${level}/c${column}/r${row}`);
                const page = await createLandscapeSurfaceDetailPage({ manifest: fixture.manifest, descriptor, recipe: still, seed: 5, presentation: fixture.presentation, loadCover: fixture.loadCover });
                for (let r = descriptor.fineStartRow; r < descriptor.fineStartRow + descriptor.rows; r++) for (let c = descriptor.fineStartColumn; c < descriptor.fineStartColumn + descriptor.columns; c++) {
                    const x = c * spacing, z = 125 - r * spacing, signed = landscapeRegionSignedDistance(region, x, z), texel = texelAt(page, descriptor, c, r), code = codeOf(texel);
                    assert.equal(texel[0] & 15, landscapeRegionContains(region, x, z) ? soil : 3, 'semantic soil uses exact containment');
                    if (Math.abs(signed) > spacing) { assert.equal(texel[0] >> 4, signed > 0 ? soil : 3, `${soilId} label at ${x},${z} (${signed})`); labelled++; }
                    if (code >> 12 === 15 || Math.abs(signed) > .5 || vertices.some(vertex => Math.hypot(vertex.x - x, vertex.z - z) < 1.5)) continue;
                    const decoded = ((code & 4095) / 4095 * 2 - 1) * 4 * spacing, expected = (high ? signed : -signed) * .75 / width;
                    if (Math.abs(expected) < 3.9 * spacing) { assert.ok(Math.abs(decoded - expected) < .02, `${soilId} coordinate ${decoded} vs ${expected} at ${x},${z}`); distances++; }
                }
            }
        }
    }
    assert.ok(labelled > 5000 && distances > 500, `${labelled} labels, ${distances} distances`);
});

test('Fine pages: painted overrides skip hidden edges and read the soil just outside each visible edge', async () => {
    const entries = [{ soilId: 'loam', region: { type: 'rectangle', minX: 48.8, maxX: 51.5, minZ: 40, maxZ: 80 } }, { soilId: 'sand', region: { type: 'rectangle', minX: 20, maxX: 40, minZ: 20, maxZ: 40 } },
        { soilId: 'rock', region: { type: 'circle', center: { x: 40, z: 30 }, radius: 5 } }];
    const fixture = fixtureContext({ chunkIntervals: 16, maxLevel: 2, spacing: NATIVE, minX: 0, minZ: 0, coverAt: column => column <= 25 ? 2 : 3 }, entries);
    const radius = landscapeSurfaceDetailSearchRadius(still, fixture.index.spacing(5).x) * fixture.index.spacing(5).x;
    assert.ok(radius > 2.15 && radius < 2.25, `${radius}`);
    const inspect = async (x, z) => {
        const span = 16 * fixture.index.spacing(5).x, id = `l5/c${Math.floor(x / span)}/r${Math.floor((125 - z) / span)}`;
        return sampleLandscapeSurfaceDetail({ manifest: fixture.manifest, descriptor: id, recipe: still, seed: 3, presentation: fixture.presentation, loadCover: fixture.loadCover, x, z });
    };
    const hidden = await inspect(48.5, 60);
    assert.deepEqual([hidden.sample.label, hidden.base.label, hidden.base.other], ['loam', 'loam', 'forest']);
    assert.ok(hidden.base.distanceMeters < 1.5);
    assert.equal(hidden.boundary, null, 'a base edge hidden under a same-soil override is not a boundary');
    const right = await inspect(51, 60);
    assert.deepEqual([right.sample.label, [...right.boundary.pair], right.boundary.source], ['loam', ['loam', 'forest'], 'override:soil-0']);
    assert.ok(Math.abs(right.boundary.distanceMeters - (51.5 - right.sample.x)) < 1e-9);
    const far = await inspect(49.9, 60);
    assert.ok(far.sample.x - 48.8 < 51.5 - far.sample.x, 'the same-soil left edge is the nearest edge');
    assert.deepEqual([far.sample.label, [...far.boundary.pair], far.boundary.source], ['loam', ['loam', 'forest'], 'override:soil-0']);
    assert.ok(Math.abs(far.boundary.distanceMeters - (51.5 - far.sample.x)) < 1e-9, 'the visible far edge replaces the same-soil near edge');
    const inner = await inspect(36, 30);
    assert.deepEqual([inner.sample.label, [...inner.boundary.pair], inner.boundary.source], ['rock', ['sand', 'rock'], 'override:soil-2']);
    assert.ok(Math.abs(inner.boundary.distanceMeters - (5 - Math.hypot(inner.sample.x - 40, inner.sample.z - 30))) < 1e-9);
    const outer = await inspect(44, 30);
    assert.deepEqual([outer.sample.label, [...outer.boundary.pair], outer.boundary.source], ['rock', ['loam', 'rock'], 'override:soil-2']);
    const painted = await inspect(36, 39);
    assert.deepEqual([painted.sample.label, [...painted.boundary.pair], painted.boundary.source], ['sand', ['sand', 'loam'], 'override:soil-1']);
    assert.ok(Math.abs(painted.boundary.distanceMeters - (40 - painted.sample.z)) < 1e-9);
    const covered = await inspect(159 * .244140625, 125 - 369 * .244140625), coveredDistance = Math.hypot(covered.sample.x - 40, covered.sample.z - 30) - 5;
    assert.ok(coveredDistance > 0 && coveredDistance < .1 && 40 - covered.sample.x < 1.7, 'the nearest sand edge point lies under the rock circle');
    assert.deepEqual([covered.sample.label, [...covered.boundary.pair], covered.boundary.source], ['sand', ['sand', 'rock'], 'override:soil-2'], 'a sand edge hidden under rock is skipped');
    assert.ok(Math.abs(covered.boundary.distanceMeters - coveredDistance) < 1e-9);
});

test('Fine pages: inspection exposes internals that reproduce stored texels and bounded procedural displacement', { skip: cacheSkip }, async () => {
    const descriptor = coastalIndex.descriptor('l6/c17/r49'), page = await coastalPage('l6/c17/r49'), next = random(5), breakupBound = recipe.breakup.amplitudes.reduce((sum, value) => sum + value, 0) * (1 + recipe.breakup.ridgedMix / 2);
    let boundaries = 0;
    for (let i = 0; i < 24; i++) {
        const column = descriptor.fineStartColumn + Math.floor(next() * descriptor.columns), row = descriptor.fineStartRow + Math.floor(next() * descriptor.rows);
        const nearBoundary = i % 2 === 0 ? (() => { for (let k = 0; k < 2000; k++) { const c = descriptor.fineStartColumn + Math.floor(next() * descriptor.columns), r = descriptor.fineStartRow + Math.floor(next() * descriptor.rows);
            if (codeOf(texelAt(page, descriptor, c, r)) >> 12 !== 15) return [c, r]; } return [column, row]; })() : [column, row];
        const x = nearBoundary[0] * descriptor.spacing.x + (next() - .5) * .2, z = 4000 - nearBoundary[1] * descriptor.spacing.z + (next() - .5) * .2;
        const sample = await sampleLandscapeSurfaceDetail({ manifest: coastal, descriptor, recipe, seed: coastalSeed, presentation: coastalPresentation, loadCover: async owner => ({ landCover: await coastalCover(owner) }), x, z });
        assert.deepEqual([...sample.texel.bytes], [...texelAt(page, descriptor, sample.sample.column, sample.sample.row)]);
        assert.deepEqual([sample.generated, sample.measured, sample.key], [true, false, page.metadata.key]);
        assert.ok(Math.abs(sample.warp.x) < WARP && Math.abs(sample.warp.z) < WARP);
        assert.deepEqual([sample.warpedPosition.x, sample.warpedPosition.z], [x + sample.warp.x, z + sample.warp.z]);
        assert.ok(['seabed', 'sand', 'loam', 'forest', 'rock', 'unknown'].includes(sample.base.label) && sample.label === sample.base.label);
        if (sample.boundary) {
            boundaries++;
            assert.ok(sample.boundary.junctionFade >= 0 && sample.boundary.junctionFade <= 1);
            assert.ok(Math.abs(sample.boundary.breakupMeters) < sample.boundary.profile.breakup * breakupBound + 1e-12);
            assert.ok(sample.boundary.pair.includes(sample.sample.label) && sample.boundary.pair.includes(sample.texel.displaySoil) && sample.boundary.source === 'base');
            assert.equal(sample.boundary.distanceMeters, Math.abs(sample.boundary.signedDistanceMeters));
        }
    }
    assert.ok(boundaries >= 8, `${boundaries}`);
    for (let i = 0; i < 16; i++) {
        const column = descriptor.fineStartColumn + Math.floor(next() * descriptor.columns), row = descriptor.fineStartRow + Math.floor(next() * descriptor.rows);
        const sample = await sampleLandscapeSurfaceDetail({ manifest: coastal, descriptor, recipe, seed: coastalSeed, presentation: coastalPresentation,
            loadCover: async owner => ({ landCover: await coastalCover(owner) }), x: column * descriptor.spacing.x, z: 4000 - row * descriptor.spacing.z });
        assert.equal(sample.finalLabel, sample.texel.displaySoil, `settled label differs from the full composite at ${column},${row}`);
    }
    const uniform = coastalIndex.descriptor('l6/c0/r41'), uniformPage = await coastalPage('l6/c0/r41');
    assert.equal(uniformPage.metadata.shortcut, true);
    const sample = await sampleLandscapeSurfaceDetail({ manifest: coastal, descriptor: uniform, recipe, seed: coastalSeed, presentation: coastalPresentation, loadCover: async owner => ({ landCover: await coastalCover(owner) }), x: 30.1, z: 1416.2 });
    assert.deepEqual([...sample.texel.bytes], [...texelAt(uniformPage, uniform, sample.sample.column, sample.sample.row)]);
    assert.equal(sample.texel.uniform, true);
    await assert.rejects(sampleLandscapeSurfaceDetail({ manifest: coastal, descriptor, recipe, seed: coastalSeed, presentation: coastalPresentation, loadCover: coastalCover, x: 0, z: 0 }), /outside page/);
});

test('Uniform proof: resident native masks resolve uniform fine pages conservatively and agree with generation', { skip: cacheSkip }, async () => {
    const native = id => coastal.chunks.find(chunk => chunk.id === id), mask = async id => ({ descriptor: native(id),
        pixels: (await createLandscapeCoverageMask({ manifest: coastal, manifestUrl: coastalUrl.href, presentation: coastalPresentation, chunkId: id, loadCover: async owner => ({ landCover: await coastalCover(owner) }) })).pixels });
    const sea = await mask('l3/c0/r5'), proven = [], unproven = [];
    for (const l4 of coastalIndex.children('l3/c0/r5')) for (const l5 of coastalIndex.children(l4.id)) for (const l6 of coastalIndex.children(l5.id)) {
        (landscapeSurfaceDetailUniformSoil({ manifest: coastal, descriptor: l6, recipe, nativePage: sea }) >= 0 ? proven : unproven).push(l6.id);
    }
    assert.ok(proven.length > 20 && unproven.length > 0, `${proven.length}/${unproven.length}`);
    for (const id of [proven[0], proven[proven.length - 1]]) {
        const soil = landscapeSurfaceDetailUniformSoil({ manifest: coastal, descriptor: id, recipe, nativePage: sea }), page = await coastalPage(id);
        assert.deepEqual([page.metadata.uniform, page.metadata.uniformSoil, [...page.soils]], [true, soil, [soil]]);
    }
    assert.equal(landscapeSurfaceDetailUniformSoil({ manifest: coastal, descriptor: 'l6/c17/r49', recipe, nativePage: await mask('l3/c2/r6') }), -1);
    const neighbors = await Promise.all(['l3/c0/r4', 'l3/c1/r4', 'l3/c1/r5', 'l3/c0/r6', 'l3/c1/r6'].map(mask));
    const widened = unproven.filter(id => landscapeSurfaceDetailUniformSoil({ manifest: coastal, descriptor: id, recipe, nativePages: [sea, ...neighbors] }) >= 0);
    for (const id of widened.slice(0, 2)) assert.equal((await coastalPage(id)).metadata.uniform, true, id);
    const fixture = fixtureContext({ chunkIntervals: 32, maxLevel: 2, spacing: NATIVE, minX: 0, minZ: 0, coverAt: () => 3 });
    const plain = { descriptor: fixture.manifest.chunks.find(chunk => chunk.id === 'l2/c0/r0') };
    plain.pixels = (await createLandscapeCoverageMask({ manifest: fixture.manifest, manifestUrl: 'https://fixture.invalid/', presentation: fixture.presentation, chunkId: 'l2/c0/r0', loadCover: fixture.loadCover })).pixels;
    const forest = fixture.manifest.soil.catalog.findIndex(soil => soil.id === 'forest');
    assert.equal(landscapeSurfaceDetailUniformSoil({ manifest: fixture.manifest, descriptor: 'l5/c0/r0', recipe, nativePage: plain }), forest);
    for (const id of ['l5/c1/r0', 'l5/c16/r16']) assert.equal(landscapeSurfaceDetailUniformSoil({ manifest: fixture.manifest, descriptor: id, recipe, nativePage: plain }), -1, `${id} support reaches beyond the supplied native page`);
    const all = await Promise.all(fixture.manifest.chunks.filter(chunk => chunk.level === 2).map(async chunk => ({ descriptor: chunk,
        pixels: (await createLandscapeCoverageMask({ manifest: fixture.manifest, manifestUrl: 'https://fixture.invalid/', presentation: fixture.presentation, chunkId: chunk.id, loadCover: fixture.loadCover })).pixels })));
    for (const id of ['l5/c1/r0', 'l5/c16/r16']) assert.equal(landscapeSurfaceDetailUniformSoil({ manifest: fixture.manifest, descriptor: id, recipe, nativePages: all }), forest, id);
    const near = withOverrides(fixture.manifest, [{ soilId: 'rock', region: { type: 'circle', center: { x: 15, z: 240 }, radius: .5 } }]);
    const far = withOverrides(fixture.manifest, [{ soilId: 'rock', region: { type: 'circle', center: { x: 200, z: 30 }, radius: .5 } }]);
    assert.equal(landscapeSurfaceDetailUniformSoil({ manifest: near, descriptor: 'l5/c0/r0', recipe, nativePage: plain }), -1);
    assert.equal(landscapeSurfaceDetailUniformSoil({ manifest: far, descriptor: 'l5/c0/r0', recipe, nativePage: plain }), forest);
    assert.throws(() => landscapeSurfaceDetailUniformSoil({ manifest: coastal, descriptor: 'l6/c17/r49', recipe, nativePage: { descriptor: native('l3/c2/r6'), pixels: new Uint8Array(4) } }), /incomplete/);
});

test('Natural presentation: base display ignores overrides while semantic soil applies them exactly and sample stays unchanged', () => {
    const fixture = createLandscapeModelFixture({ coverAt: column => column < 2 ? 3 : column > 6 ? 2 : 6 });
    const root = fixture.decoded.get(fixture.manifest.overviewId), region = { type: 'circle', center: { x: 0, z: 18 }, radius: 1 };
    const presentation = createLandscapeNaturalPresentation(withOverrides(fixture.manifest, [{ soilId: 'sand', region }]), root);
    for (const [x, z] of [[0, 18], [-4, 18], [4, 18], [.5, 18.2]]) for (const cover of [2, 3, 6]) {
        const inside = landscapeRegionContains(region, x, z), base = presentation.sampleBase(x, z, cover);
        assert.equal(presentation.semanticSoil(x, z, cover), inside ? 2 : base & 15);
        assert.equal(presentation.sample(x, z, cover), inside ? 2 * 17 : base);
    }
    assert.equal(createLandscapeNaturalPresentation(fixture.manifest, root).sampleBase(-4, 18, 6) >> 4, 4);
    assert.throws(() => presentation.sampleBase(0, 18, 99), /Unknown natural presentation cover/);
});

test('Region geometry: exact signed distances agree with containment and nearest boundary points realize them', () => {
    const circle = { type: 'circle', center: { x: 1, z: 2 }, radius: 3 }, rectangle = { type: 'rectangle', minX: 0, maxX: 4, minZ: 0, maxZ: 2 };
    const polygon = { type: 'polygon', points: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }, { x: 2, z: 1 }, { x: 0, z: 4 }] };
    assert.equal(landscapeRegionSignedDistance(circle, 1, 2), 3);
    assert.equal(landscapeRegionSignedDistance(circle, 1, 7), -2);
    assert.equal(landscapeRegionSignedDistance(circle, 4, 2), 0);
    assert.equal(landscapeRegionSignedDistance(rectangle, 1, 1), 1);
    assert.equal(landscapeRegionSignedDistance(rectangle, 3.5, 1), .5);
    assert.equal(landscapeRegionSignedDistance(rectangle, 7, 6), -5);
    assert.equal(landscapeRegionSignedDistance(rectangle, 2, -3), -3);
    assert.equal(landscapeRegionSignedDistance(rectangle, 0, 1), 0);
    assert.equal(landscapeRegionSignedDistance({ type: 'point', x: 1, z: 1 }, 4, 5), -5);
    assert.equal(landscapeRegionSignedDistance({ type: 'point', x: 1, z: 1 }, 1, 1), 0);
    assert.ok(Math.abs(landscapeRegionSignedDistance(polygon, 2, 2) + 2 / Math.sqrt(13)) < 1e-12, 'concave notch distance');
    assert.ok(Math.abs(landscapeRegionSignedDistance(polygon, 1, .5) - .5) < 1e-12);
    const point = new Float64Array(2);
    assert.deepEqual([...landscapeRegionNearestBoundaryPoint(circle, 1, 2, point)], [4, 2]);
    assert.deepEqual([...landscapeRegionNearestBoundaryPoint(rectangle, 1, 1.5, point)], [1, 2]);
    assert.deepEqual([...landscapeRegionNearestBoundaryPoint(rectangle, 6, 5, point)], [4, 2]);
    assert.deepEqual([...landscapeRegionNearestBoundaryPoint({ type: 'point', x: 1, z: 1 }, 4, 5, point)], [1, 1]);
    const next = random(3);
    for (let i = 0; i < 4000; i++) {
        const x = next() * 8 - 2, z = next() * 8 - 2;
        for (const region of [circle, rectangle, polygon]) {
            const signed = landscapeRegionSignedDistance(region, x, z), inside = landscapeRegionContains(region, x, z);
            assert.ok(inside ? signed >= 0 : signed <= 0, `${region.type} ${x},${z}`);
            const probe = 1e-3, moved = landscapeRegionSignedDistance(region, x + probe, z);
            assert.ok(Math.abs(moved - signed) <= probe + 1e-12, 'signed distance is 1-Lipschitz');
            landscapeRegionNearestBoundaryPoint(region, x, z, point);
            assert.ok(Math.abs(Math.hypot(point[0] - x, point[1] - z) - Math.abs(signed)) < 1e-9, `${region.type} nearest point at ${x},${z}`);
            assert.ok(Math.abs(landscapeRegionSignedDistance(region, point[0], point[1])) < 1e-9);
        }
    }
});
