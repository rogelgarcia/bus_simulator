// Count exported triangle indices separately for wood and alpha-card foliage.
// @ts-check
import path from 'node:path';
import {readFile, writeFile} from 'node:fs/promises';
import {glbDocument} from '../Validate.mjs';
import {writeJson} from '../../baking/Files.mjs';

async function counts(file) {
    const {json} = glbDocument(await readFile(file));
    const result = {wood: 0, leaves: 0};
    for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
        const count = json.accessors[primitive.indices].count;
        if ((primitive.mode ?? 4) !== 4 || count % 3 !== 0) throw new Error('Expected indexed triangles: ' + file);
        const key = json.materials[primitive.material].name.includes('spray cards') ? 'leaves' : 'wood';
        result[key] += count / 3;
    }
    return result;
}

/** @param {{output: string, baseline: string, placement?: string}} options @param {Array<{id: string, woodTriangles: number, canopyTriangles: number, currentWoodTriangles: number, currentLeafTriangles: number, referenceWoodTriangles: number, referenceFoliageTriangles: number, coreTriangles?: number, outerTriangles?: number}>} models */
export async function writeTriangleCounts(options, models) {
    const rows = [];
    for (const model of models) {
        const variant = model.id.split('/')[1];
        const old = await counts(path.join(options.baseline, model.id, variant + '_lod0.glb'));
        const revised = await counts(path.join(options.output, model.id, variant + '_lod0.glb'));
        if (old.wood !== model.currentWoodTriangles || old.leaves !== model.currentLeafTriangles ||
            revised.wood !== model.woodTriangles || revised.leaves !== model.canopyTriangles || (options.placement !== 'core' && old.wood !== revised.wood))
            throw new Error('Triangle report does not match exported indices: ' + model.id);
        rows.push({model: model.id, reference_wood_triangles: model.referenceWoodTriangles,
            reference_leaf_triangles: model.referenceFoliageTriangles, current_wood_triangles: old.wood,
            current_leaf_triangles: old.leaves, new_wood_triangles: revised.wood, new_leaf_triangles: revised.leaves,
            current_total: old.wood + old.leaves, new_total: revised.wood + revised.leaves});
        if (options.placement === 'core') Object.assign(rows.at(-1), {new_core_triangles: model.coreTriangles, new_outer_triangles: model.outerTriangles});
    }
    const columns = Object.keys(rows[0]);
    const totals = Object.fromEntries(columns.map(key => [key, key === 'model' ? 'TOTAL' : rows.reduce((sum, row) => sum + row[key], 0)]));
    const records = [...rows, totals];
    await writeJson(path.join(options.output, 'triangle-counts.json'), records);
    await writeFile(path.join(options.output, 'triangle-counts.csv'), [columns.join(','), ...records.map(row => columns.map(key => row[key]).join(','))].join('\n') + '\n');
}
