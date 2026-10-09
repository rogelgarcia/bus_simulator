// Executes a validated landscape synthesis recipe: ordered operators on one working grid with tracked memory, progress, cancellation and resampling.
// @ts-check
// The graph owns the layer store (one tracked array per named layer), gives every operator a scope whose temporaries are released
// when it ends (also when it throws or is aborted), evaluates the operator mask once, derives the operator seed, and checks the
// AbortSignal between operators (operators check it inside long loops through context.checkpoint). Operators run in recipe order on
// the working grid; when the recipe declares a coarser working spacing the final height is resampled to the output grid with the
// resample operator's filter while the output cover is the untouched native cover (keep-source). Recipe overrides (imported maps,
// region edits, operator re-runs, exclude zones) evaluate after the operator loop and before the resample with contexts from the
// same factory; the maps of import overrides are read before the first operator so the identity an export-map writes is final. The
// report records per-operator seconds and statistics, the applied overrides, the working grid, the input hashes and the recipe
// identity they produce.
import { landscapeSynthesisEffectiveSeed, landscapeSynthesisRecipeIdentity, resolveLandscapeSynthesisParameters, validateLandscapeSynthesisRecipe } from '../../../src/app/landscape/LandscapeSynthesisRecipe.js';
import { TerrainFieldMemory } from '../terrain_fields/TerrainFieldsGrid.mjs';
import { SYNTHESIS_OPERATORS } from './operators/index.mjs';
import { applyRecipeOverrides, prepareRecipeOverrides } from './operators/Overrides.mjs';
import { evaluateSelector } from './operators/Selectors.mjs';
import { resampleToGrid, synthesisOutputGrid, synthesisWorkingGrid } from './SynthesisWorkingGrid.mjs';

function createLayerStore(memory, grid, owned) {
    const layers = new Map(), n = grid.columns * grid.rows;
    return Object.freeze({
        has: name => layers.has(name),
        get(name) {
            const entry = layers.get(name);
            if (!entry) throw new Error(`[Synthesis] layer ${name} does not exist yet (layers: ${[...layers.keys()].join(', ') || 'none'})`);
            return entry.array;
        },
        create(name, Type) {
            if (layers.has(name)) throw new Error(`[Synthesis] layer ${name} already exists`);
            const memoryName = `layer/${name}`, array = memory.allocate(memoryName, Type, n);
            owned.add(memoryName); layers.set(name, { array, memoryName });
            return array;
        },
        adopt(name, array, memoryName) {
            if (layers.has(name)) throw new Error(`[Synthesis] layer ${name} already exists`);
            if (array.length !== n) throw new Error(`[Synthesis] layer ${name} has ${array.length} samples, the working grid needs ${n}`);
            owned.add(memoryName); layers.set(name, { array, memoryName });
        },
        release(name) {
            const entry = layers.get(name);
            if (!entry) throw new Error(`[Synthesis] cannot release missing layer ${name}`);
            memory.free(entry.memoryName); owned.delete(entry.memoryName); layers.delete(name);
        },
        entries: () => [...layers.entries()].map(([name, entry]) => ({ name, array: entry.array, memoryName: entry.memoryName }))
    });
}

function createScope(memory, operatorId, owned) {
    const names = new Set();
    const qualified = name => `op/${operatorId}/${name}`;
    return Object.freeze({
        allocate(name, Type, length) {
            const array = memory.allocate(qualified(name), Type, length);
            names.add(qualified(name)); owned.add(qualified(name));
            return array;
        },
        free(...list) { for (const name of list) { memory.free(qualified(name)); names.delete(qualified(name)); owned.delete(qualified(name)); } },
        releaseAll() { for (const name of names) { memory.free(name); owned.delete(name); } names.clear(); }
    });
}

/**
 * @param {{recipe:any,inputs?:{root?:string,readLandscape?:Function,planFiles?:any,readFile?:Function},memory:TerrainFieldMemory,signal?:AbortSignal,
 *   onProgress?:(event:{index:number,count:number,id:string,op:string,phase:'start'|'done',seconds:number,fraction:number})=>void,
 *   onOperator?:(event:{index:number,count:number,id:string,op:string,statistics:any,layers:{has:(name:string)=>boolean,get:(name:string)=>Float32Array|Uint8Array},grid:any})=>unknown,log?:(message:string)=>void}} options
 * @returns {Promise<{grid:any,heights:Float32Array,cover:Uint8Array,layers:Record<string,Float32Array|Uint8Array>,workingGrid:any,report:any,release:()=>void}>}
 */
