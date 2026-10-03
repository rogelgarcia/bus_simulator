// Starts the loopback-only landscape development server on the worktree's dedicated port.
import { fileURLToPath } from 'node:url';
import { createLandscapeServer } from './Server.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const port = Number(process.env.PORT ?? 8002);
if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 8001) throw new Error('Choose a valid landscape port other than 8001 (default 8002).');
const server = createLandscapeServer({ root });
server.listen(port, '127.0.0.1', () => console.log(`[LandscapeServer] http://127.0.0.1:${port}/screens/landscape_fabrication.html`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { server.close(); server.closeAllConnections(); });
