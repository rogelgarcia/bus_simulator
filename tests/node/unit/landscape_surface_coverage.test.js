// Checks continuous material contours, footprint integration and canonical coverage support.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLandscapeModelFixture } from './landscape_model_fixture.js';
import { createLandscapeNaturalPresentation } from '../../../src/graphics/engine3d/landscape/LandscapeNaturalPresentation.js';
import { createLandscapeCoverageMask } from '../../../src/graphics/engine3d/landscape/LandscapeCoverageMask.js';
import { LANDSCAPE_SURFACE_COVERAGE, landscapeCoverageMaskLayout, landscapeCoverageRampAverage, sampleLandscapeSurfaceCoverage, landscapeCoverageAvailability } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceCoverage.js';

function field(spacing, soilAt, options = {}) {
    return (x, z, footprint = {}) => sampleLandscapeSurfaceCoverage({ bounds: { minX: 0, maxX: 16 * spacing, minZ: 0, maxZ: 16 * spacing }, columns: 17, rows: 17, soilAt, x, z, ...options, ...footprint });
}

function assertCoverage(result) {
    assert.ok(result.weights.every(value => Number.isFinite(value) && value >= -1e-12 && value <= 1 + 1e-12));
    assert.ok(Math.abs(result.weights.reduce((sum, value) => sum + value, 0) - 1) < 1e-9);
}

test('Surface coverage: source nodes retain isolated islands and one-cell channels without semantic changes', () => {
    for (const soilAt of [(column, row) => column === 8 && row === 8 ? 2 : 3, column => column === 8 ? 2 : 3]) {
        const sample = field(1.953125, soilAt);
        for (let row = 0; row <= 16; row++) for (let column = 0; column <= 16; column++) {
            const result = sample(column * 1.953125, (16 - row) * 1.953125);
            assertCoverage(result);
            assert.equal(result.weights[soilAt(column, row)], 1);
        }
    }
});

test('Surface coverage: triple junctions remain normalized, preserve absent layers and cross competitor ties continuously', () => {
    const sample = field(1.953125, (column, row) => column < 8 ? 0 : row < 8 ? 1 : 2);
    for (const dx of [[0, 0], [.4, .4], [1.3, .1], [3, .2]]) {
        for (let x = 13; x < 17; x += .125) for (let z = 15; z < 18; z += .125) {
            const result = sample(x, z, { dx, dy: [.01, 0] });
            assertCoverage(result);
            assert.deepEqual(result.weights.slice(3), [0, 0, 0]);
        }
        const a = sample(15.29296875, 16.6015625 - 1e-8, { dx, dy: [.01, 0] });
        const b = sample(15.29296875, 16.6015625 + 1e-8, { dx, dy: [.01, 0] });
        assert.ok(Math.max(...a.weights.map((value, i) => Math.abs(value - b.weights[i]))) < 1e-6);
    }
});

test('Surface coverage: blend width remains in world meters when the resident source spacing changes eightfold', () => {
    const widths = [];
    for (const spacing of [1.953125, 15.625]) {
        const sample = field(spacing, column => column < 8 ? 2 : 3), boundary = 7.5 * spacing;
        const position = target => {
            let low = boundary - 1, high = boundary + 1;
            for (let i = 0; i < 45; i++) { const middle = (low + high) / 2; if (sample(middle, 8 * spacing).weights[3] < target) low = middle; else high = middle; }
            return (low + high) / 2;
        };
        widths.push(position(.9) - position(.1));
        let previous = 0;
        for (let offset = -1; offset <= 1; offset += .025) {
            const value = sample(boundary + offset, 8 * spacing).weights[3];
            assert.ok(value >= previous - 1e-10); previous = value;
        }
    }
    assert.ok(widths.every(width => width > .2 && width < LANDSCAPE_SURFACE_COVERAGE.blendWidthMeters));
    assert.ok(Math.abs(widths[0] - widths[1]) < .1, `${widths}`);
});

test('Surface coverage: local ramp integration agrees with numeric pixel quadrature, including axis-aligned footprints', () => {
    const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
    for (const [center, x, y] of [[.5, 1, 0], [.2, .8, .4], [.7, .03, 1], [-.2, 2, .7], [.5, 1, 1e-12], [.95, .01, .01]]) {
        let sum = 0;
        for (let row = 0; row < 160; row++) for (let column = 0; column < 160; column++) sum += smooth(center + ((column + .5) / 160 - .5) * x + ((row + .5) / 160 - .5) * y);
        assert.ok(Math.abs(landscapeCoverageRampAverage(center, x, y) - sum / 160 ** 2) < .0002);
    }
});

test('Surface coverage: minified checkerboards are bounded averages and report oversized source footprints', () => {
    const sample = field(1.953125, (column, row) => (column + row) % 2 ? 2 : 3);
    for (let x = 10; x < 12; x += .125) {
        const result = sample(x, 11, { dx: [3.90625, 0], dy: [0, 3.90625] });
        assertCoverage(result);
        assert.ok(Math.abs(result.weights[2] - .5) < 1e-9);
        assert.equal(result.filterLimited, false);
    }
    assert.equal(sample(11, 11, { dx: [4, 0], dy: [0, 4] }).filterLimited, true);
});