export async function executeSynthesisRecipe({ recipe: input, inputs = {}, memory, signal, onProgress = () => {}, onOperator = null, log = () => {} }) {
    if (!(memory instanceof TerrainFieldMemory)) throw new Error('[Synthesis] executeSynthesisRecipe needs a TerrainFieldMemory ledger');
    const recipe = validateLandscapeSynthesisRecipe(input), output = synthesisOutputGrid(recipe), working = synthesisWorkingGrid(recipe), started = performance.now();
    const owned = new Set(), layers = createLayerStore(memory, working.grid, owned), inputHashes = [], operators = [];
    const state = { plan: null, native: null, imports: new Map() };
    const enabled = recipe.operators.filter(operator => operator.enabled);
    let resampleFilter = null;
    const release = () => { for (const name of [...owned]) if (memory.entries.has(name)) memory.free(name); owned.clear(); };
    // one context per run of an operator: recipe operators, override evaluation and operator re-runs share this factory
    const contextFor = (operator, { params, seed, mask: selector }) => {
        const scope = createScope(memory, operator.id, owned), cache = {};
        memory.enter(operator.id);
        let mask = null, maskEvaluated = false;
        const context = Object.freeze({
            recipe, grid: working.grid, output, seaLevel: recipe.seaLevel, memory, signal, log, inputs, cache, scope, layers, imports: state.imports,
            working: { coarse: working.coarse }, operator: { id: operator.id, op: operator.op, seed, params, mask: selector },
            get plan() { return state.plan; }, setPlan: plan => { state.plan = plan; },
            get native() { return state.native; }, setNative: native => { state.native = native; },
            own: name => owned.add(name), disown: name => owned.delete(name),
            recordInput: (id, sha256) => inputHashes.push({ id, sha256 }),
            identity: () => landscapeSynthesisRecipeIdentity(recipe, inputHashes),
            checkpoint: () => signal?.throwIfAborted(),
            mask() {
                if (maskEvaluated) return mask;
                maskEvaluated = true;
                if (selector !== null) mask = evaluateSelector(context, selector, scope.allocate('mask', Float32Array, working.grid.columns * working.grid.rows));
                return mask;
            }
        });
        return { context, scope };
    };
    try {
        await prepareRecipeOverrides(recipe, contextFor);
        for (let index = 0; index < enabled.length; index++) {
            const operator = enabled[index];
            signal?.throwIfAborted();
            const params = resolveLandscapeSynthesisParameters(operator), seed = landscapeSynthesisEffectiveSeed(recipe, operator);
            onProgress({ index, count: enabled.length, id: operator.id, op: operator.op, phase: 'start', seconds: (performance.now() - started) / 1000, fraction: index / enabled.length });
            log(`[Synthesis] ${index + 1}/${enabled.length} ${operator.id} (${operator.op})`);
            const { context, scope } = contextFor(operator, { params, seed, mask: operator.mask });
            const mark = performance.now();
            let statistics;
            try { statistics = await SYNTHESIS_OPERATORS[operator.op](context); }
            finally { scope.releaseAll(); }
            if (operator.op === 'resample') resampleFilter = params.filter;
            const seconds = (performance.now() - mark) / 1000;
            operators.push({ id: operator.id, op: operator.op, seconds: Math.round(seconds * 1e6) / 1e6, statistics });
            onProgress({ index, count: enabled.length, id: operator.id, op: operator.op, phase: 'done', seconds, fraction: (index + 1) / enabled.length });
            // inspection after each operator (review images per operator); the callback must not keep the layer arrays
            if (onOperator) await onOperator({ index, count: enabled.length, id: operator.id, op: operator.op, statistics, layers: { has: layers.has, get: layers.get }, grid: working.grid });
        }
        signal?.throwIfAborted();
        if (!layers.has('height') || !layers.has('cover')) throw new Error('[Synthesis] the recipe produced no height or cover layer (an enabled import-heights is required)');
        const overrides = await applyRecipeOverrides({ recipe, layers, memory, grid: working.grid, contextFor, log });
        signal?.throwIfAborted();
        let heights, cover;
        const outputMark = performance.now();
        memory.enter('output');
        if (working.coarse) {
            if (!resampleFilter) throw new Error('[Synthesis] a coarse working grid needs the resample operator');
            if (!state.native) throw new Error('[Synthesis] the native cover was not retained for the output');
            heights = memory.allocate('output/heights', Float32Array, output.columns * output.rows); owned.add('output/heights');
            resampleToGrid(working.grid, layers.get('height'), output, heights, resampleFilter);
            cover = state.native.cover;
        } else { heights = layers.get('height'); cover = layers.get('cover'); }
        let capped = 0;
        if (recipe.outputs.heightCap !== null) for (let i = 0; i < heights.length; i++) if (heights[i] > recipe.outputs.heightCap) { heights[i] = recipe.outputs.heightCap; capped++; }
        for (let i = 0; i < heights.length; i++) if (!Number.isFinite(heights[i])) throw new Error(`[Synthesis] output height ${i} is not finite`);
        const identity = await landscapeSynthesisRecipeIdentity(recipe, inputHashes);
        const report = { identity, recipeId: recipe.id, seed: recipe.seed, operators, overrides, working: { spacing: working.grid.spacingX, columns: working.grid.columns, rows: working.grid.rows },
            output: { spacing: output.spacingX, columns: output.columns, rows: output.rows }, resampled: working.coarse, resampleFilter: working.coarse ? resampleFilter : null,
            outputHeightCap: recipe.outputs.heightCap, outputCappedSamples: capped, coverPolicy: recipe.outputs.coverPolicy, inputs: [...inputHashes].sort((a, b) => a.id < b.id ? -1 : 1),
            outputSeconds: Math.round((performance.now() - outputMark) / 1e3 * 1e6) / 1e6, totalSeconds: Math.round((performance.now() - started) / 1e3 * 1e6) / 1e6, memory: memory.report() };
        return { grid: output, heights, cover, layers: Object.fromEntries(layers.entries().map(entry => [entry.name, entry.array])), workingGrid: working.grid, report, release };
    } catch (error) { release(); throw error; }
}
