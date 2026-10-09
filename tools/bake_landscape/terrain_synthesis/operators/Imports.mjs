// Implements the interchange operators: import-map (a declared map combined into a float layer) and export-map (a layer written as a map with provenance).
// @ts-check
// A declared import is read once per run through the run-level cache (context.imports): the sidecar authenticates the bytes, the frame
// is compared exactly with the working grid (or, when the recipe works coarse, an output-grid map is decimated with the aligned tent
// average exactly as import-heights decimates the native heights: the only resampling, and reported) and the hash is recorded as the
// input import/<id>, so the recipe identity covers the file and one map used by several operators or overrides is read and recorded
// exactly once. Combination under the mask m with v = scale * map + offset: replace h += m (v - h); add h += m v; multiply
// h += m (h v - h); max and min h += m (max|min(h, v) - h); a full mask writes the combined value directly so a replace round trip is
// bit exact. export-map writes the current layer of the working grid through the runtime export root with the recipe identity as
// provenance; the recipe validator places exports after every input operator, and override imports are read before the operators
// run, so that identity is the final one.
import path from 'node:path';
import { readAuthoringFile } from '../../../landscape_authoring/AuthoringFiles.mjs';
import { LANDSCAPE_INTERCHANGE_MAP_LIMIT, LANDSCAPE_INTERCHANGE_META_SUFFIX, describeLandscapeMapFrame, exportLandscapeMap, importLandscapeMap, landscapeMapFrame, sameLandscapeMapFrame } from '../interchange/Interchange.mjs';
import { decimateHeights } from '../SynthesisWorkingGrid.mjs';

const round6 = value => Math.round(value * 1e6) / 1e6;

function resolveInputPath(context, relative) {
    const root = context.inputs.root;
    if (typeof root !== 'string' || !root) throw new Error(`[Synthesis] operator ${context.operator.id}: inputs.root is required to resolve ${relative}`);
    return path.resolve(root, relative);
}

/**
 * The decoded, frame-checked values of a declared import on the working grid, read and recorded once per run.
 * @param {any} context operator context @param {string} importId
 * @returns {Promise<{id:string,file:string,kind:string,encoding:string,sha256:string,values:Float32Array,decimated:boolean,meta:any}>}
 */
export async function resolveImport(context, importId) {
    const cache = context.imports;
    if (cache.has(importId)) return cache.get(importId);
    const entry = context.recipe.inputs.imports.find(item => item.id === importId);
    if (!entry) throw new Error(`[Synthesis] operator ${context.operator.id}: import ${importId} is not declared in recipe.inputs.imports`);
    const read = relative => context.inputs.readFile ? context.inputs.readFile(relative) : readAuthoringFile(resolveInputPath(context, relative), LANDSCAPE_INTERCHANGE_MAP_LIMIT, { signal: context.signal });
    const imported = await importLandscapeMap(entry.file, { read }), { meta } = imported;
    if (meta.kind !== entry.kind || meta.encoding !== entry.encoding) throw new Error(`[Synthesis] import ${importId}: ${entry.file} is a ${meta.encoding} ${meta.kind} map, the recipe declares ${entry.encoding} ${entry.kind}`);
    if (meta.kind === 'heights' && meta.seaLevel !== context.seaLevel) throw new Error(`[Synthesis] import ${importId}: ${entry.file} uses sea level ${meta.seaLevel}, the recipe uses ${context.seaLevel}`);
    const frame = landscapeMapFrame(meta), { grid, output, memory } = context, name = `import/${importId}`, n = grid.columns * grid.rows;
    let values, decimated = false;
    if (sameLandscapeMapFrame(frame, grid)) { values = memory.allocate(name, Float32Array, n); values.set(imported.values); }
    else if (context.working.coarse && sameLandscapeMapFrame(frame, output)) { values = memory.allocate(name, Float32Array, n); decimateHeights(output, imported.values, grid, values, 'tent'); decimated = true; }
    else {
        const accepted = context.working.coarse ? `the working grid ${describeLandscapeMapFrame(grid)} or the output grid ${describeLandscapeMapFrame(output)}` : `the working grid ${describeLandscapeMapFrame(grid)}`;
        throw new Error(`[Synthesis] import ${importId}: ${entry.file} frame ${describeLandscapeMapFrame(frame)} differs from ${accepted}; interchange maps are never resampled`);
    }
    context.own(name);
    context.recordInput(name, meta.sha256);
    const resolved = Object.freeze({ id: importId, file: entry.file, kind: meta.kind, encoding: meta.encoding, sha256: meta.sha256, values, decimated, meta });
    cache.set(importId, resolved);
    return resolved;
}

