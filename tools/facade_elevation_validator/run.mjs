// tools/facade_elevation_validator/run.mjs
// Compares a rendered building elevation against the reference photo it
// reproduces, and reports which proportions do NOT match.
//
// Both images are measured with the same scale-invariant algorithms inside a
// building rectangle, so a 1122px reference and a 2560px render are directly
// comparable: every metric is either a ratio, a count, or a fraction of the
// building box. Metrics outside tolerance are printed as FAIL with the
// measured delta, which is the list of things to fix.
//
// Run:
//   node tools/facade_elevation_validator/run.mjs \
//     --ref "downloads/buildings_references/10 front.png" --refRect 110,111,906,1115 \
//     --shot tests/artifacts/screens/buildings/modern_bank_elevation.png
//
// Rects are x,y,w,h in image pixels. Omit a rect to auto-detect the building
// silhouette against sky/grass (works on harness renders, not on street photos).
import fs from 'node:fs';
import { decodePng } from '../reference_image_inspector/png.mjs';

function parseArgs(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i++) {
        const token = argv[i];
        if (!token.startsWith('--')) continue;
        const key = token.slice(2);
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) out[key] = true;
        else { out[key] = next; i++; }
    }
    return out;
}

function luminanceAt(image, x, y) {
    const i = (y * image.width + x) * 4;
    return 0.2126 * image.data[i] + 0.7152 * image.data[i + 1] + 0.0722 * image.data[i + 2];
}

function rgbAt(image, x, y) {
    const i = (y * image.width + x) * 4;
    return [image.data[i], image.data[i + 1], image.data[i + 2]];
}

// Background in a harness render is sky (blue-ish and bright) or grass
// (green-dominant). Everything else is building or its ground slab.
function isBackground(image, x, y) {
    const [r, g, b] = rgbAt(image, x, y);
    if (g >= r + Math.max(4, g * 0.05) && g >= b + Math.max(4, g * 0.05)) return true; // grass, lit or shadowed
    if (b >= r - 4 && (0.2126 * r + 0.7152 * g + 0.0722 * b) > 120) return true; // sky
    return false;
}

// The building is the TALL non-background mass: the ground slab under it is
// also non-background but only a few rows deep, so columns are kept by how
// much of the frame they fill, and rows by how much of the building width they
// span. That rejects the slab, the shadow and the terrain without needing an
// explicit rect.
function autoDetectRect(image) {
    const colCounts = new Array(image.width).fill(0);
    for (let x = 0; x < image.width; x++) {
        let count = 0;
        for (let y = 0; y < image.height; y++) if (!isBackground(image, x, y)) count++;
        colCounts[x] = count;
    }
    const maxCol = Math.max(...colCounts);
    if (maxCol <= 0) throw new Error('auto-detect found no building pixels');
    const colThreshold = maxCol * 0.5;
    let minX = -1;
    let maxX = -1;
    for (let x = 0; x < image.width; x++) {
        if (colCounts[x] < colThreshold) continue;
        if (minX < 0) minX = x;
        maxX = x;
    }
    const width = maxX - minX + 1;

    // A building row is filled between the silhouette edges AND empty just
    // outside them. The ground slab and the terrain fail the second test
    // because they run past the building on both sides.
    const outside = Math.max(6, Math.round(width * 0.02));
    const leftProbe = minX - outside;
    const rightProbe = maxX + outside;
    let minY = -1;
    let maxY = -1;
    for (let y = 0; y < image.height; y++) {
        let count = 0;
        for (let x = minX; x <= maxX; x++) if (!isBackground(image, x, y)) count++;
        if (count < width * 0.8) continue;
        if (leftProbe >= 0 && !isBackground(image, leftProbe, y)) continue;
        if (rightProbe < image.width && !isBackground(image, rightProbe, y)) continue;
        if (minY < 0) minY = y;
        maxY = y;
    }
    if (minY < 0) throw new Error('auto-detect found no building rows');
    return { x: minX, y: minY, w: width, h: maxY - minY + 1 };
}

function parseRect(value, image) {
    if (!value || value === true) return autoDetectRect(image);
    const parts = String(value).split(',').map((p) => Math.round(Number(p.trim())));
    if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p))) throw new Error(`bad rect: ${value}`);
    return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
}

function columnProfile(image, rect) {
    const values = [];
    for (let x = rect.x; x < rect.x + rect.w; x++) {
        let sum = 0;
        for (let y = rect.y; y < rect.y + rect.h; y++) sum += luminanceAt(image, x, y);
        values.push(sum / rect.h);
    }
    return values;
}

