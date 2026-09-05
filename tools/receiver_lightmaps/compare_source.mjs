// Explains exact live-versus-bake source mismatches without changing either source.
import { readFile, writeFile } from 'node:fs/promises';
import { parseBakeSourcePackage } from '../../src/app/illumination/bake_source/index.js';

const baked = (await parseBakeSourcePackage(await readFile(process.argv[2]))).manifest;
const live = JSON.parse(await readFile(process.argv[3]));
function differences(a, b, key = '', output = []) {
    if (output.length >= 40 || JSON.stringify(a) === JSON.stringify(b)) return output;
    if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
        for (const name of new Set([...Object.keys(a), ...Object.keys(b)])) differences(a[name], b[name], `${key}/${name}`, output);
    } else output.push({ key, baked: a, live: b });
    return output;
}
const report = { hashes: differences(baked.hashes, live.hashes), sections: {} };
report.materialPairs = baked.objects.filter((object) => {
    const other = live.objects.find((v) => v.id === object.id);
    return JSON.stringify(object.materialIds) !== JSON.stringify(other?.materialIds);
}).slice(0, 8).map((object) => {
    const other = live.objects.find((v) => v.id === object.id);
    return { object: object.id, differences: differences(baked.materials.find((v) => v.id === object.materialIds[0]),
        live.materials.find((v) => v.id === other?.materialIds[0])) };
});
for (const key of ['source', 'lightingProfiles', 'channelProfiles', 'objects', 'meshInstances', 'geometries', 'materials', 'textures', 'receiverMappings']) {
    const a = baked[key], b = live[key];
    if (Array.isArray(a) && Array.isArray(b)) {
        const left = new Map(a.map((v) => [v.id, v]));
        const right = new Map(b.map((v) => [v.id, v]));
        report.sections[key] = { baked: a.length, live: b.length, removed: [...left.keys()].filter((id) => !right.has(id)).slice(0, 8),
            added: [...right.keys()].filter((id) => !left.has(id)).slice(0, 8),
            changed: [...left].filter(([id, value]) => right.has(id) && differences(value, right.get(id)).length)
                .slice(0, 8).map(([id, value]) => ({ id, differences: differences(value, right.get(id)) })) };
    } else report.sections[key] = differences(a, b);
}
await writeFile(process.argv[4], JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.hashes, null, 2));
