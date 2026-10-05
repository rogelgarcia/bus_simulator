// Authenticate and reuse the accepted LOD0 wood while preserving the comparison baseline.
// @ts-check
import path from 'node:path';
import {readFile, mkdir, copyFile} from 'node:fs/promises';
import {hashFile, writeJson} from '../../baking/Files.mjs';

/** @param {{output: string, baseline: string, models: string[]}} options */
export async function reuseWood(options) {
    const json = async file => JSON.parse(await readFile(file, 'utf8'));
    const source = await json(path.join(options.output, 'reference.json'));
    const baseline = await json(path.join(options.baseline, 'reference.json'));
    if (source.sha256 !== baseline.sha256) throw new Error('LOD0 baseline and revision use different reference scenes');
    const files = [];
    await copyFile(path.join(options.baseline, 'inspection.json'), path.join(options.output, 'inspection.json'));
    for (const model of options.models) {
        const previous = await json(path.join(options.baseline, model, 'model.json'));
        if (previous.placement && previous.placement !== 'direction') throw new Error('Expected the original direction-grouped LOD0 baseline');
        await mkdir(path.join(options.output, model), {recursive: true});
        for (const name of ['wood.blend', 'wood.json', 'bark_color.png', 'bark_normal.png', 'bark_orm.png']) {
            const from = path.join(options.baseline, model, name), to = path.join(options.output, model, name);
            const identity = await hashFile(from);
            await copyFile(from, to);
            if ((await hashFile(to)).sha256 !== identity.sha256) throw new Error('Wood reuse did not preserve its source');
            files.push({model, file: name, ...identity});
        }
    }
    await writeJson(path.join(options.output, 'reused-wood.json'), {baseline: options.baseline, referenceSha256: source.sha256, files});
}