/**
 * Combines map values into a float layer under the mask and reports what changed.
 * @param {any} context @param {Float32Array} layer @param {Float32Array} values @param {Float32Array|null} mask @param {{mode:string,scale:number,offset:number}} params
 */
export function combineLayer(context, layer, values, mask, { mode, scale, offset }) {
    const { columns } = context.grid, n = layer.length;
    let changed = 0, maxChange = 0, masked = 0, minimum = Infinity, maximum = -Infinity;
    for (let i = 0; i < n; i++) {
        if (i % columns === 0 && (i / columns) % 64 === 0) context.checkpoint();
        const m = mask ? mask[i] : 1;
        if (m <= 0) continue;
        masked++;
        const v = scale * values[i] + offset, h = layer[i];
        if (v < minimum) minimum = v;
        if (v > maximum) maximum = v;
        const target = mode === 'replace' ? v : mode === 'add' ? h + v : mode === 'multiply' ? h * v : mode === 'max' ? (h > v ? h : v) : (h < v ? h : v);
        layer[i] = m >= 1 ? target : h + m * (target - h);
        const change = Math.abs(layer[i] - h);
        if (change > 0) { changed++; if (change > maxChange) maxChange = change; }
    }
    return { mode, scale, offset, maskedSamples: masked, changedSamples: changed, maxChangeMeters: round6(maxChange), mapMinimum: masked ? round6(minimum) : null, mapMaximum: masked ? round6(maximum) : null };
}

async function importMap(context) {
    const { params, id } = context.operator, resolved = await resolveImport(context, params.importId), mask = context.mask();
    let created = false;
    if (!context.layers.has(params.target)) {
        if (params.mode !== 'replace' || mask !== null) throw new Error(`[Synthesis] operator ${id}: layer ${params.target} does not exist yet; only replace without a mask creates it`);
        context.layers.create(params.target, Float32Array);
        created = true;
    }
    const layer = context.layers.get(params.target);
    if (!(layer instanceof Float32Array)) throw new Error(`[Synthesis] operator ${id}: layer ${params.target} is categorical; import-map combines float layers`);
    const statistics = combineLayer(context, layer, resolved.values, mask, params);
    return { importId: params.importId, target: params.target, created, file: resolved.file, kind: resolved.kind, encoding: resolved.encoding, sha256: resolved.sha256, decimated: resolved.decimated,
        mapGrid: { columns: resolved.meta.columns, rows: resolved.meta.rows, spacingX: resolved.meta.spacing.x, spacingZ: resolved.meta.spacing.z }, ...statistics };
}

async function exportMap(context) {
    const { params, id } = context.operator, root = context.inputs.exportRoot;
    if (typeof root !== 'string' || !root) throw new Error(`[Synthesis] operator ${id}: inputs.exportRoot is required to write ${params.file} (a leaf sets it to its stage directory)`);
    const layer = context.layers.get(params.layer);
    if (!(layer instanceof Float32Array)) throw new Error(`[Synthesis] operator ${id}: layer ${params.layer} is categorical; export-map writes float layers`);
    const identity = await context.identity();
    const written = await exportLandscapeMap({ file: path.resolve(root, params.file), kind: params.kind, encoding: params.encoding, grid: context.grid, values: layer, seaLevel: context.seaLevel,
        range: params.range === null ? null : { minMeters: params.range[0], maxMeters: params.range[1] },
        provenance: { tool: 'landscape-synthesis', recipeId: context.recipe.id, recipeIdentity: identity, seed: context.recipe.seed, operatorId: id, layer: params.layer, workingSpacing: context.grid.spacingX }, created: identity });
    return { layer: params.layer, kind: params.kind, encoding: params.encoding, file: params.file, metaFile: `${params.file}${LANDSCAPE_INTERCHANGE_META_SUFFIX}`, sha256: written.sha256, byteLength: written.byteLength,
        columns: context.grid.columns, rows: context.grid.rows, range: written.meta.range, recipeIdentity: identity };
}

export const IMPORT_OPERATORS = Object.freeze({ 'import-map': importMap, 'export-map': exportMap });
