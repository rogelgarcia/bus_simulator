// Publishes reviewed branchlet trees through the shared bake validation and rollback workflow.
// @ts-check
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {hashFile, listFiles} from '../../baking/Files.mjs';
import {publishBakeDirectory} from '../../baking/Publication.mjs';
import {validate as validateBranchlets} from '../branchlets/Validate.mjs';
import {validateModels as validateLod1} from '../lod1/Validate.mjs';
import {packageBranchletLibrary, validateBranchletLibrary} from './Package.mjs';

function sources(ctx) {
    const options = Object.fromEntries(['source', 'source0', 'source1'].map(key => [key, path.resolve(ctx.root, ctx.options[key])]));
    for (const directory of Object.values(options)) {
        const relative = path.relative(path.join(ctx.root, 'tests/artifacts/screens'), directory);
        if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Use separate reviewed sources under tests/artifacts/screens');
    }
    return options;
}

export const branchletLibraryJob = {
    id: 'vegetation/branchlet-library', always: true,
    description: 'Install all 30 reviewed branchlet LOD0/LOD1 trees as portable embedded-PBR assets',
    outputs: ['assets/public/vegetation_lods'],
    defaults: {source: 'tests/artifacts/screens/ai594_branchlet_canopies/final',
        source0: 'tests/artifacts/screens/ai591_core_canopies/final', source1: 'tests/artifacts/screens/ai593_lod1_canopies/final'},
    options: {source: String, source0: String, source1: String},
    async inputs(ctx) {
        const directories = Object.values(sources(ctx));
        const files = (await Promise.all(directories.map(listFiles))).flat().filter(file => /(?:_lod[01]\.glb|model\.json|compression\.json|layout\.json|coverage\.json|atlas\.json|leaf_(?:color|normal|orm)\.png|reference-(?:sources|material-approximations)\.json)$/.test(file));
        for (const directory of ['branchlet_library', 'branchlets', 'lod1', 'lod0_library']) files.push(...await listFiles(path.join(ctx.root, 'tools/bake_vegetation', directory)));
        return [...files.filter(file => !file.includes('__pycache__')), path.join(ctx.root, 'assets/public/vegetation_lod0/index.json'),
            path.join(ctx.root, 'tools/bake_vegetation/Validate.mjs'), path.join(ctx.root, 'tools/bake_vegetation/Accessors.mjs'), path.join(ctx.root, 'tools/bake_vegetation/lod0/Png.mjs')];
    },
    async run(ctx) {
        const options = sources(ctx), manifest = JSON.parse(await readFile(path.join(ctx.root, 'assets/public/vegetation_lod0/index.json'), 'utf8'));
        const models = manifest.models.map(row => row.id);
        for (const row of manifest.models) {
            const file = path.join(options.source0, row.id, row.id.split('/')[1]+'_lod0.glb');
            if ((await hashFile(file)).sha256 !== row.sourceGlb.sha256) throw new Error('Accepted LOD0 input changed');
        }
        await validateLod1({root: ctx.root, output: options.source1, models});
        await validateBranchlets({...options, output: options.source, levels: [0, 1], models});
        const directory = path.join(ctx.stage, 'library');
        await packageBranchletLibrary({source: options.source, provenance: options.source0, destination: directory});
        await ctx.assertInputsStable();
        const result = {state: 'validated', directory, files: await listFiles(directory)};
        if (ctx.publish) {
            const destination = path.join(ctx.root, 'assets/public/vegetation_lods');
            await publishBakeDirectory(directory, destination);
            await validateBranchletLibrary({directory: destination});
            result.state = 'published'; result.files.push(...await listFiles(destination));
        }
        return result;
    },
    validate: validateBranchletLibrary
};
