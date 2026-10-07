// Installs the exact reviewed branchlet GLBs and authenticates their portable embedded PBR assets.
// @ts-check
import path from 'node:path';
import {createHash} from 'node:crypto';
import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import {hashFile, writeJson} from '../../baking/Files.mjs';
import {glbDocument} from '../Validate.mjs';
import {readAccessor} from '../Accessors.mjs';
import {SPECIES} from '../lod0_library/Package.mjs';

const json = async file => JSON.parse(await readFile(file, 'utf8'));
const totals = [{wood: 47548, leaves: 50000}, {wood: 23640, leaves: 15366}];
const identities = SPECIES.flatMap(species => [1, 2, 3].map(n => `${species}/mature_0${n}`));
const digest = async (file, expected) => {
    const actual = await hashFile(file);
    if (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes) throw new Error('Asset authentication failed: '+file);
};

/** @param {{source:string, destination:string, provenance:string}} options */
export async function packageBranchletLibrary({source, destination, provenance}) {
    const manifest = {schema: 'bus-sim-vegetation-lods-v1', revision: 'branchlets-v1',
        generator: 'tools/bake_vegetation/branchlets',
        publication: 'Standalone LOD0/LOD1 assets; existing city placements and legacy catalog unchanged',
        models: [], sourceFiles: {}};
    await mkdir(destination, {recursive: true});
    for (const level of [0, 1]) for (const id of identities) {
        const [species, variant] = id.split('/'), stem = `${variant}_lod${level}`;
        const directory = path.join(source, `lod${level}`, id);
        const stats = await json(path.join(directory, 'model.json'));
        const compression = await json(path.join(directory, 'compression.json'));
        if (compression.textures.length !== 6 || compression.textures.some(t => !Number.isFinite(t.quality.psnr)
            || t.quality.psnr < 28 || !(t.quality.alphaCoverageError <= .015)
            || !((t.quality.meanNormalAngleDegrees ?? 0) <= 6))) throw new Error('Compressed PBR quality gate failed: '+id);
        const error = stats.geometryError;
        if (error.nonManifoldEdges !== 0 || !(error.p99Metres <= (level ? .15 : .10))
            || !(error.maxMetres <= (level ? .35 : .18)) || (level && !(error.reverse?.faceMax <= .09))) throw new Error('Wood quality gate failed: '+id);
        const file = `${species}/${stem}.glb`, original = path.join(directory, stem+'.glb');
        await mkdir(path.join(destination, species), {recursive: true});
        await copyFile(original, path.join(destination, file));
        manifest.models.push({id, level, file, ...await hashFile(original), woodTriangles: stats.woodTriangles,
            leafTriangles: stats.canopyTriangles, coreTriangles: stats.coreTriangles,
            geometryError: error, textures: compression.textures.map(t => ({name: t.name, sha256: t.sha256, bytes: t.bytes}))});
    }
    for (const file of ['reference-sources.json', 'reference-material-approximations.json']) {
        await copyFile(path.join(provenance, file), path.join(destination, file));
        manifest.sourceFiles[file] = await hashFile(path.join(destination, file));
    }
    await writeFile(path.join(destination, 'README.md'), '# Mature trees with branchlet canopies\n\nFive species, three mature forms each, with LOD0 and LOD1 (30 models). Each GLB contains its compressed PBR maps and loads independently of the review workspace. Files are byte-identical to the AI594 reviewed exports.\n\nGenerator code: tools/bake_vegetation/, especially lod0/, lod1/, and branchlets/. Install with node tools/bake.mjs --target vegetation/branchlet-library --publish. Source Blender scenes and comparison renders remain in tests/artifacts/screens/ai594_branchlet_canopies/final/.\n\nOriginal modeled geometry; photographic materials are CC0. See reference-sources.json for credits and reference-material-approximations.json for species approximations. Licensed game atlas pixels were not copied. Double-sided alpha cards share leaf tissue on both faces; wind and runtime LOD switching are not implemented here.\n\nThis asset directory is shared and gitignored; distribute it alongside the code. Existing city placements and the earlier LOD0 catalog are unchanged.\n');
    manifest.sourceFiles['README.md'] = await hashFile(path.join(destination, 'README.md'));
    await writeJson(path.join(destination, 'index.json'), manifest);
    await validateBranchletLibrary({directory: destination});
    return manifest;
}