function rowProfile(image, rect, columns = null) {
    const values = [];
    const xs = columns ?? Array.from({ length: rect.w }, (_, i) => rect.x + i);
    for (let y = rect.y; y < rect.y + rect.h; y++) {
        let sum = 0;
        for (const x of xs) sum += luminanceAt(image, x, y);
        values.push(sum / xs.length);
    }
    return values;
}

// Local minima of a profile, thinned so two picks are never closer than
// `minSpacing` samples (the deeper one wins).
function localMinima(values, minSpacing) {
    const picks = [];
    for (let i = 1; i < values.length - 1; i++) {
        if (!(values[i] <= values[i - 1] && values[i] < values[i + 1])) continue;
        const last = picks[picks.length - 1];
        if (last && i - last.index < minSpacing) {
            if (values[i] < last.value) picks[picks.length - 1] = { index: i, value: values[i] };
            continue;
        }
        picks.push({ index: i, value: values[i] });
    }
    return picks;
}

// Dominant repeat length of a 1-D profile, by normalised autocorrelation.
// Counting dark lines fails on a facade — a mullion shows up as two edges, a
// glazing bar as a third — so the period is found from the signal as a whole
// and the FIRST strong peak is taken, which is the true module.
function dominantPeriod(values, minLag, maxLag) {
    const n = values.length;
    if (n < 8 || maxLag <= minLag) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const centred = values.map((v) => v - mean);
    let energy = 0;
    for (const v of centred) energy += v * v;
    if (energy <= 1e-9) return 0;

    const scores = [];
    const hi = Math.min(maxLag, Math.floor(n / 2));
    for (let lag = Math.max(2, Math.floor(minLag)); lag <= hi; lag++) {
        let sum = 0;
        for (let i = 0; i + lag < n; i++) sum += centred[i] * centred[i + lag];
        scores.push({ lag, score: sum / (energy * (1 - lag / n)) });
    }
    if (!scores.length) return 0;
    const best = scores.reduce((a, b) => (b.score > a.score ? b : a));
    // A period of P also correlates at 2P, 3P, ..., so the fundamental is the
    // SHORTEST lag that is itself a peak of the correlation curve and scores
    // nearly as well as the strongest one. Requiring a local maximum keeps
    // shoulder noise at tiny lags from being mistaken for the module.
    const peaks = scores.filter((s, i) => i > 0
        && i < scores.length - 1
        && s.score >= scores[i - 1].score
        && s.score > scores[i + 1].score
        && s.score >= best.score * 0.8);
    const fundamental = peaks.length ? peaks[0] : best;
    // Refine to sub-sample accuracy with a parabolic fit around the peak.
    const idx = scores.findIndex((s) => s.lag === fundamental.lag);
    if (idx > 0 && idx < scores.length - 1) {
        const y0 = scores[idx - 1].score;
        const y1 = scores[idx].score;
        const y2 = scores[idx + 1].score;
        const denom = y0 - 2 * y1 + y2;
        if (Math.abs(denom) > 1e-9) return fundamental.lag + 0.5 * (y0 - y2) / denom;
    }
    return fundamental.lag;
}

function median(list) {
    if (!list.length) return 0;
    const sorted = [...list].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function meanColor(image, rect) {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let y = Math.max(0, rect.y); y < Math.min(image.height, rect.y + rect.h); y++) {
        for (let x = Math.max(0, rect.x); x < Math.min(image.width, rect.x + rect.w); x++) {
            const [pr, pg, pb] = rgbAt(image, x, y);
            r += pr;
            g += pg;
            b += pb;
            n++;
        }
    }
    return n ? { r: r / n, g: g / n, b: b / n } : { r: 0, g: 0, b: 0 };
}

