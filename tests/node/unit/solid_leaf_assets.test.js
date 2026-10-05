// Checks exported leaf specimens independently of the procedural author's topology counters.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { glbDocument } from '../../../tools/bake_vegetation/Validate.mjs';
import { readAccessor } from '../../../tools/bake_vegetation/Accessors.mjs';

const SPECIES = process.env.VEGETATION_TEST_SPECIES?.split(',').map(value => value.replaceAll('-', '_'))
    ?? ['london_plane', 'silver_linden', 'northern_red_oak', 'arrowwood_viburnum', 'american_elm'];
const PROTOTYPE = process.env.VEGETATION_LEAF_STUDY_DIRECTORY;
if (PROTOTYPE && SPECIES.length !== 1) throw new Error('A staged leaf study requires exactly one selected species');

for (const species of SPECIES) {
    test(`Solid leaves: ${species} exported specimens have closed, outward-wound volume`, async () => {
        const directory = PROTOTYPE ? pathToFileURL(path.resolve(PROTOTYPE) + path.sep)
            : new URL(`../../../assets/public/vegetation/${species}/`, import.meta.url);
        const manifest = JSON.parse(await fs.readFile(new URL('index.json', directory), 'utf8'));
        assert.equal(manifest.foliageRepresentation, 'solid-leaves-v1');
        const document = glbDocument(await fs.readFile(new URL(manifest.leafStudy.file, directory)));
        assert.equal(document.json.materials.length, 1);
        assert.equal(document.json.materials[0].alphaMode, 'OPAQUE');
        assert.equal(document.json.materials[0].doubleSided, false);
        const primitive = document.json.meshes[0].primitives[0];
        const position = readAccessor(document, primitive.attributes.POSITION);
        const indices = readAccessor(document, primitive.indices);
        const points = [], ids = [], unique = new Map(), edges = new Map();
        for (let row = 0; row < position.count; row++) {
            const point = [0, 1, 2].map(axis => position.get(row, axis));
            const key = point.join(',');
            if (!unique.has(key)) { unique.set(key, points.length); points.push(point); }
            ids.push(unique.get(key));
        }
        const parent = points.map((_, index) => index);
        const root = index => { while (parent[index] !== index) index = parent[index]; return index; };
        const volumes = [];
        for (let row = 0; row < indices.count; row += 3) {
            const triangle = [0, 1, 2].map(offset => ids[indices.get(row + offset, 0)]);
            assert.equal(new Set(triangle).size, 3, 'collapsed triangle');
            for (let side = 0; side < 3; side++) {
                const a = triangle[side], b = triangle[(side + 1) % 3];
                const key = a < b ? `${a}:${b}` : `${b}:${a}`;
                const edge = edges.get(key) ?? { count: 0, winding: 0 };
                edge.count++; edge.winding += a < b ? 1 : -1; edges.set(key, edge);
                parent[root(b)] = root(a);
            }
            const [a, b, c] = triangle.map(index => points[index]);
            const volume = (a[0] * (b[1] * c[2] - b[2] * c[1])
                + a[1] * (b[2] * c[0] - b[0] * c[2])
                + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
            volumes.push([triangle[0], volume]);
        }
        for (const edge of edges.values()) assert.deepEqual(edge, { count: 2, winding: 0 });
        const components = new Map();
        for (const [vertex, volume] of volumes) components.set(root(vertex), (components.get(root(vertex)) ?? 0) + volume);
        assert.equal(components.size, 16, 'eight blades and eight modeled petioles');
        for (const volume of components.values()) assert.ok(volume > 1e-10, 'nonzero outward-wound enclosed volume');
        assert.equal(manifest.leafStudy.forms, 8);
    });
}
