// Evaluates recipe overrides after the operator loop: imported maps, region height edits, operator re-runs and exclude protection, in document order.
// @ts-check
// Overrides are data the user keeps while the procedural recipe regenerates, so they run on the finished operator state, each with its
// own context (scope, mask) from the executor's factory. Import overrides are read before the operators run (prepareRecipeOverrides) so
// their hashes enter the identity that export-map writes mid-run. Each applied override is measured against a height snapshot taken
// just before it (changed samples, maximum change, with its own statistics under details). When any exclude override exists, every
// layer the overrides may write is snapshotted before the first override and restored under each exclude mask after the last one
// (float layers blend by the mask, categorical layers restore where the mask exceeds 0.5), so excluded zones end exactly as the
// operators left them. An operator re-run keeps the operator's seed, merges the override parameters over the operator parameters and
// multiplies the override mask with the operator mask when both exist; it acts on the current state, so additive operators add again.
import { LANDSCAPE_SYNTHESIS_OPERATORS, LANDSCAPE_SYNTHESIS_OVERRIDES, landscapeSynthesisEffectiveSeed, resolveLandscapeSynthesisParameters } from '../../../../src/app/landscape/LandscapeSynthesisRecipe.js';
import { SYNTHESIS_OPERATORS } from './index.mjs';
import { IMPORT_OPERATORS, resolveImport } from './Imports.mjs';

const round6 = value => Math.round(value * 1e6) / 1e6;

function resolveOverrideParameters(override) {
    const resolved = {};
    for (const [name, definition] of Object.entries(LANDSCAPE_SYNTHESIS_OVERRIDES[override.type].parameters)) resolved[name] = override[name] === undefined ? definition.default ?? null : override[name];
    return Object.freeze(resolved);
}

function recipeOperator(recipe, id) {
    const operator = recipe.operators.find(entry => entry.id === id);
    if (!operator) throw new Error(`[Synthesis] override operatorId ${id} is not a recipe operator`);
    return operator;
}

function overriddenLayers(recipe) {
    const names = new Set();
    for (const override of recipe.overrides) {
        if (override.type === 'import') names.add(override.target ?? 'height');
        else if (override.type === 'region') names.add('height');
        else if (override.type === 'operator') for (const layer of LANDSCAPE_SYNTHESIS_OPERATORS[recipeOperator(recipe, override.operatorId).op].layers.writes) names.add(layer);
    }
    return [...names];
}

/**
 * Reads and records every map an import override uses, before the operators run, so the identity is complete for mid-run exports.
 * @param {any} recipe validated recipe @param {(operator:{id:string,op:string},options:{params:any,seed:number,mask:any})=>{context:any,scope:any}} contextFor
 */
export async function prepareRecipeOverrides(recipe, contextFor) {
    const imports = [...new Set(recipe.overrides.filter(override => override.type === 'import').map(override => override.importId))];
    if (!imports.length) return;
    const { context, scope } = contextFor({ id: 'overrides', op: 'prepare' }, { params: null, seed: 0, mask: null });
    try { for (const importId of imports) await resolveImport(context, importId); }
    finally { scope.releaseAll(); }
}

async function regionOverride(context, override) {
    const heights = context.layers.get('height'), mask = context.mask(), { mode, meters } = override.height, { columns } = context.grid;
    let masked = 0;
    for (let i = 0; i < heights.length; i++) {
        if (i % columns === 0 && (i / columns) % 64 === 0) context.checkpoint();
        const m = mask[i];
        if (m <= 0) continue;
        masked++;
        const h = heights[i], target = mode === 'set' ? meters : mode === 'raise' ? h + meters : h - meters;
        heights[i] = m >= 1 ? target : h + m * (target - h);
    }
    return { mode, meters, maskedSamples: masked };
}

