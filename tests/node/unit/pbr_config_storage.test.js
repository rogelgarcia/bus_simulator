// Guards that authored PBR configuration is ordinary Git content (never Git LFS pointers) and keeps its exact bytes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const git = (args, input) => execFileSync('git', ['-C', root, '-c', 'core.quotepath=off', ...args], { encoding: 'utf8', input, maxBuffer: 256 * 1024 * 1024 });
let skip = false;
try { git(['rev-parse', '--is-inside-work-tree']); } catch (error) { skip = `requires a Git work tree: ${error.message.split('\n')[0]}`; }

const CONFIG = /^assets\/public\/pbr\/(?:_catalog_index\.js|[^/]+\/pbr\.(?:material|material\.correction)\.config\.js|[^/]+\/pbr\.landscape\.config\.json)$/;
const isPointer = text => text.startsWith('version https://git-lfs.github.com/spec/');

/** Contents of the given blobs through one `git cat-file --batch`. @param {string[]} shas @returns {Map<string, Buffer>} */
function readBlobs(shas) {
    const output = execFileSync('git', ['-C', root, 'cat-file', '--batch'], { input: shas.join('\n') + '\n', maxBuffer: 256 * 1024 * 1024 });
    const blobs = new Map();
    for (let offset = 0; offset < output.length;) {
        const newline = output.indexOf(10, offset), [sha, , size] = output.subarray(offset, newline).toString('utf8').split(' ');
        blobs.set(sha, output.subarray(newline + 1, newline + 1 + Number(size)));
        offset = newline + 1 + Number(size) + 1;
    }
    return blobs;
}

/** Attribute values of each path, as `git check-attr` resolves them from the working tree's .gitattributes. */
function attributes(paths) {
    const result = new Map();
    for (const line of git(['check-attr', '--stdin', 'filter', 'diff', 'merge', 'text'], paths.join('\n') + '\n').trim().split('\n')) {
        const [, path, name, value] = line.match(/^(.*): (\w+): (.*)$/);
        result.set(path, { ...result.get(path), [name]: value });
    }
    return result;
}

test('PBR configuration storage: every tracked config is plain Git content, never an LFS pointer', { skip }, () => {
    const tracked = git(['ls-files', '-s', '--', 'assets/public/pbr']).trim().split('\n').filter(Boolean).map(line => {
        const [meta, path] = line.split('\t');
        return { path, blob: meta.split(' ')[1] };
    });
    assert.deepEqual(tracked.filter(entry => !CONFIG.test(entry.path)).map(entry => entry.path), [], 'only authored configuration is tracked under assets/public/pbr');
    const committed = git(['ls-tree', '-r', 'HEAD', '--', 'assets/public/pbr']).trim().split('\n').filter(Boolean).map(line => ({ path: line.split('\t')[1], blob: line.split('\t')[0].split(' ')[2] }));
    const entries = [...tracked, ...committed], blobs = readBlobs([...new Set(entries.map(entry => entry.blob))]);
    const pointers = entries.filter(entry => isPointer(blobs.get(entry.blob).subarray(0, 64).toString('latin1'))).map(entry => entry.path);
    assert.deepEqual([...new Set(pointers)], [], 'PBR configuration must be stored as its content, not as Git LFS pointers');
    for (const entry of tracked) assert.equal(blobs.get(entry.blob).includes(0), false, `${entry.path} is text`);
});

test('PBR configuration storage: tracked and future config paths resolve to no LFS filter and no line-ending conversion', { skip }, () => {
    const tracked = git(['ls-files', '--', 'assets/public/pbr']).trim().split('\n').filter(Boolean);
    const future = ['assets/public/pbr/_catalog_index.js', 'assets/public/pbr/future_material/pbr.material.config.js',
        'assets/public/pbr/future_material/pbr.material.correction.config.js', 'assets/public/pbr/future_material/pbr.landscape.config.json'];
    for (const [path, values] of attributes([...new Set([...tracked, ...future])])) {
        assert.deepEqual(values, { filter: 'unspecified', diff: 'unspecified', merge: 'unspecified', text: 'unset' }, path);
    }
    // binary material sources under assets/public stay routed to LFS, should one ever be tracked
    assert.deepEqual(attributes(['assets/public/pbr/future_material/basecolor.png']).get('assets/public/pbr/future_material/basecolor.png').filter, 'lfs');
});