// The base reads much lighter than the curtain wall, so the strongest
// downward step in the row profile (scanning up from the bottom) is the top of
// the base. Returned as a fraction of the building height.
function measureBaseTopFraction(image, rect) {
    // The base is not reliably brighter than the shaft — that depends on the
    // light — but it is always far more CONTRASTY across the width: a handful
    // of deep openings between broad piers, against the shaft's near-uniform
    // module grid. So the boundary is the row where the horizontal contrast of
    // the facade jumps, scanning the lower half of the building.
    const bandHeight = Math.max(6, Math.round(rect.h * 0.03));
    const x0 = rect.x + Math.round(rect.w * 0.06);
    const width = Math.round(rect.w * 0.88);
    const contrastAt = (y) => {
        const cols = columnProfile(image, { x: x0, y, w: width, h: bandHeight });
        const mean = cols.reduce((a, b) => a + b, 0) / cols.length;
        let variance = 0;
        for (const v of cols) variance += (v - mean) * (v - mean);
        return Math.sqrt(variance / cols.length) / Math.max(1, mean);
    };

    const first = rect.y + Math.round(rect.h * 0.4);
    const last = rect.y + rect.h - bandHeight * 2;
    const step = Math.max(2, Math.round(rect.h * 0.006));
    const samples = [];
    for (let y = first; y <= last; y += step) samples.push({ y, contrast: contrastAt(y) });
    if (samples.length < 4) return { fraction: 0, step: 0 };

    const span = Math.max(2, Math.round(samples.length * 0.12));
    let bestIndex = -1;
    let bestJump = 0;
    for (let i = span; i < samples.length - span; i++) {
        let above = 0;
        let below = 0;
        for (let k = 1; k <= span; k++) {
            above += samples[i - k].contrast;
            below += samples[i + k].contrast;
        }
        const jump = (below - above) / span;
        if (jump > bestJump) {
            bestJump = jump;
            bestIndex = i;
        }
    }
    if (bestIndex < 0) return { fraction: 0, step: 0 };
    const baseTopY = samples[bestIndex].y;
    return { fraction: (rect.y + rect.h - baseTopY) / rect.h, step: bestJump, baseTopY };
}

// Vertical mullion pitch of the curtain wall, as a count of modules across the
// building width.
function measureModules(image, rect, baseTopY) {
    const band = {
        x: rect.x + Math.round(rect.w * 0.02),
        y: rect.y + Math.round(rect.h * 0.06),
        w: Math.round(rect.w * 0.96),
        h: Math.max(8, Math.round((baseTopY - rect.y) * 0.5))
    };
    const cols = columnProfile(image, band);
    const spread = Math.max(...cols) - Math.min(...cols);
    // Modules are between 1/60th and 1/8th of the facade width in practice.
    const pitch = dominantPeriod(cols, rect.w / 60, rect.w / 8);
    return {
        count: pitch > 0 ? rect.w / pitch : 0,
        pitchFraction: pitch / rect.w,
        contrast: spread
    };
}

// Floor rows of the curtain wall, plus the vision:spandrel height ratio. The
// profile is sampled at pane centres so the horizontal rails stand out.
function measureFloors(image, rect, baseTopY) {
    const glassTop = rect.y + Math.round(rect.h * 0.045);
    const glassBottom = baseTopY - Math.round(rect.h * 0.01);
    if (glassBottom - glassTop < 20) return { count: 0, visionSpandrelRatio: 0, detected: 0 };

    const band = { x: rect.x + Math.round(rect.w * 0.06), y: glassTop, w: Math.round(rect.w * 0.88), h: glassBottom - glassTop };
    const rows = rowProfile(image, band);
    const floorPitch = dominantPeriod(rows, band.h / 24, band.h / 3);
    if (!(floorPitch > 2)) return { count: 0, visionSpandrelRatio: 0 };

    // Fold every floor onto one averaged profile, then split it at the two
    // horizontal RAILS (its darkest lines). The gaps between them are the
    // vision pane and the spandrel, which is measurable whether the spandrel
    // is glass or masonry — a tone-based split is not, once the two panes
    // share a material.
    const folded = new Array(Math.round(floorPitch)).fill(0);
    const counts = new Array(folded.length).fill(0);
    for (let i = 0; i < rows.length; i++) {
        const slot = Math.round(i % floorPitch) % folded.length;
        folded[slot] += rows[i];
        counts[slot] += 1;
    }
    for (let i = 0; i < folded.length; i++) folded[i] /= Math.max(1, counts[i]);
    const lo = Math.min(...folded);
    const hi = Math.max(...folded);

    // Rotate so the profile starts at the darkest sample — the deepest rail —
    // then threshold: the dark samples are the horizontal rails and the bright
    // runs between them are the panes. Two runs per floor means vision and
    // spandrel, whatever material either is made of.
    const startIndex = folded.indexOf(lo);
    const rotated = folded.map((_, i) => folded[(startIndex + i) % folded.length]);
    // How deep the rails cut depends on the image, so sweep the threshold and
    // take the first level that separates the floor into exactly two panes.
    const runsAt = (level) => {
        const threshold = lo + (hi - lo) * level;
        const out = [];
        let run = 0;
        for (const v of rotated) {
            if (v > threshold) run += 1;
            else if (run > 0) {
                out.push(run);
                run = 0;
            }
        }
        if (run > 0) out.push(run);
        return out.filter((r) => r > 1);
    };
    let sorted = [];
    for (let level = 0.3; level <= 0.8; level += 0.05) {
        const candidate = runsAt(level);
        if (candidate.length === 2) {
            sorted = candidate.sort((a, b) => b - a);
            break;
        }
    }
    if (sorted.length < 2) return { count: band.h / floorPitch, visionSpandrelRatio: 0, contrast: hi - lo };
    return {
        count: band.h / floorPitch,
        floorPitchFraction: floorPitch / rect.h,
        visionSpandrelRatio: sorted[0] / Math.max(1, sorted[1]),
        contrast: hi - lo
    };
}