test('Coverage halos: canonical same-level support is independent of request order and preserves original categories', async () => {
    const fixture = createLandscapeModelFixture({ coverAt: (column, row) => column < row ? 1 : column > row + 1 ? 3 : 2 });
    const { manifest, decoded } = fixture, root = decoded.get(manifest.overviewId);
    const presentation = createLandscapeNaturalPresentation(manifest, root), seen = new Map(), originals = new Map([...decoded].map(([id, chunk]) => [id, chunk.landCover.slice()]));
    let active = 0, peak = 0;
    for (const descriptor of [...manifest.chunks].reverse()) {
        const mask = await createLandscapeCoverageMask({ manifest, manifestUrl: 'https://fixture.invalid/manifest.json', presentation, chunkId: descriptor.id,
            loadCover: async id => { active++; peak = Math.max(peak, active); await Promise.resolve(); active--; return decoded.get(id); } });
        const layout = landscapeCoverageMaskLayout(descriptor);
        assert.equal(mask.pixels.byteLength, layout.pageBytes);
        assert.ok(mask.sourceIds.length <= 9);
        for (let row = 0; row < layout.height; row++) for (let column = 0; column < layout.width; column++) {
            const globalColumn = Math.max(0, Math.min(manifest.grid.columns - 1, descriptor.startColumn + (column - layout.halo) * descriptor.sampleStride));
            const globalRow = Math.max(0, Math.min(manifest.grid.rows - 1, descriptor.startRow + (row - layout.halo) * descriptor.sampleStride));
            const original = fixture.sourceCover[globalRow * manifest.grid.columns + globalColumn], offset = (row * layout.width + column) * 4;
            assert.equal(mask.pixels[offset + 1], original);
            const key = `${globalColumn}/${globalRow}`;
            if (seen.has(key)) assert.equal(mask.pixels[offset], seen.get(key));
            seen.set(key, mask.pixels[offset]);
        }
    }
    assert.equal(peak, 1);
    for (const [id, original] of originals) assert.deepEqual(decoded.get(id).landCover, original);
    assert.deepEqual(landscapeCoverageMaskLayout({ columns: 257, rows: 257 }), { columns: 257, rows: 257, halo: 2, sourceHalo: 6, width: 261, height: 261,
        sourceWidth: 269, sourceHeight: 269, pixelBytes: 4, pageBytes: 272484, decodeBytes: 945598 });
});

test('Coverage halos: missing or corrupt support rejects detail instead of changing its boundary field', async () => {
    const fixture = createLandscapeModelFixture(), { manifest, decoded } = fixture;
    const presentation = createLandscapeNaturalPresentation(manifest, decoded.get(manifest.overviewId));
    await assert.rejects(createLandscapeCoverageMask({ manifest, manifestUrl: 'https://fixture.invalid/', presentation, chunkId: 'l1/c0/r0',
        loadCover: async id => { if (id === 'l1/c1/r0') throw new Error('Hash mismatch for support'); return decoded.get(id); } }), /Hash mismatch/);
});

test('Coverage halos: tiny valid source pages resolve every canonical owner beyond immediate neighboring tiles', async () => {
    for (const chunkIntervals of [1, 2]) {
        const { manifest, decoded } = createLandscapeModelFixture({ chunkIntervals, maxLevel: 4, coverAt: (column, row) => (column + row) % 4 });
        const presentation = createLandscapeNaturalPresentation(manifest, decoded.get(manifest.overviewId));
        const result = await createLandscapeCoverageMask({ manifest, manifestUrl: 'https://fixture.invalid/', presentation, chunkId: 'l4/c7/r7', loadCover: async id => decoded.get(id) });
        assert.equal(result.sourceIds.length, chunkIntervals === 1 ? 196 : 64);
        assert.equal(result.pixels.byteLength, (chunkIntervals + 5) ** 2 * 4);
    }
});

test('Coverage hierarchy: unequal arrivals share one continuous four-tile corner envelope', () => {
    const progress = [[.6, .9], [.2, .4]];
    const sample = (column, row, x, z) => {
        const neighbors = [];
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            if (dc === 0 && dr === 0) continue;
            neighbors.push(progress[row + dr]?.[column + dc] ?? 1);
        }
        return landscapeCoverageAvailability({ bounds: { minX: column * 10, maxX: (column + 1) * 10, minZ: 10 - row * 10, maxZ: 20 - row * 10 },
            x, z, progress: progress[row][column], neighborProgress: neighbors, bandMeters: 2 });
    };
    for (const [column, row] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        assert.equal(sample(column, row, 10, 10), .2);
        assert.ok(Math.abs(sample(column, row, 10 + (column ? 1 : -1) * 1e-6, 10 + (row ? -1 : 1) * 1e-6) - .2) < 1e-9);
    }
});

test('Coverage hierarchy: a missing child fades to the shared parent continuously at its edge and preserves its interior', () => {
    const options = { bounds: { minX: 0, maxX: 20, minZ: 0, maxZ: 20 }, progress: 1, neighborProgress: [1, 1, 1, 1, 0, 1, 1, 0], bandMeters: 4 };
    assert.equal(landscapeCoverageAvailability({ ...options, x: 20, z: 1 }), 0);
    assert.equal(landscapeCoverageAvailability({ ...options, x: 10, z: 10 }), 1);
    assert.ok(landscapeCoverageAvailability({ ...options, x: 20 - 1e-6, z: 1 }) < 1e-9);
});
