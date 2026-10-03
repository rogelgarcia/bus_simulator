// Measure repeated low-frequency contrast in actual canopy renders, retaining per-phase attribution.
// @ts-check

export { validateGrassCanopyRenderedExposure } from './GrassDebugV2CanopyExposure.js';

/** @param {Float64Array} phase @param {number} size */
export function scoreGrassCanopyRenderedPhase(phase, size) {
    const mean = phase.reduce((a, b) => a + b, 0) / phase.length;
    const heat = new Float32Array(phase.length), bands = [];
    for (const radius of [1, 2, 4]) {
        let variance = 0;
        for (let i = 0; i < phase.length; i++) {
            const x = i % size, y = Math.floor(i / size); let sum = 0;
            for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++)
                sum += phase[((y + dy + size) % size) * size + (x + dx + size) % size];
            const residual = sum / ((radius * 2 + 1) ** 2) / Math.max(mean, 1e-6) - 1;
            heat[i] += residual * residual; variance += residual * residual;
        }
        bands.push(variance / phase.length);
    }
    return { loss: bands.reduce((a, b) => a + b, 0) / bands.length, bands, heat, mean };
}

/** @param {object[]} views @param {object[]|null} reference */
export function combineGrassCanopyRenderedViews(views, reference = null) {
    const ratios = views.map((view, i) => view.loss / Math.max(reference ? reference[i].loss : 1, 1e-8));
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length, worst = Math.max(...ratios);
    const heat = new Float32Array(views[0].heat.length);
    views.forEach((view, v) => {
        const weight = (1 / views.length + (ratios[v] === worst ? .5 : 0)) / Math.max(reference ? reference[v].loss : 1, 1e-8);
        for (let i = 0; i < heat.length; i++) heat[i] += view.heat[i] * weight;
    });
    return { loss: mean + .5 * worst, meanRatio: mean, worstRatio: worst, heat };
}
