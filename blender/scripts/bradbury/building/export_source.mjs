// Records the source and installed-asset identities actually read by a game export.
// @ts-check
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const hashes = bytes => ({ bytes: bytes.length, md5: createHash('md5').update(bytes).digest('hex'),
    sha256: createHash('sha256').update(bytes).digest('hex') });

/** @param {{root:string, output:string, urls:Set<string>, origin:string, files:string[], tag:string, buildingId:string, maxTextureSize:number}} options */
export async function saveExportSource({ root, output, urls, origin, files, tag, buildingId, maxTextureSize }) {
    const spec = 'tests/headless/visual/specs/bradbury_blender_export.pwtest.js';
    const local = new Set([spec, 'blender/scripts/bradbury/building/export_source.mjs', 'package.json', 'package-lock.json',
        'src/graphics/content3d/buildings/configs/BradburyBlock.js']);
    const remote = [];
    for (const value of urls) {
        const url = new URL(value);
        if (url.origin === origin) local.add(decodeURIComponent(url.pathname).replace(/^\//, ''));
        else remote.push(value);
    }
    const dependencies = [];
    for (const relative of [...local].sort()) {
        const file = path.resolve(root, relative);
        const within = path.relative(root, file);
        if (within.startsWith('..') || path.isAbsolute(within)) throw new Error(`Export dependency escapes source root: ${relative}`);
        const bytes = await readFile(file);
        // Game images/models stay in the installed store. Freeze their identity, and copy only source text.
        const copied = /\.(?:[cm]?js|json|html|css|glsl)$/.test(relative);
        if (copied) {
            const target = path.join(output, 'source', relative);
            await mkdir(path.dirname(target), { recursive: true });
            await writeFile(target, bytes, { flag: 'wx' });
        }
        dependencies.push({ file: relative, ...hashes(bytes), snapshot: copied ? `source/${relative}` : null });
    }
    const outputs = [];
    for (const file of files) outputs.push({ file: path.basename(file), ...hashes(await readFile(file)) });
    const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
    const source = {
        schema: 1, origin: 'Bradbury building_showcase export', date: new Date().toISOString(),
        commit: git(['rev-parse', 'HEAD']), dirtyPaths: git(['diff', 'HEAD', '--name-only']).split(/\r?\n/).filter(Boolean),
        spec, command: `EXPORT_TAG=${tag} BUILDING_ID=${buildingId} EXPORT_MAX_TEXTURE=${maxTextureSize} node node_modules/@playwright/test/cli.js test -c tests/headless/visual/visual.config.mjs bradbury_blender_export`,
        files: outputs, dependencies, remoteDependencies: remote.sort(),
        notes: 'Source snapshots include dirty saved files. Installed binary assets are read from the game store and authenticated by hash; remote module URLs are pinned in the saved import map. This is the generation commit, not a claim of a clean working tree.'
    };
    await writeFile(path.join(output, 'source.json'), JSON.stringify(source, null, 2) + '\n', { flag: 'wx' });
}
