// Produces a deterministic complete UV layout using the pinned installed Blender.
import { readFile, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { parseBakeSourcePackage } from '../../src/app/illumination/bake_source/index.js';
import { validateResolvedCityBakePackage } from '../../src/graphics/illumination/bake_source/BakeSourceValidation.js';
import { verifyBlenderExecutable } from '../illumination_bake_compiler/src/BlenderToolchain.mjs';
import { receiverMappingExclusion } from '../../src/app/illumination/receiver_lightmaps/ReceiverAtlas.js';
import { resolveReceiverTransport } from '../../src/app/illumination/receiver_lightmaps/ReceiverTransportPolicy.js';
const [input, destination, blender] = process.argv.slice(2);
if (!input || !destination || !blender) throw new Error('Usage: node tools/receiver_lightmaps/unwrap.mjs source.bsib tests/artifacts/... existing-blender.exe');
const stage = path.resolve(destination);
if (!stage.startsWith(path.resolve('tests/artifacts') + path.sep)) throw new Error('Unwrap output must be under tests/artifacts.');
const contract = JSON.parse(await readFile('tools/illumination_bake_compiler/toolchain.v1.json'));
await verifyBlenderExecutable({ executablePath: path.resolve(blender), contract: { fileName: 'blender.exe',
    sha256: contract.blender.executableSha256, byteLength: contract.blender.executableByteLength } });
const bytes = await readFile(input);
await validateResolvedCityBakePackage(bytes);
const source = await parseBakeSourcePackage(bytes), manifest = resolveReceiverTransport(source.manifest);
const materials = new Map(manifest.materials.map(m => [m.id, m]));
const profile = { coverage: 'complete-eligible-v1', irradianceRepresentation: 'surface-diffuse-v1' };
const receivers = manifest.receiverMappings.filter(m => !receiverMappingExclusion(m, materials.get(m.materialId), profile)).map(m => m.id).sort();
await mkdir(stage, { recursive: true });
if (path.resolve(input) !== path.join(stage, 'source.bsib')) await copyFile(input, path.join(stage, 'source.bsib'));
await writeFile(path.join(stage, 'unwrap-job.json'), JSON.stringify({ packageSha256: createHash('sha256').update(bytes).digest('hex'), receivers, angleDegrees: 66 }));
await new Promise((resolve, reject) => {
    const child = spawn(blender, ['--background', '--factory-startup', '--python-use-system-env', '--python-exit-code', '1',
        '--python', path.resolve('tools/receiver_lightmaps/blender/unwrap.py'), '--', stage], {
        stdio: 'inherit', windowsHide: true, env: { ...process.env, BLENDER_USER_CONFIG: path.join(stage, 'config'),
            BLENDER_USER_EXTENSIONS: path.join(stage, 'extensions'), PYTHONPYCACHEPREFIX: path.join(stage, 'python-cache'), TEMP: stage, TMP: stage }
    });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error('Blender unwrap failed: ' + code)));
});
