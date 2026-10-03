// Refine the source with measured rendered patterns and verify the winning layout at final bake resolution.
// @ts-check
import { createGrassDebugV2CanopyPatternProbe } from './GrassDebugV2CanopyPatternProbe.js';
import { createGrassDebugV2CanopyRenderedProbe } from './GrassDebugV2CanopyRenderedProbe.js';
import { combineGrassCanopyRenderedViews } from './GrassDebugV2CanopyRenderedScore.js';

function masksMatch(candidate, initial) {
    return Math.abs(candidate.coverage - initial.coverage) <= .006
        && ['leaf', 'background'].every(key => candidate[key].every((value, c) => Math.abs(value / initial[key][c] - 1) <= .02));
}

function viewSummary(result) {
    return result.views.map(({ heat, ...view }) => view);
}

/** @param {import('three').Mesh} mesh @param {object} options */
export async function refineGrassDebugV2CanopyRenderedPattern(mesh, options) {
    const { periodMeters, shootIds, onProgress = () => {}, onPreview = () => {}, maxTrials = 288, canMove = () => true } = options;
    if (!Number.isInteger(maxTrials) || maxTrials < 1) throw new Error('Rendered refinement needs a positive trial budget.');
    const started = performance.now(), probe = createGrassDebugV2CanopyPatternProbe(mesh, shootIds, periodMeters);
    const evaluationMesh = mesh.clone(false); evaluationMesh.geometry = mesh.geometry.clone();
    const base = mesh.geometry.attributes.position, positions = evaluationMesh.geometry.attributes.position;
    const rendered = createGrassDebugV2CanopyRenderedProbe(options);
    const updateGeometry = () => {
        for (const group of probe.groups) for (const vertex of group.vertices)
            positions.setXYZ(vertex, base.getX(vertex) + group.dx, base.getY(vertex), base.getZ(vertex) + group.dz);
        positions.needsUpdate = true; evaluationMesh.geometry.computeBoundingBox(); evaluationMesh.geometry.computeBoundingSphere();
    };
    const wrap = n => n - Math.floor(n / periodMeters + .5) * periodMeters;
    let state = 0x7352a149;
    const random = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
    let trials = 0, accepted = 0, lastImprovement = 0;
    const history = [], changed = new Set();
    const eligible = probe.groups.filter(group => canMove(group, 0, 0));
    if (!eligible.length) throw new Error('Rendered optimization has no movable interior shoots.');
    try {
        onProgress('Rendered LOD4 feedback · measuring 48 camera views…');
        const initial = await rendered.evaluate(evaluationMesh);
        let best = initial, score = combineGrassCanopyRenderedViews(initial.views, initial.views);
        history.push({ trials: 0, accepted, loss: score.loss, meanRatio: 1, worstRatio: 1 });
        for (; trials < maxTrials; trials++) {
            if (trials % 4 === 0) {
                onProgress(`Rendered LOD4 feedback · ${trials}/${maxTrials} trials · ${accepted} accepted · pattern score −${(100 * (1 - score.loss / 1.5)).toFixed(1)}%`);
                onPreview(best.preview); await new Promise(resolve => requestAnimationFrame(resolve));
            }
            const ownership = probe.render(); let hottest = -1, selected = -1;
            for (let i = 0; i < 24; i++) {
                const pixel = Math.floor(random() * ownership.owners.length), owner = ownership.owners[pixel];
                const phase = Math.floor(Math.floor(pixel / ownership.size) * 32 / ownership.size) * 32 + Math.floor((pixel % ownership.size) * 32 / ownership.size);
                if (owner >= 0 && canMove(probe.groups[owner], 0, 0) && score.heat[phase] > hottest) { hottest = score.heat[phase]; selected = owner; }
            }
            const group = selected >= 0 ? probe.groups[selected] : eligible[Math.floor(random() * eligible.length)];
            const other = eligible[Math.floor(random() * eligible.length)], saved = [group.dx, group.dz, other.dx, other.dz];
            const swap = random() < .4 && group !== other;
            if (swap) {
                const dx = wrap(other.x + other.dx - group.x - group.dx), dz = wrap(other.z + other.dz - group.z - group.dz);
                group.dx += dx; group.dz += dz; other.dx -= dx; other.dz -= dz;
            } else {
                const radius = random() < .7 ? .16 : periodMeters;
                group.dx += (random() - .5) * radius; group.dz += (random() - .5) * radius;
            }
            group.dx = wrap(group.x + group.dx) - group.x; group.dz = wrap(group.z + group.dz) - group.z;
            if (swap) { other.dx = wrap(other.x + other.dx) - other.x; other.dz = wrap(other.z + other.dz) - other.z; }
            if (!canMove(group, group.dx, group.dz) || (swap && !canMove(other, other.dx, other.dz))) {
                group.dx = saved[0]; group.dz = saved[1]; other.dx = saved[2]; other.dz = saved[3];
                continue;
            }
            updateGeometry();
            const candidate = await rendered.evaluate(evaluationMesh), candidateScore = combineGrassCanopyRenderedViews(candidate.views, initial.views);
            if (masksMatch(candidate.masks, initial.masks) && candidateScore.worstRatio <= 1.03 && candidateScore.loss < score.loss - 1e-5) {
                best = candidate; score = candidateScore; accepted++; lastImprovement = trials;
                changed.add(group.id); if (swap) changed.add(other.id);
                history.push({ trials: trials + 1, accepted, loss: score.loss, meanRatio: score.meanRatio, worstRatio: score.worstRatio });
            } else {
                group.dx = saved[0]; group.dz = saved[1];
                if (swap) { other.dx = saved[2]; other.dz = saved[3]; }
            }
            if (trials - lastImprovement >= 64) { trials++; break; }
        }
        onProgress('Rendered LOD4 feedback · verifying at 4096² with 8192² self-shadows…');
        onPreview(best.preview); await new Promise(resolve => requestAnimationFrame(resolve));
        positions.copy(base); positions.needsUpdate = true;
        const fullInitial = await rendered.evaluate(evaluationMesh, 4096, 8192);
        updateGeometry();
        const fullCandidate = await rendered.evaluate(evaluationMesh, 4096, 8192);
        const fullScore = combineGrassCanopyRenderedViews(fullCandidate.views, fullInitial.views);
        const published = accepted > 0 && masksMatch(fullCandidate.masks, fullInitial.masks) && fullScore.worstRatio <= 1.05 && fullScore.loss < 1.5;
        const moves = published ? probe.groups.filter(group => group.dx || group.dz).map(({ id, dx, dz }) => ({ id, dx, dz })) : [];
        if (published) { base.copy(positions); base.needsUpdate = true; mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere(); }
        onPreview((published ? fullCandidate : fullInitial).preview);
        return Object.freeze({ algorithm: 'rendered-feedback', trials, accepted, rejected: trials - accepted,
            renderPipeline: fullCandidate.renderPipeline,
            stop: trials >= maxTrials ? 'trial-budget' : 'plateau', published, changedShoots: moves.length, moves, history,
            previewResolution: 512, previewShadowResolution: 2048, verificationResolution: 4096, verificationShadowResolution: 8192,
            views: viewSummary(initial), finalViews: viewSummary(best), initialMasks: initial.masks, finalMasks: best.masks,
            initialLoss: 1.5, finalLoss: score.loss, meanRatio: score.meanRatio, worstRatio: score.worstRatio,
            verification: { initial: viewSummary(fullInitial), candidate: viewSummary(fullCandidate), meanRatio: fullScore.meanRatio,
                worstRatio: fullScore.worstRatio, loss: fullScore.loss, initialMasks: fullInitial.masks, candidateMasks: fullCandidate.masks },
            milliseconds: performance.now() - started });
    } finally { rendered.dispose(); evaluationMesh.geometry.dispose(); }
}