// Base openings: dark runs across the stone, measured in the upper third of
// the base where every opening is in deep shadow in both images.
function measureBaseOpenings(image, rect, baseTopY) {
    const baseHeight = rect.y + rect.h - baseTopY;
    const band = {
        x: rect.x,
        y: baseTopY + Math.round(baseHeight * 0.16),
        w: rect.w,
        h: Math.max(6, Math.round(baseHeight * 0.22))
    };
    const cols = columnProfile(image, band);
    const sorted = [...cols].sort((a, b) => a - b);
    const dark = sorted[Math.round(sorted.length * 0.15)];
    const light = sorted[Math.round(sorted.length * 0.85)];
    const threshold = (dark + light) * 0.5;
    const minRun = Math.max(3, Math.round(rect.w * 0.015));

    const raw = [];
    let start = -1;
    for (let i = 0; i < cols.length; i++) {
        const isDark = cols[i] < threshold;
        if (isDark && start < 0) start = i;
        else if (!isDark && start >= 0) {
            if (i - start >= minRun) raw.push({ start, end: i - 1, width: i - start });
            start = -1;
        }
    }
    if (start >= 0 && cols.length - start >= minRun) raw.push({ start, end: cols.length - 1, width: cols.length - start });

    // A glazing bar, a flagpole or a lamppost splits one opening into two dark
    // runs. Anything separated by less than a third of the narrowest plausible
    // pier is the same opening.
    const mergeGap = Math.max(minRun, Math.round(rect.w * 0.02));
    const runs = [];
    for (const run of raw) {
        const last = runs[runs.length - 1];
        if (last && run.start - last.end - 1 <= mergeGap) {
            last.end = run.end;
            last.width = last.end - last.start + 1;
            continue;
        }
        runs.push({ ...run });
    }

    const piers = [];
    for (let i = 1; i < runs.length; i++) piers.push(runs[i].start - runs[i - 1].end - 1);
    const openingWidth = median(runs.map((r) => r.width));
    const pierWidth = median(piers);
    return {
        count: runs.length,
        openingFraction: openingWidth / rect.w,
        pierFraction: pierWidth / rect.w,
        openingPierRatio: pierWidth > 0 ? openingWidth / pierWidth : 0
    };
}

function measure(image, rect, label) {
    const base = measureBaseTopFraction(image, rect);
    const baseTopY = base.baseTopY ?? (rect.y + Math.round(rect.h * 0.7));
    const modules = measureModules(image, rect, baseTopY);
    const floors = measureFloors(image, rect, baseTopY);
    const openings = measureBaseOpenings(image, rect, baseTopY);

    const baseHeight = rect.y + rect.h - baseTopY;
    const colors = {
        // Stone between the first two openings, mid height of the base.
        base: meanColor(image, {
            x: rect.x + Math.round(rect.w * 0.02),
            y: baseTopY + Math.round(baseHeight * 0.35),
            w: Math.round(rect.w * 0.05),
            h: Math.round(baseHeight * 0.3)
        }),
        // The middle of the glass shaft, averaging panes and mullions.
        curtain: meanColor(image, {
            x: rect.x + Math.round(rect.w * 0.2),
            y: rect.y + Math.round(rect.h * 0.25),
            w: Math.round(rect.w * 0.6),
            h: Math.round(rect.h * 0.25)
        })
    };

    return {
        label,
        rect,
        aspect: rect.w / rect.h,
        baseHeightFraction: base.fraction,
        moduleCount: modules.count,
        moduleContrast: modules.contrast,
        floorCount: floors.count,
        floorPitchFraction: floors.floorPitchFraction ?? 0,
        visionSpandrelRatio: floors.visionSpandrelRatio,
        baseOpeningCount: openings.count,
        baseOpeningFraction: openings.openingFraction,
        basePierFraction: openings.pierFraction,
        baseOpeningPierRatio: openings.openingPierRatio,
        colorBase: colors.base,
        colorCurtain: colors.curtain,
        // Relative tone is comparable across very different exposures; the
        // absolute levels are not.
        baseOverCurtainLuma: (0.2126 * colors.base.r + 0.7152 * colors.base.g + 0.0722 * colors.base.b)
            / Math.max(1, 0.2126 * colors.curtain.r + 0.7152 * colors.curtain.g + 0.0722 * colors.curtain.b)
    };
}

