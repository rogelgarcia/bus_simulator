// Detect visible clusters, attribute them to source shoots, and retain improving moves/swaps.
// @ts-check
import { createGrassDebugV2CanopyPatternProbe, createGrassDebugV2CanopyPatternScore } from './GrassDebugV2CanopyPatternProbe.js';

/** @param {import('three').Mesh} mesh @param {{periodMeters:number,shootIds:number[],sun:number[],onProgress?:(message:string)=>void,onPreview?:(preview:object)=>void,maxTrials?:number}} options */
export async function optimizeGrassDebugV2CanopyPattern(mesh, { periodMeters, shootIds, sun, onProgress = () => {}, onPreview = () => {}, maxTrials = 3600, canMove = () => true }) {
    if (!Array.isArray(sun) || sun.length !== 3 || !sun.every(Number.isFinite) || sun[1] <= 0
        || !Number.isFinite(periodMeters) || periodMeters <= 0 || !Number.isInteger(maxTrials) || maxTrials < 1)
        throw new Error('Pattern optimization requires a sun direction and a positive trial budget.');
    const started = performance.now(), probe = createGrassDebugV2CanopyPatternProbe(mesh, shootIds, periodMeters);
    const initialPixels = probe.render(), scorer = createGrassDebugV2CanopyPatternScore(initialPixels.size, sun);
    const initial = scorer.evaluate(initialPixels, true), targetCoverage = initial.coverage;
    let state = 0x17a41e53, best = initial, accepted = 0, rejected = 0, trials = 0, lastImprovement = 0;
    const random = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
    const wrap = n => n - Math.floor(n / periodMeters + .5) * periodMeters;
    const history = [], changed = new Set();
    const eligible = probe.groups.filter(group => canMove(group, 0, 0));
    if (!eligible.length) throw new Error('Pattern optimization has no movable interior shoots.');
    for (; trials < maxTrials; trials++) {
        if (trials % 24 === 0) {
            best = scorer.evaluate(probe.render(), true);
            history.push({ trials, accepted, loss: best.loss, coverage: best.coverage });
            const percent = 100 * (initial.loss - best.loss) / Math.max(initial.loss, 1e-12);
            onProgress(`Optimizing LOD4 · ${trials}/${maxTrials} trials · ${accepted} accepted · preview pattern score −${percent.toFixed(1)}%`);
            onPreview({ ...probe.render(), trials, accepted, reduction: percent });
            await new Promise(resolve => requestAnimationFrame(resolve));
        }
        const pixels = probe.render(), size = pixels.size;
        // Sample several hot pixels and trace the strongest one back to its visible shoot.
        let pixel = 0, heat = -1;
        for (let candidate = 0; candidate < 12; candidate++) {
            const p = Math.floor(random() * (size * size / 2)) * 2;
            if (pixels.owners[p] >= 0 && canMove(probe.groups[pixels.owners[p]], 0, 0) && best.heat[p] > heat) { heat = best.heat[p]; pixel = p; }
        }
        const group = heat >= 0 ? probe.groups[pixels.owners[pixel]] : eligible[Math.floor(random() * eligible.length)];
        const other = eligible[Math.floor(random() * eligible.length)];
        const saved = [group.dx, group.dz, other.dx, other.dz], swap = random() < .45 && other !== group;
        if (swap) {
            const dx = wrap(other.x + other.dx - group.x - group.dx), dz = wrap(other.z + other.dz - group.z - group.dz);
            group.dx += dx; group.dz += dz; other.dx -= dx; other.dz -= dz;
        } else {
            const radius = random() < .75 ? .10 : periodMeters;
            group.dx += (random() - .5) * radius; group.dz += (random() - .5) * radius;
        }
        group.dx = wrap(group.x + group.dx) - group.x; group.dz = wrap(group.z + group.dz) - group.z;
        if (swap) { other.dx = wrap(other.x + other.dx) - other.x; other.dz = wrap(other.z + other.dz) - other.z; }
        const candidate = scorer.evaluate(probe.render());
        // Keep density stable so the optimizer cannot win by covering the ground or removing grass.
        if (canMove(group, group.dx, group.dz) && (!swap || canMove(other, other.dx, other.dz))
            && Math.abs(candidate.coverage - targetCoverage) <= .006 && candidate.loss < best.loss - 1e-8) {
            best = { ...candidate, heat: best.heat }; accepted++; lastImprovement = trials;
            changed.add(group.id); if (swap) changed.add(other.id);
        } else {
            group.dx = saved[0]; group.dz = saved[1];
            if (swap) { other.dx = saved[2]; other.dz = saved[3]; }
            rejected++;
        }
        if (trials - lastImprovement >= 240) { trials++; break; }
    }
    const final = scorer.evaluate(probe.render()); probe.apply();
    history.push({ trials, accepted, loss: final.loss, coverage: final.coverage });
    onPreview({ ...probe.render(), trials, accepted, reduction: 100 * (initial.loss - final.loss) / Math.max(initial.loss, 1e-12) });
    return Object.freeze({ algorithm: 'material-feedback', resolution: 128, trials, accepted, rejected, changedShoots: changed.size,
        stop: trials >= maxTrials ? 'trial-budget' : 'plateau', initialLoss: initial.loss, finalLoss: final.loss,
        initialCoverage: targetCoverage, finalCoverage: final.coverage, changedShootIds: [...changed], history, milliseconds: performance.now() - started });
}
