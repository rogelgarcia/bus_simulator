// Checks actual exported LOD1 geometry and cutout contracts against installed LOD0 counts.
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {glbDocument} from '../Validate.mjs';
import {readAccessor} from '../Accessors.mjs';

export async function validateModels(options) {
    const manifest = JSON.parse(await readFile(path.join(options.root, 'assets/public/vegetation_lod0/index.json'), 'utf8'));
    for (const id of options.models) {
        const variant = id.split('/')[1], directory = path.join(options.output, id);
        const stats = JSON.parse(await readFile(path.join(directory, 'model.json'), 'utf8'));
        const coverage = JSON.parse(await readFile(path.join(directory, 'coverage.json'), 'utf8'));
        if (coverage.views.length !== 24 || coverage.views.some(view => !(view.coverageRatio >= .95 && view.coverageRatio <= 1.20)
            || !(view.outsideLod0EnvelopeFraction >= 0 && view.outsideLod0EnvelopeFraction <= .10))) throw new Error('LOD1 canopy volume gate failed: '+id);
        const document = glbDocument(await readFile(path.join(directory, variant + '_lod1.glb'))), doc = document.json;
        let wood = 0, leaves = 0;
        for (const mesh of doc.meshes) for (const primitive of mesh.primitives) {
            const material = doc.materials[primitive.material], count = doc.accessors[primitive.indices].count / 3;
            if (material.name.includes('spray cards')) {
                if (!material.doubleSided || material.alphaMode !== 'MASK' || material.alphaCutoff !== .5
                    || material.extensions?.KHR_materials_diffuse_transmission?.diffuseTransmissionFactor !== .17) throw new Error('LOD1 leaf coverage contract failed');
                leaves += count;
            } else wood += count;
            for (const field of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'TANGENT']) {
                const values = readAccessor(document, primitive.attributes[field]);
                for (let i = 0; i < values.count; i++) for (let c = 0; c < values.width; c++) if (!Number.isFinite(values.get(i, c))) throw new Error('Non-finite LOD1 geometry');
            }
        }
        const source = manifest.models.find(row => row.id === id);
        if (wood !== stats.woodTriangles || leaves !== stats.canopyTriangles || wood + leaves > Math.floor((source.woodTriangles + source.leafTriangles) * .4)
            || wood >= source.woodTriangles || leaves >= source.leafTriangles || leaves < 32 || stats.geometryError.nonManifoldEdges !== 0
            || stats.geometryError.p99Metres > .15 || stats.geometryError.maxMetres > .35
            || !(stats.geometryError.reverse?.faceMax <= .09)) throw new Error('LOD1 triangle/manifold budget failed: ' + id);
    }
}