function startOverride(recipe, override, contextFor) {
    const id = `override/${override.id}`;
    if (override.type === 'import') return { ...contextFor({ id, op: 'import-map' }, { params: resolveOverrideParameters(override), seed: 0, mask: override.mask }), run: context => IMPORT_OPERATORS['import-map'](context) };
    if (override.type === 'region') return { ...contextFor({ id, op: 'region' }, { params: resolveOverrideParameters(override), seed: 0, mask: override.mask }), run: context => regionOverride(context, override) };
    const operator = recipeOperator(recipe, override.operatorId), params = resolveLandscapeSynthesisParameters({ op: operator.op, params: { ...operator.params, ...override.params } });
    const mask = operator.mask !== null && override.mask !== null ? { type: 'multiply', selectors: [operator.mask, override.mask] } : operator.mask ?? override.mask;
    return { ...contextFor({ id, op: operator.op }, { params, seed: landscapeSynthesisEffectiveSeed(recipe, operator), mask }), run: context => SYNTHESIS_OPERATORS[operator.op](context) };
}

function restoreUnderMask(layers, snapshots, mask) {
    const restored = {};
    for (const { name, copy } of snapshots) {
        const layer = layers.get(name), float = layer instanceof Float32Array;
        let samples = 0, maxChange = 0;
        for (let i = 0; i < layer.length; i++) {
            const m = mask[i];
            if (m <= 0) continue;
            const h = layer[i];
            if (float) layer[i] = m >= 1 ? copy[i] : h + m * (copy[i] - h);
            else if (m > .5) layer[i] = copy[i];
            const change = Math.abs(layer[i] - h);
            if (change > 0) { samples++; if (change > maxChange) maxChange = change; }
        }
        restored[name] = { samples, maxChangeMeters: float ? round6(maxChange) : null };
    }
    return restored;
}

/**
 * Applies recipe.overrides in document order on the current layers and returns one report entry per override.
 * @param {{recipe:any,layers:any,memory:any,grid:{columns:number,rows:number},contextFor:Function,log:(message:string)=>void}} options
 * @returns {Promise<Array<{id:string,type:string,seconds:number,statistics:any}>>}
 */
export async function applyRecipeOverrides({ recipe, layers, memory, grid, contextFor, log }) {
    const overrides = recipe.overrides, n = grid.columns * grid.rows;
    if (!overrides.length) return [];
    const excludes = overrides.filter(override => override.type === 'exclude'), snapshots = [], report = [];
    if (excludes.length) for (const name of overriddenLayers(recipe)) {
        if (!layers.has(name)) continue;
        const source = layers.get(name), memoryName = `override/snapshot/${name}`, copy = memory.allocate(memoryName, source.constructor, n);
        copy.set(source);
        snapshots.push({ name, copy, memoryName });
    }
    const before = memory.allocate('override/before', Float32Array, n);
    try {
        for (const override of overrides) {
            const entry = { id: override.id, type: override.type, seconds: 0, statistics: null };
            report.push(entry);
            if (override.type === 'exclude') continue;
            log(`[Synthesis] override ${override.id} (${override.type})`);
            const mark = performance.now(), { context, scope, run } = startOverride(recipe, override, contextFor);
            before.set(layers.get('height'));
            let details;
            try { details = await run(context); }
            finally { scope.releaseAll(); }
            const heights = layers.get('height');
            let changed = 0, maxChange = 0;
            for (let i = 0; i < n; i++) { const change = Math.abs(heights[i] - before[i]); if (change > 0) { changed++; if (change > maxChange) maxChange = change; } }
            entry.seconds = round6((performance.now() - mark) / 1000);
            entry.statistics = { changedSamples: changed, maxChangeMeters: round6(maxChange), details };
        }
        for (const override of excludes) {
            log(`[Synthesis] override ${override.id} (exclude)`);
            const mark = performance.now(), { context, scope } = contextFor({ id: `override/${override.id}`, op: 'exclude' }, { params: null, seed: 0, mask: override.mask });
            try {
                const mask = context.mask();
                let protectedSamples = 0;
                for (let i = 0; i < n; i++) if (mask[i] > 0) protectedSamples++;
                const restored = restoreUnderMask(layers, snapshots, mask), entry = report.find(item => item.id === override.id);
                entry.seconds = round6((performance.now() - mark) / 1000);
                entry.statistics = { changedSamples: restored.height?.samples ?? 0, maxChangeMeters: restored.height?.maxChangeMeters ?? 0, details: { protectedSamples, layers: snapshots.map(snapshot => snapshot.name), restored } };
            } finally { scope.releaseAll(); }
        }
    } finally {
        memory.free('override/before');
        for (const snapshot of snapshots) memory.free(snapshot.memoryName);
    }
    return report;
}