/** @param {{directory:string}} result */
export async function validateBranchletLibrary({directory}) {
    const manifest = await json(path.join(directory, 'index.json'));
    if (manifest.schema !== 'bus-sim-vegetation-lods-v1' || manifest.revision !== 'branchlets-v1' || manifest.models.length !== 30) throw new Error('Incomplete branchlet library');
    const seen = new Set(), counts = [{wood: 0, leaves: 0}, {wood: 0, leaves: 0}];
    for (const row of manifest.models) {
        if (![0, 1].includes(row.level) || !identities.includes(row.id) || seen.has(`${row.level}/${row.id}`)
            || row.file !== `${row.id}_lod${row.level}.glb`) throw new Error('Invalid asset identity');
        seen.add(`${row.level}/${row.id}`);
        const file = path.join(directory, row.file); await digest(file, row);
        const document = glbDocument(await readFile(file)), doc = document.json;
        if (!doc.extensionsRequired?.includes('KHR_texture_basisu') || doc.images.length !== 6 || doc.buffers.length !== 1
            || doc.buffers[0].uri || row.textures.length !== 6) throw new Error('Incomplete embedded PBR');
        for (const image of doc.images) {
            const expected = row.textures.find(t => t.name === image.name), view = doc.bufferViews[image.bufferView];
            if (image.uri || image.mimeType !== 'image/ktx2' || !view || !expected) throw new Error('Invalid embedded texture');
            const bytes = document.bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0)+view.byteLength);
            if (createHash('sha256').update(bytes).digest('hex') !== expected.sha256 || bytes.length !== expected.bytes) throw new Error('Embedded PBR authentication failed');
        }
        let wood = 0, leaves = 0, core = 0;
        for (const mesh of doc.meshes) for (const primitive of mesh.primitives) {
            const material = doc.materials[primitive.material], count = doc.accessors[primitive.indices].count/3;
            if ((primitive.mode ?? 4) !== 4 || !Number.isInteger(count)) throw new Error('Invalid triangles');
            if (material.name.includes('spray cards')) {
                leaves += count; if (mesh.name.includes('core')) core += count;
                if (!material.doubleSided || material.alphaMode !== 'MASK' || material.alphaCutoff !== .5
                    || material.extensions?.KHR_materials_diffuse_transmission?.diffuseTransmissionFactor !== .17) throw new Error('Invalid foliage material');
            } else wood += count;
            for (const field of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'TANGENT']) {
                const values = readAccessor(document, primitive.attributes[field]);
                for (let i=0; i<values.count; i++) for (let c=0; c<values.width; c++) if (!Number.isFinite(values.get(i,c))) throw new Error('Non-finite asset geometry');
            }
        }
        if (wood !== row.woodTriangles || leaves !== row.leafTriangles || core !== 30 || row.coreTriangles !== 30) throw new Error('Asset triangle count mismatch');
        counts[row.level].wood += wood; counts[row.level].leaves += leaves;
        if (row.level === 1) {
            const lod0 = manifest.models.find(m => m.level === 0 && m.id === row.id);
            if (!lod0 || wood+leaves > Math.floor((lod0.woodTriangles+lod0.leafTriangles)*.4)) throw new Error('LOD1 exceeds 40% budget');
        }
    }
    if (JSON.stringify(counts) !== JSON.stringify(totals)) throw new Error('Combined tree budget mismatch');
    const sourceFiles = ['README.md', 'reference-sources.json', 'reference-material-approximations.json'];
    if (Object.keys(manifest.sourceFiles).length !== sourceFiles.length || sourceFiles.some(f => !manifest.sourceFiles[f])) throw new Error('Incomplete provenance');
    for (const file of sourceFiles) await digest(path.join(directory, file), manifest.sourceFiles[file]);
}
