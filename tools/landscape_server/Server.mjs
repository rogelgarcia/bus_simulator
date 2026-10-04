// Serves the local landscape viewer and a bounded selection handoff.
// @ts-check
import http from 'node:http';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createLandscapeAuthoringApi } from './AuthoringApi.mjs';

const MANIFEST = 'assets/public/landscape/coastal-city/manifest.json';
export const SELECTION_FILE = 'tests/artifacts/screens/landscape/ai576/selection.latest.json';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const isPbrMetadata = relative => relative === 'assets/public/pbr/_catalog_index.js' || /^assets\/public\/pbr\/[a-z0-9_]+\/pbr\.material\.(?:correction\.)?config\.js$/.test(relative);
const isPublicPath = relative => relative === 'favicon.ico' || relative === 'index.html' || isPbrMetadata(relative) || ['src/', 'screens/', 'debug_tools/', 'assets/public/landscape/'].some(prefix => relative.startsWith(prefix));

function reply(response, status, body) {
    response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify(body));
}

async function readJson(request) {
    let size = 0;
    const chunks = [];
    for await (const chunk of request) {
        size += chunk.length;
        if (size > 65536) throw new Error('Landscape request exceeds 64 KiB');
        chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

// Worktrees may link the shared asset store as a junction; only these declared roots are trusted by real path.
const LINKED_ROOTS = ['.', 'assets'];

async function realRoots(workspace) {
    const roots = [];
    for (const logical of LINKED_ROOTS) {
        try { roots.push({ logical, real: await realpath(path.join(workspace, logical)) }); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return roots.sort((a, b) => b.real.length - a.real.length);
}

function logicalPath(roots, resolved) {
    const root = roots.find(value => resolved === value.real || resolved.startsWith(value.real + path.sep));
    return root ? path.join(root.logical, path.relative(root.real, resolved)).split(path.sep).join('/') : null;
}

/** @param {{root: string,landscapeDirectory?:string}} options */
export function createLandscapeServer({ root, landscapeDirectory }) {
    const workspace = path.resolve(root);
    const landscape = path.resolve(landscapeDirectory ?? path.join(workspace, path.dirname(MANIFEST)));
    const authoring = createLandscapeAuthoringApi({ directory: landscape, readJson, reply });
    const trusted = Promise.all([realRoots(workspace), realpath(landscape)]);
    trusted.catch(() => {});
    let pendingWrite = Promise.resolve();
    const server = http.createServer(async (request, response) => {
        try {
            const host = request.headers.host ?? '';
            if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) return reply(response, 403, { error: 'Local host required' });
            const pathname = decodeURIComponent(new URL(request.url, `http://${host}`).pathname);
            if (pathname.includes('\\') || pathname.split('/').includes('..')) return reply(response, 403, { error: 'Invalid path' });
            if (pathname === '/__health') return reply(response, 200, { ready: true, service: 'landscape', root: workspace });
            if (pathname.startsWith('/api/landscape/') && await authoring(request, response, pathname)) return;
            if (pathname === '/api/landscape/selection') {
                if (request.method === 'GET') {
                    try { return reply(response, 200, JSON.parse(await readFile(path.join(workspace, SELECTION_FILE), 'utf8'))); }
                    catch (error) { if (error.code === 'ENOENT') return reply(response, 404, { error: 'No selection yet' }); throw error; }
                }
                if (request.headers.origin && request.headers.origin !== `http://${host}`) return reply(response, 403, { error: 'Same-origin handoff required' });
                if (request.method === 'DELETE') {
                    const clear = async () => {
                        try { await unlink(path.join(workspace, SELECTION_FILE)); }
                        catch (error) { if (error.code !== 'ENOENT') throw error; }
                    };
                    pendingWrite = pendingWrite.then(clear, clear);
                    await pendingWrite;
                    return reply(response, 200, { cleared: true });
                }
                if (request.method !== 'POST') return reply(response, 405, { error: 'Use GET, POST, or DELETE' });
                if (!String(request.headers['content-type']).startsWith('application/json')) return reply(response, 415, { error: 'JSON required' });
                const selection = await readJson(request);
                const manifest = JSON.parse(await readFile(path.join(landscape, 'manifest.json'), 'utf8'));
                const position = selection.position;
                if (selection.landscapeId !== manifest.id || selection.sourceRevision !== manifest.revision) return reply(response, 409, { error: 'Selection targets a stale or different landscape' });
                if (!position || !['x', 'y', 'z'].every(axis => Number.isFinite(position[axis])) || typeof selection.selectionId !== 'string') return reply(response, 400, { error: 'Invalid selection coordinates or identity' });
                if (position.x < manifest.bounds.minX || position.x > manifest.bounds.maxX || position.z < manifest.bounds.minZ || position.z > manifest.bounds.maxZ) return reply(response, 400, { error: 'Selection outside landscape' });
                const destination = path.join(workspace, SELECTION_FILE);
                const write = async () => {
                    await mkdir(path.dirname(destination), { recursive: true });
                    const temporary = `${destination}.${randomUUID()}.tmp`;
                    await writeFile(temporary, `${JSON.stringify(selection, null, 2)}\n`);
                    await rename(temporary, destination);
                };
                pendingWrite = pendingWrite.then(write, write);
                await pendingWrite;
                return reply(response, 200, { saved: SELECTION_FILE });
            }
            if (!['GET', 'HEAD'].includes(request.method)) return reply(response, 405, { error: 'Read-only static files' });
            const relative = pathname === '/' ? 'screens/landscape_fabrication.html' : pathname.slice(1);
            if (!isPublicPath(relative)) return reply(response, 404, { error: 'Not found' });
            const sourcePrefix = 'assets/public/landscape/coastal-city/';
            const sourceRequest = relative.startsWith(sourcePrefix);
            const staticRoot = sourceRequest ? landscape : workspace;
            const candidate = path.resolve(staticRoot, sourceRequest ? relative.slice(sourcePrefix.length) : relative);
            if (!candidate.startsWith(staticRoot + path.sep)) return reply(response, 403, { error: 'Invalid path' });
            const resolved = await realpath(candidate), [roots, realLandscape] = await trusted;
            if (sourceRequest ? !resolved.startsWith(realLandscape + path.sep) : !isPublicPath(logicalPath(roots, resolved) ?? '')) return reply(response, 403, { error: 'Invalid source location' });
            const info = await stat(resolved);
            if (!info.isFile()) return reply(response, 404, { error: 'Not found' });
            const etag = `"${info.size}-${info.mtimeMs}"`;
            if (request.headers['if-none-match'] === etag) {
                response.writeHead(304, { etag }); response.end(); return;
            }
            response.writeHead(200, { 'content-type': MIME[path.extname(resolved)] ?? 'application/octet-stream', 'content-length': info.size, 'cache-control': 'no-cache', etag });
            if (request.method === 'HEAD') return response.end();
            const stream = createReadStream(resolved);
            stream.on('error', error => response.destroy(error));
            response.on('close', () => stream.destroy());
            stream.pipe(response);
        } catch (error) {
            if (response.headersSent) { response.destroy(error); return; }
            reply(response, error.code === 'ENOENT' ? 404 : 400, { error: error.message });
        }
    });
    return server;
}
