// Verifies landscape handoff revision checks and source-server boundaries.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createLandscapeServer, SELECTION_FILE } from '../../../tools/landscape_server/Server.mjs';

test('Landscape handoff: saves valid context and rejects stale or foreign requests', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'landscape-handoff-'));
    await mkdir(path.join(root, 'assets/public/landscape/coastal-city'), { recursive: true });
    await writeFile(path.join(root, 'assets/public/landscape/coastal-city/manifest.json'), JSON.stringify({ id: 'coastal', revision: 'r1', bounds: { minX: 0, maxX: 4000, minZ: 0, maxZ: 4000 } }));
    const server = createLandscapeServer({ root });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const selection = { landscapeId: 'coastal', sourceRevision: 'r1', selectionId: 'point-1', position: { x: 20, y: -2, z: 40 } };
    const post = (value, headers = {}) => fetch(`${origin}/api/landscape/selection`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(value) });
    try {
        assert.equal((await post(selection)).status, 200);
        assert.deepEqual(JSON.parse(await readFile(path.join(root, SELECTION_FILE), 'utf8')), selection);
        assert.equal((await post({ ...selection, sourceRevision: 'old' })).status, 409);
        assert.equal((await post(selection, { origin: 'http://evil.example' })).status, 403);
        assert.equal((await post({ ...selection, position: { x: -1, y: 0, z: 0 } })).status, 400);
        assert.equal((await fetch(`${origin}/.git/config`)).status, 404);
        assert.equal((await fetch(`${origin}/downloads/private.txt`)).status, 404);
        assert.equal((await fetch(`${origin}/assets/private.bin`)).status, 404);
        assert.deepEqual(await (await fetch(`${origin}/api/landscape/selection`)).json(), selection);
        assert.equal((await fetch(`${origin}/api/landscape/selection`, { method: 'DELETE', headers: { origin: 'http://evil.example' } })).status, 403);
        assert.equal((await fetch(`${origin}/api/landscape/selection`, { method: 'DELETE' })).status, 200);
        assert.equal((await fetch(`${origin}/api/landscape/selection`)).status, 404);
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
        assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()));
        assert.ok(path.basename(root).startsWith('landscape-handoff-'));
        await rm(root, { recursive: true, force: true });
    }
});