// name, extractor, tolerance (relative unless `abs`), and whether the metric is
// a count that should be compared as a whole number.
const CHECKS = [
    { key: 'aspect', label: 'width / height', tol: 0.04 },
    { key: 'baseHeightFraction', label: 'base height / building height', tol: 0.08 },
    { key: 'moduleCount', label: 'curtain modules across', tol: 0.06, round: true },
    { key: 'floorCount', label: 'curtain floors', tol: 0.12, round: true },
    { key: 'visionSpandrelRatio', label: 'vision : spandrel height', tol: 0.2 },
    { key: 'baseOpeningCount', label: 'base openings', tol: 0.001, round: true },
    { key: 'baseOpeningFraction', label: 'base opening width / building width', tol: 0.12 },
    { key: 'basePierFraction', label: 'base pier width / building width', tol: 0.18 },
    { key: 'baseOpeningPierRatio', label: 'base opening : pier width', tol: 0.18 },
    { key: 'baseOverCurtainLuma', label: 'base tone / curtain tone', tol: 0.22 }
];

const args = parseArgs(process.argv.slice(2));
if (!args.ref || !args.shot) {
    console.log('usage: node tools/facade_elevation_validator/run.mjs --ref <png> --shot <png> [--refRect x,y,w,h] [--shotRect x,y,w,h] [--json]');
    process.exit(1);
}

const refImage = decodePng(fs.readFileSync(args.ref));
const shotImage = decodePng(fs.readFileSync(args.shot));
const refMeasured = measure(refImage, parseRect(args.refRect, refImage), 'reference');
const shotMeasured = measure(shotImage, parseRect(args.shotRect, shotImage), 'render');

const results = CHECKS.map((check) => {
    const expected = refMeasured[check.key];
    const actual = shotMeasured[check.key];
    const a = check.round ? Math.round(actual) : actual;
    const e = check.round ? Math.round(expected) : expected;
    // A metric the measurement could not resolve in one of the two images is
    // reported as unmeasured rather than as a mismatch: reporting a difference
    // that was never measured would send the next fix in a random direction.
    if (!(e > 0) || !(a > 0)) return { ...check, expected: e, actual: a, delta: 0, skipped: true, pass: true };
    const delta = (a - e) / Math.abs(e);
    return { ...check, expected: e, actual: a, delta, pass: Math.abs(delta) <= check.tol };
});

if (args.json) {
    console.log(JSON.stringify({ reference: refMeasured, render: shotMeasured, results }, null, 2));
} else {
    const fmt = (v) => (typeof v === 'number' ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(3)) : String(v));
    console.log(`reference rect ${JSON.stringify(refMeasured.rect)}`);
    console.log(`render    rect ${JSON.stringify(shotMeasured.rect)}`);
    console.log('');
    console.log('metric                                    reference     render      delta   status');
    for (const r of results) {
        const row = [
            r.label.padEnd(40),
            fmt(r.expected).padStart(10),
            fmt(r.actual).padStart(11),
            (r.skipped ? '-' : `${(r.delta * 100).toFixed(1)}%`).padStart(10),
            (r.skipped ? '  n/a' : (r.pass ? '  ok' : '  FAIL'))
        ].join(' ');
        console.log(row);
    }
    const failed = results.filter((r) => !r.pass);
    const measured = results.filter((r) => !r.skipped);
    console.log('');
    const unmeasured = results.length - measured.length;
    console.log(`${measured.length - failed.length}/${measured.length} measured metrics match; ${failed.length} to fix`
        + (unmeasured ? `; ${unmeasured} unmeasured` : ''));
    const c = (x) => `rgb(${Math.round(x.r)},${Math.round(x.g)},${Math.round(x.b)})`;
    console.log(`colors  base ref ${c(refMeasured.colorBase)} vs render ${c(shotMeasured.colorBase)}`);
    console.log(`colors  curtain ref ${c(refMeasured.colorCurtain)} vs render ${c(shotMeasured.colorCurtain)}`);
    process.exitCode = failed.length ? 1 : 0;
}
