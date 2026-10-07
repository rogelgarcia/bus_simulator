// Registers explicit original mature vegetation families with staged authentication and rollback publication.
// @ts-check
import path from 'node:path';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { listFiles, hashFile, writeJson } from '../baking/Files.mjs';
import { runHeadlessBake } from '../baking/Blender.mjs';
import { publishBakeDirectory } from '../baking/Publication.mjs';
import { glbDocument, validateVegetation, foliageFingerprint } from './Validate.mjs';
import { primitiveFingerprint } from './Accessors.mjs';
import { showcaseJob } from './showcase/job.mjs';
import { surfacesJob } from './surfaces/job.mjs';
import { junctionsJob } from './junctions/job.mjs';
import { growthJob } from './growth/job.mjs';
import { lod0Job } from './lod0/job.mjs';
import { lod0LibraryJob } from './lod0_library/job.mjs';
import { lod1Job } from './lod1/job.mjs';
import { branchletsJob } from './branchlets/job.mjs';
import { branchletLibraryJob } from './branchlet_library/job.mjs';
import { distantJob } from './distant/job.mjs';

const HERE = 'tools/bake_vegetation';
const SPECIES = ['london-plane', 'silver-linden', 'northern-red-oak', 'arrowwood-viburnum', 'american-elm'];
const PROTOTYPES = { 'northern-red-oak': 'oak', 'london-plane': 'plane', 'arrowwood-viburnum': 'shrub', 'american-elm': 'elm' };

async function normalizeMaterials(file, manifest) {
    const { json, remainder } = glbDocument(await readFile(file));
    for (const primitive of json.meshes.flatMap(mesh => mesh.primitives)) {
        // Blender's all-color export reserves COLOR_0 for a white fallback; both surfaces use the authored layer.
        if (primitive.attributes.COLOR_1 === undefined) throw new Error('Authored vegetation surface color was not exported');
        primitive.attributes.COLOR_0 = primitive.attributes.COLOR_1;
        delete primitive.attributes.COLOR_1;
    }
    for (const material of json.materials) {
        const settings = manifest.materials[material.name];
        if (!settings) throw new Error('Unexpected vegetation material name');
        material.alphaMode = settings.alphaMode;
        material.doubleSided = settings.doubleSided;
        delete material.alphaCutoff;
    }
    const serialized = Buffer.from(JSON.stringify(json)), padded = Buffer.alloc(Math.ceil(serialized.length / 4) * 4, 32);
    serialized.copy(padded);
    const header = Buffer.alloc(20);
    header.write('glTF', 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + padded.length + remainder.length, 8);
    header.writeUInt32LE(padded.length, 12); header.write('JSON', 16);
    await writeFile(file, Buffer.concat([header, padded, remainder]));
}

const createJob = (species, prototype = false) => ({
    id: prototype ? 'vegetation/prototype-' + PROTOTYPES[species] : 'vegetation/' + species,
    description: prototype ? `Stage one detailed ${species} for clay review without publication` : `Author three mature ${species} forms with detailed wood and solid leaves`,
    blender: true, configurationPaths: ['executable'], outputs: prototype ? [] : ['assets/public/vegetation/' + species.replaceAll('-', '_')],
    inputs: async ctx => {
        const inputs = (await listFiles(path.join(ctx.root, HERE))).filter(file => /\.(mjs|py|json)$/.test(file));
        const recipe = JSON.parse(await readFile(path.join(ctx.root, HERE, species.replaceAll('-', '_'), 'recipe.json'), 'utf8'));
        if (recipe.texture.photographicBark) {
            const source = JSON.parse(await readFile(path.join(ctx.root, HERE, recipe.texture.photographicBark, 'source.json'), 'utf8'));
            for (const record of Object.values(source.maps)) inputs.push(path.join(ctx.root, source.inputDirectory, record.file));
        }
        return inputs;
    },
    async run(ctx) {
        if (prototype && ctx.publish) throw new Error('Vegetation prototypes are stage-only; review before full-family publication');
        const folder = species.replaceAll('-', '_'), previousEnv = ctx.env;
        const recipe = JSON.parse(await readFile(path.join(ctx.root, HERE, folder, 'recipe.json'), 'utf8'));
        const accepted = JSON.parse(await readFile(path.join(ctx.root, HERE, 'accepted_wood.json'), 'utf8')).species[species];
        const originalWood = species === 'american-elm' && recipe.revision === 1 && recipe.woodContract === 'original-authoring-v1';
        if (!accepted && !originalWood) throw new Error(`Missing accepted wood contract: ${species}`);
        ctx.env = { ...ctx.env, OMP_NUM_THREADS: '2', OPENBLAS_NUM_THREADS: '2', TBB_NUM_THREADS: '2' };
        try { await runHeadlessBake(ctx, HERE + '/authoring/build.py', [ctx.stage, path.join(ctx.root, HERE, folder, 'recipe.json'), ...(prototype ? ['mature_01'] : [])]); }
        finally { ctx.env = previousEnv; }
        const directory = path.join(ctx.stage, 'publication'), manifestPath = path.join(directory, 'index.json');
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
        manifest.woodContract = accepted ? 'preserve-accepted-v1' : 'original-authoring-v1';
        const study = path.join(directory, manifest.leafStudy.file);
        await normalizeMaterials(study, manifest);
        Object.assign(manifest.leafStudy, await hashFile(study));
        for (const entry of manifest.variants) {
            const file = path.join(directory, entry.file);
            await normalizeMaterials(file, manifest);
            Object.assign(entry, await hashFile(file));
            const document = glbDocument(await readFile(file));
            entry.foliageFingerprint = foliageFingerprint(document);
            entry.woodFingerprint = primitiveFingerprint(document, 'bark');
            if (accepted && JSON.stringify(accepted.variants[entry.id]) !== JSON.stringify(entry.woodFingerprint)) throw new Error(`Accepted wood changed: ${species}/${entry.file}`);
        }
        for (const [name, expected] of Object.entries(manifest.textures).filter(([name]) => name.startsWith('bark_'))) {
            if (accepted && accepted.textures[name] !== expected.sha256) throw new Error(`Accepted bark texture changed: ${species}/${name}`);
        }
        manifest.compilerIdentity = ctx.key;
        await writeJson(manifestPath, manifest);
        const result = { state: 'validated', directory, files: await listFiles(directory) };
        await validateVegetation(result);
        await ctx.assertInputsStable();
        if (ctx.publish) {
            const destination = path.join(ctx.root, 'assets/public/vegetation', folder);
            await publishBakeDirectory(directory, destination);
            if (species === 'london-plane') for (const name of ['young', 'mature', 'spreading']) for (const retired of ['desktop', 'mobile']) {
                await unlink(path.join(destination, `${name}_${retired}.glb`)).catch(error => { if (error.code !== 'ENOENT') throw error; });
            }
            await validateVegetation({ directory: destination });
            result.state = 'published';
            result.files.push(...await listFiles(destination));
        }
        return result;
    }, validate: validateVegetation
});
const leaves = SPECIES.map(species => createJob(species));

export const vegetationJobs = [...leaves, showcaseJob, surfacesJob, junctionsJob, growthJob, lod0Job, lod0LibraryJob, lod1Job, branchletsJob, branchletLibraryJob, distantJob, ...Object.keys(PROTOTYPES).map(species => createJob(species, true)), {
    id: 'vegetation', description: 'Explicit original mature vegetation asset authoring, excluded from default production bakes',
    configurationPaths: ['executable'], children: leaves.map(job => job.id)
}];
