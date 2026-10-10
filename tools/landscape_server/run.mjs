// Starts the loopback-only landscape development server on the worktree's dedicated port.
// LANDSCAPE_DIRECTORY (optional, relative to the worktree or absolute) serves another saved landscape directory, such as a synthesis
// fixture, at the viewer's canonical cache address instead of the local cache; the directory must already hold a manifest.json.
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createLandscapeServer } from './Server.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const port = Number(process.env.PORT ?? 8002);
if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 8001) throw new Error('Choose a valid landscape port other than 8001 (default 8002).');
const landscapeDirectory = process.env.LANDSCAPE_DIRECTORY ? path.resolve(root, process.env.LANDSCAPE_DIRECTORY) : null;
if (landscapeDirectory && !existsSync(path.join(landscapeDirectory, 'manifest.json'))) throw new Error(`LANDSCAPE_DIRECTORY ${landscapeDirectory} holds no manifest.json; point it at a saved landscape directory.`);
const server = createLandscapeServer({ root, ...(landscapeDirectory ? { landscapeDirectory } : {}) });
server.listen(port, '127.0.0.1', () => console.log(`[LandscapeServer] http://127.0.0.1:${port}/screens/landscape_fabrication.html${landscapeDirectory ? ` serving ${landscapeDirectory}` : ''}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { server.close(); server.closeAllConnections(); });
